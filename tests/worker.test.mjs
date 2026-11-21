// Runs the real worker locally (wrangler dev, local D1 and KV) against the fake Anthropic API.
// npm run test:worker
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { startFakeAnthropic } from "./fake-anthropic.mjs";

const W = path.resolve(import.meta.dirname, "../worker");
const PORT = 8799, FAKE = 9911, ORIGIN = "https://alexcowan.github.io";
const BASE = `http://127.0.0.1:${PORT}`;
const PERSIST = fs.mkdtempSync("/tmp/cwg-wrangler-");
const env = { ...process.env, NO_PROXY: "localhost,127.0.0.1", no_proxy: "localhost,127.0.0.1", WRANGLER_SEND_METRICS: "false", CI: "true" };
const wr = (...a) => execFileSync("npx", ["wrangler", ...a, "--persist-to", PERSIST], { cwd: W, env, stdio: ["ignore", "pipe", "pipe"] }).toString();
let dev, fake;

before(async () => {
  fake = await startFakeAnthropic(FAKE);
  fs.writeFileSync(path.join(W, ".dev.vars"), `ANTHROPIC_API_KEY=test\nCLASS_CODE=class123\nINSTRUCTOR_CODE=prof456\nANTHROPIC_URL=http://127.0.0.1:${FAKE}/v1/messages\n`);
  wr("d1", "migrations", "apply", "cwg", "--local");
  // Two comments posted before the move to D1, still in KV.
  wr("kv", "key", "put", "c:pipeline", JSON.stringify([{ id: "old00001", i: "AC", t: "First!", at: "2026-10-30T10:00:00.000Z" }, { id: "old00002", i: "MM", t: "Second", at: "2026-10-30T11:00:00.000Z" }]), "--binding", "COMMENTS", "--local");
  dev = spawn("npx", ["wrangler", "dev", "--local", "--port", String(PORT), "--persist-to", PERSIST, "--ip", "127.0.0.1"], { cwd: W, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let log = ""; dev.stdout.on("data", d => log += d); dev.stderr.on("data", d => log += d);
  for (let i = 0; i < 120; i++) {
    try { await fetch(BASE + "/comments?term=x", { headers: { Origin: ORIGIN } }); return; } catch { await new Promise(r => setTimeout(r, 500)); }
  }
  throw new Error("wrangler dev didn't start:\n" + log);
});
after(() => { try { process.kill(-dev.pid, "SIGTERM"); } catch {} dev?.stdout.destroy(); dev?.stderr.destroy(); fake?.server.close(); fs.rmSync(path.join(W, ".dev.vars"), { force: true }); });

const post = (p, body, origin = ORIGIN) => fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json", Origin: origin }, body: JSON.stringify(body) });
const grade = (extra = {}) => post("/grade", { puzzle: "s4-price", code: "class123", answers: { items: [{ label: "The Then", text: "x" }, { label: "The assumption", text: "y" }, { label: "The commit", text: "z" }] }, ...extra });

test("grade: one verdict per item, in order", async () => {
  const r = await grade(); assert.equal(r.status, 200);
  const d = await r.json();
  assert.deepEqual(d.results.map(x => [x.label, x.verdict]), [["The Then", "ok"], ["The assumption", "ok"], ["The commit", "ok"]]);
  assert.match(fake.state.last.system, /Bug: w/); // the s4-price answer key went to the model
});
test("grade: wrong class code, unknown puzzle, wrong origin", async () => {
  assert.equal((await grade({ code: "nope" })).status, 401);
  assert.equal((await grade({ puzzle: "s9-nothing" })).status, 400);
  assert.equal((await post("/grade", {}, "https://evil.example")).status, 403);
});
test("grade: a busy API is retried, then succeeds", async () => {
  await fetch(`http://127.0.0.1:${FAKE}/control`, { method: "POST", body: JSON.stringify({ fail: 2, status: 529 }) });
  const r = await grade(); assert.equal(r.status, 200);
  assert.equal(fake.state.calls, 3);
});
test("grade: still busy after two retries is a 502 the page can show", async () => {
  await fetch(`http://127.0.0.1:${FAKE}/control`, { method: "POST", body: JSON.stringify({ fail: 5, status: 429 }) });
  const r = await grade(); assert.equal(r.status, 502);
  assert.match((await r.json()).error, /Grader unavailable \(429\)/);
  await fetch(`http://127.0.0.1:${FAKE}/control`, { method: "POST", body: "{}" });
});
test("comments: old KV comments come across once, in order", async () => {
  const d = await (await fetch(BASE + "/comments?term=pipeline", { headers: { Origin: ORIGIN } })).json();
  assert.deepEqual(d.comments.map(c => c.id), ["old00001", "old00002"]);
  const again = await (await fetch(BASE + "/comments?term=pipeline", { headers: { Origin: ORIGIN } })).json();
  assert.equal(again.comments.length, 2);
});
test("comments: 20 students posting at once all land", async () => {
  const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => post("/comments", { term: "oneoh", check: "8633", initials: "S" + String.fromCharCode(65 + i), text: "comment " + i })));
  assert.ok(rs.every(r => r.status === 200));
  const d = await (await fetch(BASE + "/comments?term=oneoh", { headers: { Origin: ORIGIN } })).json();
  assert.equal(d.comments.length, 20);
  assert.deepEqual(Object.keys(d.comments[0]).sort(), ["at", "i", "id", "t"]);
});
test("comments: checks and instructor delete", async () => {
  assert.equal((await post("/comments", { term: "oneoh", check: "1234", initials: "AB", text: "x" })).status, 401);
  assert.equal((await post("/comments", { term: "oneoh", check: "8633", initials: "ABCDE", text: "x" })).status, 400);
  assert.equal((await post("/comments", { term: "oneoh", check: "8633", initials: "AB", text: "x".repeat(601) })).status, 413);
  assert.equal((await post("/comments", { term: "Bad Term", check: "8633", initials: "AB", text: "x" })).status, 400);
  const list = (await (await fetch(BASE + "/comments?term=oneoh", { headers: { Origin: ORIGIN } })).json()).comments;
  assert.equal((await post("/comments/delete", { term: "oneoh", id: list[0].id, code: "wrong" })).status, 401);
  const d = await (await post("/comments/delete", { term: "oneoh", id: list[0].id, code: "prof456" })).json();
  assert.equal(d.comments.length, 19);
});
test("stats: the grading record counts checks, errors and ok rates, and nothing personal", async () => {
  assert.equal((await post("/stats", { code: "nope" })).status, 401);
  const d = await (await post("/stats", { code: "prof456", days: 7 })).json();
  const p = d.puzzles.find(x => x.puzzle === "s4-price");
  assert.equal(p.checks, 3); // two good grades, one that stayed busy (wrong code / unknown puzzle aren't logged)
  assert.equal(p.errors, 1);
  assert.deepEqual(p.items.map(i => [i.label, i.ok, i.n]), [["The Then", 2, 2], ["The assumption", 2, 2], ["The commit", 2, 2]]);
  const rows = JSON.parse(wr("d1", "execute", "cwg", "--local", "--json", "--command", "SELECT * FROM grades"));
  const cols = Object.keys(rows[0].results[0]).sort();
  assert.deepEqual(cols, ["at", "error", "items", "ok", "puzzle", "verdicts"]);
});

