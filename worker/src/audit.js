// The Vibe Code Audit: team setup, materials (doc + repo), and the Auditor's runs.
// Routes are all POST /audit/<action>. A team is created with the class code; after that every call
// carries the team's private token (from the link the page shows), which is stored here only as a hash.

import { QUESTIONS, SECTIONS, ENGINEERING_IDEAS } from "../../site/audit/rubric.js";
import puppeteer from "@cloudflare/puppeteer";
import { ANTHROPIC_URL, aiBody, aiHeaders, toolInput, apiError, pingAI } from "./ai.js";
import { buildSlice, sliceText, readable, priority, MAX_SLICE_CHARS, MAX_FILE_CHARS } from "../../site/audit/slice.js";

const MAX_TOKENS = 12000;
const GITHUB_API = "https://api.github.com";
const AUDITOR_ACCOUNT = "instructor-8633";
const MAX_RUNS = 10;               // per team, both rounds counted
const MAX_ASKS = 10;               // "Ask about this" questions per team, apart from runs
// Runs before Class 11 are the check-in; runs after are the final. The date decides, not the team.
const CHECKIN_ENDS = "2026-11-24T19:45:00Z";
const stageAt = (iso) => (iso < CHECKIN_ENDS ? "checkin" : "final");
const MAX_PDF_B64 = 1400000;      // about 1 MB of PDF
const MAX_GITHUB_FILES = 36;      // Workers allow 50 outbound calls per request; leave room for the rest

export async function audit(request, env, path, cors) {
  let b; try { b = await request.json(); } catch { return json({ error: "Bad JSON" }, 400, cors); }
  if (!env.DB) return json({ error: "The Auditor isn't set up yet." }, 503, cors);
  const action = path.slice("/audit/".length);
  try {
    if (action === "roster") return await rosterSearch(b, env, cors);
    if (action === "team") return await createTeam(b, env, cors);
    if (action === "results") return await results(b, env, cors);
    if (action === "classteams") return await setClassTeams(b, env, cors);
    const team = await teamFromToken(env, b.token);
    if (!team) return json({ error: "That team link isn't valid any more. Ask a teammate for the current link." }, 401, cors);
    if (action === "load") return json(await view(env, team), 200, cors);
    if (action === "save") return await save(b, env, team, cors);
    if (action === "repo") return await repo(b, env, team, cors);
    if (action === "zip") return await zip(b, env, team, cors);
    if (action === "doc") return await doc(b, env, team, cors);
    if (action === "run") return await run(b, env, team, cors);
    if (action === "relink") return await relink(env, team, cors);
    if (action === "reset") return await reset(env, team, cors);
    if (action === "pingai") return await pingAll(env, team, cors);
    if (action === "ask") return await ask(b, env, team, cors);
  } catch (e) {
    return json({ error: "Something went wrong on my side: " + String(e && e.message || e).slice(0, 200) }, 500, cors);
  }
  return json({ error: "Not found" }, 404, cors);
}

// ---------- team setup ----------

function classCodeOk(b, env) { return b.code && String(b.code).trim() === env.CLASS_CODE; }
const normEmail = e => String(e || "").trim().toLowerCase();
const fullName = r => `${r.preferred && r.preferred !== r.first ? r.preferred : r.first} ${r.last}`;

async function rosterSearch(b, env, cors) {
  if (!classCodeOk(b, env)) return json({ error: "Wrong class code." }, 401, cors);
  const q = String(b.q || "").trim().toLowerCase();
  if (q.length < 2) return json({ people: [] }, 200, cors);
  const like = "%" + q.replace(/[%_]/g, "") + "%";
  const { results: rows } = await env.DB.prepare(
    "SELECT email, first, last, preferred FROM roster WHERE lower(first) LIKE ?1 OR lower(last) LIKE ?1 OR lower(preferred) LIKE ?1 OR lower(email) LIKE ?1 OR lower(first || ' ' || last) LIKE ?1 OR lower(preferred || ' ' || last) LIKE ?1 ORDER BY last, first LIMIT 8"
  ).bind(like).all();
  return json({ people: rows.map(r => ({ email: r.email, name: fullName(r) })) }, 200, cors);
}

async function createTeam(b, env, cors) {
  if (!classCodeOk(b, env)) return json({ error: "Wrong class code." }, 401, cors);
  const name = String(b.name || "").trim().slice(0, 60);
  if (!name) return json({ error: "Give your team a name." }, 400, cors);
  const emails = [...new Set([normEmail(b.me), ...(b.members || []).map(normEmail)].filter(Boolean))];
  if (emails.length > 6) return json({ error: "Teams are 2–4 people." }, 400, cors);
  const people = [], staff = new Set();
  for (const e of emails) {
    const r = await env.DB.prepare("SELECT email, first, last, preferred, role FROM roster WHERE email = ?").bind(e).first();
    if (!r) return json({ error: `${e} isn't on the class roster. Use your Darden email.` }, 400, cors);
    people.push({ email: r.email, name: fullName(r), google: r.email });
    if (r.role === "instructor") staff.add(r.email);
  }
  // Nobody on two teams, except instructors (who can join as many as they like, e.g. to test).
  const { results: teams } = await env.DB.prepare("SELECT name, members FROM audit_teams").all();
  for (const t of teams) {
    const taken = JSON.parse(t.members).map(m => m.email).filter(e => emails.includes(e) && !staff.has(e));
    if (taken.length) return json({ error: `${taken.join(", ")} ${taken.length > 1 ? "are" : "is"} already on team "${t.name}". Ask that team for its link instead.` }, 409, cors);
  }
  const token = randomToken(), id = randomToken().slice(0, 12), now = new Date().toISOString();
  const type = b.project_type === "sponsored" ? "sponsored" : b.project_type === "de novo" ? "de novo" : null;
  await env.DB.prepare("INSERT INTO audit_teams (id, token_hash, name, project_type, created_at, created_by, members, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, await sha256(token), name, type, now, people[0].email, JSON.stringify(people), now).run();
  const team = await env.DB.prepare("SELECT * FROM audit_teams WHERE id = ?").bind(id).first();
  return json({ token, ...(await view(env, team)) }, 200, cors);
}

async function relink(env, team, cors) {
  const token = randomToken();
  await env.DB.prepare("UPDATE audit_teams SET token_hash = ? WHERE id = ?").bind(await sha256(token), team.id).run();
  return json({ token }, 200, cors);
}

// Testing: start a team over (materials, runs, links), keeping the team, its members and its link.
// Only for teams with an instructor on them, so students can't use it to get around the run limit.
async function isStaffTeam(env, team) {
  const emails = JSON.parse(team.members).map(m => m.email);
  if (!emails.length) return false;
  const staff = await env.DB.prepare(`SELECT count(*) AS n FROM roster WHERE role = 'instructor' AND email IN (${emails.map(() => "?").join(",")})`).bind(...emails).first();
  return !!(staff && staff.n);
}

// Live check: one tiny AI call per kind (Auditor, puzzle grader), with the settings real calls use.
// Instructor test teams only, so it can't be used to spend the API budget.
async function pingAll(env, team, cors) {
  if (!(await isStaffTeam(env, team))) return json({ error: "Only test teams with an instructor on them can run the AI check." }, 403, cors);
  const checks = await Promise.all([pingAI(env, "auditor"), pingAI(env, "grader")]);
  return json({ checks }, checks.every(c => c.ok) ? 200 : 503, cors);
}

async function reset(env, team, cors) {
  if (!(await isStaffTeam(env, team))) return json({ error: "Only test teams with an instructor on them can be reset." }, 403, cors);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM audit_runs WHERE team_id = ?").bind(team.id),
    env.DB.prepare("DELETE FROM audit_material WHERE team_id = ?").bind(team.id),
    env.DB.prepare("UPDATE audit_teams SET repo_url = NULL, repo_access = NULL, deployed_url = NULL, doc_url = NULL, doc_source = NULL, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), team.id),
  ]);
  return json(await view(env, await fresh(env, team)), 200, cors);
}

