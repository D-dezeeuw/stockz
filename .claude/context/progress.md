# Progress

The handoff file. A fresh context reads `CLAUDE.md` → **this file** → the current phase
in `masterplan.md`, and knows where the project stands. Rewritten at every phase close.

---

## Status: Phase 11 closed (v0.11.0) · Phase 12 next

**Live:** https://d-dezeeuw.github.io/stockz/ (Pages serves `main` root — pushing is deploying)
**Tests:** 234, one per function, all passing individually. Every gated file ≥85% branches.
**Branch model:** everything merges to `main`; no feature branches outstanding.

## Phase 11 — Real-Time Market Data Pipeline (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F11.3 | `createRing` (fixed capacity, O(1), `replaceLast`), `arrivalRate` | `src/pipeline/ring.js` |
| F11.2, F11.4 | `publishTick`, `onTick`, `latestTick`, `recentTrades`, `flushToState`, `scheduleFlush`, `busStats` | `src/pipeline/bus.js` |
| F11.1, F11.6, F11.7 | `bucketStart`, `foldTrade`, `addTrade`, `candles`, `vwap` (1s/5s/1m) | `src/pipeline/candles.js` |
| F11.5, F11.8 | `ingest` (the one feed door), `setVenueState`, `markStaleFeeds`, `feedStats` | `src/pipeline/feed.js` |

**The rule: nothing between a socket and `bus.js` may call `setValue`.** One rAF flush
writes one value per path per frame. Candle buckets align to the wall clock; a print
inside the open bucket replaces the open candle (`ring.replaceLast`).

## Phase 10 — EToro Connectivity (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F10.1–F10.4 | `etoroHeaders`, `etoroRequest`, `fetchInstruments`, `fetchQuotes`, `fetchPortfolio`, `pollIntervalFor`, `createQuotePoller` | `src/venues/etoro/rest.js` |
| F10.7 | `mapQuote`, `mapPosition`, `mapOrder`, `mapOrderState`, `mapError`, `learnInstruments`, `symbolFor`, `toEpoch` | `src/venues/etoro/map.js` |
| F10.9 | `createMockFetch`, `seededRandom`, `mockQuote`, `primeMockInstruments` | `src/venues/etoro/mock.js` |
| F10.6 | CORS position: dev proxy, mock offline, relay-or-off in production | `docs/etoro-cors.md` |

**Shape parity is enforced by test** — `mapQuote` must produce the same keys as OKX's
`mapTicker`. Nothing downstream may branch on venue.
**A public CORS proxy is off the table**: it would see the API keys in every header.

## Phase 9 — OKX Connectivity (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F9.3, F9.4 | `okxTimestamp`, `prehashString`, `toBase64`, `hmacSha256`, `signRequest`, `buildLoginFrame` | `src/venues/okx/sign.js` |
| F9.1, F9.2 | `createOkxSocket` (backoff + resubscribe), `subscribeFrame`, `parseFrame`, `isStale` | `src/venues/okx/socket.js` |
| F9.6, F9.10 | `mapTicker/Trade/Book/Order/Position/Error`, `toNum`, `mapOrderState` | `src/venues/okx/map.js` |
| F9.5, F9.8 | `okxRequest`, `placeOrder`, `cancelOrder`, `fetchPositions`, `withinRateLimit` | `src/venues/okx/rest.js` |

Venue facts worth keeping: the WS login signs a **seconds** timestamp while REST signs the
ISO string; a GET signs an **empty** body (`{}` must not be signed); OKX returns HTTP 200
with `code: '1'` for business failures and the real reason is the per-item `sCode`.
Nothing here opens a socket in tests — the socket factory, timer, `fetch` and
`crypto.subtle` are all injected.

