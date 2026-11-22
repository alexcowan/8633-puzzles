// Live check of the Auditor, run after each deploy: the steps a team takes before an audit,
// against the deployed worker and a real test team. No audit run, so no AI calls.
//
//   AUDIT_SMOKE_TOKEN  the test team's link token (the part after #t=)
//   AUDIT_SMOKE_SHEET  optional: the test team's audit sheet (defaults to the HinH test sheet)
//   AUDIT_API          optional: the Auditor's address (defaults to the live one)
//
//   node scripts/smoke-audit.mjs

const API = process.env.AUDIT_API || "https://shrill-wood-3253.acowan.workers.dev/audit/";
const TOKEN = process.env.AUDIT_SMOKE_TOKEN;
const SHEET = process.env.AUDIT_SMOKE_SHEET || "https://docs.google.com/spreadsheets/d/18fDDXfVX_T7kAMElZMwtBDnhJY-JhdOVWnanNubi8Es/edit";

if (!TOKEN) { console.log("AUDIT_SMOKE_TOKEN isn't set; skipping the live check."); process.exit(0); }

const failures = [];
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"}  ${what}`); if (!ok) failures.push(what); };

async function call(action, body) {
  const res = await fetch(API + action, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://alexcowan.github.io" },
    body: JSON.stringify({ token: TOKEN, ...body }),
  });
  let json = {};
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

// 1. The Submission: the sheet opens, the charter doc is opened, the repo is picked up,
//    and nothing from the Submission is listed as a link it couldn't open.
const doc = await call("doc", { doc_url: SHEET });
check(doc.status === 200, `sheet opens (HTTP ${doc.status}${doc.json.error ? ": " + doc.json.error : ""})`);
const found = doc.json.found || {};
check(found.notes?.opened === true, "product charter and design notes: opened");
check(/github\.com\//.test(found.repo || ""), `repo found in the Submission (${found.repo || "none"})`);
const unopened = doc.json.links?.unopened || [];
const stray = unopened.filter(u => /github\.com\//.test(u) || (found.repo && u.startsWith(found.repo)) || (found.deployed && u.startsWith(found.deployed)));
check(stray.length === 0, `no Submission links listed as "couldn't open"${stray.length ? ": " + stray.join("; ") : ""}`);

// 2. The repo step reads the repo the Submission points to.
if (found.repo) {
  const repo = await call("repo", { repo_url: found.repo });
  check(repo.status === 200 && !repo.json.need && !repo.json.error, `repo readable (HTTP ${repo.status}${repo.json.error ? ": " + repo.json.error : ""})`);
}

if (failures.length) { console.error(`\n${failures.length} check(s) failed.`); process.exit(1); }
console.log("\nThe Auditor's intake steps work on the live site.");
