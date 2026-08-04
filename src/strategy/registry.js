import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { onTick } from '../pipeline/bus.js'
import { validateStrategyShape, createStrategyContext } from './contract.js'
import { runHook, BUILTIN_STRATEGIES } from './engine.js'
import { setStrategyParam, publishParamForm, applyParams, paramsFor } from './params.js'
import { normalizeSignal, publishSignal, sweepSignals, signalChip } from './signal.js'
import { sessionKey } from '../positions/ledger.js'
import { measureTick, recordCost, shouldRunTick, DEFAULT_BUDGET_MS } from './budget.js'
import { recordResult, release, resetSandbox, isQuarantined } from './sandbox.js'
import { snapshotRing, resetHistory } from './history.js'
import { setWeight, publishWeights } from './composite.js'
import { applyPreset, presetNames, presetDirty } from './presets.js'
import { recordFire, flushScoreboard, resetScoreboard, saveScoreboard } from './scoreboard.js'

/**
 * Who is registered, and what is running where.
 *
 * A strategy is registered once and *run* many times — one run per instrument, each with
 * its own params, its own init state and its own tick subscription. Keeping those two
 * ideas apart is what lets the same mean-reversion idea sit on four symbols with four
 * different lookbacks and no shared mutable anything.
 *
 * Stopping must leave nothing behind. A run that is stopped but whose tick subscription
 * survives is a strategy still emitting signals from a UI that says it is off, which is
 * the worst possible failure here — the desk would be acting on something the trader
 * believes they turned off.
 */

/** Registered descriptors, by id. */
const known = new Map()

/** Live runs, by run key. */
const runs = new Map()

/**
 * The canonical identity of a running pair.
 *
 * @param {string} strategyId - the strategy.
 * @param {string} instrument - the qualified symbol.
 * @returns {string} the run key.
 */
export function makeRunKey(strategyId, instrument) {
  const id = String(strategyId ?? '').trim()
  const symbol = String(instrument ?? '').trim()
  if (!id || !symbol) return ''

  return `${id}@${symbol}`
}

/**
 * Make a strategy known to the desk.
 *
 * @param {object} descriptor - a defined strategy.
 * @returns {object} the registered strategy.
 * @throws {Error} on an invalid shape or a duplicate id.
 */
export function registerStrategy(descriptor) {
  validateStrategyShape(descriptor)

  const id = String(descriptor.id)
  // Named rather than silent: two strategies under one id means whichever loaded last
  // wins, and the trader has no way to tell which one is running.
  if (known.has(id)) throw new Error(`strategy: "${id}" is already registered`)

  known.set(id, descriptor)
  return descriptor
}

/**
 * The descriptor behind an id.
 *
 * @param {string} strategyId - the strategy.
 * @returns {object|null} the descriptor.
 */
export function strategyFor(strategyId) {
  return known.get(String(strategyId ?? '')) ?? null
}

/**
 * Everything registered.
 *
 * @returns {object[]} the descriptors, in registration order.
 */
export function knownStrategies() {
  return [...known.values()]
}

/**
 * Start a strategy on an instrument.
 *
 * @param {string} strategyId - the strategy.
 * @param {string} instrument - the qualified symbol.
 * @param {{params?: object, now?: number, subscribe?: Function}} [options] - the run.
 * @returns {object|null} the run, or null when it could not start.
 */
export function startStrategy(strategyId, instrument, options = {}) {
  const key = makeRunKey(strategyId, instrument)
  const strategy = known.get(String(strategyId ?? ''))
  if (!key || !strategy) return null

  // Idempotent: a double-click on start, or a re-subscribe after a reconnect, must not
  // leave two tick subscriptions racing the same strategy state.
  const existing = runs.get(key)
  if (existing) return existing

  const ctx = createStrategyContext({
    strategy,
    instrument,
    params: options.params ?? paramsFor(strategy),
    ind: options.ind,
    now: options.now,
  })

  const subscribe = typeof options.subscribe === 'function' ? options.subscribe : onTick
  const run = {
    key,
    strategyId: strategy.id,
    name: strategy.name,
    instrument: String(instrument),
    startedAt: Number(options.now) || 0,
    ctx,
    memory: strategy.init(ctx),
    signal: null,
    // A strategy runs inside the same frame as the book and the ticket. A slow one does
    // not just make itself late, it makes the desk late.
    budgetMs: Number(options.budgetMs ?? ctx.params?.budgetMs) || DEFAULT_BUDGET_MS,
    costMs: undefined,
    stride: 1,
    throttled: false,
    ticks: 0,
  }

  const timed = measureTick(
    (payload) => runHook(strategy, 'onTick', run.ctx, payload, key),
    { clock: options.clock },
  )

  run.unsubscribe = subscribe((tick) => {
    // Ticks arrive for every instrument on the bus; a run only sees its own.
    if (String(tick?.symbol ?? '') !== run.instrument) return

    // The stride gate is a modulo and nothing else — it has to be cheaper than the work
    // it is skipping, or throttling costs more than it saves.
    run.ticks += 1
    if (!shouldRunTick(run.ticks, run.stride)) return

    const { result, costMs } = timed(tick)
    recordCost(run, costMs)
    // Three throws in a row and the run benches itself, subscription and all.
    if (recordResult(run, result, { stop: stopStrategy, now: tick?.ts }).quarantined) return

    run.signal = normalizeSignal(result.signal, {
      now: Number(tick?.ts) || 0,
      source: strategy.id,
      instrument: run.instrument,
    })
    publishSignal(run.key, run.signal)
    // Scored on the same call that publishes, for the same reason history is: a second
    // place to record a fire is a place that will eventually be forgotten.
    recordFire({ ...run.signal, strategyId: strategy.id, instrument: run.instrument })
  })

  runs.set(key, run)
  publishRunning()
  return run
}