// ---------------- Mid-quarter quiz ----------------
import { QUIZ, gradeQuiz, isJustChecking } from "../worker/src/quiz.js";
const BEST = { "p1-gwt": "b", "p1-steps": "b", "p1-mvc": "a", "p1-scenario": "a", "p1-data": "d", "p1-depdir": "a", "p1-ai": "a",
  "p2-stackpipe": "a", "p2-pyramid": "a", "p2-f": "c", "p2-integration": "a", "p2-niche": "a", "p2-verify": "a" };
const perfect = () => ({ ...Object.fromEntries(Object.entries(BEST).map(([k, v]) => [k, { pick: v }])),
  "p1-devtools": { element: "span.price", winner: ".promo .price parts.css:110", loser: ".catalog-part .price" },
  "p1-console": { predict: "b", paste: "112.00 string true" } });

test("quiz key: every page option has an explanation, and the best answers score full marks", () => {
  for (const q of QUIZ) if (q.type === "mc") for (const o of ["a", "b", "c", "d"]) assert.ok(q.explain[o], `${q.id} option ${o}`);
  const r = gradeQuiz(perfect());
  assert.equal(r.of, 15); assert.equal(r.score, 15);
  assert.deepEqual(r.grid.map(g => g.part + g.level).sort(), ["1A", "1F", "1S", "2A", "2F", "2S"]);
});
test("quiz key: partial credit, and the hands-on items aren't fussy", () => {
  const a = perfect();
  a["p1-mvc"] = { pick: "b" };                                                           // reasonable alternative
  a["p1-devtools"] = { element: "<span class=\"price\">", winner: "", loser: ".catalog-part .price" }; // one of two scored; bonus doesn't count
  a["p1-console"] = { predict: "a", paste: "  '112.00'  'string' true  VM123:2" };        // wrong prediction, messy paste
  const it = Object.fromEntries(gradeQuiz(a).items.map(i => [i.id, i]));
  assert.equal(it["p1-mvc"].credit, 0.5);
  assert.equal(it["p1-devtools"].credit, 0.5); assert.match(it["p1-devtools"].explain, /Bonus: right/);
  assert.equal(it["p1-console"].credit, 1); assert.equal(it["p1-console"].prediction, false);
  assert.equal(gradeQuiz({ "p1-console": { paste: "112.00" } }).items.find(i => i.id === "p1-console").credit, 0);
  assert.equal(gradeQuiz({ "p1-devtools": { loser: ".promo .price" } }).items.find(i => i.id === "p1-devtools").credit, 0);
});
test("quiz key: Just Checking", () => {
  assert.ok(isJustChecking("Just", "Checking")); assert.ok(isJustChecking(" just ", "checking!"));
  assert.ok(!isJustChecking("Justin", "Checkley"));
});
test("quiz: saves a named attempt and returns the grid; missing name is refused; no class code needed", async () => {
  assert.equal((await post("/quiz", { first: "A", last: "", answers: {} })).status, 400);
  const r = await post("/quiz", { first: "Ada", last: "Lovelace", answers: perfect() });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.score, 15); assert.equal(d.justChecking, false); assert.ok(d.items.every(i => i.explain));
  const jc = await (await post("/quiz", { first: "Just", last: "Checking", answers: {} })).json();
  assert.equal(jc.justChecking, true); assert.equal(jc.score, 0);
  const rows = JSON.parse(wr("d1", "execute", "cwg", "--local", "--json", "--command", "SELECT first, last, just_checking, score, of FROM quiz_attempts ORDER BY at"))[0].results;
  assert.deepEqual(rows, [{ first: "Ada", last: "Lovelace", just_checking: 0, score: 15, of: 15 }, { first: "Just", last: "Checking", just_checking: 1, score: 0, of: 15 }]);
});

