---
name: deploy-pages
description: Ship STOCKZ to GitHub Pages with the local gh-pages deploy - build, publish, smoke-check, tag, rollback. Use for releases and Pages issues. Never via GitHub Actions.
---

# Deploy to GitHub Pages

No CI. No GitHub Actions. Deploys are a local, deliberate command from a clean `main`.
Full context: `.claude/context/deployment.md`.

## Ship it

```bash
git checkout main && git pull origin main
npm version patch            # or minor/major; updates package.json + tag
# edit CHANGELOG.md: move Unreleased -> new version
npm run deploy               # vite build && gh-pages -d dist
git push origin main --tags
```

Prerequisites checked before every deploy:
- `vite.config.js` has `base: '/stockz/'` (repo-name path for project Pages).
- Built `index.html` importmap pins an **exact** spektrum version — no `@1`, no
  `@latest` in production.
- `public/404.html` exists (SPA fallback).
- No `.github/workflows/` directory exists. If one appeared, delete it in the same
  commit and mention it.

## Smoke check (the live URL, ~2 minutes)

1. Page loads with cached theme, no flash, no console errors.
2. No keys → key modal appears; with `?okxKey=...` → URL scrubbed, session live.
3. OKX LED green, watchlist ticking, chart moving.
4. Paper mode: place + flatten one order, journal records it.
5. Day/night toggle persists across reload.

## Rollback

```bash
git checkout v<previous> && npm ci && npm run deploy && git checkout main
```

The `gh-pages` branch is generated output — never edit or merge it manually.
