# Changelog

All notable changes to STOCKZ. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning is [semver](https://semver.org/).

**Version scheme:** the desk is pre-1.0 while the masterplan is being delivered. Each
closed phase cuts a minor release — phase 1 → `0.1.0`, phase 2 → `0.2.0`, … phase 30 →
`0.30.0`. When phase 30 closes and the desk is feature-complete, it ships as **`1.0.0`**.
Patch releases (`0.7.1`) are for fixes shipped between phase closes.

## [Unreleased]

### Added

- **Watchlists** — create, rename, delete, add, remove and reorder, persisted with the
  rest of your settings so a list is never rebuilt in the morning. Symbols are
  venue-qualified (`okx:BTC-USDT`), so the same ticker on two venues stays two rows and
  the spread between them is visible rather than merged away. (F12.1, F12.2, F12.8,
  F12.9)
- **Focus follows the list** — clicking a row sets `market.focus`, which the ticket, chart
  and book all follow. Focus is deliberately *not* persisted: restoring yesterday's focus
  would aim the order ticket at an instrument nobody is looking at. (F12.5, F12.10)
- **A list can never be lost by mis-click** — the last list is undeletable, and a stale
  active id falls back to the first list rather than blanking the block. (F12.1)
- **Live rows** — last, % change, spread and volume per row, with a tick pulse that
  compares against the *previous frame* rather than the previous tick, so a page load
  never flashes and a fast tape does not strobe. A symbol with no data says stale instead
  of showing a confident zero. (F12.6)
- **Inline sparklines** — recent prints scaled into ratios rather than pixels, so one
  series renders at any row height; a flat series draws a centred line instead of dividing
  by zero. (F12.7)
- **Fuzzy instrument search** — subsequence matching, so `btu` finds `BTC-USDT`, ranked
  exact → prefix → scattered because that is what someone typing three fast letters meant.
  One box searches both venues. (F12.4)

## [0.11.0] — 2026-08-03 — Phase 11: Real-Time Market Data Pipeline

The path from socket to screen: ring buffers, rAF-coalesced writes, locally built candles,
one entry point for every feed, and honest reporting when a feed goes quiet.

### Added

- **The tick pipeline** — feeds publish to a bus, ticks land in fixed-size ring buffers,
  and a single rAF flush writes one value per path per frame. Writing state per tick would
  re-render the desk hundreds of times a second to show frames a human cannot see; a burst
  of a hundred ticks now collapses into one write. (F11.2, F11.3, F11.4)
- **Fixed memory under load** — buffers have a hard capacity and O(1) writes, so a long
  session cannot degrade into GC pauses exactly when the market gets busy. Drop counts are
  reported rather than hidden. (F11.3, F11.9)
- **Candles built locally at scalping timeframes** — 1s, 5s and 1m folded from raw prints
  rather than requested from the venue: the venue's smallest bar is usually too coarse to
  scalp, and a local bar closes the instant the clock does with no round-trip. Buckets
  align to the wall clock so two instruments produce bars that line up, and a print inside
  the open bar updates it in place instead of drawing hundreds of one-print bars a second.
  Adds VWAP, the reference a mean-reversion scalp measures deviation from. (F11.1, F11.6,
  F11.7)
- **One door for every feed** — live sockets, polled quotes and (later) replayed sessions
  all enter through `ingest`, so replay is indistinguishable from live and a second code
  path cannot grow a second set of bugs. (F11.5)
- **Silent feeds are called out** — an open socket that stopped delivering marks its venue
  stale and its blocks with it. Prices that simply stop moving otherwise read as a calm
  market, which is the most dangerous thing a feed can do. (F11.8, F11.10)

## [0.10.0] — 2026-08-03 — Phase 10: EToro Connectivity

A second venue on the same desk, mapped into identical shapes, polled adaptively, and
fully exercisable offline.

### Added

- **EToro on the same desk** — REST client with key headers, instrument catalogue,
  quotes, and portfolio, all mapped into **exactly** the internal shapes OKX produces. A
  test asserts key-for-key parity, because the moment a block writes
  `if (venue === 'etoro')` the desk has two of everything. (F10.1, F10.2, F10.4, F10.7)
- **Adaptive quote polling** — EToro has no stream, so the focused instrument polls every
  second, watchlist rows every five, and a hidden tab not at all. Polling everything at
  one rate burns the budget on rows nobody is looking at, which is what makes the
  *focused* quote late. (F10.3)
- **The instrument catalogue is cumulative** — a partial refresh teaches new instruments
  without blanking out ones the desk is already showing. (F10.2)
- **Offline EToro** — a mock that answers every endpoint with deterministic, *moving*
  prices through the real mappers and poller, so the whole pipeline stays developable and
  testable without keys or a network. A frozen mock teaches nothing about a UI whose job
  is displaying change. (F10.9)
- **CORS documented honestly** — EToro refuses browser origins, so dev uses a Vite proxy
  and production either uses a relay you host or leaves the venue off. A public CORS proxy
  is explicitly rejected: it would see the API keys in every request header, which is the
  one thing the vault exists to prevent. (F10.6)

## [0.9.0] — 2026-08-03 — Phase 9: OKX Connectivity

A real line to the venue: signed requests, a socket that survives a bad network, and
mappers that keep every venue quirk out of the app.

### Added

- **OKX request signing** — HMAC-SHA256 via Web Crypto, with the secret read from the
  vault at call time rather than cached (a cached key would outlive `keys.lock`). The
  prehash string is pinned by test, including the empty-body rule for GETs and the WS
  login's seconds timestamp, which differs from REST's ISO form — a venue inconsistency
  that otherwise surfaces as an unauthorised socket. (F9.3, F9.4)
- **Reconnecting WebSocket** — exponential backoff forever, and **resubscribe on
  recovery**: a socket that reconnects but forgets its channels shows a frozen book, which
  reads as a quiet market rather than as missing data. A malformed frame is dropped, never
  the session, and `isStale` catches the open-but-silent socket. (F9.1, F9.2)
- **OKX payload mappers** — tickers, trades, books, orders, positions and error codes,
  each a pure function so no venue quirk escapes into the app: `''` becomes `0` rather
  than `NaN`, a signed position size becomes an explicit side, and error codes become
  sentences a trader can act on. (F9.6, F9.10)
- **Signed REST with a client-side rate budget** — orders, cancels and positions over
  HTTPS as the fallback when the socket is reconnecting; a trader who wants out of a
  position does not care which transport carries the cancel. Calls that would breach
  OKX's published limits are refused locally, because being rate-limited mid-scalp costs
  a fill. Every call returns a result object and never throws: an exception on the order
  path leaves the trader unsure whether the order went. (F9.4, F9.5, F9.8)

## [0.8.0] — 2026-08-03 — Phase 8: API Key Access Layer

Credentials in seconds, and nowhere they should not be: URL params scrubbed on arrival, a
vault outside the reactive tree, and a panic lock.

### Added

- **Trade within seconds of opening a link** — credentials arrive as URL params, are read
  once into an in-memory vault, and the address bar is rewritten immediately. A key left
  in the URL reaches browser history, screen shares and `Referer` headers; reading it once
  and scrubbing costs nothing. (F8.1, F8.2)
- **Keys never touch application state** — the vault is a plain module-scoped map outside
  the reactive tree, and only presence booleans reach state. State is recorded into
  history, returned by `serialize()` and exported with the journal: a key that reaches it
  ends up in a file the trader emails to someone. A test asserts a stored key appears in
  neither state nor a serialized session. (F8.4)
- **Key modal and panic lock** — paste credentials once, or clear every one instantly with
  `keys.lock`. Paper mode deliberately never demands keys, so a new user can click a
  working desk before handing anything over. (F8.3, F8.7)

## [0.7.0] — 2026-08-03 — Phase 7: User Settings & Persistence

The desk is configurable: a settings drawer driven by one schema, layout presets, JSON
export/import, and an undoable reset.

### Added

- **A settings drawer** — order size, price step, size presets, risk limits, favourites
  and sounds, opened from the header gear and rendered from one declared schema, so a new
  setting appears by being declared rather than by editing markup. (F7.1, F7.3)
- **Every write is coerced** — a value typed into the drawer gets exactly the same
  treatment as one from an imported file. Junk in a risk field becomes the default rather
  than `NaN`, because a daily-loss limit that quietly became `NaN` is a disabled circuit
  breaker. (F7.2)
- **Layout presets** — save the current block arrangement under a name and switch back to
  it later. (F7.4)
- **Export and import** — settings travel to another machine as JSON, carrying the block
  layout, because "my settings" means the desk as it looked. Imports are normalised: a
  hand-edited file is untrusted input. (F7.7)
- **Reset with one undo** — restoring defaults checkpoints first and rewinds through the
  engine's own history, the same mechanism the trade journal uses, so there is one way to
  go back rather than two. (F7.8)

## [0.6.0] — 2026-08-03 — Phase 6: Day/Night Theme Engine

The desk remembers how you like it: themes persist, load without a flash, and the palette
flips without dragging the prices through a fade.

### Added

- **Your theme and layout survive a reload** — settings persist to localStorage, versioned
  and migrated, so a schema change never costs a trader their arrangement. Only
  `settings.*` is stored: a resurrected position from yesterday that *looks* live is a
  real loss, not a cosmetic bug. Corrupt storage or a refusing browser degrades to
  defaults instead of blocking the boot. (F6.1)
- **No white flash on load** — an inline script stamps the cached theme before any
  stylesheet or module runs, because a night-theme trader loading a white page for one
  frame at 2am is not a small annoyance. (F6.6)
- **150ms theme crossfade** — surfaces and text fade, numbers do not: a price that fades
  between values is a price you cannot read at speed. (F6.7)
- **Canvas re-palette seam** — renderers subscribe to theme changes, since a chart drawn
  in phosphor green stays green on a white background until it is redrawn. (F6.8)
- **Browser chrome follows the theme** — no dark address bar above a light desk. (F6.9)

## [0.5.0] — 2026-08-03 — Phase 5: Header, Branding & Navigation

Orientation without looking away from the prices: wordmark, section nav, venue LEDs,
day-PnL ticker, venue clock, and the theme toggle.

### Added

- **The header** — STOCKZ wordmark, section nav (desk / trade / journal / stats), live
  venue LEDs, the day-PnL ticker, venue-time clock, hotkey and settings buttons, and the
  day/night toggle, in fixed positions so the eye finds each answer by muscle memory
  rather than by searching. (F5.1–F5.9)
- **Sections switch block sets** — `ui.setSection` picks which blocks are on screen, so
  'trade' drops the journal and 'journal' drops the ladder, without the trader hiding
  blocks by hand. An unknown section shows everything rather than an empty screen. (F5.2)
- **Session clock shows uptime** — a desk that silently reconnected an hour ago and one
  that has been streaming all session look identical otherwise. (F5.7)
- **Theme switching** — one attribute on `<html>` flips the whole palette from the token
  sets already in the stylesheet: no stylesheet swap, no reload, nothing to re-fetch
  mid-session. A first-time visitor with a light OS preference gets the day theme. (F5.4)
- **Condensed mobile header** — labels drop, but the LEDs, PnL and clock stay: on a phone
  the trader still needs to know if they are connected and what they are carrying. (F5.10)

## [0.4.0] — 2026-08-03 — Phase 4: Dashboard Grid Shell

The desk got its shape: a header, a uniform grid of same-size blocks driven entirely by a
registry in state, and a footer.

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

[Unreleased]: https://github.com/D-dezeeuw/stockz/compare/v0.11.0...HEAD
[0.11.0]: https://github.com/D-dezeeuw/stockz/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/D-dezeeuw/stockz/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/D-dezeeuw/stockz/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/D-dezeeuw/stockz/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/D-dezeeuw/stockz/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/D-dezeeuw/stockz/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/D-dezeeuw/stockz/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/D-dezeeuw/stockz/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/D-dezeeuw/stockz/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/D-dezeeuw/stockz/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/D-dezeeuw/stockz/releases/tag/v0.1.0
