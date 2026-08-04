import { setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { onTick } from '../pipeline/bus.js'
import { validateStrategyShape, createStrategyContext } from './contract.js'
import { runHook, BUILTIN_STRATEGIES } from './engine.js'
import { setStrategyParam, publishParamForm, applyParams, paramsFor } from './params.js'

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
  }

  run.unsubscribe = subscribe((tick) => {
    // Ticks arrive for every instrument on the bus; a run only sees its own.
    if (String(tick?.symbol ?? '') !== run.instrument) return
    run.signal = runHook(strategy, 'onTick', run.ctx, tick)
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
  const rows = liveRuns().map((run) => ({
    key: run.key,
    strategyId: run.strategyId,
    name: run.name,
    instrument: run.instrument,
    startedAt: run.startedAt,
    action: run.signal?.action ?? 'none',
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
    if (run.strategyId === strategy.id) applyParams(run, next, strategy)
  }

  return next
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
