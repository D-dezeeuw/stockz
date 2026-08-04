# Progress

The handoff file. A fresh context reads `CLAUDE.md` → **this file** → the current phase
in `masterplan.md`, and knows where the project stands. Rewritten at every phase close.

---

## Status: delivering — phase 26, F26.10 next

**The pause is lifted.** The owner restarted delivery on 2026-08-04: *"Continue the
masterplan fully automatically."* The earlier "Pause after Phase 25" order no longer
applies. Delivery runs to phase 30 without stopping for approval, per CLAUDE.md.

**Where phase 26 stands:** F26.1–F26.9 are merged to `main` and green. F26.9 (period
selector) was delivered from scratch on `feature/f26-9-period-selector` — only
`src/analytics/period.js` survived from the branch parked before the pause, because
everything else on it predated a session's worth of work on `main`. **F26.10 (performance
report export) is the last feature before the phase closes as `v0.26.0`.**

The hourly masterplan watchdog (`trig_014GA2EKv5ub8HCd7vrqgyA5`) was deleted during the
pause and has not been recreated; delivery is currently paced by a `/loop`. If a pause is
ever needed again, **delete** the trigger rather than disabling it — disabling was tried
first and did not hold, it fired again on its next tick.

**Between phase 25 and here**, a long run of owner-reported defects was fixed outside the
masterplan: the whole DOM binding contract (every action was a no-op, all 37 `data-each`
used Vue syntax, an SVG binding aborted the bind walk), the credential flow, venue
endpoints, a self-populating 40-instrument watchlist, real paper execution, and the
autopilot. See `CHANGELOG.md` under `[Unreleased]`.

## Status: Phase 25 closed (v0.25.0)

**Live:** https://d-dezeeuw.github.io/stockz/ (Pages serves `main` root — pushing is deploying)
**Tests:** 1120, one per function, all passing individually. Every gated file >80% branches.
**Branch model:** everything merges to `main`; no feature branches outstanding.

## Phase 25 — Trade Journal & Time-Travel Audit (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F25.1 | `normalizeFill`, `splitCrossingFill`, `matchLots`, `makeTrade`, `pairFills`, `journalTrades`, `openLots`, `saveOpenLots`, `loadOpenLots`, `resetJournal`, `onJournalFill`, `journalState` | `src/journal/pairing.js`, `types.js` |
| F25.2 | `holdTime`, `formatHold`, `slippage`, `sumFees`, `maeMfe`, `netPnl`, `rMultiple`, `enrichTrade`, `refreshJournalRows`; `recordTick`, `ticksBetween`, `resetTicks` | `src/journal/metrics.js`, `ticks.js` |
| F25.3 | `normalizeTag`, `annotationFor`, `addTag`, `removeTag`, `setNote`, `suggestTags`, `tagCatalog`, `publishAnnotations`, `saveAnnotations`, `loadAnnotations`, `registerTagActions`, `resetAnnotations` | `src/journal/tags.js` |
| F25.4 | `checkpointLabel`, `pinTrade`, `addPin`, `checkpoints`, `jumpToCheckpoint`, `pinLive`, `returnToLive`, `registerCheckpointActions`, `resetCheckpoints` | `src/journal/checkpoints.js` |
| F25.5 | `isSecretKey`, `redactSecrets`, `buildEnvelope`, `exportSession`, `exportName`, `downloadFile`, `registerExportActions`, `auditExport` | `src/journal/export.js` |
| F25.6 | `validateSession`, `loadSession`, `replayState`, `stepReplay`, `seekReplay`, `publishStep`, `setSpeed`, `liveOnly`, `exitReplay`, `importFile`, `registerImportActions`, `resetReplay` | `src/journal/import.js` |
| F25.7 | `matchesFilters`, `filterTrades`, `sortTrades`, `journalInstruments`, `refreshFiltered`, `setFilter`, `toggleSort`, `clearFilters`, `registerFilterActions` | `src/journal/filters.js` |
| F25.8 | `fixed`, `isoOrBlank`, `toCsvField`, `toCsvRow`, `buildCsv`, `csvName`, `exportCsv`, `registerCsvActions` | `src/journal/csv.js` |
| F25.9 | `dayKey`, `groupByDay`, `daySummary`, `dailyRows`, `refreshDays`, `toggleDay`, `registerSummaryActions` | `src/journal/summary.js` |
| F25.10 | `retentionPolicy`, `pruneTrades`, `pruneTicks`, `pruneCheckpoints`, `archiveBeforePrune`, `storageUsage`, `runRetention`, `scheduleRetention`, `registerRetentionActions` | `src/journal/retention.js` |

**The unit is the round trip, never the fill.** Forty executions across six partial exits is
one decision. Matching is **FIFO and not configurable**: a journal exists to be trusted later,
and a policy that can change retroactively makes every past entry depend on a setting nobody
remembers the value of.

**The data flow**: `ingestFill` (positions/store.js) → `onJournalFill` → `pairFills` → pins
via `pinTrade`. The okx frame flush calls `recordTick` and `refreshFiltered`, and
`refreshFiltered` re-derives the rows (`refreshJournalRows`) and the day scorecard
(`refreshDays`) on the way through, so there is one publish rather than three views of one
list. Enrichment happens on publish, not at close: a trade that closed a second ago is still
having its MAE/MFE filled in behind it.

**Two hard gates, both on the order path in `exec/engine.js`'s `submit()`:** `liveOnly()`
refuses every order while a session is being replayed, and phase 24's `isExit` exempts closes
from the halt. The replay gate is raised before the payload lands — one frame of a live ticket
over replayed prices is one frame too many.

**Secrets never leave.** `redactSecrets` matches on **key name**, deep, rather than against a
list of known paths: a path list goes stale the first time somebody adds a field and fails
silently. `auditExport` re-checks the finished *text*, because the guarantee that matters is
about the bytes that leave.

New state: the whole `journal.*` and `replay.*` namespaces. New settings: `maxDays`,
`maxTrades`, `maxCheckpoints`. New stylesheet: `src/styles/journal.css`. New utility:
`.visually-hidden` in `utilities.css`.

**Deviations in phase 25, all deliberate:**
- **No IndexedDB anywhere.** Tick recordings are a bounded in-memory ring per instrument
  (`ticks.js`), annotations and open lots are `localStorage`. The plan repeatedly assumes an
  IDB tick store; none exists and nothing else in this codebase uses IDB. A trade older than
  the trail honestly reports no excursion rather than one reconstructed from candles the
  trader was never looking at.
- No gzip/`CompressionStream` on export, and no drag-and-drop import — a file input behind a
  styled label covers it, and the sessions this produces are kilobytes.
- `closeIntent` now sets `reduceOnly` only where the venue honours it (fixed in phase 24).