## Phase 8 — API Key Access Layer (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F8.1–F8.2 | `parseKeyParams`, `scrubKeyParams`, `adoptKeysFromUrl` | `src/venues/vault.js` |
| F8.4 | the vault: `setKeys`, `getKey`, `hasKeys`, `keyPresence`, `clearKeys` | `src/venues/vault.js` |
| F8.3, F8.7 | key modal, `submitKeys`, `lockKeys`, `needsKeys`, `adoptKeys` | `src/ui/keys.js`, `index.html` |
| F8.9 | `adoptKeysFromEnv` — dev fallback to `STOCKZ_*` | `src/venues/vault.js` |

**THE RULE: credentials never enter Spektrum state.** State goes into history,
`serialize()`, journal exports and devtools dumps. Only `ui.keysPresent` (booleans) is in
state; `getKey(venue, field)` is the single way a full key leaves the vault, which keeps
key handling greppable. The key modal uses plain DOM inputs, never `data-model`.

## Phase 7 — User Settings & Persistence (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F7.1–F7.3 | `SETTINGS_SCHEMA`, `defaultSettings`, `coerceSetting`, `normalizeSettings`, `parseList`, `fieldFor` | `src/state/settings-schema.js` |
| F7.3 | settings drawer (`ui.modal === 'settings'`), `data-model` fields | `index.html`, `src/styles/states.css` |
| F7.4 | `saveLayoutPreset`, `applyLayoutPreset` | `src/ui/settings.js` |
| F7.7 | `exportSettings`, `importSettings` (normalised on the way in) | `src/ui/settings.js` |
| F7.8 | `resetSettings` + `undoSettingsReset` via `checkpoint`/`replay` | `src/ui/settings.js` |

`initialState()` now spreads `defaultSettings()`, so the schema is the single source of
defaults. Adding a setting = add it to `SETTINGS_SCHEMA` (and to `PATHS.settings` so the
paths test stays green).

## Phase 6 — Day/Night Theme Engine (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F6.1 | `loadSettings`, `saveSettings`, `migrateSettings` (versioned), `restoreSettings`, `persistSettings`, `isPersistable` | `src/state/persist.js` |
| F6.6 | inline no-flash boot script — stamps `data-theme` before any stylesheet | `index.html` `<head>` |
| F6.7 | 150ms crossfade on surfaces; numbers explicitly excluded | `src/styles/status.css` |
| F6.8 | `onThemeRepaint` — canvas renderers subscribe here (phase 13 uses it) | `src/state/systems.js` |
| F6.9 | `syncBrowserChrome` + `CHROME_COLOR` | `src/ui/theme.js` |

**Storage key is `stockz.settings.v1`.** The no-flash script duplicates the theme read by
necessity (no module graph that early) — if the key or shape changes, change it in
`persist.js` **and** in `index.html`.

## Phase 5 — Header, Branding & Navigation (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F5.1–F5.9 | wordmark, nav, venue LEDs, PnL ticker, UTC clock, hotkey/settings buttons, theme toggle, sticky header | `index.html`, `src/styles/grid.css` |
| F5.2 | `setSection`, `blockInSection`, `SECTION_BLOCKS` — sections switch block sets | `src/ui/header.js` |
| F5.5, F5.7 | `venueLeds`, `sessionClock` (clock + uptime) | `src/ui/header.js` |
| F5.4 | `preferredTheme`, `applyTheme`, `setTheme` — one attribute on `<html>` | `src/ui/theme.js` |
| — | `toggleOverlay` — same panel twice closes it | `src/ui/header.js` |
| F5.10 | condensed mobile header: labels drop, LEDs/PnL/clock stay | `src/styles/grid.css` |

