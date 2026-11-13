// Mid-quarter check-in quiz: the answer key. The page (site/quiz.html) has the questions and options;
// the credit for each option and the explanations stay here, so they aren't in the page source.
// Grading is deterministic: no AI call. Credit per item is 0 to 1.
// Levels: F = foundational (know the idea), A = applied (use it on HinH), S = stretch (choose between alternatives and say why).

export const QUIZ_ID = "midq-ay27";

export const QUIZ = [
  // ---------------- Part 1 · The Fundamentals (Sessions 1–5) ----------------
  { id: "p1-gwt", part: 1, level: "F", s: 1, type: "mc",
    credit: { b: 1 },
    explain: {
      b: "Right. A Then says what Trent sees, specifically enough that you could check it.",
      a: "This one says how the page is built (a div re-rendering). A Then can name what the user does and sees, but not how the page is built.",
      c: "“The search works” can't be checked. What would you look for?",
      d: "This is the implementation (an API call). Trent never sees it, and the code could change without the story changing.",
    },
    practice: ["s1-predict-then-run.html", "terms.html?s=1"] },

  { id: "p1-steps", part: 1, level: "F", s: 2, type: "mc",
    credit: { b: 1 },
    explain: {
      b: "Right. Pseudocode, the plan, is step 2: unpacking what you want to have happen into codable steps. Read it before the code.",
      a: "Step 1 is the story and its scenarios: what should happen, not the steps to make it happen.",
      c: "Step 3 is choosing between ways to do one of those steps (call a service, use a library, write it).",
      d: "Step 4 comes once there's code to run.",
    },
    practice: ["s2-read-the-plan.html", "terms.html?s=2"] },

  { id: "p1-mvc", part: 1, level: "F", s: 3, type: "mc",
    credit: { a: 1, b: 0.5 },
    explain: {
      a: "That's the one I'd pick: what a backordered part looks like is the view's job, in the stylesheet.",
      b: "Reasonable, and half right: the controller decides which cards get the backordered class. The orange itself is the view's.",
      c: "The model holds whether the part is in stock. It shouldn't know what color anything is.",
      d: "It does belong somewhere in particular: one place to look.",
    },
    practice: ["s3-whose-rule.html", "terms.html?s=3"] },

  { id: "p1-devtools", part: 1, level: "A", s: 3, type: "devtools",
    // In site/quiz/parts.css: `.catalog-part .price` (line 88) sets the navy; `.promo .price` (line 110) wins.
    winner: { must: ["promo", "price"], line: 110 }, loser: { must: ["catalog-part", "price"] }, element: { must: ["span", "price"] },
    explain: {
      ok: "Right: the price is a span with class price; `.promo .price` (parts.css, line 110) sets the red, and `.catalog-part .price` (line 88) is crossed out. Both are one class plus one class, equally specific, so the later one wins.",
      element: "The element is the price itself: a span with class price. Right-click the price, not the card, and choose Inspect.",
      winner: "The winning rule is the one on top in Styles with a color that isn't crossed out: `.promo .price`, in parts.css around line 110.",
      loser: "Look below the winner in Styles for a color with a line through it: `.catalog-part .price`, around line 88.",
    },
    practice: ["s3-whose-rule.html", "s3-phone.html"] },

  { id: "p1-console", part: 1, level: "A", s: 4, type: "console",
    predictRight: "b",
    explain: {
      ok: "You ran it. It prints 184.00 string true: a data attribute is always text, and text compares character by character, so '1' before '5' makes \"184.00\" <= \"50\" true.",
      predictRight: "And your prediction was right.",
      predictWrong: "Your prediction was different, which is the useful part: the value is text, not a number, so the comparison goes alphabetically. Number(...) at the edge fixes it.",
      paste: "I couldn't find the output in what you pasted. Paste the line the Console prints after you press Enter (it should have three values on it).",
    },
    practice: ["s4-price.html", "terms.html?s=4"] },

  { id: "p1-scenario", part: 1, level: "A", s: 4, type: "mc",
    credit: { a: 1, b: 1 },
    explain: {
      a: "Right. The story says “at or under,” and a part priced exactly at the limit is where code most often gets it wrong (< instead of <=).",
      b: "Right. No limit at all is a case the story covers and code easily misses (an empty box can come through as 0).",
      c: "Sorting isn't in the story. Adding it changes what you're building, not how well you test it.",
      d: "The grid is the view's business. A scenario says what Trent sees, not how it's laid out.",
    },
    practice: ["s4-price.html", "s1-predict-then-run.html"] },

  { id: "p1-data", part: 1, level: "A", s: 5, type: "mc",
    credit: { b: 1 },
    explain: {
      b: "Right. List price lives in Parts, once. What each customer was charged is a different fact, about the job, and it stays on the job.",
      a: "Then last month's invoices would show this month's price. A lookup to the current price rewrites history.",
      c: "The part name is a fact about the part: it belongs in Parts, one place, not on every job.",
      d: "A nightly copy is the same fact in two places again, and it's stale by morning.",
    },
    practice: ["s5-price.html", "terms.html?s=5"] },

  { id: "p1-depdir", part: 1, level: "S", s: 3, type: "mc",
    credit: { a: 1, b: 1 },
    explain: {
      a: "Right. The promo page changes this month; the design system changes a few times a year. The page depends on the design system, not the other way around.",
      b: "Also right, if sale prices will show up on more than one page: then it's a design-system component, named for what it is (sale), not for one page.",
      c: "One stylesheet isn't DRYer if it carries a rule for one page: now the design system depends on the page, and the next person can't tell it's safe to remove.",
      d: "An in-line style outranks every rule and is the hardest thing to find and undo.",
    },
    practice: ["s3-whose-rule.html", "terms.html?s=3"] },

  { id: "p1-ai", part: 1, level: "S", s: 4, type: "mc",
    credit: { a: 1 },
    explain: {
      a: "Right. The AI goes behind the interface, and the adapter checks what comes back, so showParts still gets the same Then for the same Given. One side of an interface can be probabilistic only if the other side isn't.",
      b: "Then the story's implementation knows about the AI, and its Then changes run to run. You can't write a test for that.",
      c: "An AI can absolutely be part of an application. It just can't be the part you need to be deterministic.",
      d: "“About right” isn't a Then you can check. Write the check into the adapter instead.",
    },
    practice: ["s4-interface.html", "terms.html?s=4"] },

  // ---------------- Part 2 · The Systems (Sessions 6–7, so far) ----------------
  { id: "p2-stackpipe", part: 2, level: "F", s: 6, type: "mc",
    credit: { a: 1 },
    explain: {
      a: "Right. The test: would the pain go away with the same stack and better test and deploy automation? Here, yes.",
      b: "Switching frameworks wouldn't touch a day of clicking around before every release.",
      c: "Code organization matters, but the day of manual checking is the release process.",
      d: "You can tell from where the time goes: it's spent releasing, not building.",
    },
    practice: ["terms.html", "syllabus.html"] },

  { id: "p2-pyramid", part: 2, level: "F", s: 7, type: "mc",
    credit: { a: 1 },
    explain: {
      a: "Right. One function, fixed inputs, nothing else running: a unit test. When it fails, it names the function.",
      b: "An integration test runs pieces together, like the controller against a copy of the page.",
      c: "A system test drives the real page the way Trent would.",
      d: "A feature flag runs in production on live users. This runs in seconds on every commit.",
    },
    practice: ["s7-three-tests.html"] },

  { id: "p2-f", part: 2, level: "A", s: 6, type: "mc",
    credit: { c: 1 },
    explain: {
      c: "Right: $5,000 / 0.10 = $50,000 and $5,000 / 0.50 = $10,000. No plausible saving on team cost moves F the way the success rate does.",
      a: "That's the cost of any feature. F is the cost of a successful one, so divide by the success rate.",
      b: "Close, but the other way round: the team that succeeds less pays more per success.",
      d: "Divide by the success rate: $5,000 / 0.10 and $5,000 / 0.50.",
    },
    practice: ["syllabus.html"] },

  { id: "p2-integration", part: 2, level: "A", s: 7, type: "mc",
    credit: { b: 1 },
    explain: {
      b: "Right. The integration test used its own copy of the page, which still said max-price. Test copies of the page can drift from the real one, and only a test against the real page sees that.",
      a: "The unit test passed for that reason. The integration test does run the controller against a page, just not the real one.",
      c: "The tests are deterministic. They passed because neither looked at the real page's HTML.",
      d: "The system test caught it, so the change did break something Trent would see.",
    },
    practice: ["s7-three-tests.html"] },

  { id: "p2-niche", part: 2, level: "S", s: 6, type: "mc",
    credit: { a: 1 },
    explain: {
      a: "Right. AI writes much better code for popular stacks, so a niche one charges a tax on every feature, in f-e. It can still be the right call, but it should be a deliberate one.",
      b: "The popular choice is often right, but the AI doesn't know your scale, security exposure, or what your team knows. “The AI picked it” is how you got a stack, not whether to keep it.",
      c: "More tests catch the failures. They don't make the AI any better at writing for the stack.",
      d: "Nothing here says users want the features any less. The cost shows up in what the team can ship.",
    },
    practice: ["syllabus.html"] },

  { id: "p2-verify", part: 2, level: "S", s: 7, type: "mc",
    credit: { a: 1, b: 0.5 },
    explain: {
      a: "Right. Generating changes got cheap; verifying them didn't. Your test and deploy machinery has to grow at least as fast as what goes into it. Spend the reclaimed time there.",
      b: "Reasonable for a week, and half right: matching the rate of change to what you can verify is the point. But the lasting fix is more verification, not less generation.",
      c: "Finding who merged it fixes nothing in the pipeline. Ask what would have caught it, so the fix also catches the next one.",
      d: "A review meeting before every release is the old trap: bigger, rarer releases that are harder to test and harder to diagnose.",
    },
    practice: ["s7-three-tests.html"] },
];