### Gotchas a fresh context should not rediscover

- **Spektrum expressions do not carry `Math`** (or other globals). Anything needing rounding
  is formatted into a `*Label` field by the publishing function — see `winRateLabel`,
  `storage.label`. A binding that silently evaluates to nothing is the worst kind of broken.
- **`fmt.pct` signs its output and expects a percentage**, not a 0..1 ratio.
- **`Number(null)` is a finite zero.** Anywhere "missing" must differ from zero — CSV cells,
  for one — check for null/undefined/'' *before* coercing.
- **A `data-each` container may not also carry `data-if`.** Style the empty container away
  with `:empty` instead.
- **`@container` queries never match here** — nothing declares a `container-type`. Use the
  40rem media breakpoint the grid already uses.
- **A new state namespace needs three edits**: `PERSISTED_NAMESPACES`-adjacent list in
  `paths.js`, the `PATHS` block, and `initialState()`; `paths.test.js` and `initial.test.js`
  both assert the two match exactly.
- **Every new action name needs `names.test.js` updated twice**: the expected list, and the
  register call that proves something registers it.

## Next up — Phase 26

Read `.claude/context/masterplan.md` at `### F26.1` and start there. Phase 30's plan text still
assumes a `gh-pages` branch that no longer exists — Pages serves `main` root — and must be
revised when it is reached.

## Phase 24 — Circuit Breakers & Risk Kill Switch (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| — | `TRIP`, `TRIP_REASONS` (leaf module, no imports) | `src/breakers/codes.js` |
| F24.1 | `refreshThresholds`, `currentThresholds`, `checkBreakers`, `trippedCode`, `tripBreaker`, `resetBreaker`, `breakerRejection` | `src/breakers/core.js` |
| F24.2 | `updateDayPnl`, `dailyPct`, `dailyLossCheck`, `refreshDaily`, `resetDay` | `src/breakers/daily.js` |
| F24.3, F24.4 | `getPosSize`, `isReducing`, `isExit`, `capFor`, `positionCheck`, `onRealizedFill`, `streakCheck`, `pauseTrading`, `clearPause`, `pauseCheck`, `recordBlock`, `pauseState`, `resumeDue`, `resetPause` | `src/breakers/position.js` |
| F24.5 | `killSwitch`, `tripAction`, `killLatency`, `rearm`, `registerKillActions` | `src/breakers/kill.js` |
| F24.6 | `TRIP_ACTIONS`, `actionFor`, `retryOnce`, `markPending`, `clearPending`, `reconcilePending`, `pendingInstruments`, `executeTripAction`, `watchTrip`, `watchPending`, `resetTrip` | `src/breakers/trip.js` |
| F24.7 | `WARN_AT`, `ledStateFor`, `exposurePct`, `streakPct`, `breakerLeds`, `refreshLeds` | `src/breakers/leds.js` |
| F24.8 | `HOLD_MS`, `stillOverLimit`, `startHold`, `armHoldProgress`, `cancelHold`, `holdState`, `holdFrame`, `holdLoop`, `mountRelease`, `rearmDesk`, `registerRearmActions` | `src/breakers/rearm.js` |
| F24.9 | `eventLabel`, `logBreakerEvent`, `breakerEvents`, `flushBreakerLog`, `loadBreakerLog`, `pruneBreakerEvents`, `copyBreakerLog`, `registerLogActions`, `resetBreakerLog` | `src/breakers/log.js` |
| F24.10 | `BREAKER_LIMITS`, `validateBreakerSettings`, `breakerSettings`, `breakerContext`, `refreshBreakerCard`, `watchBreakerSettings` | `src/breakers/settings.js` |
| — | `orderChecks`, plus every re-export | `src/breakers/index.js` |

**A breaker never asks.** No confirm dialog, no "are you sure", no modal in the order
path — a breaker that asks is one that gets clicked through at exactly the moment it was
built for. A trip is a state change plus a rejection object; the trader finds out because
the desk stopped, and stopping is the feature.

**Three severities, kept distinct on purpose.** Conflating them would be worse than not
showing them:
- **Block** (`positionCheck`) — refuses one order, desk untouched. A fat-fingered size is a
  typo far more often than an emergency, and flattening the book over one is a cure worse
  than the mistake.
- **Pause** (`pauseCheck`) — no new entries, exits always allowed. Trading through a bad run
  turns a bad hour into a bad week, but a trader who cannot close is trapped by their own net.
- **Halt** (`tripBreaker` → `executeTripAction`) — disarm, cancel, flatten, in that order and
  none of it awaited.

**Exits are exempt from all three**, by the reduce-only flag or by sign (`isExit`). This is
not a nicety: without it the halt latch rejects the trip's own flatten, and the kill switch
cancels everything and then closes nothing.

**The order path**, inside `submit()` after `prepare()`: `isExit` → `dailyLossCheck` (halt)
→ `orderChecks` (pause, then cap). Primitive comparisons against a cached threshold object;
nothing on the hot path reads settings, walks a list, or allocates.

**Hot-path seams elsewhere**: `appendRealization` (ledger) feeds `onRealizedFill`;
`refreshDaily`, `refreshLeds` and `resumeDue` run on the okx frame flush; `killBot` is
called first and synchronously by every trip.

New state: `breaker.paused`, `lossStreak`, `lastBlock`, `blocked`, `killLatencyMs`,
`flattenPending`, `leds`, `holdPct`, `lastRearm`, `log`, `limits`. New settings:
`maxConsecLosses`, `pauseMinutes`. New actions: `breaker.kill`, `breaker.rearm`,
`breaker.hold`, `breaker.release`, `breaker.copyLog`. New hotkey: **Ctrl+Shift+K**, which
fires from inside a focused field via `ALWAYS_ON` in `src/keys/keymap.js`. New stylesheet:
`src/styles/breakers.css`.

**Deviations in phase 24, all deliberate:**
- The breaker log stores to **localStorage, not IndexedDB**. The plan assumed a shared IDB
  upgrade helper "used for tick recordings" that does not exist; nothing else here uses IDB.
  A hundred bounded entries pruned at thirty days do not justify a second storage engine plus
  a fake-IDB test dependency, and the guarantees asked for are all met.
- `capOverrides` is not flattened into the threshold cache; `capFor` reads
  `settings.botCapOverrides` — the same map phase 23's `bot/caps.js` uses — in one property
  access.
- F24.9's "journal mirror" is deferred: the phase-25 journal does not exist yet. The log ring
  and `breakerEvents()` are the seam.
- `breaker.session.blocked` is a flat `breaker.blocked` counter.