## Phase 4 — Dashboard Grid Shell (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F4.1 | `.app-shell` header/grid/footer rows; equal cells via auto-fit + `grid-auto-rows` | `src/styles/grid.css` |
| F4.2, F4.10 | `makeBlock`, `addBlock`, `removeBlock`, `updateBlock`, `reorderBlock`, `sortBlocks`, `visibleBlocks`, `toggleBlock`, `currentBlocks`, `commitBlocks` | `src/blocks/registry.js` |
| F4.3, F4.5, F4.6 | block chrome, skeleton shimmer, empty and error states | `src/styles/states.css`, `index.html` |
| F4.4 | `columnCount`, `densityFor`, `applyLayout`, `observeLayout` | `src/blocks/layout.js` |
| F4.7 | footer: Neko Media + LinkedIn/npm/GitHub inline SVG | `index.html` |
| F4.8 | `setBlockVisibility` + `ui.toggleBlock` action | `src/blocks/layout.js` |
| — | 8 starter blocks seeded at boot without trampling a saved layout | `src/blocks/seed.js` |

`commitBlocks` is the single write point and normalises through `makeBlock`, so anything
downstream can trust every entry.

## Phase 3 — Money-Hacker Design System (closed)

The desk got its face. Styles are plain CSS files linked from `index.html` (no bundler in
the deploy path), tokens on `:root`, day variant under `[data-theme='day']`.

| Feature | What now exists | Where |
| --- | --- | --- |
| F3.1 | green/orange ramps, near-black surfaces, day variant | `src/styles/tokens.css` |
| F3.2 | monospace stack, type scale, tabular numerals by default | `src/styles/type.css` |
| F3.3 | 4px spacing step, radius/border, grid metrics (`--block-w/h`) | `src/styles/layout.css` |
| F3.4 | glow, LEDs, tick pulse, scanlines; all off under reduced motion | `src/styles/accents.css` |
| F3.5 | `statusOfValue`, `statusClass`, `valueClass`, `sideClass`, `connectionClass`, `tickPulseClass` | `src/ui/status-color.js` |
| F3.6 | 100–150ms motion budget, focus rings, reduced-motion killswitch | `src/styles/status.css` |
| F3.7 | `icon()`, `escapeAttr()`, `sideIcon()` — 10 inline SVGs on a 16px grid | `src/ui/icons.js` |
| F3.8 | `fmt.*` global so bindings can format and colour in one expression | `src/ui/format-bindings.js` |
| F3.9 | token-resolved utility classes; `[data-cloak]` hiding rule | `src/styles/utilities.css` |
| F3.10 | `parseHex`, `relativeLuminance`, `contrastRatio`, `meetsContrast`, `auditContrast` | `src/ui/contrast.js` |

**The contrast audit caught a real defect**: day-theme orange was 4.17:1 on white (below
AA), so loss values would have been harder to read than profit values in daylight. Token
is now `#b84600`. Re-run that test after any token change.

## Phase 2 — Spektrum Core Integration (closed)

The desk became reactive: one state tree, one action registry, derived values that cannot
go stale, and faults that reach the trader instead of the console.

| Feature | What now exists | Where |
| --- | --- | --- |
| F2.1 | spektrum@1.1.0 + 5 companions pinned in the importmap; `engineInfo()` reads the page's own map | `index.html`, `src/app/engine.js` |
| F2.2 | `bootstrap()` seeds state → binds → uncloaks → checkpoints → rAF pump; `makeBootClock` | `src/app/bootstrap.js` |
| F2.3 | `PATHS`, `buildPath`, `assertKnownNamespace`, `isPersisted` + lint rule vs raw path literals | `src/state/paths.js` |
| F2.4 | `registerAction`, `dispatchAction`, `ui.setStatus`, `app.reset`; names in `ACTIONS` | `src/actions/` |
| F2.5 | `spreadOf`, `midOf`, `exposureOf`, `openOrderCount`, `statusLineOf` + `registerDerived` | `src/state/derived.js` |
| F2.6 | UTC clock, uptime, heartbeat, theme watch, latching spread warning, `stopSystems` | `src/state/systems.js` |
| F2.7 | `loadAsync` (aborts in-flight), `retryDelay`, `setAsyncStatus`, `refreshServerTime` | `src/state/async.js` |
| F2.8 | `mountDevtools` (dev only), `devDumpState`, `devReplayTo` | `src/app/devtools.js` |
| F2.9 | `pushToast`, `dismissToast`, `expireToasts`, `describeEngineError`, `wireEngineErrors` | `src/ui/toast.js` |
| F2.10 | `collectExpressions`, `renderPrecompileModule`, `cspMeta`, `npm run build:csp` | `src/app/csp.js`, `docs/csp.md` |

