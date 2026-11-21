// Read a ZIP in the browser (no library): the central directory lists every file, and the browser's own
// DecompressionStream inflates them. Only files the Auditor would read get inflated; the rest are listed.
import { readable, listable } from "./slice.js";

const MAX_INFLATE = 400000; // skip any single file bigger than this uncompressed

export async function readZip(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);
  // End of central directory: scan back from the end for its signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("That file isn't a ZIP I can read.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen));
    if (!name.endsWith("/")) entries.push({ name, method, csize, usize, local });
    p += 46 + nlen + xlen + clen;
  }
  // GitHub's "Download ZIP" puts everything in one folder (repo-branch/); drop it so paths match the repo.
  const tops = new Set(entries.map(e => e.name.split("/")[0]));
  const strip = tops.size === 1 && entries.every(e => e.name.includes("/")) ? [...tops][0].length + 1 : 0;
  const files = [];
  for (const e of entries) {
    const path = e.name.slice(strip);
    if (!path || !listable(path)) continue;
    let text;
    if (readable(path) && e.usize <= MAX_INFLATE) {
      const lnlen = dv.getUint16(e.local + 26, true), lxlen = dv.getUint16(e.local + 28, true);
      const start = e.local + 30 + lnlen + lxlen, data = buf.subarray(start, start + e.csize);
      try {
        const bytes = e.method === 0 ? data : e.method === 8 ? await inflate(data) : null;
        if (bytes) text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      } catch { /* unreadable entry: list it, don't read it */ }
    }
    files.push({ path, text });
  }
  return files;
}

async function inflate(data) {
  const s = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