**Two real bugs fixed on the way through**, both of which made the wipe a no-op exactly when
it fired: the halt latch rejected its own flatten (see *exits are exempt*), and `closeIntent`
carried `reduceOnly` onto spot and eToro where it is unsupported and the order is refused
outright — so FLAT ALL had been silently doing nothing on those venues. A third seam: the
streak *check* read `maxConsecLosses` while the cached *threshold* read `botCooldownAfter`,
so one number configured half a breaker.

### Gotchas a fresh context should not rediscover

- **Import cycles bite on top-level consts.** `core.js` imports `bot/runner.js`, so anything
  importing `TRIP` from `core.js` inherits that dependency; the first module to build a lookup
  table keyed by a trip code found the enum in its temporal dead zone. Hence `codes.js` as a
  leaf. Function-level cycles are fine; module-evaluation-time ones are not.
- **`setValue` lands next tick, and objects MERGE.** Two writes to one path in a frame lose
  the first. Modules that own a list (pending instruments, the log ring) keep their own array
  and publish a copy — never read state back and write it again in the same frame.
- **Inline arrows are invisible to the coverage gate.** Extract them as named exported
  functions with their own single test (`holdLoop`, `reconcilePending`).
- **A CSS animation on an element that only changed its text never replays.** The ticket's
  block flash alternates class names on the block counter to force a restart.
- **A `0` sentinel collides with a monotonic clock.** `holdFrom` is `null` for "no press",
  because `performance.now()` reads near zero early in a page's life.
- **Tag pushes do not work through this environment's git proxy.** `git push --tags` fails
  with "the remote end hung up unexpectedly" and `git ls-remote --tags origin` shows the
  remote has no tags at all — no earlier phase managed one either. The release is cut in
  `CHANGELOG.md`, `package.json` and `src/app/version.js`, which is what the version test
  and the live page read. Do not spend a phase close retrying this.
- **Vitest `-t` matches substrings** — expect reporter noise from sibling names.
- **`spektrum-devtools` throws one unhandled `reading 'length'` error during
  `bootstrap.test.js`** in jsdom. Pre-existing, unrelated to any phase's changes, and does not
  fail the suite.

## Phase 23 — Auto-Trade Bot Runner (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F23.1–F23.3 | `enqueueSignal`, `pushDecision`, `botDecisions`, `armGate`, `optInGate`, `runGates`, `decide`, `dispatchOrder`, `drainTick`, `flushDecisions`, `createBotRunner`, `toggleMasterArm`, `setAutoEnabled`, `disableAllAuto`, `refreshBotStatus`, `killBot` | `src/bot/runner.js` |
| F23.4 | `snapToStep`, `ruleSize`, `routeInstrument`, `mapSignalToOrder`, `rulesFor` | `src/bot/mapper.js` |
| F23.5, F23.6 | `createThrottle`, `currentThrottle`, `throttleGate`, `onFillClosed`, `startCooldown`, `cooldownGate`, `clearCooldown`, `refreshLimits` | `src/bot/throttle.js` |
| F23.7 | `getOpenSize`, `exposureFor`, `capFor`, `capGate`, `cappedInstruments`, `refreshCaps` | `src/bot/caps.js` |
| F23.9, F23.10 | `isDryRun`, `logDryOrder`, `dispatchOrDry`, `countSignal`, `refreshSession`, `resetSession`, `toggleDryRun`, `hardStop`, `sessionReport` | `src/bot/session.js` |

**Nothing here is a second execution path.** Every bot order goes through `dispatchOrDry` →
`submit()` → `prepare()`, the same door a hand-typed order uses. A bot with its own
validation would be a second answer to "is this order sane", and the two would disagree the
day it mattered.

**The gate chain, in order**: `armGate` → `optInGate` → `throttleGate` → `cooldownGate` →
`capGate`. Cheapest first, so a disarmed desk never touches the throttle's window. Every
rejection is recorded with a *reason* — a bot that silently does nothing is
indistinguishable from a broken one.

**Three defaults carry the safety of the whole phase**, and all three are deliberate
inversions of the desk's usual opt-out style:
- `botArmed` is **transient** — stored, never restored, so every boot is disarmed.
- Strategies are **opt-in**, unlike alerts: being told about a signal and having money
  placed on it are different enough that the defaults must differ.
- `botDryRun` defaults **true even when unset** (`!== false`), so an undefined flag can
  never mean "go ahead".

**`killBot(reason)` is the seam phase 24's breaker pulls.** It stops the loop *before*
disarming, and disarms even with no runner attached — a kill switch with an exception is
not one.

New state: `bot.decisions`, `bot.status`, `bot.limits`, `bot.cooldownUntil`, `bot.capped`,
`bot.session`. New settings: `botArmed` (transient), `botSize`, `botStrategies`, `botRules`,
`botSizeRule`, `botEquityPct`, `botOrderType`, `botOffsetTicks`, `botMaxPerMin`,
`botCooldownAfter`, `botCooldownMinutes`, `botMaxPerInstrument`, `botCapOverrides`,
`botDryRun`. New block: `bot`. New hotkey: **Shift+A**. New concept:
`transientSettings()` in the settings schema, honoured by `restoreSettings`.

**Deviations in phase 23:** the dry-run store is in memory (200 entries) rather than
IndexedDB — phase 24 owns the store, and `sessionReport()` is the seam. There is no
`bot.masterArmed` state key as the plan names it; the flag lives at `settings.botArmed` so
it inherits the settings drawer and the transient-restore rule. Bot session P&L is not
separately summed: the scoreboard already attributes closes per strategy, and a second
attribution path would be a second thing to disagree.
## Phase 22 — Alerts & Notifications (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F22.2 | `makeAlert`, `isDuplicate`, `emitAlert`, `onAlert`, `alertLog`, `flushAlerts`, `alertEnabled`, `resetAlerts` — **the bus** | `src/alerts/bus.js` |
| F22.1 | `createAlert`, `evalPriceCross`, `rearmAlert`, `markFired`, `saveAlert`, `updateAlert`, `removeAlert`, `evaluateAlerts`, `alertChips`, `publishAlertChips`, `registerAlertActions` | `src/alerts/price.js` |
| F22.2 | `signalSeverity`, `mapSignalToAlert`, `routeSignalAlert`, `setAlertToggle`, `toggleRows`, `publishToggles` | `src/alerts/signals.js` |
| F22.3 | `execSeverity`, `parseRejectReason`, `mapOrderEvent`, `coalescePartials`, `routeExecAlert`, `REJECT_CODES` | `src/alerts/exec.js` |
| F22.4 | `spreadBaseline`, `spreadSpike`, `latencySpike`, `formatDowntime`, `venueTransition`, `checkHealth` | `src/alerts/health.js` |
| F22.5 | `coalesceToast`, `pauseToast`, `toastFromAlert`, `registerToastActions`, `wireAlertToasts` (added to the phase-2 module) | `src/ui/toast.js` |
| F22.6 | `scheduleTone`, `playSound`, `soundForAlert`, `resumeAudio`, `unlockAudio`, `soundAlert`, `wireAlertSounds` | `src/alerts/sounds.js` |
| F22.7 | `permissionState`, `requestPermission`, `visibilityGate`, `sendNotification`, `routeNative`, `wireNativeAlerts` | `src/alerts/notify.js` |
| F22.8 | `isSilenced`, `mayInterrupt`, `toggleDnd`, `snooze`, `snoozeLabel`, `expireSnooze`, `refreshDnd` | `src/alerts/dnd.js` |
| F22.9 | `formatTs`, `filterLog`, `logChips`, `unreadCount`, `refreshLog`, `toggleFilter`, `markLogSeen` | `src/alerts/log.js` |
| F22.10 | `sanitizeAlert`, `sanitizeOnLoad`, `migrateAlerts`, `portableAlert`, `exportAlerts`, `importAlerts`, `quotaGuard`, `rehydrateAlerts` | `src/alerts/persist.js` |

