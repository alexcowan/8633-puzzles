// One place for how the worker calls the AI: which model, and the settings each model accepts.
// The Auditor, the puzzle grader and the live AI check all build their requests here, so the check
// sends exactly what real calls send. When the API changes what a model accepts, change it here.

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export const AI = {
  // claude-sonnet-5-5 turns thinking off with "between_tools", and doesn't allow a forced tool.
  auditor: { model: "claude-sonnet-5-5", thinking: { type: "between_tools" }, forceTool: false },
  grader: { model: "claude-haiku-5-5", thinking: { type: "disabled" }, forceTool: true },
};

export function aiBody(kind, { maxTokens, system, tool, user }) {
  const c = AI[kind];
  return {
    model: c.model, max_tokens: maxTokens, thinking: c.thinking, system,
    tools: [tool], tool_choice: c.forceTool ? { type: "tool", name: tool.name } : { type: "auto" },
    messages: [{ role: "user", content: user }],
  };
}

export function aiHeaders(env) {
  return { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" };
}

// The tool call's input; if the model wrote JSON as text instead, read that.
export function toolInput(data, name) {
  const use = (data.content || []).find(c => c.type === "tool_use" && c.name === name);
  if (use && use.input) return use.input;
  const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("");
  try { return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { return null; }
}

// The API's error message, readable.
export function apiError(raw) {
  try { const e = JSON.parse(raw).error; if (e && e.message) return (e.type ? e.type + ": " : "") + e.message.slice(0, 280); } catch {}
  return String(raw).slice(0, 300);
}

// Live check: one tiny request per kind, with the same settings real calls use.
const CHECK_TOOL = {
  name: "report_check", description: "Report that the check worked.",
  input_schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
};
export async function pingAI(env, kind) {
  const body = aiBody(kind, { maxTokens: 400, system: "This is a connectivity check. Call the report_check tool with ok set to true, and nothing else.", tool: CHECK_TOOL, user: "Check." });
  try {
    const res = await fetch(env.ANTHROPIC_URL || ANTHROPIC_URL, { method: "POST", headers: aiHeaders(env), body: JSON.stringify(body) });
    const raw = await res.text();
    if (!res.ok) return { kind, model: body.model, ok: false, detail: "api " + res.status + ": " + apiError(raw) };
    const input = toolInput(JSON.parse(raw), "report_check");
    return { kind, model: body.model, ok: !!input, detail: input ? "tool call returned" : "no tool call in the reply" };
  } catch (e) { return { kind, model: body.model, ok: false, detail: "network: " + String(e).slice(0, 120) }; }
}
