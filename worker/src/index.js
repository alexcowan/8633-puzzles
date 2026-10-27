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
      "The commit: passes if the change is deleting the #featured rule (or its border-left-color line), or removing id=\"featured\" from the card's HTML. A reason is not required to pass. If the answer gives one about the next person or the style guide (a one-off style on one card is an exception nobody can find and has to be undone later), say that was well seen. Also well seen, not required: noting that a DevTools change disappears on reload, so the fix has to be committed in the file. If page_check.fixed_by mentions 'a style attribute on a card', the student took the shortcut; say so in one phrase (an in-line style outranks every rule and is the hardest thing to undo). Changing #featured's color to teal works but is thin: it keeps a leftover rule and hard-codes a color the stylesheet already has as a variable. The course's one assumption about HinH: parts.css is the design system, it changes a few times a year, pages change every week, so pages depend on the design system and never the other way around. If the answer says #featured is the design system carrying a rule for one page's promo (the dependency pointing the wrong way), say that was well seen; it is not required to pass.",
    ],
  },
  "s3-phone": {
    story: "As Trent the Technician, I want to see a part's price and whether it's in stock, so I can quote the customer on the spot. Bug: on a 390 px phone, each card runs off the right edge and the prices are cut off. The student predicted what Trent would see, then used the browser's device toolbar and developer tools to find why. The facts: in s3-phone/parts.css, inside `@media (max-width: 600px)` (line 113), `.catalog-part { width: 100vw; }` (line 121). 100vw is the whole screen (390 px), not the column the card sits in (about 332 px on the real page), and because width sets the content box, padding (16 + 16) and border (6 left + 1 right) are added on top: 390 + 32 + 7 = 429 px in a 332 px column, about 97 px too wide. The right fix is deleting that line: the phone rule already makes the grid one column (1fr), so cards fill the width on their own, on every phone. width: 100% still overflows by the padding and border (39 px); 100% plus box-sizing: border-box works but is two changes to put back what the grid already does. page_check records what the student left in the rule on each try.",
    guidance: [
      "Then vs. what he got: the Then passes if it says what Trent should see per the story (both capacitors, each with a price and stock status); 'the parts' with no price is thin. The 'got' passes if it says the prices (or the right side of the cards) are cut off or off-screen. If 'then' already described the bug, that's fine only if it was written as a prediction; don't penalize a correct guess.",
      "The box: passes if it names the card (.catalog-part) and gives numbers that show content + padding + border exceeding the space, e.g. 390 + 32 + 7 = 429 vs about 332. Numbers within a few pixels are fine (device frames and window sizes vary). Naming the element with no numbers, or only one number, is thin. Saying the grid or the page is too wide is thin: the grid is the space; the card is what's too wide.",
      "The commit: passes if it deletes `width: 100vw` (line 121, inside the @media rule in parts.css) AND explains that the one-column grid already sizes the card to whatever space it has, so it works at any width; mentioning that 100vw means the whole screen rather than the card's column is good. Changing it to 100% is thin: page_check.attempts will usually show that failing; say padding and border are added outside a width. 100% plus box-sizing: border-box passes but note it's two lines to undo one. A fixed number (e.g. 330px) is thin: it fits one phone, not every phone.",
    ],
  },

  "s4-checkbox": {
    story: "As Trent the Technician, I want to see only the parts that are in stock, so I don't quote a customer a part I can't get today. Bug: a designer cleaned up the parts page and added an 'In stock only' checkbox with id=\"instock-only\". The code, s4-checkbox/parts-controller.js, looks for it on line 7: document.getElementById('in-stock-only').addEventListener('change', showParts). getElementById returns null, so line 7 throws 'Cannot read properties of null (reading addEventListener)'. The Console's link points at line 7, and the id the code looks for is on that same line. Search still works because its listeners were attached on lines 5 and 6, before the error. Either side can be fixed: change the HTML id back to in-stock-only, or change 'in-stock-only' on line 7 to 'instock-only' (in DevTools, by editing the line in Sources). Renaming the id in DevTools alone doesn't make the box work in the tab, because the code looked for the checkbox once, when the page loaded. page_check.fixed_by says which side the student changed when the page confirmed the fix.",
    guidance: [
      "The error: passes if it says, in any words, that the code couldn't find the element (null, or 'cannot read addEventListener of null') AND names parts-controller.js with line 7. A nearby line is fine if the file and the null are right. 'Something's broken in the JavaScript' or no file and line is thin.",
      "The agreement: passes if it names both sides: the id in the HTML (instock-only) and the id the code looks for (in-stock-only, on line 7 of parts-controller.js), and says the HTML side changed (the designer's cleanup). Naming only one side is thin. Saying the code changed is thin: the story says the page was cleaned up.",
      "The commit: either side can pass; the reason decides it. Changing the HTML back passes if the reason is that the code (and anything else, such as tests or other scripts) already depends on that name, so the side that changed should go back, or that the id is an agreement and a cleanup shouldn't break it silently. Changing line 7 passes if the reason is that the designer's name is the one going forward; it's stronger if it notes checking for anything else that uses the old name. 'It's a typo' or 'whichever is easier' with no reason is thin. If the answer also says the fix has to be committed in the file because a DevTools change disappears on reload, or that the code only looks for the element at load, say that was well seen.",
    ],
  },

  // Session 4 in-class pages send `page_check` plus `items`.
  "s4-interface": {
    story: "As Trent the Technician, I want to see a part's price and whether I can get it today, so I can agree on next steps with the customer. The page: s4-interface/parts-controller.js has the story's implementation, showParts (ten lines), above an interface (a dashed line), and below the interface one line that picks a source (const getPriceAndAvailability = fromCatalogCopy / fromDistributor / fromAI) plus three adapters that each return {price, inStock}. Sources: HinH's catalog copy (write it; free, instant, loaded from the distributor's API once a night, so it says CP-0450-L is in stock when it sold out this morning); the distributor's API (call a service; current to the minute, $0.02 a call, 350 ms, and the format is the distributor's); an AI (ask an AI; always answers, plausible, but the price drifts between calls for the same part and the stock answer is sometimes wrong, so the same Given and When give different Thens). No library is on the menu because a library is someone else's code, not someone else's live data. Step 2: the distributor ships API v2, retiring qty_on_hand in favor of availability ('IN_STOCK'/'BACKORDERED'); with the distributor selected every part then shows backordered because the adapter computes undefined > 0. Three one-line fixes: (a) read the API inside showParts (works, but the story's implementation now knows the distributor's field names, 1 line changed in showParts, and the source line no longer does anything); (b) change the adapter fromDistributor to read availability (works, 0 lines changed in showParts; the right one); (c) switch the source line back to the catalog copy (0 lines in showParts, but Trent gets last night's data, the story says 'today', and tonight's load calls the same API, so it breaks too). The page's check: HX-2201 shows $184.00 in stock, CP-0450-L shows backordered, and lines changed in showParts is 0. page_check.fix_that_passed and attempts record what the student did.",
    guidance: [
      "The choice: any of the three can pass if the reason is about HinH's business and Trent's story ('today'). The distributor is the natural fit for 'today'; the catalog copy is defensible for a 1.0 if the student says what it costs Trent (last night's data, a wasted trip now and then). Choosing the AI for a price lookup is thin unless the student says why it's the wrong kind of question for an AI: it doesn't look the answer up, so the same part can come back with a different price. A reason that's only 'it's the most accurate' or 'it's free', with no tie to Trent or HinH, is thin.",
      "The dependencies: passes if it names what the chosen source changes on its own schedule, outside HinH's control (Table 1's third column), AND that HinH's code would have to change when it does. For the distributor: its interface or format (field names), uptime, and price per call. For the catalog copy: the distributor's API too, through the nightly load, so v2 breaks the load tonight (a quieter break; the fix goes in the loader), and the data is a day stale. For the AI: the vendor's AI itself, its cost, and that its answer varies run to run, so the same Given and When can give different Thens. Naming the dependency without saying it can force a change in HinH's code is close but thin. If the student notes that the interface keeps that dependency in one adapter, say that was well seen.",
      "The fix: passes if it's the adapter (fromDistributor) AND the reason is dependency direction in any words: the adapter depends on the distributor, showParts depends on a name HinH chose, so the distributor's change should stay in the one function that knows about the distributor; counting lines in showParts is the test of whether the interface held. Choosing (a) read-the-API-in-showParts is thin even if page_check shows the scenarios passed: say that showParts now knows the distributor's format and will change again next time, and the source line is dead. Choosing (c) switch-back is thin: it dodges the change and gives Trent stale data. If the student also notes that the source line is itself an interface (any adapter can be swapped in one line) or that the adapter is where a check on an AI's answer would go, say that was well seen.",
    ],
  },
  "s4-price": {
    story: "As Trent the Technician, I want to see only the parts at or under the price the customer gave me, so I can offer a repair they'll say yes to. Bug: with a max price of 100 the page shows nothing ('No parts match'), and with a max price of 50 it shows HX-2201 ($184.00) along with the three parts that belong there. There is no error in the Console. The facts: in s4-price/parts-controller.js, line 14 reads maxPrice from the input's .value and line 17 reads price from the card's data-price attribute; both are text, not numbers, because an input's value and a data attribute are always strings. Line 19, price <= maxPrice, therefore compares text character by character, like alphabetizing: '96.00' <= '100' is false because '9' comes after '1'; every price's first or second character beats '100', so at 100 everything is hidden; '184.00' <= '50' is true because '1' comes before '5', so at 50 the $184 motor shows. The expected Then for max 100: CP-0450, CP-0450-L, FL-1620, IG-3300, TH-7710 shown, HX-2201 hidden. The fix: convert the two inputs to numbers where they are read (Number(...) or parseFloat on line 17 for price, and ideally line 14 for maxPrice), before the comparison. Converting only price on line 17 passes the page's scenarios because JavaScript then coerces maxPrice in a mixed comparison. Converting inside the comparison on line 19 also passes. The best reason for fixing at the read lines: typed inputs, normalize at the edge so the rule inside never sees malformed input and the next comparison in this function is honest too. The page check runs four scenarios: max 100, max 50, no max, and search CP with max 30. page_check.observations_tried lists the console.log lines the student ran; page_check.fix_that_passed lists the changed lines.",
    guidance: [
      "The Then: passes if it lists the five parts at or under $100 (or says 'everything but the $184 blower motor'); 'the cheap parts' with no specifics is thin. If the Then was written after the fact to match the bug, don't penalize; the page can't tell.",
      "The assumption: passes if it says the code assumed price and maxPrice (or 'the values') were numbers and they are text (strings), read from the page, so the comparison went alphabetically/character by character; AND it says what the observation printed that showed this, e.g. values in quotes, or typeof 'string', or a specific comparison coming out wrong. Naming only one of the two values is fine. 'The comparison is wrong' with no mention of text vs number is thin. If observations_tried is empty, say the observation step was skipped. 'The <= operator is broken' is wrong: say the operator did what it does with text.",
      "The commit: passes if the change converts to a number (Number, parseFloat, parseInt, unary plus) on line 17 and/or 14, or in the comparison on line 19, AND gives a reason for the placement. Converting where the values are read (lines 14 and 17) with the reason that inputs should be made the right type at the edge, once, before any rule uses them (typed inputs, normalize at the edge) is the strong answer. Converting only in line 19 passes if the reason is given, but note that the next line to use price would have to convert again. Converting only price (line 17) passes the scenarios; say in one phrase that maxPrice is also text and the comparison only works because JavaScript coerces it, which is a thing to know about rather than rely on. If page_check.passed is false, say so. Bonus, not required: noting that the HTML could carry the price as a number in the data model instead of in the view, or that TypeScript would have flagged this.",
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
      "Report through the report_review tool.",
    ].join("\n");

    // The verdicts come back as tool input, so the API hands us parsed JSON.
    // (Asking for JSON as text broke when a note quoted code with braces or quotes in it.)
    const tool = {
      name: "report_review",
      description: "Report one verdict per item, in order, and a one-sentence summary.",
      input_schema: {
        type: "object",
        properties: {
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                verdict: { type: "string", enum: ["ok", "thin"] },
                note: { type: "string" },
              },
              required: ["label", "verdict", "note"],
            },
          },
          summary: { type: "string" },
        },
        required: ["results", "summary"],
      },
    };

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
        tools: [tool],
        tool_choice: { type: "tool", name: "report_review" },
        messages: [{ role: "user", content: "Student answers (JSON):\n" + answers }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return json({ error: "Grader unavailable (" + res.status + ")", detail: detail.slice(0, 300) }, 502, cors);
    }
    const data = await res.json();
    const use = (data.content || []).find(c => c.type === "tool_use" && c.name === "report_review");
    let parsed = use && use.input;
    if (!parsed) {
      // Fallback: the model answered in text after all.
      const text = (data.content || []).map(c => c.text || "").join("");
      try { parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); }
      catch { return json({ error: "Grader returned something unreadable.", raw: text.slice(0, 300) }, 502, cors); }
    }

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