**One shape in, one door out.** Every source builds the same alert record and calls
`emitAlert`; every output takes exactly one `onAlert` subscription. That is the whole point:
a new alert type must not need a new wire into every output, or the fourth one gets
forgotten. Alerts carry a `kind` subtype so outputs style and sound off it rather than
re-parsing the text.

**The severity ladder decides what interrupts**, and the desk stays usable only while
`error` is rare enough to still mean something. Debounce is per-source and deliberate: 5s on
signals, 400ms on fills, **0 on rejects** — two rejects in a row are two decisions.

**DND gates the outputs, never the bus.** Silence means "do not interrupt me", not "do not
tell me": the log keeps filling while muted, which is what makes muting safe to use. Errors
pierce DND by default.

**A gap through a level is a cross.** Price alerts always compare *two* prices, which is
also why a restored alert cannot fire at boot — the first tick has only one.

New state: `alerts.fired`, `alerts.log`, `ui.alertChips`, `ui.alertToggles`, `ui.alertPanel`,
`ui.logFilter`, `ui.logSeenAt`, `ui.dnd`, `ui.audioReady`, `ui.notifyPermission`,
`ui.alertDraft`, `ui.alertDirection`. New settings: `alerts`, `alertToggles`, `dnd`,
`snoozeUntil`, `bypassCritical`, `spreadSpikeK`, `latencyWarnMs`. New block: `alerts`.

**Deviations in phase 22:** there is no `trigger('alert:fired')` event system as the plan's
wording assumes — the bus's `onAlert` is the seam, and it is better because subscription is
explicit. The toast queue was **extended** rather than rebuilt: phase 2 already shipped one,
and two toast stacks would be exactly the duplication this phase exists to avoid. Alert
definitions persist through the existing `settings.*` store rather than a second
`spektrum/persist` slice.

## Phase 21 — Built-in Scalping Strategies (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F21.1 | `tickVelocity`, `windowDelta`, `velocityBaseline`, `burstSignal`, `decayExit`, `momentumTick` | `src/strategy/builtin/momentum.js` |
| F21.2 | `foldPrint`, `bandTouch`, `revertConfirm`, `vwapExit`, `revertTick` | `src/strategy/builtin/vwap-revert.js` |
| F21.3 | `quotePrices`, `minSpreadGate`, `shouldRequote`, `inventorySkew`, `spreadTick` | `src/strategy/builtin/spread-capture.js` |
| F21.4 | `depthImbalance`, `microPrice`, `imbalancePersist`, `imbalanceSignal`, `flipExit`, `imbalanceTick` | `src/strategy/builtin/book-imbalance.js` |
| F21.5 | `classifyAggressor`, `aggressorRatio`, `ratioShift`, `pressureSignal`, `normalizeExit`, `pressureTick` | `src/strategy/builtin/tape-pressure.js` |
| F21.6 | `swingPoints`, `levelCluster`, `touchReject`, `fadeSignal`, `levelBreak`, `fadeTick`, `publishLevels` | `src/strategy/builtin/range-fade.js` |
| F21.7 | `sessionClock`, `openingRange`, `driveSignal`, `oneShotGuard`, `trailStop`, `driveTick` | `src/strategy/builtin/open-drive.js` |
| F21.8 | `microRange`, `squeezeDetect`, `expansionTrigger`, `squeezeSignal`, `contractionExit`, `squeezeTick` | `src/strategy/builtin/vol-squeeze.js` |
| F21.9 | `PRESETS`, `validatePreset`, `presetFor`, `applyPreset`, `customPresets`, `savePreset`, `presetDirty`, `presetNames` | `src/strategy/presets.js` |
| F21.10 | `emptyStats`, `recordFire`, `recordOutcome`, `statsRollup`, `scoreboard`, `flushScoreboard`, `attributeClose`, `resetScoreboard`, `restoreScoreboard`, `saveScoreboard` | `src/strategy/scoreboard.js` |

**Every strategy is a description, not a module with its own wiring.** Each is one
`defineStrategy({...})` plus pure functions, added to `BUILTIN_STRATEGIES` in
`src/strategy/engine.js`. None of them imports state, an action, or a venue.

**`ctx.state` is the scratchpad** added in F21.1: the context stays frozen, but a strategy
keeping a ring buffer or a running baseline has somewhere to put it with no per-tick
allocation and nothing shared between two runs on two instruments.

**The pattern every one of them follows**: measure against the instrument's *own* recent
history, never an absolute threshold; require a *confirmation* before acting on a setup;
and exit on a condition the entry premise no longer holds — not on a target alone.

**Their exits are what makes them safe**, and each is a different lesson: a burst that has
not paid in seconds was not a burst; a fade held "until it reverts" is the failure mode of
mean reversion; a range trader loses money on the range that ended; a maker's real risk is
inventory, not direction.

New state: `strategy.scoreboard`, `market.levels` (S/R for the chart overlay). New
settings: `settings.activePresets`, `settings.customPresets`, `settings.strategyStats`.
New actions: `strategy.setPreset`, `strategy.resetScore`. New block: `scoreboard`.

**Deviations in phase 21:** strategies live in `src/strategy/builtin/` rather than
`src/strategies/` — one strategy namespace, not two. There is no `defineFn`/`trigger()`
API as the plan's wording assumes; the phase-20 contract (`onTick` returning a signal) is
the seam, and it is strictly better because a strategy cannot reach state at all. The
IndexedDB replay verification each feature's T*.10 calls for waits on the phase-24
recorder; each strategy's behaviour is proven instead by a scripted tick sequence through
its own `*Tick` function.

