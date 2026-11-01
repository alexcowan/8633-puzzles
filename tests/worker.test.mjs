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