async function teamFromToken(env, token) {
  if (!token || typeof token !== "string" || token.length > 100) return null;
  return env.DB.prepare("SELECT * FROM audit_teams WHERE token_hash = ?").bind(await sha256(token)).first();
}

// What the page gets back: the team, what the Auditor has to read, and every run so far.
async function view(env, team) {
  const m = await env.DB.prepare("SELECT doc_text IS NOT NULL AS has_text, doc_pdf IS NOT NULL AS has_pdf, length(doc_text) AS text_len, length(doc_pdf) AS pdf_len, repo_slice, git_log IS NOT NULL AS has_log, updated_at FROM audit_material WHERE team_id = ?").bind(team.id).first();
  const { results: runs } = await env.DB.prepare("SELECT id, at, stage, round, answers, result, error FROM audit_runs WHERE team_id = ? ORDER BY at").bind(team.id).all();
  let repo = null;
  if (m && m.repo_slice) { const s = JSON.parse(m.repo_slice); repo = { note: s.note, files: s.files.map(f => f.path) }; }
  return {
    team: {
      name: team.name, project_type: team.project_type, members: JSON.parse(team.members),
      repo_url: team.repo_url, repo_access: team.repo_access, deployed_url: team.deployed_url,
      doc_url: team.doc_url, doc_source: team.doc_source, updated_at: team.updated_at,
    },
    material: {
      doc: m && (m.has_text || m.has_pdf) ? { source: m.has_pdf ? "pdf" : "gdoc", size: m.has_pdf ? Math.round(m.pdf_len * 0.75) : m.text_len } : null,
      repo, git_log: !!(m && m.has_log),
    },
    runs: runs.map(r => ({ id: r.id, at: r.at, stage: r.stage, round: r.round, answers: r.answers ? JSON.parse(r.answers) : null, result: r.result ? JSON.parse(r.result) : null, error: r.error })),
    asks: await asksFor(env, team.id),
    limits: { runs: MAX_RUNS, asks: MAX_ASKS },
  };
}

async function save(b, env, team, cors) {
  const fields = {};
  if ("deployed_url" in b) fields.deployed_url = cleanUrl(b.deployed_url);
  if ("project_type" in b) fields.project_type = b.project_type === "sponsored" ? "sponsored" : "de novo";
  if (Array.isArray(b.members)) {
    // Members can be added (from the roster) and each can set the Google address the reviewed doc goes to.
    const cur = JSON.parse(team.members), out = [];
    for (const m of b.members.slice(0, 6)) {
      const e = normEmail(m.email);
      let p = cur.find(c => c.email === e);
      if (!p) {
        const r = await env.DB.prepare("SELECT email, first, last, preferred, role FROM roster WHERE email = ?").bind(e).first();
        if (!r) return json({ error: `${e} isn't on the class roster.` }, 400, cors);
        const { results: teams } = await env.DB.prepare("SELECT name, members FROM audit_teams WHERE id != ?").bind(team.id).all();
        const other = r.role === "instructor" ? null : teams.find(t => JSON.parse(t.members).some(x => x.email === e));
        if (other) return json({ error: `${e} is already on team "${other.name}".` }, 409, cors);
        p = { email: r.email, name: fullName(r), google: r.email };
      }
      const g = normEmail(m.google);
      out.push({ ...p, google: g === "" ? "" : (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(g) ? g : p.google) });
    }
    if (!out.length) return json({ error: "A team needs at least one person." }, 400, cors);
    fields.members = JSON.stringify(out);
  }
  const keys = Object.keys(fields);
  if (keys.length) {
    fields.updated_at = new Date().toISOString();
    const ks = Object.keys(fields);
    await env.DB.prepare(`UPDATE audit_teams SET ${ks.map(k => k + " = ?").join(", ")} WHERE id = ?`).bind(...ks.map(k => fields[k]), team.id).run();
  }
  const fresh = await env.DB.prepare("SELECT * FROM audit_teams WHERE id = ?").bind(team.id).first();
  return json(await view(env, fresh), 200, cors);
}

// ---------- materials ----------

