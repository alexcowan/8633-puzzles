# Coding with GPT — puzzles

`site/` is published with GitHub Pages (Settings → Pages → main, `/site`).
`worker/` is the grader proxy on Cloudflare Workers. The API key and class code are Wrangler secrets.

## Add a puzzle
1. Add `site/sN-name.html` and a line in `site/index.html`.
2. If it has a "Check my work" button: add its rubric to `RUBRICS` in `worker/src/index.js`, set `PUZZLE_ID` in the page, deploy the worker.

## Deploy the worker (first time)
```
cd worker
npm i -g wrangler && wrangler login
wrangler secret put ANTHROPIC_API_KEY   # from the cwg-grader workspace in the Anthropic Console
wrangler secret put CLASS_CODE          # whatever you put on Canvas
wrangler deploy                         # prints the worker URL
```
Then put that URL in `GRADER_URL` in each page with a Check button, and your Pages origin in `ALLOWED_ORIGINS` in `wrangler.toml`.

## Rotating the class code
`wrangler secret put CLASS_CODE` again. Takes effect immediately.