// ---------- the Vibe Code Audit ----------
const PDF = Buffer.from("%PDF-1.4\n% a tiny stand-in\n").toString("base64");
test("audit: team setup from the roster, private link, materials, two rounds, instructor results", async () => {
  wr("d1", "execute", "cwg", "--local", "--command",
    "INSERT INTO roster (email, first, last, preferred) VALUES ('aaa1x@darden.virginia.edu','Clyde','Bowie','Findley'),('bbb2y@darden.virginia.edu','Julia','Boyer','Julia'),('ccc3z@darden.virginia.edu','Ada','Lovelace','Ada')");
  // The class code gates the roster.
  assert.equal((await post("/audit/roster", { code: "nope", q: "find" })).status, 401);
  // The page checks the code with an empty query before showing the rest of the form.
  assert.equal((await post("/audit/roster", { code: "nope", q: "" })).status, 401);
  assert.deepEqual(await (await post("/audit/roster", { code: "class123", q: "" })).json(), { people: [] });
  const found = await (await post("/audit/roster", { code: "class123", q: "findley" })).json();
  assert.deepEqual(found.people, [{ email: "aaa1x@darden.virginia.edu", name: "Findley Bowie" }]);
  // Someone off the roster is refused.
  assert.equal((await post("/audit/team", { code: "class123", me: "x@darden.virginia.edu", name: "T" })).status, 400);
  const made = await (await post("/audit/team", { code: "class123", me: "AAA1X@darden.virginia.edu", members: ["bbb2y@darden.virginia.edu"], name: "Parts Pals", project_type: "de novo" })).json();
  assert.ok(made.token && made.token.length >= 20);
  assert.deepEqual(made.team.members.map(m => m.name), ["Findley Bowie", "Julia Boyer"]);
  // Nobody on two teams.
  assert.equal((await post("/audit/team", { code: "class123", me: "ccc3z@darden.virginia.edu", members: ["bbb2y@darden.virginia.edu"], name: "Other" })).status, 409);
  // Except instructors, who can be on as many teams as they like.
  wr("d1", "execute", "cwg", "--local", "--command", "UPDATE roster SET role = 'instructor' WHERE email = 'ccc3z@darden.virginia.edu'");
  assert.equal((await post("/audit/team", { code: "class123", me: "ccc3z@darden.virginia.edu", name: "Test 1" })).status, 200);
  assert.equal((await post("/audit/team", { code: "class123", me: "ccc3z@darden.virginia.edu", name: "Test 2" })).status, 200);
  const token = made.token;
  assert.equal((await post("/audit/load", { token: "bad" })).status, 401);
  // Can't run without material.
  assert.equal((await post("/audit/run", { token })).status, 400);
  // Google address for sharing; blank means no doc for that person.
  const saved = await (await post("/audit/save", { token, deployed_url: "parts.example.com", members: [{ email: "aaa1x@darden.virginia.edu", google: "findley@gmail.com" }, { email: "bbb2y@darden.virginia.edu", google: "" }] })).json();
  assert.equal(saved.team.deployed_url, "https://parts.example.com");
  assert.deepEqual(saved.team.members.map(m => m.google), ["findley@gmail.com", ""]);
  // A ZIP the page unpacked: secrets and dependencies never make the slice.
  const z = await (await post("/audit/zip", { token, git_log: "abc first commit", files: [
    { path: "README.md", text: "# Parts" }, { path: "app.js", text: "console.log(1)" }, { path: ".env", text: "KEY=secret" }, { path: "node_modules/x/index.js", text: "x" }, { path: "logo.png" },
  ] })).json();
  assert.deepEqual(z.material.repo.files, ["README.md", "app.js"]);
  assert.equal(z.team.repo_access, "zip");
  assert.equal((await post("/audit/doc", { token, pdf: "bm90IGEgcGRm" })).status, 400);
  // Only a Google Sheet or Doc link (or a PDF) is accepted as the audit sheet.
  assert.equal((await post("/audit/doc", { token, doc_url: "https://example.com/notes" })).status, 400);
  const d = await (await post("/audit/doc", { token, pdf: PDF, filename: "audit.pdf" })).json();
  assert.equal(d.material.doc.source, "pdf");
  // Round 1: a report with the Top 10 first, a status per question, one follow-up.
  const r1 = await (await post("/audit/run", { token, stage: "checkin" })).json();
  assert.equal(r1.run.round, 1);
  assert.equal(r1.run.result.top10.length, 10);
  assert.equal(r1.run.result.questions.length, 14);
  assert.equal(r1.run.result.requests.length, 1);
  const sent = fake.state.last;
  assert.equal(sent.model, "claude-sonnet-5-5");
  assert.ok(sent.messages[0].content.some(c => c.type === "document"));
  assert.ok(!JSON.stringify(sent).includes("KEY=secret"));
  const c = r1.run.result.counts; assert.equal(c.good + c.work + c.missing, 14);
  // Round 2: answers go back, no more requests.
  const r2 = await (await post("/audit/run", { token, stage: "checkin", answers: [{ id: "B4", ask: "Show me where matching happens.", answer: "app.js line 3" }] })).json();
  assert.equal(r2.run.round, 2); assert.equal(r2.run.result.requests.length, 0);
  assert.match(JSON.stringify(fake.state.last.messages), /app\.js line 3/);
  // A new link replaces the old one.
  const { token: t2 } = await (await post("/audit/relink", { token })).json();
  assert.equal((await post("/audit/load", { token })).status, 401);
  assert.equal((await post("/audit/load", { token: t2 })).status, 200);
  // Instructor view.
  assert.equal((await post("/audit/results", { code: "class123" })).status, 401);
  const res = await (await post("/audit/results", { code: "prof456" })).json();
  const pals = res.teams.find(t => t.name === "Parts Pals"); assert.equal(res.teams.length, 3); assert.equal(pals.latest.round, 2);
  assert.ok(pals.pct > 0 && pals.pct <= 100);
});
