import { defineStrategy, createStrategyContext, toSignal, resolveParams } from './contract.js'
import { noopStrategy } from './builtin/noop.js'
import { compositeStrategy } from './composite.js'
import { safeInvoke } from './sandbox.js'

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
export const BUILTIN_STRATEGIES = Object.freeze([noopStrategy, compositeStrategy])

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
 * There is exactly one place a strategy exception is caught, and this is it. A second
 * try/catch further out would mean two definitions of "the strategy failed", and the
 * quarantine tally would count whichever one happened to fire.
 *
 * @param {object} strategy - the strategy.
 * @param {string} hook - 'onTick' or 'onCandle'.
 * @param {object} ctx - the context.
 * @param {object} payload - the tick or candle.
 * @param {string} [runKey] - the run, for the error record.
 * @returns {{signal: object, ok: boolean, error: string, runKey: string}} the outcome.
 */
export function runHook(strategy, hook, ctx, payload, runKey) {
  const result = safeInvoke(strategy?.[hook], runKey, ctx, payload)

  // A throwing strategy is silenced for this tick, not for the session, and never takes
  // the frame down with it: the desk's own feed and ticket keep working while somebody's
  // idea is broken.
  if (!result.ok && result.error !== 'not callable') {
    ctx?.log?.warn?.(`${hook} threw: ${result.error}`)
  }

  return { ...result, signal: toSignal(result.value) }
}
