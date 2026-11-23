// A stand-in for the Anthropic Messages API, for tests. It answers every request with a report_review
// tool call that passes each item. POST /control {fail: N, status} makes the next N calls fail first.
import http from "node:http";
export function startFakeAnthropic(port) {
  const state = { calls: 0, failNext: 0, failStatus: 529, last: null };
  const server = http.createServer(async (req, res) => {
    let body = ""; for await (const c of req) body += c;
    if (req.url === "/control") {
      const b = JSON.parse(body || "{}"); state.failNext = b.fail || 0; state.failStatus = b.status || 529; state.calls = 0;
      res.writeHead(200); return res.end("{}");
    }
    state.calls++;
    const b = JSON.parse(body); state.last = b;
    if (state.failNext > 0) { state.failNext--; res.writeHead(state.failStatus, { "content-type": "application/json" }); return res.end('{"type":"error","error":{"type":"overloaded_error"}}'); }
    if (b.tools && b.tools[0] && b.tools[0].name === "report_check") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ content: [{ type: "tool_use", name: "report_check", input: { ok: true } }] }));
    }
    if (b.tools && b.tools[0] && b.tools[0].name === "report_audit") {
      // The Auditor: a status per question id listed in the system prompt; round 1 asks one follow-up.
      const ids = (/one entry per question id, in order \((.*?)\)/.exec(b.system) || [, ""])[1].split(", ").filter(Boolean);
      const round1 = /This is round 1 of 2/.test(b.system);
      const input = {
        top10: Array.from({ length: 10 }, (_, i) => ({ title: "Rec " + (i + 1), observation: "Saw something " + (i + 1), step: ["intent", "unpack", "effectuate", "iterate"][i % 4], action: i % 2 ? "test" : "change", where: i < 2 ? "app.js:1-5" : "" })),
        questions: ids.map((id, i) => ({ id, status: i % 5 === 4 ? "missing" : i % 3 === 2 ? "work" : "good", note: "Note on " + id })),
        requests: round1 ? [{ id: "B4", ask: "Show me where matching happens.", why: "The doc and code disagree." }] : [],
        opinion: round1 ? "Preliminary: solid start." : "Final: solid.",
      };
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ content: [{ type: "tool_use", name: "report_audit", input }] }));
    }
    const m = /in this order: (.*?)\. 'ok' means/.exec(b.system || "");
    const labels = m ? m[1].split(", ") : [];
    const input = { results: labels.map(l => ({ label: l, verdict: "ok", note: "Fine: " + l })), summary: "All good." };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ content: [{ type: "tool_use", name: "report_review", input }] }));
  });
  return new Promise(r => server.listen(port, () => r({ server, state })));
}
