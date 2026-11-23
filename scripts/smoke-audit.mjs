// Live check of the worker, run after each deploy and once a day: the steps a team takes before an
// audit, against the deployed worker and a real test team, plus one tiny AI call each for the Auditor
// and the puzzle grader with exactly the settings real calls use (the API can change under us).
//
//   AUDIT_SMOKE_TOKEN  the test team's link token (the part after #t=)
//   AUDIT_SMOKE_NOTES  optional: the test team's charter and design notes (defaults to the HinH test doc)
//   AUDIT_SMOKE_REPO   optional: the test team's repo (defaults to the HinH parts catalog)
//   AUDIT_API          optional: the Auditor's address (defaults to the live one)
//
//   node scripts/smoke-audit.mjs

const API = process.env.AUDIT_API || "https://shrill-wood-3253.acowan.workers.dev/audit/";
const TOKEN = process.env.AUDIT_SMOKE_TOKEN;
const NOTES = process.env.AUDIT_SMOKE_NOTES || "https://docs.google.com/document/d/1YHKsS0hXguetIl1U2KkAw7CNFkLtxs_3Jl1kxkwgglw/edit";
const REPO = process.env.AUDIT_SMOKE_REPO || "https://github.com/alexcowan/2ModelfromDesignIII";

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

// 1. The charter and design notes open.
const doc = await call("doc", { doc_url: NOTES });
check(doc.status === 200, `charter and design notes open (HTTP ${doc.status}${doc.json.error ? ": " + doc.json.error : ""})`);
check(doc.json.found?.notes?.opened === true, "product charter and design notes: opened");

// 2. The repo step reads the repo.
const repo = await call("repo", { repo_url: REPO });
check(repo.status === 200 && !repo.json.need && !repo.json.error, `repo readable (HTTP ${repo.status}${repo.json.error ? ": " + repo.json.error : ""})`);

// 3. The AI accepts the requests the Auditor and the puzzle grader send.
const ping = await call("pingai", {});
for (const c of ping.json.checks || []) check(c.ok, `AI call for the ${c.kind} (${c.model}): ${c.detail}`);
if (!ping.json.checks) check(false, `AI check ran (HTTP ${ping.status}${ping.json.error ? ": " + ping.json.error : ""})`);

if (failures.length) { console.error(`\n${failures.length} check(s) failed.`); process.exit(1); }
console.log("\nThe Auditor's intake steps work on the live site.");