async function material(env, teamId, cols) {
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO audit_material (team_id, updated_at) VALUES (?, ?) ON CONFLICT(team_id) DO NOTHING").bind(teamId, now).run();
  const ks = Object.keys(cols);
  await env.DB.prepare(`UPDATE audit_material SET ${ks.map(k => k + " = ?").join(", ")}, updated_at = ? WHERE team_id = ?`).bind(...ks.map(k => cols[k]), now, teamId).run();
}
async function touchTeam(env, teamId, cols) {
  const ks = Object.keys(cols);
  await env.DB.prepare(`UPDATE audit_teams SET ${ks.map(k => k + " = ?").join(", ")}, updated_at = ? WHERE id = ?`).bind(...ks.map(k => cols[k]), new Date().toISOString(), teamId).run();
}

async function doc(b, env, team, cors) {
  if (b.pdf) {
    const pdf = String(b.pdf);
    if (pdf.length > MAX_PDF_B64) return json({ error: "That PDF is over 1 MB. Export it without images, or trim it, and try again." }, 413, cors);
    if (!pdf.startsWith("JVBER")) return json({ error: "That doesn't look like a PDF." }, 400, cors);
    await material(env, team.id, { doc_pdf: pdf, doc_text: null });
    await touchTeam(env, team.id, { doc_source: "pdf", doc_url: b.filename ? String(b.filename).slice(0, 120) : "uploaded PDF" });
    return json(await view(env, await fresh(env, team)), 200, cors);
  }
  // Their product charter and design notes (a Google Doc, Slides or Sheet): read it, then follow the links in it.
  // (An old-style audit sheet still works: its Submission rows give the notes, repo and deployed app.)
  const url = String(b.doc_url || "");
  const g = googleFile(url);
  if (!g) return json({ error: "That doesn't look like a link to a Google Doc, Slides or Sheet. Copy it from the address bar, or download it as a PDF and upload that." }, 400, cors);
  const main = await googleExport(g);
  if (main.error === "private") return json({ error: "I can't open that: it isn't public. Either set General access to \"Anyone with the link\" (Viewer), or download it as a PDF (File → Download → PDF) and upload that.", need: "pdf" }, 403, cors);
  if (main.error) return json({ error: "Couldn't reach Google. Try again in a moment." }, 502, cors);
  if (main.text.trim().length < 200) return json({ error: "I opened it, but there's almost nothing in it yet." }, 400, cors);
  const label = g.kind === "sheet" ? "THEIR SHEET (CSV)" : "THEIR PRODUCT CHARTER AND DESIGN NOTES";
  const parts = [`${label}:\n${main.text}`];
  // The Submission rows: product notes, repo, deployed app. The repo and app are read in their own steps.
  const sub = g.kind === "sheet" ? submission(main.text) : {};
  const isSubmission = !!(sub.notes || sub.repo);
  const ownStep = new Set([sub.repo, sub.deployed].filter(Boolean).map(cleanUrl));
  // Linked working docs: Google Docs, Slides and Sheets that are public. Anything else is noted, not opened.
  const links = [...new Set((main.text.match(/https?:\/\/[^\s",)\]]+/g) || []))]
    .filter(u => u !== url && !ownStep.has(cleanUrl(u)) && !GH_REPO.test(u + "/")).slice(0, MAX_LINKS);
  const opened = [], unopened = [];
  await Promise.all(links.map(async u => {
    const f = googleFile(u);
    if (!f) { unopened.push(`${u} (not a Google file; if it's in your repo I read it there)`); return; }
    const r = await googleExport(f);
    if (r.error) { unopened.push(`${u} (${r.error === "private" ? "not shared publicly" : "couldn't load"})`); return; }
    opened.push(u); parts.push(`===== LINKED ${f.kind.toUpperCase()}: ${u} =====\n${r.text.slice(0, MAX_LINKED_CHARS)}`);
  }));
  if (unopened.length) parts.push("LINKS I COULDN'T OPEN:\n" + unopened.join("\n"));
  const found = isSubmission ? {
    sheet: true,
    notes: sub.notes ? { url: sub.notes, opened: opened.includes(sub.notes) } : null,
    repo: sub.repo || null,
    deployed: sub.deployed || null,
  } : { notes: { url, opened: true }, repo: null, deployed: null };
  if (sub.deployed) await touchTeam(env, team.id, { deployed_url: cleanUrl(sub.deployed) });
  await material(env, team.id, { doc_text: parts.join("\n\n").slice(0, 160000), doc_pdf: null });
  await touchTeam(env, team.id, { doc_source: g.kind === "sheet" ? "gsheet" : "gdoc", doc_url: g.canonical });
  return json({ links: { opened, unopened }, found, ...(await view(env, await fresh(env, team))) }, 200, cors);
}

const MAX_LINKS = 15, MAX_LINKED_CHARS = 20000;

// Reads the Submission rows of the sheet's CSV: a label in column B, the value in the next filled cell.
function submission(csv) {
  const out = {};
  for (const row of parseCSV(csv)) {
    const label = (row[1] || "").trim().toLowerCase();
    const value = row.slice(2).map(v => v.trim()).find(v => v && !/^\[.*\]$/.test(v)) || "";
    const url = (/https?:\/\/\S+/.exec(value) || [])[0];
    if (!url) continue;
    if (/^product charter|^product notes|design notes/.test(label)) out.notes = out.notes || url;
    else if (/^repo/.test(label)) out.repo = out.repo || url;
    else if (/^deployed/.test(label)) out.deployed = out.deployed || url;
  }
  return out;
}
function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
export { submission };
function googleFile(u) {
  const m = /docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([A-Za-z0-9_-]{20,})/.exec(String(u || ""));
  if (!m) return null;
  const kind = { document: "doc", spreadsheets: "sheet", presentation: "slides" }[m[1]];
  const gid = (/[#?&]gid=(\d+)/.exec(u) || [])[1];
  return { kind, id: m[2], gid, canonical: `https://docs.google.com/${m[1]}/d/${m[2]}` };
}
async function googleExport(f) {
  const path = { doc: "document", sheet: "spreadsheets", slides: "presentation" }[f.kind];
  const fmt = f.kind === "sheet" ? "csv" + (f.gid ? "&gid=" + f.gid : "") : "txt";
  try {
    const res = await fetch(`https://docs.google.com/${path}/d/${f.id}/export?format=${fmt}`, { redirect: "follow" });
    if (!res.ok || /accounts\.google\.com/.test(res.url) || /text\/html/.test(res.headers.get("content-type") || "")) return { error: "private" };
    return { text: (await res.text()).slice(0, 120000) };
  } catch { return { error: "network" }; }
}

const GH_REPO = /github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:\/|$|\?|#)/;
function gh(env, path, init = {}) {
  return fetch(GITHUB_API + path, { ...init, headers: { "Accept": "application/vnd.github+json", "User-Agent": "cwg-auditor", "X-GitHub-Api-Version": "2022-11-28", ...(env.GITHUB_TOKEN ? { "Authorization": "Bearer " + env.GITHUB_TOKEN } : {}), ...(init.headers || {}) } });
}

// Read the repo on GitHub if it's public, or private with instructor-8633 as a collaborator
// (accepting the team's pending invite if there is one). Otherwise say what the options are.
async function repo(b, env, team, cors) {
  const m = GH_REPO.exec(String(b.repo_url || "").trim() + "/");
  if (!m) return json({ error: "That doesn't look like a GitHub repo link (https://github.com/owner/repo)." }, 400, cors);
  const owner = m[1], name = m[2], full = `${owner}/${name}`;
  await touchTeam(env, team.id, { repo_url: `https://github.com/${full}` });

  let res = await gh(env, `/repos/${full}`);
  let accepted = false;
  if (res.status === 404 && env.GITHUB_TOKEN) {
    // Private: see whether the team has invited the Auditor, and accept it.
    const inv = await gh(env, "/user/repository_invitations?per_page=100");
    if (inv.ok) {
      const match = (await inv.json()).find(i => i.repository && i.repository.full_name.toLowerCase() === full.toLowerCase());
      if (match) {
        const ok = await gh(env, `/user/repository_invitations/${match.id}`, { method: "PATCH" });
        if (ok.ok || ok.status === 204) { accepted = true; res = await gh(env, `/repos/${full}`); }
      }
    }
  }
  if (res.status === 404) {
    return json({ need: "access", account: AUDITOR_ACCOUNT, error: `I can't see ${full}. It's private, or the link is off. Either add ${AUDITOR_ACCOUNT} as a collaborator (Settings → Collaborators → Add people) and click Check again, or upload a ZIP instead.` }, 200, cors);
  }
  if (!res.ok) return json({ error: `GitHub said ${res.status}. Try again in a minute.` }, 502, cors);
  const info = await res.json();
  const access = info.private ? "collaborator" : "public";

  // The file list, then the files most worth reading, within the outbound-call budget.
  const tr = await gh(env, `/repos/${full}/git/trees/${encodeURIComponent(info.default_branch)}?recursive=1`);
  if (!tr.ok) return json({ error: "I could see the repo but not its files. Is it empty?" }, 400, cors);
  const tree = (await tr.json()).tree.filter(t => t.type === "blob");
  const picks = tree.filter(t => readable(t.path) && t.size > 0)
    .sort((a, b) => priority(a.path) - priority(b.path) || a.size - b.size);
  const want = []; let est = 0;
  for (const t of picks) {
    if (want.length >= MAX_GITHUB_FILES) break;
    const s = Math.min(t.size, MAX_FILE_CHARS);
    if (est + s > MAX_SLICE_CHARS) continue;
    want.push(t); est += s;
  }
  const texts = await Promise.all(want.map(async t => {
    const r = await gh(env, `/repos/${full}/contents/${t.path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(info.default_branch)}`, { headers: { "Accept": "application/vnd.github.raw" } });
    return r.ok ? { path: t.path, text: await r.text() } : null;
  }));
  const files = tree.map(t => ({ path: t.path, text: (texts.find(x => x && x.path === t.path) || {}).text }));
  const slice = buildSlice(files);

  // Commit history: cadence and messages are the iteration signal.
  let log = null;
  const cm = await gh(env, `/repos/${full}/commits?per_page=60`);
  if (cm.ok) log = (await cm.json()).map(c => `${(c.commit.author && c.commit.author.date || "").slice(0, 16)} ${c.commit.author && c.commit.author.name || ""}: ${(c.commit.message || "").split("\n")[0]}`).join("\n");

  await material(env, team.id, { repo_slice: JSON.stringify(slice), git_log: log });
  await touchTeam(env, team.id, { repo_access: access });
  return json({ accepted, access, ...(await view(env, await fresh(env, team))) }, 200, cors);
}

// A ZIP the page unpacked in the browser: it sends the readable files; the slice is rebuilt here.
async function zip(b, env, team, cors) {
  const files = Array.isArray(b.files) ? b.files.slice(0, 3000) : [];
  if (!files.length) return json({ error: "That ZIP had no files I can read." }, 400, cors);
  const clean = files.map(f => ({ path: String(f.path || "").slice(0, 300), text: typeof f.text === "string" ? f.text.slice(0, MAX_FILE_CHARS + 100) : undefined }));
  const slice = buildSlice(clean);
  const log = b.git_log ? String(b.git_log).slice(0, 12000) : null;
  await material(env, team.id, { repo_slice: JSON.stringify(slice), git_log: log });
  await touchTeam(env, team.id, { repo_access: "zip", ...(b.repo_url ? { repo_url: cleanUrl(b.repo_url) } : {}) });
  return json(await view(env, await fresh(env, team)), 200, cors);
}

// ---------- the Auditor ----------

const LABELS = QUESTIONS.map(q => q.id);

function systemPrompt(round) {
  const rubric = SECTIONS.map(s => `${s.id}. ${s.title}${s.observed ? " (you judge these yourself, from the notes, the repo and the deployed app; the team needn't write them up)" : " (from the team's own notes: " + s.from + ")"}\n` + QUESTIONS.filter(q => q.section === s.id).map(q =>
    `  ${q.id} ${q.label}: "${q.question}"\n     Look for: ${q.look_for.join("; ")}`).join("\n")).join("\n");
  return [
    "You are the Auditor for the final assignment in an MBA course, Coding with GPT, at Darden. Student teams of 2–4 vibe-coded an app with AI. Their working docs (personas, stories, designs and so on) live wherever they keep them; they give you their product charter and design notes (a Google Doc, Slides or Sheet, or a PDF), their repo, and their deployed app if they have one. They don't map their material to the elements below; finding it is your job, and when something important is missing, ask for it and say why. You read their notes, the public Google files those link to, a slice of their repo and its commit history, and return an audit, the way a good financial auditor would: observations, questions, and priorities, not a grade.",
    "Judge each element by the material itself. A repo path refers to the repo slice; if that file isn't in the slice, say you couldn't see it. If an element's material is in a link you couldn't open (listed at the end of their notes), don't mark it missing for that alone: say so in the note, and ask for it in your requests if it matters.",
    "The course's through line is applying four steps adaptively as you see what breaks: (1) design intent (personas, JTBD, user stories with OECs), (2) unpacking (MVC: models, views, controllers; Given-When-Then), (3) effectuating between alternatives (stack, packages, APIs, deploy targets), (4) iteratively coding, testing, debugging (tests, pipeline, observability). The trap you are there to catch: a working 1.0 makes a team think it's mostly done. Most of these apps haven't met real users and won't be overtly broken, so most of what you have to say is about what to test, what's likely to need changing, and what's confusing.",
    "The engineering ideas the course teaches, which you use when you read their code: " + ENGINEERING_IDEAS.join(", ") + ". Readability applies to APIs and machine interfaces too, not just code.",
    "The readers are MBA students, many of them senior people and consultants, not trained engineers. Be plain, specific and kind. Don't restate their text. Don't invent facts about their app: if you can't tell from the material, say so or ask.",
    "Elements marked (Optional) are optional: if a team hasn't done one, mark it 'missing' and say in the note that it's optional; it isn't counted against them.",
    "",
    "THE AUDIT QUESTIONS AND WHAT TO LOOK FOR (question ids in brackets are what you report against):",
    rubric,
    "",
    "EVERYTHING DEPENDS ON DESIGN INTENT. Your read of B–D only means something if you've understood what they're building and how they'd know it worked. A good design is a testable design: it names a result someone could observe (who does what, how often) that would tell the team the idea worked or didn't.",
    "",
    "WHAT TO RETURN: call the report_audit tool exactly once, with the whole audit. Don't answer in text; the tool call is your entire answer.",
    "0. understanding: say back what you think they're building, in one or two plain sentences (the experiment, the user, the main story), and how they'd know it worked: the observable result, in their terms. If you can't find one in their material, set testable to false and say in how_you_know what's missing. When testable is false, your first Top 10 item must be about making the design testable (step: intent).",
    "1. top10: your ten most useful recommendations, ranked, most important first. Each is phrased mostly as an observation or a question (for example: a part of the UI that looks confusing, a comparable worth testing against, a part of the code likely to need changing, an A/B test worth running), says which of the four steps it goes back to, and what to do: change, test, or leave alone on purpose. Every item has a why: one or two plain sentences on why it matters for this team, tied back to their design intent or the four steps (for example, for adding analytics: without them you have no ground truth, so you can't tell whether anyone completes the main story). Assume the reader doesn't already know why. At least two must come from reading their code against the engineering ideas, and must cite a file and line(s) from the slice. At least one must be framed as a test with users. Spread them across the four steps.",
    "2. questions: one entry per question id, in order (" + LABELS.join(", ") + "), with a status: 'good' (in good shape: the answer engages with what to look for), 'work' (needs some work: there, but thin or missing a look-for), or 'missing' (not answered, or answered with nothing they could act on). The note is one or two sentences on why, specific to their app. Judge the doc and the repo together: if the code shows something the doc leaves out, say so.",
    round === 1
      ? "3. requests: up to three follow-up requests, only where more would materially change your audit. Each names the question id it's about, asks for something specific (often: show me the file and lines where X happens, or tell me what happened when a user tried Y), and says why you're curious. If you have what you need, return none. This is round 1 of 2; the team answers and you give your final opinion."
      : "3. requests: return none. This is round 2: the team has answered your follow-ups (below); take the answers into account.",
    "4. opinion: two to four sentences, your overall read for the team, in the voice of an auditor's opinion. Round 1 says it's preliminary.",
    "5. since_last: only if your previous Top 10 is given below. For each of its items, in order, say done, partly, or open, with one short line acknowledging what they did (or what's still missing). Be generous where the work is real: crediting progress matters. Then mark each item in your new Top 10 as new (true) if it wasn't on the previous list in substance.",
  ].join("\n");
}

const AUDIT_TOOL = {
  name: "report_audit",
  description: "Report the audit: a ranked Top 10, a status for every question, any follow-up requests, and an overall opinion.",
  input_schema: {
    type: "object",
    properties: {
      top10: { type: "array", maxItems: 10, items: { type: "object", properties: {
        title: { type: "string", description: "A short headline, under 12 words" },
        observation: { type: "string", description: "What you saw or are asking, one to three sentences" },
        step: { type: "string", enum: ["intent", "unpack", "effectuate", "iterate"] },
        action: { type: "string", enum: ["change", "test", "leave alone"] },
        where: { type: "string", description: "File and lines when it comes from the code, else empty" },
        why: { type: "string", description: "Why it matters for this team, one or two plain sentences" },
        is_new: { type: "boolean", description: "Not on your previous Top 10 (true when there's no previous list)" },
      }, required: ["title", "observation", "step", "action", "why"] } },
      questions: { type: "array", items: { type: "object", properties: {
        id: { type: "string" }, status: { type: "string", enum: ["good", "work", "missing"] }, note: { type: "string" },
      }, required: ["id", "status", "note"] } },
      requests: { type: "array", maxItems: 3, items: { type: "object", properties: {
        id: { type: "string", description: "Question id this is about" }, ask: { type: "string" }, why: { type: "string" },
      }, required: ["id", "ask", "why"] } },
      opinion: { type: "string" },
      understanding: { type: "object", properties: {
        building: { type: "string", description: "What you think they're building: experiment, user, main story" },
        how_you_know: { type: "string", description: "The observable result that would tell them it worked, or what's missing" },
        testable: { type: "boolean" },
      }, required: ["building", "how_you_know", "testable"] },
      since_last: { type: "array", items: { type: "object", properties: {
        title: { type: "string" }, status: { type: "string", enum: ["done", "partly", "open"] }, note: { type: "string" },
      }, required: ["title", "status", "note"] } },
    },
    required: ["understanding", "top10", "questions", "requests", "opinion"],
  },
};

async function run(b, env, team, cors) {
  const stage = stageAt(new Date().toISOString());
  const m = await env.DB.prepare("SELECT * FROM audit_material WHERE team_id = ?").bind(team.id).first();
  if (!m || (!m.doc_text && !m.doc_pdf)) return json({ error: "Add your product charter and design notes first (step 1)." }, 400, cors);
  if (!m.repo_slice) return json({ error: "Add your repo first (a GitHub link or a ZIP)." }, 400, cors);
  const { count } = await env.DB.prepare("SELECT count(*) AS count FROM audit_runs WHERE team_id = ? AND error IS NULL").bind(team.id).first();
  if (count >= MAX_RUNS) return json({ error: `That's all ${MAX_RUNS} runs. Your latest report stays here.` }, 429, cors);

  // Round 2 if this answers the latest round-1 run's requests.
  let round = 1, prior = null, answers = null;
  if (Array.isArray(b.answers) && b.answers.length) {
    prior = await env.DB.prepare("SELECT * FROM audit_runs WHERE team_id = ? AND round = 1 AND error IS NULL ORDER BY at DESC LIMIT 1").bind(team.id).first();
    if (prior) { round = 2; answers = b.answers.slice(0, 3).map(a => ({ id: String(a.id || "").slice(0, 4), ask: String(a.ask || "").slice(0, 600), answer: String(a.answer || "").slice(0, 3000) })); }
  }

  const slice = JSON.parse(m.repo_slice);
  const members = JSON.parse(team.members);
  const { shot, text: shotText, note: shotNote } = team.deployed_url ? await screenshot(env, team.deployed_url) : {};
  const intro = [
    `Team: ${team.name} (${members.length} people). Stage: ${stage === "final" ? "final submission" : "check-in draft (sections C–D may be partial)"}.`,
    "Some teams started from a sponsor's existing code. If the doc or the commit history shows that, make your code recommendations about code the team wrote or changed.",
    team.deployed_url ? `Deployed app: ${team.deployed_url}. ${shot ? "Attached is a screenshot of its first page as a visitor sees it, and the page's text; you can't click through it, so walk the rest of the happy path in the code." : "I couldn't open it this time (" + shotNote + "); judge from the sheet and the code."}` : "Not deployed (that's optional): walk the happy path in the code.",
    `Repo: ${team.repo_url || "uploaded as a ZIP"}.`,
  ].filter(Boolean).join("\n");
  const content = [];
  content.push({ type: "text", text: intro + "\n\n" + (m.doc_pdf ? "THEIR PRODUCT CHARTER AND DESIGN NOTES are the attached PDF." : m.doc_text) });
  if (m.doc_pdf) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: m.doc_pdf } });
  if (shot) content.push({ type: "text", text: "THEIR DEPLOYED APP, first page:" }, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: shot } }, { type: "text", text: "Its text:\n" + shotText });
  content.push({ type: "text", text: "THEIR REPO (a slice):\n" + sliceText(slice) + "\n\nCOMMIT HISTORY (newest first):\n" + (m.git_log || "not provided") });
  if (round === 2) {
    const prev = JSON.parse(prior.result);
    content.push({ type: "text", text: "YOUR ROUND 1 OPINION: " + prev.opinion + "\n\nYOUR FOLLOW-UP REQUESTS AND THEIR ANSWERS:\n" + answers.map(a => `[${a.id}] You asked: ${a.ask}\nThey answered: ${a.answer || "(no answer)"}`).join("\n\n") });
  }

  // The previous report's Top 10, so the Auditor can credit progress. For a round 2, the one before the round 1 it answers.
  const prevRow = await env.DB.prepare("SELECT result FROM audit_runs WHERE team_id = ? AND error IS NULL AND result IS NOT NULL" + (prior ? " AND at < ?" : "") + " ORDER BY at DESC LIMIT 1").bind(...(prior ? [team.id, prior.at] : [team.id])).first();
  const prevTop = prevRow ? JSON.parse(prevRow.result).top10 : null;
  if (prevTop && prevTop.length) content.push({ type: "text", text: "YOUR PREVIOUS TOP 10 (for since_last):\n" + prevTop.map((t, i) => `${i + 1}. ${t.title}: ${t.observation}`).join("\n") });

  const runId = randomToken().slice(0, 12), at = new Date().toISOString();
  let res;
  try {
    res = await fetchWithRetry(env.ANTHROPIC_URL || ANTHROPIC_URL, {
      method: "POST",
      headers: aiHeaders(env),
      body: JSON.stringify(aiBody("auditor", { maxTokens: MAX_TOKENS, system: systemPrompt(round), tool: AUDIT_TOOL, user: content })),
    });
  } catch { return logRun(env, runId, team.id, at, stage, round, answers, null, "network", cors); }
  if (!res.ok) {
    const detail = apiError(await res.text());
    return logRun(env, runId, team.id, at, stage, round, answers, null, "api " + res.status + ": " + detail, cors);
  }
  const data = await res.json();
  const input = toolInput(data, "report_audit");
  if (!input) return logRun(env, runId, team.id, at, stage, round, answers, null, "unreadable", cors);
  const result = tidy(input, round, prevTop);
  // A report without its Top 10 is no report: log it as an error, so it doesn't use up one of the team's runs.
  if (!result.top10.length) return logRun(env, runId, team.id, at, stage, round, answers, null, "no Top 10 in the reply (stop: " + (data.stop_reason || "?") + ")", cors);
  return logRun(env, runId, team.id, at, stage, round, answers, result, null, cors);
}

// One status per question, in order; Top 10 capped; no requests in round 2.
// Some replies put a nested list or object in as a JSON string; read it either way.
function unstring(v) { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return v; } }

function tidy(r, round, prevTop) {
  for (const k of ["top10", "questions", "requests", "since_last", "understanding"]) r[k] = unstring(r[k]);
  const got = Array.isArray(r.questions) ? r.questions : [];
  const questions = QUESTIONS.map(q => {
    const x = got.find(g => g && String(g.id).toUpperCase() === q.id) || {};
    const s = ["good", "work", "missing"].includes(x.status) ? x.status : "missing";
    return { id: q.id, status: s, note: String(x.note || (s === "missing" ? "Not addressed." : "")) };
  });
  const top10 = (Array.isArray(r.top10) ? r.top10 : []).slice(0, 10).map(t => ({
    title: String(t.title || ""), observation: String(t.observation || ""),
    step: ["intent", "unpack", "effectuate", "iterate"].includes(t.step) ? t.step : "iterate",
    action: ["change", "test", "leave alone"].includes(t.action) ? t.action : "test",
    where: String(t.where || ""), why: String(t.why || ""),
    is_new: prevTop && prevTop.length ? t.is_new !== false : false,
  }));
  const u = r.understanding || {};
  const understanding = { building: String(u.building || ""), how_you_know: String(u.how_you_know || ""), testable: u.testable !== false };
  const since_last = prevTop && prevTop.length ? (Array.isArray(r.since_last) ? r.since_last : []).slice(0, prevTop.length).map((x, i) => ({
    title: String(x.title || (prevTop[i] && prevTop[i].title) || ""), status: ["done", "partly", "open"].includes(x.status) ? x.status : "open", note: String(x.note || ""),
  })) : [];
  const requests = round === 1 ? (Array.isArray(r.requests) ? r.requests : []).slice(0, 3).map(q => ({ id: String(q.id || ""), ask: String(q.ask || ""), why: String(q.why || "") })) : [];
  // An optional element that wasn't done isn't counted against the team.
  const counts = { good: 0, work: 0, missing: 0 };
  questions.forEach(q => { if (!(q.status === "missing" && QUESTIONS.find(x => x.id === q.id).optional)) counts[q.status]++; });
  // If the Auditor couldn't pin down a testable intent, or section A needs work, B–D are provisional.
  const provisional = !understanding.testable || questions.some(q => q.id[0] === "A" && q.status !== "good" && !QUESTIONS.find(x => x.id === q.id).optional);
  return { understanding, provisional, since_last, top10, questions, requests, opinion: String(r.opinion || ""), counts };
}

async function logRun(env, id, teamId, at, stage, round, answers, result, error, cors) {
  await env.DB.prepare("INSERT INTO audit_runs (id, team_id, at, stage, round, answers, result, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, teamId, at, stage, round, answers ? JSON.stringify(answers) : null, result ? JSON.stringify(result) : null, error).run();
  if (error) return json({ error: error === "network" ? "The Auditor is unavailable (network). Try again in a minute." : "The Auditor is unavailable right now (" + error.slice(0, 300) + "). Try again in a minute." }, 502, cors);
  return json({ run: { id, at, stage, round, answers, result } }, 200, cors);
}

// The deployed app's first page, as a visitor sees it. Best effort: any failure just means the
// Auditor works from the code, and the report says why.
async function screenshot(env, url) {
  if (!env.BROWSER) return { note: "no browser available" };
  if (!/^https:\/\/[^/]+\.[^/]+/.test(url) || /(^https:\/\/)(localhost|127\.|10\.|192\.168\.)/.test(url)) return { note: "not a public https link" };
  let browser;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const res = await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
    if (res && res.status() >= 400) return { note: "it answered " + res.status() };
    const shot = await page.screenshot({ type: "jpeg", quality: 60, encoding: "base64" });
    const text = (await page.evaluate(() => document.body ? document.body.innerText : "")).slice(0, 4000);
    return { shot, text };
  } catch (e) {
    return { note: /time limit|429/i.test(String(e)) ? "the browser's daily allowance ran out" : "it didn't load in 20 seconds" };
  } finally { if (browser) try { await browser.close(); } catch {} }
}

// ---------- "Ask about this": a follow-up question on one Top 10 item ----------

const ASK_TOOL = {
  name: "answer_question", description: "Answer the team's question.",
  input_schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] },
};

