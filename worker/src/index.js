// cwg-grader: a small proxy that grades puzzle submissions with Claude.
// The API key, class code and rubrics live here, never in the pages.

const MODEL = "claude-haiku-5-5";
const MAX_TOKENS = 1500;

// One rubric per puzzle. Each criterion is a short, checkable statement.
// The page shows the same list to the student ("Be ready to explain").
const RUBRICS = {
  "s1-predict-then-run": {
    story: "As Trent the Technician, I know the part number, and I want to find it in the system so I can figure out the next steps of the repair.",
    // What the grader looks at, per scenario. Lenient on wording, strict on engagement.
    guidance: [
      "A prediction counts if it says, in any words, what Trent would get: a part, several parts, nothing, a count, a price. 'Just the one part' is fine. Only fail a prediction that is blank, or that describes screen mechanics with no outcome for Trent.",
      "Where the scenario asks bug-or-feature, the student needs a position AND a reason that mentions Trent, the repair, or the story. A reason about the code is not enough. No position at all is the main miss.",
      "The student's own scenario needs a Given, an exact When, a Then, and a reason the story requires it. If the app passed it, say so: the point was to find one it fails.",
    ],
  },

  // Session 2 puzzles send `answers.items`, an array of {label, ...fields}; one verdict per item.
  "s2-ship-the-fix": {
    story: "As Trent the Technician, I know the part number, and I want to find it in the system so I can figure out the next steps of the repair. The scenario being fixed: when nothing matches, Trent sees that there are no results for what he entered and is offered a way to get help. The student took that fix through four steps: intent, plan, choosing between alternatives, test and debug.",
    guidance: [
      "Step 3 choice: any of the three options (call the desk, text a photo via Twilio, AI photo identification) can be right. What matters is the reason. It passes if it refers to HinH's business: what is distinctive to HinH, what a 1.0 is for, variable vs fixed cost, who holds Trent's data, or technical debt. A reason that is only about which technology is better or cooler is thin. No reason is the main miss.",
      "Where it broke: the correct answer is the search. The input arrived as typed ('hx-2201') and the display showed what it was given; the search compared lower case against upper case and found nothing. 'Input' or 'display' is thin; say which trace line rules it out.",
      "The fix: the right one-line change is upper-casing the query before comparing. If fixes_tried shows 'includes' or 'display' first, that is fine as long as they ended with all_pass yes; note in one phrase what the wrong one would have done (includes: matches anywhere, still case-sensitive; display: changes what is shown, not what is compared). If all_pass is no, say so.",
      "The loop (plan_line_2_rewritten): the student rewrites plan line 2 ('Find the parts in the catalog whose number starts with what he typed') so that it no longer assumes matching case. It passes if the rewrite says, in any words, that case (or capitalization, or how he types it) should not matter, e.g. 'ignoring upper or lower case'. A rewrite that only restates the original, or that fixes something else (e.g. 'anywhere in the number'), is thin. Blank is the main miss.",
    ],
  },
  "s2-stage-commit-blame": {
    story: "As Trent the Technician, I know the part number, and I want to find it in the system so I can figure out the next steps of the repair. Round 1: the student chose which hunks of an AI's diff belong in the commit 'Show a notice and a way to get help when nothing matches' (the page checked this; correct is H2 and H3 only) and wrote its message. Round 2: a five-commit history where commit 4 ('Show how many are in stock instead of in/out') also changed `if (parts.length > 0)` to `if (parts)`, which is always true for an array, so the no-results notice never shows. The fix is to restore `if (parts.length > 0)` (or `parts.length === 0` in the else).",
    guidance: [
      "Staging: report correct_staging as given. For unstaged hunks, H1 (the case fix) should go in a second commit; H4 (a wording change nobody asked for) and H5 (test data in the catalog) should be discarded or questioned; either is fine. Putting H4 or H5 in a second commit is thin: say that nothing asked for them.",
      "Commit message: passes if a teammate could tell from the one line what changed for Trent and why, without the diff. 'Fix bug' or 'update render' is thin. Mentioning the notice or the no-results case and the reason is enough; a 50-72 character subject is ideal but do not fail on length alone.",
      "Which commit broke it: the answer is 4. Its message was true but the commit did more than it said ('partial'). If commits_opened shows they clicked only commits 1-3 or all five in order without using the lights, note that the lights let you find it in two clicks. If they answered 'false' for the message, say the message was accurate about the stock change; the problem is what it left out.",
      "The fix: the line must restore a length check on parts (e.g. 'if (parts.length > 0) {'). A line that touches the notice text or the catalog is thin. The message should say why (the empty check was broken by commit 4, an array is always truthy), not just 'fix notice'.",
    ],
  },

  // Session 3 pages send `page_check` (what the page measured after the student edited it in DevTools) plus `items`.
  "s3-whose-rule": {
    story: "As Trent the Technician, I want to see at a glance which parts are backordered so I don't drive across town for nothing. Bug: TH-7710 is in stock (its card says so) but shows the orange left edge that backordered parts get. The student used the browser's developer tools to find why. The facts: in s3-whose-rule/parts.css, line 61 (declaration on 62), the rule `#featured { border-left-color: #F99B1C; }` sets it; the TH-7710 card has id=\"featured\". It beats `.catalog-part` (line 71, which sets the in-stock teal edge) because an ID selector is more specific than a class selector; it wins even though it comes EARLIER in the file, so 'it comes last' is wrong. `.catalog-part.backordered` (line 105) is the rule meant to make cards orange and does not apply to TH-7710. page_check.passed says whether the page confirmed a working fix in the student's tab; page_check.fixed_by says how.",
    guidance: [
      "Which rule, and where: passes if it names #featured (or 'the featured ID rule') and parts.css; line 61 or 62 is ideal, a nearby line or no line is fine if the selector and file are right. Naming .catalog-part.backordered or 'the backordered class' is wrong: that rule doesn't apply to this card.",
      "Why it won: passes if it says, in any words, that an ID is more specific than a class (specificity, or 'IDs beat classes'). 'Because it's later' or 'because it's last' is wrong (it's earlier in the file). 'Because it's more specific' with no mention of ID vs class is thin but close; say what to add.",
      "The commit: passes if the change is deleting the #featured rule (or its border-left-color line), or removing id=\"featured\" from the card's HTML, AND the reason is about the next person or the style guide: a style on one card is a one-off exception nobody can find, beats every rule, and has to be found and undone later. Bonus, not required: noting that a DevTools change disappears on reload, so the fix has to be committed in the file. If page_check.fixed_by mentions 'a style attribute on a card', the student took the shortcut; say so in one phrase. Changing #featured's color to teal works but is thin: it keeps a leftover rule and hard-codes a color the stylesheet already has as a variable.",
    ],
  },
  "s3-phone": {
    story: "As Trent the Technician, I want to see a part's price and whether it's in stock on my phone, so I can quote the customer on the spot. Bug: on a 390 px phone, each card runs off the right edge and the prices are cut off. The student predicted what Trent would see, then used the browser's device toolbar and developer tools to find why. The facts: in s3-phone/parts.css, inside `@media (max-width: 600px)` (line 113), `.catalog-part { width: 100vw; }` (line 121). 100vw is the whole screen (390 px), not the column the card sits in (about 332 px on the real page), and because width sets the content box, padding (16 + 16) and border (6 left + 1 right) are added on top: 390 + 32 + 7 = 429 px in a 332 px column, about 97 px too wide. The right fix is deleting that line: the phone rule already makes the grid one column (1fr), so cards fill the width on their own, on every phone. width: 100% still overflows by the padding and border (39 px); 100% plus box-sizing: border-box works but is two changes to put back what the grid already does. page_check records what the student left in the rule on each try.",
    guidance: [
      "Then vs. what he got: the Then passes if it says what Trent should see per the story (both capacitors, each with a price and stock status); 'the parts' with no price is thin. The 'got' passes if it says the prices (or the right side of the cards) are cut off or off-screen. If 'then' already described the bug, that's fine only if it was written as a prediction; don't penalize a correct guess.",
      "The box: passes if it names the card (.catalog-part) and gives numbers that show content + padding + border exceeding the space, e.g. 390 + 32 + 7 = 429 vs about 332. Numbers within a few pixels are fine (device frames and window sizes vary). Naming the element with no numbers, or only one number, is thin. Saying the grid or the page is too wide is thin: the grid is the space; the card is what's too wide.",
      "The commit: passes if it deletes `width: 100vw` (line 121, inside the @media rule in parts.css) AND explains that the one-column grid already sizes the card to whatever space it has, so it works at any width; mentioning that 100vw means the whole screen rather than the card's column is good. Changing it to 100% is thin: page_check.attempts will usually show that failing; say padding and border are added outside a width. 100% plus box-sizing: border-box passes but note it's two lines to undo one. A fixed number (e.g. 330px) is thin: it fits one phone, not every phone.",
    ],
  },
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST" || new URL(request.url).pathname !== "/grade") {
      return json({ error: "Not found" }, 404, cors);
    }
    if (!allowedOrigin(origin, env)) return json({ error: "Origin not allowed" }, 403, cors);

    // Per-IP backstop. Campus Wi-Fi puts a whole room behind one IP, so this is a room-sized limit.
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) return json({ error: "Too many requests from this network. Try again in a minute." }, 429, cors);

    let body;
    try { body = await request.json(); } catch { return json({ error: "Bad JSON" }, 400, cors); }

    if (!body.code || body.code.trim() !== env.CLASS_CODE) return json({ error: "Wrong class code." }, 401, cors);
    const rubric = RUBRICS[body.puzzle];
    if (!rubric) return json({ error: "Unknown puzzle." }, 400, cors);

    const answers = JSON.stringify(body.answers || {});
    if (answers.length > 8000) return json({ error: "Submission too long." }, 413, cors);

    // Labels: Session 1 pages send `scenarios` (+ an implied "Your scenario"); later pages send `items` with their own labels.
    const a = body.answers || {};
    const labels = Array.isArray(a.items)
      ? a.items.map(it => String(it.label || "")).filter(Boolean)
      : (Array.isArray(a.scenarios) ? a.scenarios.map(s => `Scenario ${s.n}`) : []).concat(["Your scenario"]);
    const system = [
      "You review an in-class puzzle for an MBA course on coding with AI. The student worked a small, concrete exercise and wrote notes. You are not grading; you are telling them where their thinking is thin.",
      "The user story the app was built for: " + rubric.story,
      "How to judge:",
      ...rubric.guidance.map((g, i) => `${i + 1}. ${g}`),
      "Give one verdict per item, in this order: " + labels.join(", ") + ". 'ok' means the answer and any note engage with the story and the guidance above; 'thin' means something is missing. The note is one sentence, under 20 words, that says what is missing or what was done well. Be plain and specific; do not restate the student's text.",
      "Then one sentence of summary, under 30 words.",
      "Respond with JSON only, no prose around it, in this shape:",
      `{"results":[{"label":"Scenario 1","verdict":"ok","note":"one sentence"}, ...],"summary":"one sentence"}`,
    ].join("\n");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: "disabled" },
        system,
        messages: [{ role: "user", content: "Student answers (JSON):\n" + answers }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return json({ error: "Grader unavailable (" + res.status + ")", detail: detail.slice(0, 300) }, 502, cors);
    }
    const data = await res.json();
    const text = (data.content || []).map(c => c.text || "").join("");
    let parsed;
    try { parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); }
    catch { return json({ error: "Grader returned something unreadable.", raw: text.slice(0, 300) }, 502, cors); }

    // One verdict per item, in order; fill any the model skipped.
    const got = Array.isArray(parsed.results) ? parsed.results : [];
    // Match by label, then fall back to position: the model sometimes rewords a label.
    const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const results = labels.map((l, i) => {
      const r = got.find(x => x && norm(x.label) === norm(l)) || got[i];
      if (!r) return { label: l, verdict: "thin", note: "No comment returned for this item." };
      const v = String(r.verdict || r.status || "").toLowerCase();
      return { label: l, verdict: v === "ok" ? "ok" : "thin", note: String(r.note || r.comment || "") };
    });
    return json({ results, summary: String(parsed.summary || "") }, 200, cors);
  },
};

function allowedOrigin(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  return allowed.includes(origin);
}
function corsHeaders(origin, env) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(origin, env) ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
}
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...headers } });
}
