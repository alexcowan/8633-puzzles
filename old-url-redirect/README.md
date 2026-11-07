# Old-URL redirects for alexcowan.github.io/8633-puzzles/

GitHub doesn't redirect GitHub Pages URLs when a repo is renamed, so after renaming
`8633-puzzles` → `8633`, every student link to `alexcowan.github.io/8633-puzzles/...` would 404.
These files fix that. Each one forwards to the same page (and keeps `?reset`, `#anchors`) under `/8633/`.
`404.html` catches anything not listed here.

## Steps (in this order, ideally between classes)
1. Rename this repo to `8633` (Settings → General → Repository name). The new site is live at
   `alexcowan.github.io/8633/` within a minute or two; the old URLs 404 from here until step 3.
2. Create a new **public** repo named `8633-puzzles` and upload the files in this folder (not the folder itself)
   to its root.
3. In the new repo: Settings → Pages → Deploy from a branch → `main` / `(root)` → Save.
4. Check that `alexcowan.github.io/8633-puzzles/s4-price.html` lands on `alexcowan.github.io/8633/s4-price.html`.

Nothing else needs to change: the grader only checks the origin (`https://alexcowan.github.io`), which is the
same before and after, and students' saved work lives in that origin's browser storage, so it carries over.
Update the Canvas links to `/8633/` when convenient; the redirects keep the old ones working meanwhile.
