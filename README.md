# Coding with GPT — puzzles

`site/` is published with GitHub Pages (the workflow in `.github/workflows/pages.yml` on every push to `site/`).
`worker/` is the grader proxy on Cloudflare Workers. The API key and class code are Wrangler secrets.
The worker deploys itself from GitHub Actions (`.github/workflows/deploy-worker.yml`) on every push to `worker/` once its tests pass.
`site/ws.css` holds the worksheet styles every puzzle page shares (the S1 pages keep their own); put page-only rules in the page's `<style>`.
`site/syllabus.html` is the course syllabus (linked from the index). Edit it directly; session dates and objectives come from the AY'27 outline sheet.
`site/stats.html` (not linked from the index) shows the anonymous grading record: per puzzle, how often each item comes back ok.

## Add a puzzle
1. Add `site/sN-name.html` and a line in `site/index.html`.
2. If it has a "Check my work" button: add its answer key to `RUBRICS` in `worker/src/index.js` and set `PUZZLE_ID` in the page. Merging to main deploys the worker.
3. `npm install && npx playwright install chromium && npm test` runs the worker and page tests (they also run on every pull request).

## Deploy the worker (first time)
```
cd worker
npm i -g wrangler && wrangler login
wrangler secret put ANTHROPIC_API_KEY   # from the cwg-grader workspace in the Anthropic Console
wrangler secret put CLASS_CODE          # whatever you put on Canvas
wrangler deploy                         # prints the worker URL
```
Then put that URL in `GRADER_URL` in each page with a Check button, and your Pages origin in `ALLOWED_ORIGINS` in `wrangler.toml`.

## Turn on automatic deploys and the database (once)
```
cd worker
npx wrangler d1 create cwg            # paste the database_id it prints into wrangler.toml
npx wrangler d1 migrations apply cwg --remote
```
Then in GitHub, Settings → Secrets and variables → Actions, add `CLOUDFLARE_API_TOKEN` (a token from the
"Edit Cloudflare Workers" template, plus D1 Edit) and `CLOUDFLARE_ACCOUNT_ID`. Until those exist, the deploy
workflow runs the tests and skips the deploy.

## Rotating the class code
`wrangler secret put CLASS_CODE` again. Takes effect immediately.
