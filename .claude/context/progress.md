# Progress

The handoff file. A fresh context reads `CLAUDE.md` → **this file** → the current phase
in `masterplan.md`, and knows where the project stands. Rewritten at every phase close.

---

## Status: Phase 3 closed (v0.3.0) · Phase 4 next

**Live:** https://d-dezeeuw.github.io/stockz/ (Pages serves `main` root — pushing is deploying)
**Tests:** 98, one per function, all passing individually. Every gated file ≥85% branches.
**Branch model:** everything merges to `main`; no feature branches outstanding.

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

## Next up: Phase 4 — Dashboard Grid Shell

First feature **F4.1**. `index.html` currently holds a flat `#app` with a boot line, a
status line, a demo price cell, swatches, the toast `<ul>` and one dispatch button — no
grid, no header, no footer. Decided already:

- Grid metrics already exist as tokens: `--block-w` (22rem min column), `--block-h`
  (15rem, every block the same height), `--grid-gap`, `--header-h`, `--footer-h`.
- Blocks come from a **registry in state** rendered with `data-each` — remember
  Spektrum's container-not-template rule for `data-each`.
- Block visibility toggles belong in `settings.*` (the only persisted branch).
- The footer is Neko Media + LinkedIn/npm/GitHub icons; `icon()` already ships a chart,
  gear, clock and keyboard, so add the three brand marks there.
- `.scroll-y` and the no-sideways-scroll rule are already in `layout.css`.

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