## Next up: Phase 12 — Watchlists & Instruments

First feature **F12.1**. The pipeline is complete but **no venue client is started at
boot** — `bootstrap.js` never calls `createOkxSocket` or the EToro poller, so the desk
runs on seeded state only. Phase 12 (or the first feature that needs live data) should
wire that: create the socket, `setVenueState`, subscribe, and route frames through
`ingest`.

For phase 12 itself:

- Watchlist CRUD in `settings.*` (persisted), rendered with `data-each` — remember
  Spektrum's container-not-template rule.
- Fuzzy symbol search across both venues; OKX has no catalogue fetch yet, EToro has
  `learnInstruments`/`symbolFor`.
- `market.focus` already exists and drives what the pipeline flushes.
- Row cells want `latestTick`/`recentTrades` from the bus, and `fmt.*` for display.

## Gotchas (learned the hard way — do not rediscover)

- **`replay(n)` applies history entries `[0, n)`** — `history.length` means "the
  present", not out of range. The first `devReplayTo` test assumed `n` was inclusive and
  failed.
- **Inline arrows are invisible to the coverage gate.** A watch callback or a
  `() => x || Date.now()` inside a register function will sink functions/branches below
  80%. Extract it as a named exported function with its own single test — that is the
  policy's remedy, not a second test on the parent.
- **Vite's env bag coerces assigned values to strings**, so `readEnv(name, bag)` takes an
  injectable bag. Prefer injectable sources over ambient globals: it is what keeps branch
  coverage reachable.
- **Default parameters only fire on `undefined`.** `fn(null)` reaches an `if (!arg)`
  guard, `fn(undefined)` does not.
- **`npx vitest -t "<name>"` matches substrings** — `-t mountDevtools` also matches
  `unmountX`-style names. Expected reporter noise, not a policy breach.
- **`pkill -f "<pattern>"` can match its own shell** and kill the rest of the command
  chain (exit 144). Put it in its own call, or use `timeout -k 2 N` to cap servers.
- **A `&&` chain does not stop at a failed coverage gate** if the gate command is on its
  own line — F2.6 merged red and needed a follow-up fix. Check the gate output before
  committing.
- Headless Chromium **cannot reach unpkg in this container** (`ERR_CONNECTION_RESET`),
  though curl can. Browser-based CDN checks are not meaningful here; rely on unit tests.
- **Git tags cannot be pushed** through the session proxy (403). Releases are recorded in
  `CHANGELOG.md`; tag from a local clone if a GitHub tag is wanted.

## Deviations from the masterplan (deliberate — do not "fix")

- **Tests are colocated** (`src/**/*.test.js`), not in a `tests/` mirror; `tests/` holds
  fixtures and `CONVENTIONS.md`. `testing-policy.md` is the stricter authority.
- **No separate `vitest.config.js`** — Vitest reads `vite.config.js` natively.
- **No `gh-pages` package or branch** — Pages serves `main` root, so the deploy is a push
  and the build is a local check only. Phase 30's plan text still assumes gh-pages;
  revise it there, do not restore the branch.
- **Raw ES modules in production**: no JSON imports, no `?raw`, `import.meta.env` only
  behind `?.`, static assets at the repo root, complete import paths with extensions.
- **`app.reset` is not a kill switch** — it restores the screen and deliberately leaves
  venues and the key vault alone. The kill switch is phase 24 and must stay distinct.
- **CSP is groundwork only** — `build:csp` generates the precompiled module, but the
  default build and the live page are untouched. Enforcement belongs with phase 30.
- **Commits are authored as Danny de Zeeuw** (`danny@nekomedia.nl`), never a bot
  identity. The CCR stop-hook flags these as "Unverified"; expected and accepted.