export const LEVELS = { F: "Foundational", A: "Applied", S: "Stretch" };
export const PARTS = { 1: "Part 1 · The Fundamentals", 2: "Part 2 · The Systems (so far)" };

const norm = s => String(s || "").toLowerCase().replace(/[`'"]/g, "").replace(/\s+/g, " ").trim();
const has = (text, words) => words.every(w => norm(text).includes(w));

// Returns {credit, explain} for one item. `a` is what the page sent for that item.
export function gradeItem(q, a) {
  a = a || {};
  if (q.type === "mc") {
    const pick = String(a.pick || "");
    const credit = q.credit[pick] || 0;
    let explain = pick ? (q.explain[pick] || "") : "Not answered.";
    // On a miss, also say what I'd pick and why, so the student leaves knowing the answer.
    if (credit < 1) {
      const best = Object.keys(q.credit).find(k => q.credit[k] === 1);
      const why = q.explain[best].replace(/^(Right|That's the one I'd pick)[.:]\s*/, "");
      explain += " What I'd pick: " + why.charAt(0).toUpperCase() + why.slice(1);
    }
    return { credit, explain };
  }
  if (q.type === "devtools") {
    const parts = [
      ["element", has(a.element, q.element.must)],
      ["winner", has(a.winner, q.winner.must)],
      ["loser", has(a.loser, q.loser.must) && !has(a.loser, ["promo"])],
    ];
    const got = parts.filter(p => p[1]).length;
    const credit = Math.round((got / 3) * 100) / 100;
    const explain = got === 3 ? q.explain.ok : parts.filter(p => !p[1]).map(p => q.explain[p[0]]).join(" ");
    return { credit, explain };
  }
  if (q.type === "console") {
    // Lenient: the pasted line has to show it's text and that the comparison came out true. Quotes, spacing,
    // a missing 184, or extra Console lines don't matter.
    const p = norm(a.paste);
    const ran = /\bstring\b/.test(p) && /\btrue\b/.test(p);
    const pred = String(a.predict || "") === q.predictRight;
    if (!ran) return { credit: 0, explain: q.explain.paste };
    return { credit: 1, explain: q.explain.ok + " " + (pred ? q.explain.predictRight : q.explain.predictWrong), prediction: pred };
  }
  return { credit: 0, explain: "" };
}

export function gradeQuiz(answers) {
  answers = answers || {};
  const items = QUIZ.map(q => ({ id: q.id, part: q.part, level: q.level, ...gradeItem(q, answers[q.id]), practice: q.practice }));
  const grid = {};
  for (const it of items) {
    const k = it.part + it.level;
    const g = grid[k] || (grid[k] = { part: it.part, level: it.level, got: 0, of: 0 });
    g.got += it.credit; g.of += 1;
  }
  const score = items.reduce((t, i) => t + i.credit, 0);
  return { items, grid: Object.values(grid), score: Math.round(score * 100) / 100, of: items.length };
}

export function isJustChecking(first, last) {
  const n = (norm(first) + " " + norm(last)).replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  return n === "just checking" || n.startsWith("just checking");
}
