# Deployment — GitHub Pages, No CI

**There is no GitHub Actions in this repository — ever.** No workflow files, no
`.github/workflows/`, no CI badges. Publishing is a deliberate local command.

## How it ships: push `main`, that's the deploy

**Pages source: "Deploy from a branch" → `main`, folder `/ (root)`.** The repository
root *is* the website. There is no build in the deploy path and no `gh-pages` branch.

```bash
npm run deploy
# = git push origin main && bash scripts/verify-pages.sh
```

This works because STOCKZ ships as what it already is: vanilla ES modules the browser
loads natively, with Spektrum arriving from the unpkg CDN through the importmap. Nothing
in `src/` needs transforming to run.

### The rules that keep raw serving working

Break one of these and the live site 404s while localhost stays happy:

1. **Relative paths only in `index.html`** — `./src/main.js`, `./favicon.svg`. The site
   lives under `/stockz/`, so a leading `/` escapes the prefix.
2. **No build-tool-only syntax in shipped code** — no JSON imports
   (`import pkg from '../package.json'`), no `?raw`/`?url` suffixes, no bare specifiers
   except the ones declared in the importmap. `import.meta.env` is safe only behind a
   guard (`import.meta.env?.DEV`), since it is undefined outside Vite.
3. **Static assets at the repo root**, not in `public/` — Vite dev maps `public/` to
   `/`, but a raw static server does not, so root is the only path that works in both.
4. **Every import path is explicit and complete** — `./utils/env.js`, extension
   included. The browser has no resolver.

`npm run build` still exists as a sanity check and for `npm run preview`; `dist/` is
never published.

### Always verify after deploying

```bash
npm run verify:pages
```

Checks the live page, its entry module and the favicon return 200, that no asset path is
absolute, and that `#app` is present. Pushing is not evidence that it loads.

Other standing rules:

- `vite.config.js` still sets `base: '/stockz/'` for `npm run build` / `npm run preview`
  — local checks only, never published.
- `404.html` at the repo root mirrors `index.html` so deep links survive Pages routing
  (added when routing arrives).
- The importmap in `index.html` pins the exact Spektrum version
  (`https://unpkg.com/spektrum@<x.y.z>/...`) before a release — `@1` is for dev only; a
  live page must never shift under the user because a CDN published a new minor.

## Release ritual

1. On `main`, all merged features green (per `testing-policy.md`).
2. Bump version in `package.json` **and `APP_VERSION` in `src/app/version.js`** (the
   `appVersion` test fails if they drift), add a CHANGELOG entry.
3. `npm run deploy` from the local checkout.
4. Smoke check the live URL: page loads themed · key modal appears (or URL-param key
   accepted) · OKX LED green · ticks flowing · paper-mode order round-trips.
5. Tag: `git tag v<x.y.z> && git push --tags`.

## Rollback

The site is `main`, so a rollback is a git revert: `git revert <bad commit>` (or
`git reset --hard <tag>` on a branch you then merge) and push. Pages redeploys within a
minute. Verify with `npm run verify:pages`.

## Access URLs

- `https://<user>.github.io/stockz/` — key modal flow.
- `https://<user>.github.io/stockz/?okxKey=...&okxSecret=...&okxPass=...` — instant
  session (URL is scrubbed on load; still prefer the modal on shared machines).