## Phase 20 — Strategy Engine Core (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F20.1 | `validateStrategyShape`, `defineStrategy`, `resolveParams`, `createStrategyContext`, `toSignal`, `HOOKS`, `BUDGET_PARAM` | `src/strategy/contract.js` |
| F20.1 | `describeStrategies`, `runHook`, `BUILTIN_STRATEGIES` | `src/strategy/engine.js` |
| F20.2 | `makeRunKey`, `registerStrategy`, `strategyFor`, `knownStrategies`, `startStrategy`, `stopStrategy`, `liveRuns`, `publishRunning`, `resetStrategies`, `registerStrategyActions`, `tuneStrategy`, `showParamForm`, `rollStrategySessions`, `tickStrategies`, `resumeStrategy`, `tuneWeight` | `src/strategy/registry.js` |
| F20.3 | `validateParamSchema`, `defaultsFromSchema`, `coerceParam`, `coerceParams`, `fieldDescriptor`, `fieldDescriptors`, `paramsFor`, `publishParamForm`, `applyParams`, `setStrategyParam` | `src/strategy/params.js` |
| F20.4 | `clampStrength`, `normalizeSignal`, `isExpired`, `flatten`, `publishSignal`, `sweepSignals`, `signalChip`, `DIR` | `src/strategy/signal.js` |
| F20.5 | `createEma`, `createRsi`, `isWarm`, `crossed` | `src/strategy/indicators/trend.js` |
| F20.6 | `createVwap`, `trueRange`, `createAtr`, `createStddev`, `zscore` | `src/strategy/indicators/volatility.js` |
| F20.5, F20.6 | `indicatorKit` — injected as `ctx.ind` | `src/strategy/indicators/index.js` |
| F20.7 | `measureTick`, `costEwma`, `overBudget`, `throttleStride`, `shouldRunTick`, `recordCost` | `src/strategy/budget.js` |
| F20.8 | `safeInvoke`, `errorTally`, `logStrategyError`, `strategyErrors`, `quarantine`, `isQuarantined`, `release`, `publishQuarantined`, `resetSandbox`, `recordResult` | `src/strategy/sandbox.js` |
| F20.9 | `createSignalRing`, `appendSignal`, `snapshotRing`, `ringStats`, `exportSignals`, `resetHistory` | `src/strategy/history.js` |
| F20.10 | `normalizeWeights`, `composeSignals`, `voteThreshold`, `compositeTtl`, `compositeWeights`, `setWeight`, `publishWeights`, `refreshComposite`, `compositeStrategy` | `src/strategy/composite.js` |
| F20.1, F20.8, F20.10 | `noopStrategy`, `crashyStrategy` (diagnostic), composite | `src/strategy/builtin/` |

**The context is the only surface a strategy gets** — instrument, resolved params, an
indicator snapshot, a logger and an **injected clock**. No `setValue`, no order function,
no live store. A bug in somebody's idea should be a wrong signal, not a wrong position, and
the way to guarantee that is to make the unsafe thing unreachable rather than discouraged.

**Registered once, run many times.** A run is strategy × instrument, with its own params,
init state and subscription. Stopping tears down the subscription *before* forgetting the
run — a run removed from the map while still subscribed is a strategy emitting behind a UI
that says it is off.

**Exactly one place catches a strategy exception**: `runHook` → `safeInvoke`. A second
try/catch would mean two definitions of "it failed" and a quarantine tally counting
whichever fired. Three consecutive failures bench the run; any success clears the tally.

**Slow means throttled, never dropped** (every 2nd/4th/8th tick, 20% hysteresis). A
degraded signal is still a signal; silently disabling one leaves the trader watching a
strategy they believe is running.

**Signals expire.** A strategy that said "long" once and went quiet has said nothing since.
The sweep runs on the frame pump, not on the instrument's own next tick — the instrument
that went quiet is exactly the one whose signal is stale and will never produce that tick.

The pump order in `flushFeed` (`src/venues/okx/live.js`) is now: book/tape → positions →
HUD → session → fees → compact strip → `tickStrategies` (session roll + signal sweep).

New state: `strategy.running`, `strategy.quarantined`, `strategy.signals` (a **map** keyed
by run key), `ui.strategyForm`, `ui.compositeWeights`. New settings: `settings.strategyParams`
(per-strategy tuning; `composite.weights` stored **raw**, normalised on read). New actions:
`strategy.stop`, `strategy.setParam`, `strategy.resume`, `strategy.setWeight`. New block:
`strategies`.

**Deviations in phase 20:** params persist under `settings.strategyParams` rather than a
`strategy.params.*` slice — `settings.*` is the only persisted namespace by design. The
tuning form routes through the `strategy.setParam` action rather than a dynamic
`:data-model`, so every write is coerced against the schema. `budgetMs` is merged into every
strategy's schema by `defineStrategy` rather than declared by authors.

## Phase 19 — Latency & Metrics HUD (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F19.1 | `rollingMean`, `ewma`, `percentile`, `ratePerMinute`, `formatMs`, `formatBps`, `formatCompact`, `gradeLatency` | `src/hud/metrics.js` |
| F19.3, F19.4 | `spreadBps`, `sessionPace`, `winRate`, `readHud`, `refreshHud`, `resetHud` | `src/hud/state.js` |
| F19.2 | `classifyRtt`, `pingOkx`, `probeEtoro`, `recordRtt`, `worstRtt`, `flushRtt`, `nextProbeDelay`, `startProbe`, `resetRtt` | `src/hud/rtt.js` |
| F19.5 | `captureIntent`, `slippageBps`, `trackWorst`, `scoreFill`, `slippageStats`, `spreadBreached`, `flushQuality`, `resetQuality` | `src/hud/quality.js` |
| F19.6–F19.8 | `tradesPerHour`, `paceState`, `paceRatio`, `currentStreak`, `streakTone`, `dayVolume`, `refreshSession` | `src/hud/session.js` |
| F19.9 | `scheduleFor`, `feeForFill`, `addFee`, `burnRate`, `feesVsPnl`, `recordFee`, `flushFees`, `resetFees` | `src/hud/fees.js` |
| F19.10 | `severityRank`, `abbreviate`, `compactMetrics`, `orderMetrics`, `refreshCompact`, `toggleCompact`, `registerCompactActions` | `src/hud/compact.js` |

**Every HUD number is derived, never re-recorded.** Pace, streak, volume and fees all read
`positions/ledger.js`; the compact strip reads what the tiles published. A second tally of
the same event is a second thing that can be wrong, and the ledger already owns the
session roll.

**Three refusals worth keeping.** Slippage does not score a fill with no captured intent
(zero is a *perfect* fill, not an unmeasured one). RTT reports "never measured" as its own
tier, not as slow — a desk starting its session must not look broken. The burn rate is
floored at five minutes, because extrapolating an hour from ninety seconds prints a
four-figure number off two trades and the tile stops being read.