async function asksFor(env, teamId) {
  const { results: rows } = await env.DB.prepare("SELECT id, run_id, item, at, question, answer, error FROM audit_asks WHERE team_id = ? ORDER BY at").bind(teamId).all();
  return rows;
}

async function ask(b, env, team, cors) {
  const question = String(b.question || "").trim().slice(0, 800);
  if (!question) return json({ error: "Type your question first." }, 400, cors);
  const run = await env.DB.prepare("SELECT * FROM audit_runs WHERE id = ? AND team_id = ? AND result IS NOT NULL").bind(String(b.run_id || ""), team.id).first();
  if (!run) return json({ error: "That report isn't here any more. Reload the page." }, 404, cors);
  const r = JSON.parse(run.result), i = Number(b.item);
  const t = r.top10[i];
  if (!t) return json({ error: "That item isn't in the report." }, 400, cors);
  const { count } = await env.DB.prepare("SELECT count(*) AS count FROM audit_asks WHERE team_id = ? AND error IS NULL").bind(team.id).first();
  if (count >= MAX_ASKS) return json({ error: `That's all ${MAX_ASKS} questions. Bring the rest to class.` }, 429, cors);
  const m = await env.DB.prepare("SELECT doc_text FROM audit_material WHERE team_id = ?").bind(team.id).first();
  const earlier = (await asksFor(env, team.id)).filter(a => a.run_id === run.id && a.item === i && a.answer);
  const system = [
    "You are the Auditor for an MBA course, Coding with GPT, at Darden, answering a student team's follow-up question about one recommendation in your audit of their vibe-coded app.",
    "The course applies four steps adaptively: (1) design intent (personas, JTBD, user stories with OECs; a good design is a testable design), (2) unpacking (MVC; Given-When-Then), (3) effectuating between alternatives (stack, APIs, deploy targets), (4) iteratively coding, testing, debugging (tests, pipeline, observability).",
    "The readers are MBA students, not trained engineers. Answer the question they asked, plainly and specifically for their app, in a short paragraph or two. Explain why it matters and what a first step would look like. Don't invent facts about their app; if you can't tell from what's here, say so. Call the answer_question tool with your answer.",
  ].join("\n");
  const user = [
    `What you understood them to be building: ${r.understanding ? r.understanding.building + " How they'd know it worked: " + r.understanding.how_you_know : "(not recorded)"}`,
    `Your overall opinion: ${r.opinion}`,
    `The recommendation they're asking about (#${i + 1}): ${t.title}. ${t.observation}${t.why ? " Why it matters: " + t.why : ""}${t.where ? " Where: " + t.where : ""} (step: ${t.step}; action: ${t.action})`,
    earlier.length ? "Earlier questions on this item:\n" + earlier.map(a => `Q: ${a.question}\nA: ${a.answer}`).join("\n") : "",
    m && m.doc_text ? "Their product charter and design notes (excerpt):\n" + m.doc_text.slice(0, 12000) : "",
    `Their question: ${question}`,
  ].filter(Boolean).join("\n\n");
  const id = randomToken().slice(0, 12), at = new Date().toISOString();
  let answer = null, error = null;
  try {
    const res = await fetchWithRetry(env.ANTHROPIC_URL || ANTHROPIC_URL, { method: "POST", headers: aiHeaders(env), body: JSON.stringify(aiBody("grader", { maxTokens: 1200, system, tool: ASK_TOOL, user })) });
    if (!res.ok) error = "api " + res.status + ": " + apiError(await res.text());
    else { const input = toolInput(await res.json(), "answer_question"); if (input && input.answer) answer = String(input.answer); else error = "unreadable"; }
  } catch { error = "network"; }
  await env.DB.prepare("INSERT INTO audit_asks (id, team_id, run_id, item, at, question, answer, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, team.id, run.id, i, at, question, answer, error).run();
  if (error) return json({ error: "The Auditor couldn't answer just now. Try again in a minute." }, 502, cors);
  return json({ ask: { id, run_id: run.id, item: i, at, question, answer }, left: MAX_ASKS - count - 1 }, 200, cors);
}

// ---------- instructor ----------

async function results(b, env, cors) {
  if (!env.INSTRUCTOR_CODE || String(b.code || "").trim() !== env.INSTRUCTOR_CODE) return json({ error: "Wrong instructor code." }, 401, cors);
  const { results: teams } = await env.DB.prepare("SELECT * FROM audit_teams ORDER BY name").all();
  // Leave out test teams (only instructors on them) and the sample test.* roster accounts.
  const { results: staffRows } = await env.DB.prepare("SELECT email FROM roster WHERE role = 'instructor'").all();
  const staff = new Set(staffRows.map(r => r.email));
  const isTest = e => staff.has(e) || /^test\./.test(e);
  const out = [];
  for (const t of teams) {
    if (JSON.parse(t.members).every(m => isTest(m.email))) continue;
    const v = await view(env, t);
    const ok = v.runs.filter(r => r.result);
    const latest = ok[ok.length - 1] || null;
    const counted = latest ? latest.result.counts.good + latest.result.counts.work + latest.result.counts.missing : 0;
    const pct = latest && counted ? Math.round(100 * (latest.result.counts.good + 0.5 * latest.result.counts.work) / counted) : null;
    out.push({ ...v.team, asks: v.asks, material: v.material, runs: v.runs.length, errors: v.runs.filter(r => r.error).length, latest, pct, reports: ok });
  }
  // Every class team from the roster, matched to the audit team that shares the most members.
  const { results: people } = await env.DB.prepare("SELECT email, first, last, preferred, team FROM roster WHERE role IS NULL OR role != 'instructor' ORDER BY last, first").all();
  const groups = new Map();
  for (const p of people) {
    if (isTest(p.email)) continue; const k = p.team || ""; if (!groups.has(k)) groups.set(k, []); groups.get(k).push({ email: p.email, name: fullName(p) }); }
  const classTeams = [...groups].filter(([k]) => k).map(([name, members]) => {
    const emails = new Set(members.map(m => m.email));
    let best = null, n = 0;
    for (const t of out) { const k = t.members.filter(m => emails.has(m.email)).length; if (k > n) { best = t.name; n = k; } }
    return { name, members, audit_team: best };
  }).sort((a, z) => a.name.localeCompare(z.name));
  return json({ teams: out, class_teams: classTeams, unassigned: groups.get("") || [] }, 200, cors);
}

// The instructor sets each student's class team: { code, teams: { "email": "Team name", ... } }. Blank clears it.
async function setClassTeams(b, env, cors) {
  if (!env.INSTRUCTOR_CODE || String(b.code || "").trim() !== env.INSTRUCTOR_CODE) return json({ error: "Wrong instructor code." }, 401, cors);
  const pairs = Object.entries(b.teams || {}).map(([e, t]) => [normEmail(e), String(t || "").trim().slice(0, 80) || null]).filter(([e]) => e);
  if (!pairs.length) return json({ error: "No teams sent." }, 400, cors);
  const res = await env.DB.batch(pairs.map(([e, t]) => env.DB.prepare("UPDATE roster SET team = ? WHERE email = ?").bind(t, e)));
  const updated = res.reduce((n, r) => n + (r.meta && r.meta.changes || 0), 0);
  const missing = pairs.filter((_, i) => !(res[i].meta && res[i].meta.changes)).map(([e]) => e);
  return json({ updated, missing }, 200, cors);
}

// ---------- helpers ----------

async function fresh(env, team) { return env.DB.prepare("SELECT * FROM audit_teams WHERE id = ?").bind(team.id).first(); }
function cleanUrl(u) { const s = String(u || "").trim().slice(0, 300); return /^https?:\/\//.test(s) ? s : (s ? "https://" + s : null); }
function randomToken() {
  const a = new Uint8Array(18); crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sha256(s) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function fetchWithRetry(url, init, waits = [1500, 4000]) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try { res = await fetch(url, init); } catch (e) { if (attempt >= waits.length) throw e; res = null; }
    const busy = !res || res.status === 429 || res.status === 529 || res.status >= 500;
    if (!busy || attempt >= waits.length) return res;
    await new Promise(r => setTimeout(r, waits[attempt]));
  }
}
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...headers } });
}