/**
 * Stop a run, completely.
 *
 * @param {string} runKey - the run key.
 * @returns {boolean} true when a run was stopped.
 */
export function stopStrategy(runKey) {
  const run = runs.get(String(runKey ?? ''))
  if (!run) return false

  // The subscription first: a run removed from the Map while still subscribed is a
  // strategy emitting signals from a UI that says it is off.
  run.unsubscribe?.()
  runs.delete(run.key)
  publishRunning()
  return true
}

/**
 * Every live run.
 *
 * @returns {object[]} the runs.
 */
export function liveRuns() {
  return [...runs.values()]
}

/**
 * Publish what is running.
 *
 * @returns {object[]} the summaries.
 */
export function publishRunning() {
  publishWeights(liveRuns())
  const rows = liveRuns().map((run) => ({
    key: run.key,
    strategyId: run.strategyId,
    name: run.name,
    instrument: run.instrument,
    startedAt: run.startedAt,
    action: run.signal?.action ?? 'none',
    ...signalChip(run.signal),
    // Slowness is visible before it hurts, and a throttled run says so rather than just
    // going quiet.
    costMs: Number((Number(run.costMs) || 0).toFixed(2)),
    stride: run.stride,
    throttled: run.throttled === true,
    // The last few calls, so a decision can be read in context without opening the
    // journal.
    recent: snapshotRing(run.key, 5).slice().reverse(),
    ...presetPicker(run.strategyId),
  }))

  setValue(PATHS.strategy.running, rows)
  return rows
}

/**
 * Stop everything and forget every registration.
 *
 * @returns {boolean} true.
 */
export function resetStrategies() {
  for (const run of liveRuns()) run.unsubscribe?.()
  runs.clear()
  known.clear()
  resetSandbox()
  resetHistory()
  resetScoreboard()
  sessionDay = ''
  return true
}

/**
 * Register the built-ins and the run actions.
 *
 * @returns {string} the registered stop-action name.
 */
export function registerStrategyActions() {
  for (const strategy of BUILTIN_STRATEGIES) {
    if (!known.has(strategy.id)) registerStrategy(strategy)
  }

  registerAction(ACTIONS.strategy.stop, (_state, payload) =>
    stopStrategy(payload?.key ?? payload?.runKey ?? payload),
  )
  registerAction(ACTIONS.strategy.setParam, (_state, payload) => tuneStrategy(payload))
  registerAction(ACTIONS.strategy.resume, (_state, payload) =>
    resumeStrategy(payload?.key ?? payload?.runKey ?? payload),
  )
  registerAction(ACTIONS.strategy.setWeight, (_state, payload) => tuneWeight(payload))
  registerAction(ACTIONS.strategy.setPreset, (_state, payload) => pickPreset(payload))
  registerAction(ACTIONS.strategy.resetScore, () => resetScoreboard())

  return ACTIONS.strategy.stop
}

/**
 * Retune a strategy from the form, and re-init anything already running on it.
 *
 * @param {{strategy?: string, param?: string, value?: any, checked?: boolean}} payload -
 *   the form's write.
 * @returns {object|null} the params now in force.
 */
export function tuneStrategy(payload) {
  const strategy = strategyFor(payload?.strategy)
  const key = String(payload?.param ?? '')
  if (!strategy) return null

  const spec = strategy.params?.[key]
  // A checkbox reports `checked`, everything else reports `value` — reading the wrong one
  // turns every toggle into a permanent true.
  const raw = spec?.kind === 'toggle' ? (payload?.checked ?? payload?.value) : payload?.value
  const next = setStrategyParam(strategy, key, raw)
  if (!next) return null

  // Applied within the tick, not behind a restart button: a tuning that needs a restart is
  // a tuning nobody uses mid-session, which is the only time it matters.
  for (const run of liveRuns()) {
    if (run.strategyId !== strategy.id) continue
    applyParams(run, next, strategy)
    run.budgetMs = Number(next.budgetMs) || run.budgetMs
  }

  return next
}

