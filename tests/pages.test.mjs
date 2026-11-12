// Browser tests for every page in site/, with the grader replaced by a fake.
// npm run test:pages            (SITE=path/to/site to test another copy, e.g. before/after a refactor)
// Each puzzle page: loads without errors (other than the ones a puzzle plants on purpose), then a student
// fills every box, runs every scenario, and clicks Check: the page must send the grader its puzzle id and
// the class code, and show the verdicts it gets back.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const SITE = path.resolve(process.env.SITE || path.join(import.meta.dirname, "../site"));
const PORT = 8766, BASE = `http://localhost:${PORT}/`;
const GRADER = /shrill-wood-3253\.acowan\.workers\.dev/;
// Errors a puzzle shows on purpose: the S4 warm-up's broken checkbox is the bug students find.
const PLANTED = { "s4-checkbox.html": /Cannot read properties of null \(reading 'addEventListener'\)/ };
const NO_GRADER = new Set(["index.html", "s1-warmup.html", "s2-github-setup.html", "s2-read-the-plan.html", "s4-seam.html", "terms.html", "stats.html", "syllabus.html", "quiz.html"]);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg" };

let server, browser;
export const transcript = {}; // page -> what it sent and showed, for comparing two copies of the site
before(async () => {
  server = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
    const f = path.join(SITE, p);
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
  }).listen(PORT);
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close(); server?.close();
  if (process.env.TRANSCRIPT) fs.writeFileSync(process.env.TRANSCRIPT, JSON.stringify(transcript, null, 1));
});

