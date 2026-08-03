# Changelog

All notable changes to STOCKZ. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning is [semver](https://semver.org/).

**Version scheme:** the desk is pre-1.0 while the masterplan is being delivered. Each
closed phase cuts a minor release — phase 1 → `0.1.0`, phase 2 → `0.2.0`, … phase 30 →
`0.30.0`. When phase 30 closes and the desk is feature-complete, it ships as **`1.0.0`**.
Patch releases (`0.7.1`) are for fixes shipped between phase closes.

## [Unreleased]

### Added

- **UI engine on tap** — Spektrum 1.1.0 and its companions (persist, devtools, inspect,
  dock, compile) resolve from the unpkg CDN through a pinned importmap, with a
  modulepreload hint so the engine downloads before app code runs. `src/app/engine.js`
  is the single local door to the engine, and `engineInfo()` reports the version the
  page actually loaded. (F2.1)

## [0.1.0] — 2026-08-03 — Phase 1: Foundation & Tooling

The toolchain a scalping desk gets built on: clone to running app in three commands,
with a test policy and a live URL.

### Added

- **Project skeleton** — `src/` (app, utils, styles), `tests/` for shared fixtures,
  Node 22 pin, `.editorconfig`, LF normalization, and ignore rules proven to keep
  `dist/` and `.env.local` out of git. (F1.1)
- **npm script surface** — `dev`, `build`, `preview`, `test`, `test:fn`, `lint`,
  `lint:fix`, `check:secrets`, `deploy`, `verify:pages`. (F1.2)
- **Vite configuration** — strict port 5173 dev server, es2022 sourcemapped build,
  `@` → `src` alias, Spektrum specifiers marked external so the CDN importmap owns
  them. (F1.3)
- **App shell** — `index.html` with theme-aware metadata, the importmap placeholder for
  Spektrum, and `#app`; `mountApp()` / `autoMount()` boot the page. (F1.4)
- **ESLint flat config** — `eqeqeq`, `no-var`, `prefer-const` and `no-unused-vars` as
  errors; browser + worker globals for app code. (F1.5)
- **Vitest harness** — colocated `src/**/*.test.js` discovery, `tests/CONVENTIONS.md`,
  and `appVersion()` as the reference function for the one-test-per-function policy.
  (F1.6)
- **Environment handling** — `envPrefix: 'STOCKZ_'`, `.env.example` for the five venue
  vars, and `readEnv` / `hasEnv` / `venueKeyPresence` / `keyPresenceBanner`, which
  report key *presence* and never key material. Adds the `check:secrets` tripwire.
  (F1.7)
- **Shared math** — `clamp`, `roundToTick` (tick snapping without float drift),
  `tickDecimals`, `bpsDiff`. (F1.8)
- **Shared formatting** — `formatPrice`, `formatQty` (truncates, never overstates size),
  `formatPct`, `formatSigned`, `formatCompact`. (F1.8)
- **Logging** — `createLogger(ns)` with level control, a 200-entry capped ring buffer,
  a dev-only on-screen overlay, and `captureGlobalErrors` so nothing fails silently.
  (F1.9)
- **Docs** — README quickstart, `docs/architecture.md` module map, `.claude/` context,
  agents and skills, and `.claude/settings.json`. (F1.10)

### Fixed

- **Deploy served a broken page** — the live URL returned 200 while every asset 404'd:
  `index.html` used absolute paths, which escape the `/stockz/` project prefix. Paths
  are relative now, and `scripts/verify-pages.sh` fails loudly on any absolute asset
  path.
- **Publishing leaked source** — `gh-pages -d dist` carried repository dotfiles
  (`.claude/`, `.env.example`, `.gitignore`) onto the public branch.

### Changed

- **Deployment model** — GitHub Pages serves the `main` branch root, so pushing is
  deploying: no build step in the deploy path, no `gh-pages` branch or dependency. The
  app ships as raw ES modules with Spektrum from the unpkg CDN. `appVersion()` reads a
  literal `APP_VERSION` (a JSON import is bundler-only), guarded by a test that fails if
  it drifts from `package.json`; static assets moved from `public/` to the repo root.

[Unreleased]: https://github.com/D-dezeeuw/stockz/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/D-dezeeuw/stockz/releases/tag/v0.1.0