/** The session every run's indicators are anchored to. */
let sessionDay = ''

/**
 * Re-init every run when the trading day rolls.
 *
 * A session-anchored VWAP that never resets is yesterday's anchor, and a strategy mean-
 * reverting to it is trading against a price that stopped being fair hours ago. Re-init is
 * how the reset reaches indicators the registry never sees: they are built inside the
 * strategy's own `init`, so running it again rebuilds them.
 *
 * @param {number} now - the current time.
 * @param {number} [startHourUtc] - the hour the trader's day begins.
 * @returns {string[]} the runs re-initialised.
 */
export function rollStrategySessions(now, startHourUtc = 0) {
  const day = sessionKey(now, startHourUtc)
  if (!day || day === sessionDay) return []

  // The first tick of a session is not a roll — there is nothing to carry over yet.
  const first = sessionDay === ''
  sessionDay = day
  if (first) return []

  const rolled = []
  for (const run of liveRuns()) {
    const strategy = known.get(run.strategyId)
    if (!strategy) continue
    run.memory = strategy.init(run.ctx)
    rolled.push(run.key)
  }

  return rolled
}

/**
 * Persist the day's scoreboard.
 *
 * @returns {object[]} what was saved.
 */
export function persistScoreboard() {
  return saveScoreboard()
}

/**
 * Sweep expired signals and republish what is running.
 *
 * Called from the frame pump: a signal whose ttl has passed must stop looking like one
 * from this tick, and the running list carries each run's latest action.
 *
 * @param {number} now - the current time.
 * @returns {string[]} the runs whose signal expired.
 */
export function tickStrategies(now, startHourUtc = 0) {
  rollStrategySessions(now, startHourUtc)
  flushScoreboard()
  const expired = sweepSignals(now)
  if (expired.length > 0) {
    for (const run of liveRuns()) {
      if (expired.includes(run.key)) run.signal = { ...run.signal, action: 'flat', dir: 0 }
    }
    publishRunning()
  }

  return expired
}

/**
 * Show a strategy's form.
 *
 * @param {string} strategyId - the strategy.
 * @returns {object[]} the field descriptors.
 */
export function showParamForm(strategyId) {
  const strategy = strategyFor(strategyId)
  return strategy ? publishParamForm(strategy) : []
}

/**
 * Put a fixed strategy back to work.
 *
 * @param {string} runKey - the benched run.
 * @returns {object|null} the restarted run.
 */
export function resumeStrategy(runKey) {
  const record = release(runKey)
  if (!record) return null

  // Restarted rather than un-flagged: the run was stopped when it was benched, so there is
  // no subscription left to re-enable — there is only a run to create again.
  return startStrategy(record.strategyId, record.instrument)
}

/**
 * Is this run benched?
 *
 * @param {string} runKey - the run key.
 * @returns {boolean} true when quarantined.
 */
export function runQuarantined(runKey) {
  return isQuarantined(runKey)
}

/**
 * Set one member's share of the blend.
 *
 * @param {{member?: string, key?: string, value?: any}} payload - the slider's write.
 * @returns {object} the normalised weights.
 */
export function tuneWeight(payload) {
  const weights = setWeight(payload?.member ?? payload?.key, payload?.value)
  // Republished from the returned map rather than re-read from state: the write above
  // lands next tick, so a re-read here would render the weights from before the drag. The
  // whole editor is republished because moving one slider moves them all.
  publishWeights(liveRuns(), weights)

  return weights
}

/**
 * Switch a strategy to a preset pack.
 *
 * @param {{strategy?: string, value?: string, preset?: string}} payload - the picker's write.
 * @returns {object|null} the params now in force.
 */
export function pickPreset(payload) {
  const strategy = strategyFor(payload?.strategy)
  if (!strategy) return null

  const next = applyPreset(strategy, payload?.value ?? payload?.preset)
  if (!next) return null

  // Applied to anything already running, same as a manual edit: a preset that only took
  // effect on the next start would be a preset nobody trusts mid-session.
  for (const run of liveRuns()) {
    if (run.strategyId !== strategy.id) continue
    applyParams(run, next, strategy)
    run.budgetMs = Number(next.budgetMs) || run.budgetMs
  }

  return next
}

/**
 * The preset picker's rows for a strategy.
 *
 * @param {string} strategyId - the strategy.
 * @returns {{names: string[], active: string, dirty: boolean}} the picker.
 */
export function presetPicker(strategyId) {
  const strategy = strategyFor(strategyId)
  if (!strategy) return { names: [], active: '', dirty: false }

  const active = String(appState.settings?.activePresets?.[strategy.id] ?? 'standard')

  return { names: presetNames(strategy.id), active, dirty: presetDirty(strategy, active) }
}