function fakeGrader(sent) {
  return async route => {
    const req = route.request(), url = req.url();
    const cors = { "access-control-allow-origin": "*", "content-type": "application/json" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST, OPTIONS" } });
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    sent.push({ path: new URL(url).pathname, body });
    if (url.includes("/grade")) {
      const a = body.answers || {};
      const labels = Array.isArray(a.items) ? a.items.map(i => i.label) : (a.scenarios || []).map(s => `Scenario ${s.n}`).concat(["Your scenario"]);
      return route.fulfill({ headers: cors, body: JSON.stringify({ results: labels.map(l => ({ label: l, verdict: "ok", note: "FAKE-NOTE " + l })), summary: "FAKE-SUMMARY" }) });
    }
    if (url.includes("/sheet")) {
      return route.fulfill({ headers: cors, body: JSON.stringify({ tabs: [
        { name: "Parts", rows: [["part_number", "name", "price"], ["HX-2201", "Blower motor", "184"]] },
        { name: "Jobs", rows: [["job", "date", "customer"], ["J-1041", "2026-10-02", "Alvarez"]] },
        { name: "Job_Parts", rows: [["job", "part_number", "price_charged"], ["J-1041", "HX-2201", "184"]] }] }) });
    }
    if (url.includes("/quiz")) return route.fulfill({ headers: cors, body: JSON.stringify({ score: 1, of: 2, justChecking: false,
      grid: [{ part: 1, level: "F", got: 1, of: 1 }, { part: 2, level: "S", got: 0, of: 1 }],
      items: [{ id: "p1-gwt", part: 1, level: "F", credit: 1, explain: "FAKE-EXPLAIN right" }, { id: "p2-verify", part: 2, level: "S", credit: 0, explain: "FAKE-EXPLAIN wrong", practice: ["s7-three-tests.html"] }] }) });
    if (url.includes("/comments")) return route.fulfill({ headers: cors, body: JSON.stringify({ comments: [{ id: "abc12345", i: "AC", t: "FAKE-COMMENT", at: "2026-10-30T10:00:00Z" }] }) });
    return route.fulfill({ status: 404, headers: cors, body: "{}" });
  };
}

async function openPage(name, { scheme = "light" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
  const sent = [], errors = [];
  await ctx.route(GRADER, fakeGrader(sent));
  await ctx.route(/^https?:\/\/(?!localhost)/, r => (GRADER.test(r.request().url()) ? r.fallback() : r.abort()));
  await ctx.addInitScript(() => { try { localStorage.setItem("cwg-code", "class123"); } catch {} Math.random = () => 0.42; });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|net::ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + name, { waitUntil: "networkidle" }); // some pages fetch their source code after load
  return { ctx, page, sent, errors };
}

// A student who answers everything: fill each empty box, tick each first option, run each scenario.
async function workThePuzzle(page) {
  for (let round = 0; round < 3; round++) {
    await page.evaluate(() => {
      const skip = el => /code/i.test(el.id) || el.closest("[hidden]") || el.disabled || el.readOnly;
      for (const el of document.querySelectorAll("textarea, input[type=text], input:not([type])")) {
        if (skip(el) || el.value) continue;
        el.value = "test answer"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const groups = new Set();
      for (const el of document.querySelectorAll("input[type=radio]")) {
        if (el.disabled || groups.has(el.name)) continue; groups.add(el.name);
        if (!document.querySelector(`input[type=radio][name="${el.name}"]:checked`)) el.click();
      }
      for (const el of document.querySelectorAll("select")) if (!el.disabled && el.options.length > 1 && el.selectedIndex <= 0) { el.selectedIndex = 1; el.dispatchEvent(new Event("change", { bubbles: true })); }
    });
    const runs = page.locator("button:is([id^=run-], #x-run, #wu-run, #run-observe, #check-page, #check-found, #reveal, #read-sheet, #coach-go):visible:enabled");
    for (let i = 0; i < await runs.count(); i++) await runs.nth(i).click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(150);
  }
}

const pages = fs.readdirSync(SITE).filter(f => f.endsWith(".html")).sort();

for (const name of pages) {
  test(`${name}: loads cleanly in light and dark`, async () => {
    for (const scheme of ["light", "dark"]) {
      const { ctx, page, errors } = await openPage(name, { scheme });
      await page.waitForTimeout(200);
      const unexpected = errors.filter(e => !(PLANTED[name] && PLANTED[name].test(e)));
      assert.deepEqual(unexpected, [], `${name} (${scheme}) errors`);
      assert.ok((await page.locator("body").innerText()).trim().length > 0, "page is not blank");
      await ctx.close();
    }
  });

  if (NO_GRADER.has(name)) continue;
  test(`${name}: Check sends the puzzle and class code, and shows the verdicts`, async () => {
    const { ctx, page, sent } = await openPage(name);
    await workThePuzzle(page);
    const check = page.locator("button:is(#grade, #check):visible").first();
    assert.ok(await check.count(), "has a Check button");
    await check.click();
    await page.waitForTimeout(400);
    const grades = sent.filter(s => s.path === "/grade");
    assert.ok(grades.length >= 1, "sent a grading request");
    const g = grades.at(-1).body;
    const pid = await page.evaluate(() => typeof PUZZLE_ID !== "undefined" ? PUZZLE_ID : null);
    if (pid) assert.equal(g.puzzle, pid);
    assert.equal(g.code, "class123");
    const shown = await page.locator("body").innerText();
    assert.match(shown, /FAKE-NOTE/, "verdict notes appear on the page");
    transcript[name] = { sent: sent.map(s => s.body), shown };
    await ctx.close();
  });
}

test("terms.html: comments load and a new comment posts", async () => {
  const { ctx, page, sent } = await openPage("terms.html");
  await page.locator("details.cbox summary").first().click();
  await page.locator(".cmts").getByText("FAKE-COMMENT").waitFor({ timeout: 3000 });
  assert.match(await page.locator("details.cbox .n").first().innerText(), /\(1\)/, "comment count shows");
  const form = page.locator("form.cform").first();
  await form.locator("textarea").fill("A test comment");
  await form.locator(".ini").fill("AC");
  await form.locator(".chk").fill("8633");
  await form.locator("button[type=submit]").click();
  await form.page().getByText("Posted.").waitFor({ timeout: 3000 });
  const posted = sent.filter(s => s.path === "/comments" && s.body).at(-1).body;
  assert.equal(posted.text, "A test comment"); assert.equal(posted.initials, "AC"); assert.equal(posted.check, "8633");
  transcript["terms.html"] = { sent: sent.map(s => s.body) };
  await ctx.close();
});

test("quiz.html: sends name, code and every answer, then shows where the student stands", async () => {
  const { ctx, page, sent } = await openPage("quiz.html");
  await page.locator("#first").fill("Ada"); await page.locator("#last").fill("Lovelace");
  await page.locator('input[name="p1-gwt"][value="b"]').check();
  await page.locator('input[name="p1-console"][value="b"]').check();
  await page.locator("#console-paste").fill("184.00 string true");
  await page.locator("#dt-winner").fill(".promo .price parts.css:110");
  // The real stylesheet makes IG-3300's price red and the others navy, and `.promo .price` is what does it.
  const colors = await page.evaluate(() => [...document.querySelectorAll(".catalog-part .price")].map(e => getComputedStyle(e).color));
  assert.equal(new Set(colors).size, 2, "one price is a different color");
  assert.equal(colors[2], "rgb(192, 57, 43)");
  await page.locator("#submit").click();
  await page.getByText("FAKE-EXPLAIN wrong").waitFor({ timeout: 3000 });
  const b = sent.filter(s => s.path === "/quiz").at(-1).body;
  assert.equal(b.first, "Ada"); assert.equal(b.last, "Lovelace"); assert.equal(b.code, "class123");
  assert.equal(b.answers["p1-gwt"].pick, "b");
  assert.equal(b.answers["p1-console"].paste, "184.00 string true");
  assert.match(b.answers["p1-devtools"].winner, /promo/);
  assert.equal(Object.keys(b.answers).length, 15);
  const shown = await page.locator("#results").innerText();
  assert.match(shown, /Solid/); assert.match(shown, /More practice/);
  assert.match(shown, /Which test catches it\?/, "links practice for what was missed");
  // Reloading keeps the result on screen.
  await page.reload(); await page.getByText("FAKE-EXPLAIN wrong").waitFor({ timeout: 3000 });
  await ctx.close();
});
