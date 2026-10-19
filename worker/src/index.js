// cwg-grader: a small proxy that grades puzzle submissions with Claude.
// The API key, class code and rubrics live here, never in the pages.

const MODEL = "claude-haiku-5-5";
const MAX_TOKENS = 1500;

// One rubric per puzzle. Each criterion is a short, checkable statement.
// The page shows the same list to the student ("Be ready to explain").
const RUBRICS = {
  "s1-predict-then-run": {
    story: "As Trent the Technician, I know the part number, and I want to find it in the system so I can figure out the next steps of the repair.",
    criteria: [
      "Each Then says what Trent gets (price, availability, a count), not what the screen does.",
      "The student ran all five scenarios and reported honestly which predictions were wrong, with what they had assumed.",
      "Scenario 2: the student took a position on whether two results is a bug or a feature, with a reason that comes from the story, not the code.",
      "Scenario 4: the student took a bug-or-feature position on finding nothing, and reconciled it with their scenario 2 position (both come from the same prefix-match rule).",
      "The student's own scenario is one the story requires, and the app fails it.",
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

    const system = [
      "You grade an in-class puzzle for an MBA course on coding with AI. Be direct and specific. Each note is one short sentence, under 25 words, that says what is missing or what was done well.",
      "The user story the puzzle is about: " + rubric.story,
      "Judge each criterion below as pass or fail on the student's answers. 'Then' clauses that describe screens, buttons or fields fail criterion 1.",
      "Criteria:",
      ...rubric.criteria.map((c, i) => `${i + 1}. ${c}`),
      "Respond with JSON only, no prose around it. results has exactly one entry per criterion, numbered 1 to " + rubric.criteria.length + ", in this shape:",
      `{"results":[{"n":1,"pass":true,"note":"one sentence"}, ...],"summary":"one sentence"}`,
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

    // Keep the page honest: one verdict per criterion, in order, nothing extra.
    const results = rubric.criteria.map((_, i) => (parsed.results || []).find(r => r.n === i + 1) || { n: i + 1, pass: false, note: "No verdict returned for this criterion." });
    return json({ criteria: rubric.criteria, results, summary: parsed.summary || "" }, 200, cors);
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
