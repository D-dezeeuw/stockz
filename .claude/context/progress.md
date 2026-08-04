# Progress

The handoff file. A fresh context reads `CLAUDE.md` → **this file** → the current phase
in `masterplan.md`, and knows where the project stands. Rewritten at every phase close.

---

## Status: Phase 28 closed (v0.28.0) — STOPPED HERE by the owner

The owner asked to **stop after phase 28** (2026-08-04). Phases 29 and 30 are untouched;
the earlier "work until all phases are complete" instruction is superseded. Do not start
phase 29 without a fresh instruction.

**Live:** https://d-dezeeuw.github.io/stockz/ (Pages serves `main` root — pushing is deploying)
**Tests:** 1420, one per function, all passing. Paper/mode files: 98% statements, 89% branches.
**Branch model:** everything merges to `main`; no feature branches outstanding.

## Phase 28 — Paper Trading Mode (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F28.1 | `setTradeMode`, `parseModeParam`, `applyModeParam`, `isPaper`, `beginGoLive`, `cancelGoLive` | `src/exec/mode.js` |
| F28.2 | `queuePosition`, `insertResting`, `removeResting`, `amendResting`, `paperMarketFill`, `paperLimitMatch`; `restOrder`, `workPrint`, `cancelPaperOrder`, `amendPaperOrder` | `src/exec/paper/{book,engine}.js` |
| F28.3 | `applyFillToBalance`, `markToMarket`, `computeExposure`, `refreshAccount`, `paperMarks`, `bookPaperFill` | `src/exec/paper/account.js` |
| F28.4 | `paper` flag through `makePosition`/`applyFill`/`normalizeFill`/`makeTrade` | `src/positions/`, `src/journal/pairing.js` |
| F28.5 | `createHold` (shared with going live), `resetPaperAccount`, `beginPaperReset` | `src/ui/hold.js`, `src/exec/paper/account.js` |
| F28.6 | `BOOKS`, the `book` journal filter, paper badges on rows | `src/journal/filters.js` |
| F28.7 | `latencyConfig`, `latencyFor`, `afterLatency`, `seedLatency` | `src/exec/paper/latency.js` |
| F28.8 | `splitByBook`, `bookStats`, `refreshBookCompare`, `mountBookChart` | `src/exec/paper/compare.js` |
| F28.9 | `isFirstRun`, `applyFirstRunMode`, `dismissPaperHint` | `src/exec/mode.js` |
| F28.10 | `checkBook`, `checkGap`, `checkFresh`, `guardPaperFill` | `src/exec/paper/guards.js` |

### Things a later phase must know

**A position's mode is on the position, not on `trade.mode`.** A paper position left open
across a switch to live must not start reading as real, so every badge and every journal
filter reads the record's own flag. It is sticky through adds and reduces; a flip takes the
incoming fill's mode.

**`createHold` is the only "deliberate but not a dialog" gesture.** Going live and wiping
the practice account both use it. The ring fills from the timer, release listens on the
*document*, and both listeners are removed on cancel — a leftover `pointercancel` kills the
next hold.

**Settings persistence was broken until F28.10.** `persistSettings` watched two paths. It
now watches `Object.values(PATHS.settings)`, so a new setting persists by existing. Any
setting added later needs a `PATHS.settings` entry or it will silently not survive reload.

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
