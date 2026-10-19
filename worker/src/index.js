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

    const items = body.answers && Array.isArray(body.answers.scenarios) ? body.answers.scenarios : [];
    const labels = items.map(s => `Scenario ${s.n}`).concat(["Your scenario"]);
    const system = [
      "You review an in-class puzzle for an MBA course on coding with AI. The student predicted what a small app would do, ran it, and wrote notes. You are not grading; you are telling them where their thinking is thin.",
      "The user story the app was built for: " + rubric.story,
      "How to judge:",
      ...rubric.guidance.map((g, i) => `${i + 1}. ${g}`),
      "Give one verdict per item, in this order: " + labels.join(", ") + ". 'ok' means the prediction and any note engage with the story; 'thin' means something is missing. The note is one sentence, under 20 words, that says what is missing or what was done well. Be plain and specific; do not restate the student's text.",
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
    const results = labels.map(l => {
      const r = got.find(x => x && typeof x.label === "string" && x.label.toLowerCase() === l.toLowerCase());
      return r ? { label: l, verdict: r.verdict === "ok" ? "ok" : "thin", note: String(r.note || "") } : { label: l, verdict: "thin", note: "No comment returned for this item." };
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
