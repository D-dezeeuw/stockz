# Module map

A one-page mental model. The authoritative version lives in
[`.claude/context/architecture.md`](../.claude/context/architecture.md).

## Today (phase 1 complete)

```
index.html            importmap (spektrum, phase 2) + #app mount + module entry
└── src/
    ├── main.js       boot: logger -> global error capture -> overlay -> autoMount
    ├── app/
    │   └── version.js       appVersion()
    └── utils/
        ├── env.js           readEnv, hasEnv, venueKeyPresence, keyPresenceBanner
        ├── log.js           createLogger, level control, ring buffer, dev overlay
        ├── math.js          clamp, roundToTick, tickDecimals, bpsDiff
        └── format.js        formatPrice, formatQty, formatPct, formatSigned, formatCompact
```

Every `*.js` has a colocated `*.test.js` with exactly one test per function.

## Target (phases 2–30)

```
src/
├── main.js           boot sequence
├── state/            Spektrum initial state, computed values, systems
├── actions/          defineFn registry — every user action, hotkey- and palette-able
├── venues/
│   ├── okx/          WS v5 client, HMAC signer, mappers
│   └── etoro/        REST client, pollers, mappers
├── pipeline/         tick bus, ring buffers, candle aggregation, rAF flush
├── engine/           execution: order types, brackets, circuit breakers
├── strategy/         framework, indicators, built-in scalps
├── blocks/           one module per dashboard grid block
├── charts/           canvas renderers (tick, micro-candle, sparkline)
├── ui/               header, footer, modals, toasts, hotkeys
├── lib/ + utils/     pure helpers (where most single tests live)
└── workers/          feed-parser worker
```

## Data flow

```
OKX WS ─┐                                    ┌─ Spektrum state ─ bindings → DOM blocks
        ├→ worker parse → tick bus → buffers ┤
EToro poll ─┘                    (rAF flush) └─ canvas renderers
```

Feeds never touch the DOM; blocks never touch sockets. The order path is the exception:
it goes straight from action to venue with one O(1) breaker check — no queue, no dialog.

## State namespaces

`ui.*` · `settings.*` (the only persisted branch) · `market.*` · `trade.*` ·
`strategy.*`. API keys live in an in-memory vault module, never in state — state is
serialized into history and journal exports.
