# Changelog

All notable changes to STOCKZ. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning is [semver](https://semver.org/).

**Version scheme:** the desk is pre-1.0 while the masterplan is being delivered. Each
closed phase cuts a minor release — phase 1 → `0.1.0`, phase 2 → `0.2.0`, … phase 30 →
`0.30.0`. When phase 30 closes and the desk is feature-complete, it ships as **`1.0.0`**.
Patch releases (`0.7.1`) are for fixes shipped between phase closes.

## [Unreleased]

### Added

- **The dashboard grid** — a header, a uniform grid and a footer. Every block is exactly
  the same width and height, auto-fitted into as many columns as the viewport allows with
  no media queries, so the eye learns one cell size and stops re-measuring during a fast
  move. (F4.1)
- **Blocks are data, not markup** — the grid renders from a registry in state, so a
  feature adds a block by registering it and settings can hide or reorder it without
  touching HTML. Every registry function returns a new array; mutating in place would skip
  change detection and the grid would silently stop matching state. (F4.2, F4.10)
- **Block chrome with honest states** — a title bar plus loading, empty and error
  renderings. A block waiting on data shimmers rather than sitting blank: a silent empty
  cell looks exactly like a market that stopped moving, which is when someone decides the
  price is stable and sizes up. (F4.3, F4.5, F4.6)
- **Footer** — Neko Media with LinkedIn, npm and GitHub links as inline SVG. (F4.7)
- **Scroll containment** — the page never scrolls sideways; a busy tape scrolls inside its
  own block. (F4.9)
- **The desk knows its own width** — column count and a density band (compact/normal/wide)
  are measured from the grid element via ResizeObserver, not the window, so a side panel
  narrowing the grid counts as a resize. Blocks will use the band to decide how much
  detail to render on a laptop versus an ultrawide. (F4.4)
- **Block visibility toggles** — `ui.toggleBlock` shows or hides any block by id from HTML
  or a hotkey, and the choice persists with the rest of the layout. (F4.8)

## [0.3.0] — 2026-08-03 — Phase 3: Money-Hacker Design System

The desk got its face: green/orange terminal palette in two themes, monospace with
tabular numerals, density tokens, accents that mean something, and contrast proven by
test rather than by eye.

### Added

- **The money-hacker palette** — matrix-green and hot-orange ramps over near-black
  surfaces, in both night and day themes. Profit/buy is always green and loss/sell always
  orange, in both themes: a scalper reads colour before digits, and a palette that means
  different things on different screens is how the wrong button gets clicked at speed.
  (F3.1)
- **Terminal typography** — monospace throughout, with tabular numerals as the *default*
  rather than an opt-in: proportional digits change width as prices move, so a column of
  quotes shivers on every tick and the eye has to re-find the decimal point. No web fonts
  are loaded — a blocking font request is unacceptable on a page selling latency. (F3.2)
- **Density tokens** — a 4px spacing step, near-square corners and the grid metrics every
  block will share, tuned to fit the most instruments and fills on screen at once. The
  page never scrolls sideways; content scrolls inside its own block. (F3.3)
- **Terminal accents** — glow for armed, a harder glow for a tripped breaker, connection
  LEDs and a one-frame tick pulse. Each accent means exactly one thing and fires only on
  a real event: ambient effects that run constantly train the eye to ignore them. Glows
  switch off in the day theme, where they read as smudges. (F3.4)
- **One colour language** — positive is green, negative is orange, zero is neutral, buy
  matches profit and sell matches loss, in both themes. Zero is explicitly flat, never
  green: colouring a flat position as profit tells a trader they are making money when
  they are not. (F3.5)
- **Motion budget** — 100–150ms, colour and opacity only, nothing on the order path waits
  for an animation, and `prefers-reduced-motion` stops the movement while the numbers keep
  updating at full speed. (F3.6)
- **Inline SVG icons** — arrows, bolt, kill-switch skull, gear, sun/moon, chart, clock and
  keyboard, drawn on one 16px grid and filled with `currentColor`, so a sell arrow turns
  orange from its container rather than hard-coding a colour. No extra request, no flash
  of missing glyph; icon titles are escaped because venue data is not trusted input.
  (F3.7)
- **Formatters inside bindings** — `{{fmt.signed(trade.dayPnl)}}` and
  `:class="fmt.cls(trade.dayPnl)"` format and colour a cell in one place. Exposed as one
  frozen global rather than through state, which is recorded into history and journal
  exports where functions have no business. (F3.8)
- **Utility classes** — a small closed set for text, surface, border, spacing, type and
  layout, every one resolving through tokens so it is correct in both themes without an
  override. (F3.9)
- **Contrast is asserted, not eyeballed** — the WCAG luminance and ratio maths ship as
  tested functions, and one test audits the whole shipped palette in both themes. It
  immediately caught the day-theme orange at 4.17:1 on white, below AA; the token is now
  `#b84600` and passes on both day surfaces. A token that regresses now fails a test
  rather than a trader squinting at a price. (F3.10)

## [0.2.0] — 2026-08-03 — Phase 2: Spektrum Core Integration

The desk became reactive: one state tree, one action registry, derived values that
cannot go stale, and errors that reach the trader instead of the console.

### Added

- **UI engine on tap** — Spektrum 1.1.0 and its companions (persist, devtools, inspect,
  dock, compile) resolve from the unpkg CDN through a pinned importmap, with a
  modulepreload hint so the engine downloads before app code runs. `src/app/engine.js`
  is the single local door to the engine, and `engineInfo()` reports the version the
  page actually loaded. (F2.1)
- **The desk boots reactive** — state is seeded before the DOM is bound, so the first
  paint already carries real values instead of flashing placeholders at someone watching
  prices; the page then uncloaks and the tick pump starts. `initialState()` seeds every
  namespace (app, ui, settings, market, trade, strategy) with trading disarmed, in paper
  mode and flat. (F2.2)
- **One state map** — every namespace and path is declared in `src/state/paths.js`, with
  `buildPath` for dynamic branches, `assertKnownNamespace` as the guard and `isPersisted`
  marking `settings.*` as the only branch that ever reaches localStorage. A lint rule
  rejects raw path literals, so a typo can no longer invent a silent branch that no
  binding reads. (F2.3)
- **Action registry** — every user-triggerable behaviour registers under a
  `<namespace>.<verb>` name, callable from HTML (`data-fn`) or programmatically via
  `dispatchAction`, which is what hotkeys, the command palette and the bot runner will
  all dispatch through. Ships `ui.setStatus` and `app.reset`; duplicate registration is a
  hard error, and an unknown name warns instead of throwing so a stale keybinding cannot
  take the desk down mid-session. (F2.4)
- **Derived values that cannot go stale** — mid, spread, spread in bps, net exposure,
  open-order count and the header status line all recompute the moment a dependency
  moves, so two blocks can never disagree. Exposure is signed *notional*, not quantity:
  one lot of a $60k instrument is not one lot of a $3k one. (F2.5)
- **Background systems** — a UTC clock and uptime counter (venues stamp in UTC, so the
  desk does too), a heartbeat that proves the render pump is alive, a theme watch for
  canvas re-palettes, and a spread-anomaly warning that fires on the *crossing* rather
  than every tick. All teardown-tracked, so a reload cannot stack a second clock on the
  first. (F2.6)
- **Async data with visible status** — every remote source writes the same value/status/
  error trio, so a block can show loading, ready or dead without inventing its own flags.
  A new request aborts the one it replaces (a late reply overwriting a newer one is a
  stale-data bug that is very hard to spot), retries back off exponentially to a ceiling,
  and a failing source degrades only its own block while the rest of the desk keeps
  trading. (F2.7)
- **Devtools in dev only** — a state scrubber and time-travel over the same history the
  trade journal will use, plus `devDumpState()` for bug reports. Production loads none
  of it: the gate is an explicit flag, not a build-time mystery, and a companion that
  fails to load can never stop the desk booting. (F2.8)
- **Toasts instead of console noise** — engine faults, and anything else that changes
  what the trader can do, appear on the page in their own language ('display is falling
  behind the feed', not `E_TICK_OVERFLOW`). The stack is capped at four and newest-first,
  so a venue erroring dozens of times a second cannot bury the prices, and toasts age out
  on the clock tick rather than on per-toast timers. (F2.9)
- **CSP groundwork** — `npm run build:csp` extracts every runtime expression from the
  page and generates a precompiled module, so the desk can eventually run without
  `unsafe-eval` — the directive most worth not having on a page holding API keys. The
  extraction is unit-tested against the real `index.html`, because a missed expression
  fails silently at runtime rather than at build time. The default build is unchanged.
  (F2.10)

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

[Unreleased]: https://github.com/D-dezeeuw/stockz/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/D-dezeeuw/stockz/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/D-dezeeuw/stockz/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/D-dezeeuw/stockz/releases/tag/v0.1.0
