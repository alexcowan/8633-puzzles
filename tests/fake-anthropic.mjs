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
    const m = /in this order: (.*?)\. 'ok' means/.exec(b.system || "");
    const labels = m ? m[1].split(", ") : [];
    const input = { results: labels.map(l => ({ label: l, verdict: "ok", note: "Fine: " + l })), summary: "All good." };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ content: [{ type: "tool_use", name: "report_review", input }] }));
  });
  return new Promise(r => server.listen(port, () => r({ server, state })));
}
