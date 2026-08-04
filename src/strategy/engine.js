import { defineStrategy, createStrategyContext, toSignal, resolveParams } from './contract.js'
import { noopStrategy } from './builtin/noop.js'

/**
 * The strategy engine's front door.
 *
 * One import point for everything downstream, so the registry, the runner and the tuning
 * UI built in later features never reach into `contract.js` directly and the contract
 * stays a thing that can change.
 */

export { defineStrategy, createStrategyContext, toSignal, resolveParams }
export { HOOKS, SIGNAL_ACTIONS, NEUTRAL_SIGNAL, validateStrategyShape } from './contract.js'

/** Strategies that ship with the desk. */
export const BUILTIN_STRATEGIES = Object.freeze([noopStrategy])

/**
 * Summarise strategies for the inspector.
 *
 * @param {object[]} [strategies] - the strategies to describe.
 * @returns {object[]} one summary per strategy.
 */
export function describeStrategies(strategies = BUILTIN_STRATEGIES) {
  return (Array.isArray(strategies) ? strategies : []).map((strategy) => ({
    id: String(strategy?.id ?? ''),
    name: String(strategy?.name ?? ''),
    params: Object.keys(strategy?.params ?? {}),
    // Which hooks a strategy actually implements is the first question when it is not
    // firing, and the answer is otherwise buried in somebody's module.
    hooks: ['init', 'onTick', 'onCandle'].filter((hook) => typeof strategy?.[hook] === 'function'),
  }))
}

/**
 * Run one hook of one strategy.
 *
 * @param {object} strategy - the strategy.
 * @param {string} hook - 'onTick' or 'onCandle'.
 * @param {object} ctx - the context.
 * @param {object} payload - the tick or candle.
 * @returns {import('./contract.js').Signal} the signal.
 */
export function runHook(strategy, hook, ctx, payload) {
  const fn = strategy?.[hook]
  if (typeof fn !== 'function') return toSignal(null)

  try {
    return toSignal(fn(ctx, payload))
  } catch (err) {
    // A throwing strategy is silenced for this tick, not for the session, and never takes
    // the frame down with it: the desk's own feed and ticket keep working while somebody's
    // idea is broken.
    ctx?.log?.warn?.(`${hook} threw: ${err?.message ?? err}`)
    return toSignal(null)
  }
}
