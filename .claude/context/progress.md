# Progress

The handoff file. A fresh context reads `CLAUDE.md` → **this file** → the current phase
in `masterplan.md`, and knows where the project stands. Rewritten at every phase close.

---

## Status: Phase 27 closed (v0.27.0) — phase 28 next

Delivery is running unattended to phase 30 on the owner's instruction (2026-08-04:
*"Work until all phases are complete do not stop before completion"*).

**Live:** https://d-dezeeuw.github.io/stockz/ (Pages serves `main` root — pushing is deploying)
**Tests:** 1369, one per function, all passing. Backtest files: 92% statements, 81% branches.
**Branch model:** everything merges to `main`; no feature branches outstanding.

**Next: phase 28 — Paper Trading Mode**, starting at F28.1. Note that a working paper
adapter *already exists* (`src/exec/adapters/paper.js`, built mid-phase-26 when the owner
asked for automated trading) — phase 28 should extend and formalise it rather than
rebuild it.

## Phase 27 — Market Replay & Backtesting (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F27.1–F27.4 | Tick recorder, IndexedDB store, library, transport, feed source | `src/playback/*` |
| F27.5 | `createSandbox`, `invokeStrategy`, `driveBacktest`, `collectSignals`, `progressReporter`, `runBacktest`, `cancelBacktest`, `runDetachedBacktest` | `src/backtest/{sandbox,harness,worker,runner,strategies}.js` |
| F27.6 | `simMarketFill`, `simLimitFill`, `applyLatency`, `slippageForSize`, `simFees`, `orderFromSignal`, `drainPending` | `src/backtest/fills.js`, `harness.js` |
| F27.7 | `buildTradeList`, `computeExpectancy`, `computeDrawdown`, `equityCurve`, `summariseRun`, `reportTiles`, `copyReportJson` | `src/backtest/{stats,report}.js` |
| F27.8 | `expandParamGrid`, `defaultGrid`, `poolSize`, `runSweep`, `sweepView`, `heatRatio`, `applyComboParams` | `src/backtest/sweep.js` |
| F27.9 | `saveRunResult`, `listRuns`, `pinSlot`, `diffRunStats`, `drawCompare`, `clearSlots` | `src/backtest/{archive,compare}.js` |
| F27.10 | `createSeededRng`, `roundToTick`, `sumMoney`, `canonicalJson`, `hashRunResult`, `verifyDeterminism` | `src/backtest/determinism.js`, `fixture.json` |

### Things phase 28 must know

**A module worker gets no importmap.** Nothing in `src/backtest/worker.js`'s import graph
may reach the bare specifier `spektrum` — which `app/engine.js` imports and the strategy
barrel reaches through its own sandbox. `worker-graph.test.js` guards this and is written
against a control proving it can actually see a violation. Two modules had to move to
satisfy it: the fee schedule (`src/hud/fee-schedule.js`) and range-fade's level overlay
(now an injectable sink installed in bootstrap).

**`runBacktest` is a singleton and cancels its predecessor.** Anything wanting concurrency
uses `runDetachedBacktest`, which owns no state and publishes no progress. Eight sweep
lanes sharing the singleton would each kill the lane before it.

**Spektrum `data-each` binds the CONTAINER and clones its first *element* child.** A
`data-each` on an `<option>` or on a text-only `<span>` renders nothing and warns every
frame. Where a select needs both a placeholder and a bound list, the placeholder is a data
row (`backtest.recordings`, `journal.instruments`).

### Owner-driven fixes shipped during this phase

- **The live-trading checkbox did the opposite of what it says.** `syncArm()` read
  `trade.mode === 'live'` as a reason to ground the autopilot, so ticking "trade live with
  real funds" stopped the desk trading. It now keeps flying across the switch; every gate
  downstream (kill switch, breakers, caps, throttle) is unchanged. Market mode still
  defaults to **volatile** (120 orders/min).
- **OKX 401s that were not bad keys.** Requests were signed with the browser clock; OKX
  refuses a timestamp >30s off its own, as a flat 401. `src/venues/okx/clock.js` measures
  drift against `/api/v5/public/time` at boot and signs against the venue. The whole 401
  family is now named rather than swallowed, and the reconciler surfaces the venue's reason
  once instead of failing silently every thirty seconds.
- **A build stamp in the footer.** `APP_VERSION` only moves at a phase close, so it could
  not answer "am I looking at the fix I just pushed". `npm run deploy` now runs
  `scripts/stamp-build.sh`, which commits the pushed commit's SHA into `src/app/build.js`.

### Known and unfixed

- A `TypeError` from `spektrum-devtools`'s own `render` appears once per page load and in
  `bootstrap.test.js`. Pre-existing, inside the vendored companion, harmless.
- OKX round-trip latency is never measured — the socket wrapper has no `onPong`.
- The eToro quote poller is wired but never started.
- Strategies run on the focused instrument only, not the whole watchlist.
