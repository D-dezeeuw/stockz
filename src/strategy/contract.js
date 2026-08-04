import { createLogger } from '../utils/log.js'
import { indicatorKit } from './indicators/index.js'

/**
 * The strategy contract.
 *
 * A strategy is a plain object with three hooks and a params schema. It is handed a
 * context and returns signals — it never touches state, never calls `setValue`, and never
 * places an order. That is the whole point of the contract: a bug in somebody's mean
 * reversion idea should be a wrong signal, not a wrong position, and the only way to
 * guarantee that is to make the unsafe thing unreachable rather than discouraged.
 *
 * Registration validates loudly. A strategy with a misspelled hook that silently never
 * fires is worse than one that refuses to load, because the desk looks like it is running
 * a strategy that is doing nothing at all.
 *
 * @typedef {object} Signal
 * @property {string} action - 'buy', 'sell', 'flat' or 'none'.
 * @property {number} strength - 0..1 conviction.
 * @property {string} reason - why, in words a human reads in the journal.
 *
 * @typedef {object} StrategyContext
 * @property {string} instrument - the qualified symbol this run is for.
 * @property {object} params - resolved parameters, defaults applied.
 * @property {object} ind - indicator readings for this instrument.
 * @property {object} log - a namespaced logger.
 * @property {number} now - the tick's timestamp.
 *
 * @typedef {object} Strategy
 * @property {string} id - unique, kebab-case.
 * @property {string} name - what a human calls it.
 * @property {object} params - schema of tunables: key → {default, min, max}.
 * @property {(ctx: StrategyContext) => any} init - called once per run.
 * @property {(ctx: StrategyContext, tick: object) => Signal} onTick - per print.
 * @property {(ctx: StrategyContext, candle: object) => Signal} onCandle - per closed bar.
 */

/**
 * The tick budget every strategy carries, declared for the author rather than by them.
 *
 * Merged into the params schema so it reaches the tuning form, the coercion and the saved
 * settings by the same route as anything else — a budget that needed its own plumbing
 * would be a budget nobody could change.
 */
export const BUDGET_PARAM = Object.freeze({
  kind: 'number',
  label: 'tick budget (ms)',
  default: 2,
  min: 0.5,
  max: 50,
  step: 0.5,
})

/** The hooks a strategy may implement. `init` is optional; the two readers are not. */
export const HOOKS = Object.freeze(['init', 'onTick', 'onCandle'])

/** The actions a signal may carry. */
export const SIGNAL_ACTIONS = Object.freeze(['buy', 'sell', 'flat', 'none'])

/** What a strategy returns when it has nothing to say. */
export const NEUTRAL_SIGNAL = Object.freeze({ action: 'none', strength: 0, reason: '' })

/**
 * Check a strategy descriptor, loudly.
 *
 * @param {object} descriptor - the candidate strategy.
 * @returns {true} when valid.
 * @throws {Error} naming the first violation.
 */
export function validateStrategyShape(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') {
    throw new Error('strategy: descriptor must be an object')
  }

  const id = String(descriptor.id ?? '')
  // Kebab-case because the id is a state key, a journal field and a URL fragment before
  // this phase is over, and each of those hates a space differently.
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    throw new Error(`strategy: id must be kebab-case, got "${descriptor.id}"`)
  }

  if (descriptor.params && typeof descriptor.params !== 'object') {
    throw new Error(`strategy ${id}: params must be an object`)
  }

  for (const hook of HOOKS) {
    const fn = descriptor[hook]
    // `init` is genuinely optional — plenty of strategies are stateless — but a reader
    // hook that is present and not callable is a typo, not a choice.
    if (fn === undefined && hook === 'init') continue
    if (typeof fn !== 'function') {
      throw new Error(`strategy ${id}: ${hook} must be a function`)
    }
  }

  return true
}

/**
 * Freeze a validated strategy descriptor.
 *
 * @param {object} descriptor - the candidate strategy.
 * @returns {object} the frozen strategy.
 */
export function defineStrategy(descriptor) {
  validateStrategyShape(descriptor)

  return Object.freeze({
    id: String(descriptor.id),
    name: String(descriptor.name ?? descriptor.id),
    params: Object.freeze({ budgetMs: BUDGET_PARAM, ...(descriptor.params ?? {}) }),
    // Defaulted rather than left undefined, so the runner can call all three without
    // checking — one branch in a per-tick path is one branch too many.
    init: descriptor.init ?? (() => null),
    onTick: descriptor.onTick,
    onCandle: descriptor.onCandle,
  })
}

/**
 * Resolve a params schema to values.
 *
 * @param {object} schema - key → {default} descriptors.
 * @param {object} [overrides] - the trader's tuning.
 * @returns {object} the resolved params.
 */
export function resolveParams(schema, overrides = {}) {
  const out = {}

  for (const [key, spec] of Object.entries(schema ?? {})) {
    const fallback = spec && typeof spec === 'object' ? spec.default : spec
    const given = overrides?.[key]
    const value = given === undefined ? fallback : given

    // Clamped here rather than trusted from the settings drawer: a param that arrives out
    // of range from a shared preset or an old saved tuning would otherwise reach the
    // strategy as a size or a threshold nobody sanity-checked.
    const min = Number(spec?.min)
    const max = Number(spec?.max)
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = Math.min(
        Number.isFinite(max) ? max : Infinity,
        Math.max(Number.isFinite(min) ? min : -Infinity, value),
      )
    } else {
      out[key] = value
    }
  }

  return out
}

/**
 * Build the only surface a strategy gets.
 *
 * @param {{strategy?: object, instrument?: string, params?: object, ind?: object,
 *   now?: number}} [options] - the run.
 * @returns {StrategyContext} the context.
 */
export function createStrategyContext(options = {}) {
  const strategy = options.strategy ?? {}
  const id = String(strategy.id ?? 'strategy')

  return Object.freeze({
    instrument: String(options.instrument ?? ''),
    params: Object.freeze(resolveParams(strategy.params, options.params)),
    // The indicator toolkit plus whatever readings the desk already has. Frozen, and a
    // snapshot rather than the live store — a strategy that could reach the store could
    // mutate it under the next strategy in the run.
    ind: Object.freeze(indicatorKit(options.ind)),
    log: options.log ?? createLogger(`strategy:${id}`),
    // The clock is injected. A strategy that reads the wall clock cannot be replayed, and
    // replay is how a signal gets explained after the fact.
    now: Number(options.now) || 0,
  })
}

/**
 * Normalise whatever a hook returned into a signal.
 *
 * @param {any} raw - the hook's return value.
 * @returns {Signal} the signal.
 */
export function toSignal(raw) {
  if (!raw || typeof raw !== 'object') return NEUTRAL_SIGNAL

  const action = String(raw.action ?? '')
  // An unrecognised action is silence, not a guess. Coercing it to 'flat' would have a
  // typo close positions.
  if (!SIGNAL_ACTIONS.includes(action)) return NEUTRAL_SIGNAL

  const strength = Number(raw.strength)

  return {
    action,
    strength: Number.isFinite(strength) ? Math.min(1, Math.max(0, strength)) : 0,
    reason: String(raw.reason ?? ''),
  }
}
