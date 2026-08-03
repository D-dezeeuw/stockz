---
name: deploy-pages
description: Ship STOCKZ to GitHub Pages - push main (the site), verify the live page, tag and roll back. Use for releases and Pages issues. Never via GitHub Actions.
---

# Deploy to GitHub Pages

No CI. No build step. **GitHub Pages serves the `main` branch root, so pushing `main`
is the deploy.** Full context: `.claude/context/deployment.md`.

## Ship it

```bash
git checkout main && git pull origin main
npm run deploy          # git push origin main && bash scripts/verify-pages.sh
```

For a version release, first bump `package.json` **and** `APP_VERSION` in
`src/app/version.js` (the `appVersion` test fails if they drift), add a CHANGELOG entry,
then deploy and `git tag v<x.y.z> && git push --tags`.

## Why raw source works

STOCKZ is vanilla ES modules the browser loads natively; Spektrum arrives from the unpkg
CDN through the importmap. Nothing needs transforming — which is why the deploy has no
build. The cost is four rules that must hold in every commit:

1. **Relative paths in `index.html`** (`./src/main.js`) — the site lives under
   `/stockz/`, so a leading `/` escapes the prefix.
2. **No build-tool-only syntax in shipped code** — no JSON imports, no `?raw`/`?url`,
   no bare specifiers outside the importmap; `import.meta.env` only behind `?.`.
3. **Static assets at the repo root**, not `public/` (Vite dev maps `public/` to `/`, a
   static server does not).
4. **Complete import paths with extensions** — the browser has no resolver.

`npm run build` remains for local sanity checks and `npm run preview`; `dist/` is never
published and is gitignored.

## Verify — every time

```bash
npm run verify:pages
```

Asserts the live page, `src/main.js` and `favicon.svg` return 200, that no asset path is
absolute, and that `#app` is present. A push is not evidence that the site loads: the
classic failure is localhost working while the live page 404s on every asset.

Also smoke it by eye at least once per phase: themed load, no console errors, and
whatever that phase added.

## Rollback

The site is `main`, so rolling back is `git revert <commit>` (or reset a branch to the
last good tag and merge it) followed by a push. Pages picks it up within a minute;
confirm with `npm run verify:pages`.