**Fees: what the venue billed outranks what the desk estimated.** `FEE_SCHEDULE` (OKX spot
8/10bp, perps 2/5bp, EToro ~1%) is only for fills nobody has been charged for yet, and an
unknown venue prices as OKX rather than as free — a zero-fee estimate is the one error
that makes a losing strategy look profitable.

The HUD is pumped from `flushFeed` in `src/venues/okx/live.js`: `refreshHud` →
`refreshSession` → `flushFees` → `refreshCompact` (compact only). The strip trails the
tiles by one frame by construction, since it re-reads state that lands next tick.

New state: `ui.hud`, `ui.rtt`, `ui.slippage`, `ui.spreadAlert`, `ui.session`, `ui.fees`,
`ui.hudRow`. New settings: `spreadLimitBps`, `tradesPerHourTarget`, `compactHud`. New
action: `ui.toggleCompactHud`.

**Deferred in phase 19:** none. T19.8.4–T19.8.6 (dayKey / midnight roll / persisted
accumulators) are satisfied by the ledger's existing `sessionKey` + `rolloverIfNewSession`
rather than by a second set of counters — persisting them waits on the phase 24 store,
like every other non-`settings.*` slice.

## Phase 18 — Positions & Live PnL (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F18.2 | `makePosition`, `sideOf`, `avgEntryAfterAdd`, `realizedFrom`, `splitFlipFill`, `applyFill`, `unrealizedPnl` | `src/positions/math.js` |
| F18.1 | `positionKey`, `positionFor`, `upsertPosition`, `ingestFill`, `markPosition`, `openPositions`, `grossExposure`, `pnlTotals`, `flushPositions` | `src/positions/store.js` |
| F18.3 | `midFor`, `multiplierFor`, `floatingPnl`, `toAccountCcy`, `fmtPnl`, `pnlClass`, `priceBook` | `src/positions/pnl.js` |
| F18.4 | `parseFee`, `appendRealization`, `netRealized`, `sessionKey`, `rolloverIfNewSession`, `flushLedger` | `src/positions/ledger.js` |
| F18.5, F18.6 | `closeIntent`, `flattenOne`, `flattenAll`, `registerFlattenActions`, `hasExposure` | `src/positions/flatten.js` |
| F18.7, F18.8 | `dayPnl`, `pnlDirection`, `compactPnl`, `refreshDayPnl`, `expirePulse` | `src/positions/header.js` |
| F18.9 | `sample`, `curve`, `curveStats`, `curveRatios`, `curvePath` | `src/positions/equity.js` |
| F18.10 | `diffPositions`, `adoptVenueTruth`, `reconcile`, `startReconciler` | `src/positions/reconcile.js` |

**Positions apply synchronously, unlike every other hot store here.** An order list a
frame behind is cosmetic; a position a frame behind is a risk number someone may size
against. Only the *publish* is batched.

**The venue always wins.** `reconcile()` runs every 30s and replaces local numbers
outright — no averaging, no waiting to see if it settles. A failed snapshot changes
nothing, because "I could not ask" is not "there is nothing there".

**Two pieces of arithmetic carry the phase**: weighted average entry (overwriting with
the last fill price is silent and wrong from fill two onward) and through-zero flips
(one fill that is really a close plus an open, with the P&L booked between them).

New state: `trade.positions`, `trade.pnl`, `trade.ledger`, `trade.score`,
`trade.dayTotal`, `trade.dayLabel`, `trade.equityPath`, `ui.pnlPulse`, `market.tickSize`,
`market.lotSize`, `market.instrumentMeta`. New settings: `sessionStartUtc`.

**Deferred in phase 18:** T18.1.7 position rehydration and T18.4.6 ledger persistence
(only `settings.*` persists by design, and a *stale* position restored from storage is a
risk number that may be wrong — the venue snapshot is the honest source, which is what
F18.10 does).

**Process note:** F18.7 was merged with the coverage gate red on `live.js` (58% functions)
and fixed immediately after in `fix(f18.7)`. Same failure mode as F2.6 — the gate output
must be *read*, not just run.

## Phase 17 — Order Types & Execution Engine (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F17.1 | `makeIntent`, `advanceOrderState`, `normalizeReject`, `isSettled`, `roundToLotTick` | `src/exec/types.js` |
| F17.1 | `registerAdapter`, `adapterFor`, `prepare`, `deskMarket`, `submit`, `apply`, `cancel`, `publish`, `liveOrders`, `startEngine` | `src/exec/engine.js` |
| F17.1 | `isAdapter`, `supportsIntent` | `src/exec/adapters/contract.js` |
| F17.2 | `okxOrdType`, `buildOkxOrder`, `createOkxAdapter` · `buildEtoroOrder`, `createEtoroAdapter` | `src/exec/adapters/` |
| F17.3 | `applyTif`, `downgradeTif`, `iocTransitions`, `intentWithTif` | `src/exec/tif.js` |
| F17.4 | `instrumentKind`, `capabilityFor`, `capabilityFlags`, `isEmulated` | `src/exec/capabilities.js` |
| F17.5 | `offsetsFromTicks`, `makeBracket`, `bracketPlan`, `oppositeLeg` | `src/exec/bracket.js` |
| F17.6 | `linkOco`, `siblingOf`, `resolveFill`, `resolveOcoRace`, `closePair`, `linkBracketExits` | `src/exec/oco.js` |
| F17.7 | `nextTrailStop`, `bestPrice`, `startTrail`, `advanceTrail`, `stopTrail` | `src/exec/trail.js` |
| F17.8 | `deviationBps`, `checkSlippage`, `checkSize` | `src/exec/guard.js` |
| F17.9 | `amendDiff`, `amendRoute`, `takeLock`, `releaseLock`, `amendOrder`, `cancelReplace` | `src/exec/amend.js` |
| F17.10 | `setPrefix`, `issueId`, `claimId`, `dedupeOnReconnect` · `stampLatency`, `latencyFor`, `latencySummary` | `src/exec/ids.js`, `src/exec/latency.js` |

**`prepare()` is the choke point.** Every order — ticket, hotkey, repeat-last, and later
strategies — passes through it, which is where validation, capability checks, grid
rounding and both guards live. A check that lived in the ticket and not in a hotkey would
not be a check.

**One transition table, imported not restated.** `advanceOrderState` reads `TRANSITIONS`
from `ticket/lifecycle.js`; the adapters' capability flags are *derived* from
`capabilities.js`. Both are enforced by test — duplicating either is how the desk ends up
showing one status while acting on another.

**`src/ticket/send.js` was deleted**, subsumed by the engine. Its credential check moved
into the OKX adapter, where needing keys is a property of the venue rather than of
execution.

