// Which parts of a team's repo the Auditor reads. Shared by the page (for an uploaded ZIP) and the worker
// (for a repo it reads on GitHub), so both routes send the AI the same kind of slice.

// Never read: dependencies, build output, lockfiles, binaries, and anything that could hold a key.
const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|out|\.next|\.nuxt|coverage|vendor|\.venv|venv|__pycache__|\.cache|\.wrangler|\.vercel|\.firebase)\//;
const SKIP_FILE = /(^|\/)(\.env[^/]*|.*\.(pem|key|p12|pfx)|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Pipfile\.lock|.*\.min\.(js|css)|.*\.map)$/i;
const TEXT = /\.(html?|css|scss|js|mjs|cjs|jsx|ts|tsx|vue|svelte|py|rb|go|java|kt|swift|dart|php|sql|json|ya?ml|toml|md|txt|gs|sh|prisma|graphql|rules)$|(^|\/)(Dockerfile|Procfile|README|AGENTS|CLAUDE)[^/]*$/i;

export const MAX_FILE_CHARS = 14000;   // per file
export const MAX_SLICE_CHARS = 110000; // whole slice (roughly 30k tokens)
export const MAX_TREE = 400;            // paths listed in the file tree

export function readable(path) {
  return !SKIP_DIR.test(path) && !SKIP_FILE.test(path) && TEXT.test(path);
}
export function listable(path) {
  return !SKIP_DIR.test(path) && !SKIP_FILE.test(path);
}

// Lower is read first: what the team says about the app, how it's built and shipped, its tests, then its code.
export function priority(path) {
  const p = path.toLowerCase(), base = p.split("/").pop(), depth = p.split("/").length - 1;
  if (/^(readme|agents|claude)/.test(base)) return 0 + depth * 0.1;
  if (/^docs\//.test(p) && /\.(md|txt)$/.test(p)) return 0.5 + depth * 0.1; // the team's working docs, kept in the repo
  if (/^(package\.json|requirements\.txt|pyproject\.toml|pubspec\.yaml|gemfile|go\.mod|wrangler\.toml|firebase\.json|vercel\.json|netlify\.toml|render\.yaml|dockerfile|procfile)$/.test(base)) return 1 + depth * 0.1;
  if (p.startsWith(".github/workflows/")) return 2;
  if (/(^|\/)(tests?|__tests__|spec|e2e|cypress|playwright)\/|\.(test|spec)\.[a-z]+$/.test(p)) return 4 + depth * 0.1;
  if (/\.(md|txt)$/.test(p)) return 6 + depth * 0.1;
  if (/\.(json|ya?ml|toml)$/.test(p)) return 5 + depth * 0.1;
  return 3 + depth * 0.1; // source
}

// files: [{path, text}] (text may be missing for paths you only want listed). Returns {tree, files, note}.
export function buildSlice(files) {
  const all = files.filter(f => listable(f.path)).sort((a, b) => a.path.localeCompare(b.path));
  const tree = all.slice(0, MAX_TREE).map(f => f.path);
  const candidates = all.filter(f => readable(f.path) && typeof f.text === "string" && f.text.trim())
    .sort((a, b) => priority(a.path) - priority(b.path) || a.text.length - b.text.length);
  const out = []; let used = 0, cut = 0, skipped = 0;
  for (const f of candidates) {
    let text = f.text;
    if (text.length > MAX_FILE_CHARS) { text = text.slice(0, MAX_FILE_CHARS) + "\n… [cut: file continues]"; cut++; }
    if (used + text.length > MAX_SLICE_CHARS) { skipped++; continue; }
    out.push({ path: f.path, text }); used += text.length;
  }
  const note = `${all.length} files in the repo (after skipping dependencies, build output and secrets); read ${out.length}` +
    (cut ? `, ${cut} cut short` : "") + (skipped ? `, ${skipped} left out for length` : "") + ".";
  return { tree, files: out, note };
}

// The slice as one block of text for the AI.
export function sliceText(slice) {
  return "FILE TREE\n" + slice.tree.join("\n") + "\n\n" + slice.note + "\n\n" +
    slice.files.map(f => `===== ${f.path} =====\n${f.text}`).join("\n\n");
}
