# Architecture

STOCKZ is a **static single-page app** — vanilla ES modules, no SPA framework — hosted on
GitHub Pages, with Node.js 22 used only for tooling (Vite dev server/build, Vitest,
deploy script). The UI engine is **Spektrum 1.x** loaded from the unpkg CDN via an
importmap; there is deliberately no bundled framework.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| UI engine | Spektrum `1.x` via unpkg importmap | ~13kB, zero deps, reactive bindings, time-travel history — auditable trades for free |
| Build/dev | Vite (Node 22) | instant dev server, hashed prod build with GH Pages base path |
| State persistence | `spektrum/persist` → localStorage | user settings cached, restored before first paint |
| Charts | hand-rolled canvas renderers | tick-level speed; no chart-lib weight on the hot path |
| Market data | OKX v5 WebSocket (public+private), EToro REST polling | push where possible, poll where not |
| Heavy parsing | Web Worker | keeps the main thread free for rendering and clicks |
| Recordings | IndexedDB | tick sessions for replay/backtesting |
| Tests | Vitest | one test per function (see `testing-policy.md`) |
| Hosting | GitHub Pages via `gh-pages` npm package | static, free, no CI — deploy is a local command |

## Directory layout

```
stockz/
├── index.html              # entry: importmap, no-flash theme script, app mount
├── vite.config.js          # base path for Pages + vitest config
├── public/                 # icons, manifest, sounds, 404.html
├── src/
│   ├── main.js             # boot: settings → keys → feeds → bindDOM → run
│   ├── state/              # initial state, namespaces, computed, systems
│   ├── actions/            # defineFn action registry (all user actions)
│   ├── venues/
│   │   ├── okx/            # WS client, REST signer, mappers
│   │   └── etoro/          # REST client, pollers, mappers
│   ├── pipeline/           # tick bus, ring buffers, aggregators, rAF flush
│   ├── engine/             # execution: order types, brackets, breakers
│   ├── strategy/           # strategy framework, indicators, built-ins
│   ├── blocks/             # one module per dashboard block (grid cells)
│   ├── charts/             # canvas renderers (tick, candle, sparkline)
│   ├── ui/                 # header, footer, modals, toasts, hotkeys
│   ├── lib/                # pure helpers (math, format, time) — most tests live here
│   └── workers/            # feed-parser worker
└── tests → colocated *.test.js next to each module
```

## Data flow (the hot path)

```
OKX WS ─┐                     ┌─ Spektrum state (market.*) ─ {{bindings}} → DOM blocks
        ├→ Worker parse → tick bus → ring buffers → rAF flush ┤
EToro poll ─┘                 └─ canvas renderers (charts, ladder, tape)
```

- **One direction:** feeds never touch the DOM; blocks never touch sockets. Everything
  meets in Spektrum state.
- **rAF batching:** raw ticks buffer in ring buffers; a single `requestAnimationFrame`
  flush calls `setValue` once per frame per namespace. Bursts coalesce; the UI never
  re-renders more than 60×/s.
- **Orders bypass the batch:** the order path (`actions/` → `engine/` → venue) is direct
  and synchronous up to the network call — no queues, no dialogs, one inline O(1)
  circuit-breaker check.
- **Time-travel:** every state mutation is in Spektrum history. `checkpoint()` at each
  closed trade; `serialize()` exports a session; `replay(n)` reproduces any moment —
  that's the journal and audit story.

## State namespaces

- `ui.*` — theme, nav section, modals, toasts, focus
- `settings.*` — persisted via `spektrum/persist` (only this namespace persists)
- `market.*` — ticks, books, candles, instrument catalog (never persisted)
- `trade.*` — orders, fills, positions, PnL, breaker status
- `strategy.*` — registered strategies, params, live signals
- API keys live in an **in-memory vault module**, never in Spektrum state (they must
  not enter history/serialize output).