**Deferred in phase 17:** T17.2.5 WS-first submission (nothing logs into the private
socket yet; `buildLoginFrame` exists from phase 9 and the adapter's `place` is the seam).

## Phase 16 — Hotkeys & Command Palette (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F16.1 | `normalizeChord`, `registerBinding`, `registryKey`, `unregisterBinding`, `resolveKey`, `allBindings`, `isTypingTarget`, `mountKeymap` | `src/keys/keymap.js` |
| F16.2 | `DEFAULT_BINDINGS`, `applyDefaultBindings`, `groupBindings`, `chordLabel`, `hotkeyRows` | `src/keys/defaults.js` |
| F16.3, F16.4 | `mergeBindings`, `validateChord`, `findConflicts`, `migrateBindings`, `effectiveBindings`, `clearedMap`, `registerBindingActions` | `src/keys/overrides.js` |
| F16.5 | `fuzzyScore`, `actionCatalog`, `searchActions`, `moveSelection`, `registerPaletteActions` | `src/keys/palette.js` |
| F16.7 | `pushScope`, `popScope`, `activeScope`, `scopeChain`, `trackBlockFocus`, `resetScopes` | `src/keys/scopes.js` |
| F16.8 | `nextRepeatDelay`, `getNudgeStep`, `isRepeatable`, `createRepeater`, `guardRepeat` | `src/keys/repeat.js` |
| F16.9 | `isDoubleTap`, `panicCooldown`, `tapEscape`, `registerPanicAction` | `src/keys/panic.js` |
| F16.10 | `acceptChord`, `capturePreview`, `registerCaptureActions` | `src/keys/capture.js` |

**Chords resolve nearest-scope-first** (`modal` → `block` → `global`) and a **modal does
not fall through** — that is what makes typing in the palette safe. Scoped bindings share
one registry Map under a `scope chord` key; `mergeBindings` keys on scope *and* chord,
since ArrowDown legitimately means two things.

**Every binding points at an existing action** — `DEFAULT_BINDINGS` has a test asserting
it. A chord bound to a name nobody registered is a key that silently does nothing.

New state: `ui.scope`, `ui.chordSheet`, `ui.palette*`, `ui.captureFor`,
`ui.capturePreview`. New setting: `settings.chords` (chord → action overrides).

**Deferred in phase 16:** T16.9.8 journal panic record (phase 25 owns the journal; the
handler already computes the timestamp and count the entry needs).

## Phase 15 — Rapid Order Entry (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F15.1, F15.2, F15.4 | `buildTicketState`, `resolvePrice`, `canSubmit`, `refreshTicketPrice` | `src/ticket/state.js` |
| F15.1, F15.4 | `sizeForPreset`, `nudgePrice`, `registerTicketActions`, `readTicket` | `src/ticket/actions.js` |
| F15.3 | `applyPreset`, `clampQty`, `roundToLot`, `resolveQty`, `registerSizingActions` | `src/ticket/sizing.js` |
| F15.5 | `makeClientOrderId`, `buildOrderPayload`, `primePayload`, `registerSubmitAction`, `flushQueue` | `src/ticket/submit.js` |
| F15.5 | `rejectionEvent`, `acceptEvent`, `sendOrder` | `src/ticket/send.js` |
| F15.6 | `orderReducer`, `isTerminal`, `applyOrderEvent`, `ingestOrderEvent`, `ingestOrderEvents`, `partitionOrders` | `src/ticket/lifecycle.js` |
| F15.7 | `orderToast`, `coalesceToasts`, `playCue`, `makeAudioContext`, `announceOrder` | `src/ticket/feedback.js` |
| F15.8 | `nextSeq`, `enqueueOrder`, `drainQueue`, `queueOrder`, `takeQueue` | `src/ticket/queue.js` |
| F15.9 | `workingOrders`, `orderSummary`, `cancelAll`, `repeatPayload`, `registerShortcutActions`, `rememberOrder` | `src/ticket/shortcuts.js` |
| F15.10 | `priceFromY`, `intentToOrder`, `registerIntentAction` | `src/ticket/intent.js` |

**The one rule that bit twice: `setValue` lands on the *next* tick.** Anything that
writes the same path more than once inside a frame must fold locally and write once, or
each write reads state that is missing the previous one. It cost a double-drained order
queue (fixed by holding the queue outside the reactive tree) and a cancel-all that
cancelled one order out of three (fixed by `ingestOrderEvents`). Expect this again in any
batch path.

**Arming gates entering risk, never leaving it.** `canSubmit` checks `armed` *last*, so a
ticket that is also missing a size says "no size" — the more useful message. `CXL ALL`
is never disabled. `trade.armed` is in the unpersisted `trade` namespace, so every reload
starts cold by construction.

New state: `trade.ticket*` (symbol/side/size/mode/limit/price/source/flash),
`trade.queue`, `trade.lastOrder`, `trade.lastOrderSummary`, `trade.lastReject`,
`trade.buyingPower`, `market.quoteTs`. New settings: `qtyPresets`, `maxBurst`, `volume`.

**Deferred in phase 15:** T15.4.7 breaker auto-disarm (phase 24 owns the breaker; the
seam is `ticket.arm` with an explicit payload), T15.5.5 EToro submit route (CORS-blocked
without a relay; `sendOrder` takes an injectable `place`), T15.5.7 latency probe (phase 16
owns the HUD).

## Phase 14 — Order Book & Tape (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F14.1, F14.7 | `sizeToPct`, `formatSize`, `ladderRows`, `spreadRow`, `visibleMax`, `ladderView` | `src/book/ladder.js` |
| F14.2 | `emptyBook`, `applySnapshot`, `applyUpdate`, `mergeSide`, `sortSide`, `crc32`, `checksumString`, `verifyChecksum`, `hasSeqGap`, `ingestFrame` | `src/book/book.js` |
| F14.2 | `applyBookFrame`, `bookFor`, `flushBook`, `onResync`, `resetBooks` | `src/book/state.js` |
| F14.3, F14.8 | `pushPrint`, `toPrint`, `sideClass`, `formatTapeTime`, `formatSizeShort`, `tapeRows`, `flushTape`, `passesFilter`, `hiddenCount`, `filterTape`, `registerTapeActions` | `src/book/tape.js` |
| F14.4 | `sumDepth`, `computeImbalance`, `emaSmooth`, `imbalanceGauge`, `updateImbalance`, `resetImbalance` | `src/book/imbalance.js` |
| F14.5 | `rollingMedian`, `isWhale`, `multiplierFor`, `flagWhales`, `emitWhale`, `trimWhales` | `src/book/whale.js` |
| F14.6 | `sideForColumn`, `ticketFromClick`, `registerPrefillActions` | `src/book/prefill.js` |
| F14.7 | `bucketPrice`, `groupLevels`, `groupSizes`, `groupBook`, `registerGroupingActions` | `src/book/grouping.js` |
| F14.9 | `visibleRange`, `createPrintBuffer`, `shouldAutoscroll`, `trackScroll` | `src/book/window.js` |
| F14.10 | `nextBookStatus`, `backoffDelay`, `isBookStale`, `canTradeBook`, `setBookStatus`, `scheduleResync` | `src/book/integrity.js` |
| — | `channelsFor`, `routeFrame`, `flushFeed`, `startOkxFeed` — **the live feed** | `src/venues/okx/live.js` |
| — | `shouldConnect`, `connectFeeds`, `feedOptions` | `src/app/feeds.js` |

**The desk is live.** `live.js` is the only module that knows both a WebSocket frame and
a state path. It subscribes `trades` / `books5` / `tickers` for the focused instrument and
flushes book+tape+imbalance once per animation frame. **`books5` is a snapshot channel** —
every frame replaces the book, so there are no deltas to lose (the full delta+CRC path in
`book.js` is built and tested, and is what the `books` channel would use).

**Feeds are opt-in.** `bootstrap({feeds: true})` — set only in `main.js`. Node 22 has a
global `WebSocket`, so an environment check alone would make every test in the suite dial
OKX for real.

New state: `market.book`, `market.bookStatus`, `market.ladder` (computed),
`market.tape`, `market.tapeHidden`, `market.tapeWindow`, `market.imbalance`,
`market.whales`, `market.whaleCount`, `trade.ticket*`. New settings: `bookDepth`,
`imbalanceThreshold`, `whaleMultiplier`, `priceGroups`, `tapeFloors`.

**Deferred in phase 14** (all recorded in the plan with reasons): T14.2.8 worker offload
(no Worker exists; crc32 over 50 levels is microseconds), T14.9.8 print-storm benchmark
(needs the phase 24 recorder + a real browser profile), T14.10.7 IndexedDB postmortems
(phase 24 store; `ingestFrame` already returns the offending frame and reason).

## Phase 13 — Micro-Charts & Sparklines (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F13.1, F13.8 | `sizeCanvas` (dPR), `chartPalette` (CSS tokens), `createRenderLoop`, `repaintOnTheme` | `src/charts/canvas.js` |
| F13.2 | `mapRange`, `priceRange`, `priceToY`, `yToPrice`, `timeToX`, `xToTime`, `indexToX`, `autoRange`, `formatPrice`, `decimalsOf`, `composeTransform`, `applyTransform`, `candleGeometry`, `gridLines` | `src/charts/scale.js` |
| F13.2, F13.3 | `axisRows`, `drawAxisGrid` | `src/charts/axis.js` |
| F13.3 | `downsampleColumn`, `gapSplit`, `pulseRadius`, `trendUp`, `drawTickLine` | `src/charts/tickline.js` |
| F13.4 | `candleBoxes`, `volumeScale`, `drawCandles`, `drawVolumeBand`, `closeY`, `registerCandleActions` | `src/charts/candlestick.js` |
| F13.5 | `pointerToChart`, `trackPointer`, `snapToTick`, `crosshairReadout`, `formatClock`, `drawCrosshair` | `src/charts/crosshair.js` |
| F13.6 | `layoutMarkers`, `clusterFills`, `hitTestMarker`, `drawMarkers` | `src/charts/markers.js` |
| F13.7 | `levelColor`, `clampLevel`, `drawLevelLine`, `chartLevels`, `LEVEL_DASH` | `src/charts/levels.js` |
| F13.9 | `shouldStop`, `coalesceMarks`, `overBudget`, `createScheduler`, `pauseWhenHidden`, `drawDebugHud`, `framesPerSecond` | `src/charts/loop.js` |
| F13.3, F13.4 | `tickWindow`, `markOnTick`, `mountTickChart`, `mountCandleChart`, `startChart` | `src/charts/mount.js` |

**Renderers are pure draw calls; `mount.js` is the only file that knows about both the
pipeline and the canvas.** Every draw fn takes a palette — no renderer holds a hex
literal. A tick never draws: it marks dirty, and the next frame draws once however many
prints landed.

`startChart` runs either standalone (own dirty-flag loop) or on the shared scheduler —
pass `{scheduler, id, priority}`. The dashboard should use the shared one so sparklines
(`priority: 'low'`) can never outvote the price chart for a frame.

New state: `ui.candleInterval` (`1s`/`5s`/`1m`), `settings.debugCharts` (the debug axis
grid + fps HUD). The `ui.setCandleInterval` action registers in `bootstrap.js`.

## Phase 12 — Watchlists & Instruments (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F12.1, F12.8 | `createList`, `renameList`, `deleteList`, `addSymbol`, `removeSymbol`, `reorderSymbol`, `findList`, `qualifySymbol`, `splitSymbol` | `src/lists/ops.js` |
| F12.2, F12.5, F12.9 | `seedLists`, `activeList`, `setActiveList`, `focusSymbol`, `addToList`, `removeFromList`, `moveInList`, `manageList` | `src/lists/state.js` |
| F12.6, F12.7 | `buildRow`, `buildRows` (frame-based pulse), `sparklinePoints`, `sparklinePath` | `src/lists/rows.js` |
| F12.4 | `fuzzyScore`, `searchInstruments` | `src/lists/search.js` |

Symbols are **venue-qualified** (`okx:BTC-USDT`) everywhere past this point.
`market.focus` holds a qualified symbol and is **not** persisted.

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

### Still outstanding across phases
*(none — the boot-time feed gap recorded here through phase 13 was closed in phase 14;
see `src/venues/okx/live.js` and `src/app/feeds.js`.)*

## Gotchas (learned the hard way — do not rediscover)

- **`setValue` on an object MERGES; it never replaces.** `setValue(path, {})` is a no-op,
  and `setValue(path, {a: 1})` over `{b: 2}` yields `{a: 1, b: 2}`. Setting a key to
  `undefined` clears its *value* but leaves the key present (`Object.keys` still lists
  it), so any map read back must treat an `undefined` entry as absent. Clearing a map
  means writing every current key as `undefined` — see `clearedMap` in
  `src/keys/overrides.js`. Arrays, by contrast, replace wholesale.
- **`setValue` lands on the NEXT tick.** Anything writing the same path twice inside one
  frame must fold locally and write once, or the second read misses the first write. This
  cost a double-drained order queue and a cancel-all that cancelled 1 of 3 orders.
- **The credential-shaped-path guard in `initial.test.js` matches `/key|secret|passphrase|token/i`.**
  `settings.keyBindings` and `ui.hotkeyRows` both tripped it; they are now
  `settings.chords` and `ui.chordSheet`. Rename rather than adding an exception — the
  guard is worth more than the name.

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
