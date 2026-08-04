import { ewma } from '../hud/metrics.js'

/**
 * The strategy tick budget.
 *
 * A strategy runs inside the same frame as the book, the tape and the order ticket. A slow
 * one does not just make itself late — it makes the *desk* late, and a desk whose whole
 * pitch is sub-100ms cannot have somebody's backtest-grade loop between a click and an
 * order.
 *
 * So the answer is throttling, never dropping. A strategy that is too slow runs on every
 * fourth tick instead of not at all: a degraded signal is still a signal, and silently
 * disabling one would leave the trader watching a strategy they believe is running.
 */

/** The per-tick cost an author gets before they are throttled, in ms. */
export const DEFAULT_BUDGET_MS = 2

/** How fast the cost estimate moves. Slow enough that one spike is not a verdict. */
export const COST_ALPHA = 0.2

/** The strides a throttled strategy can be put on. */
export const STRIDES = Object.freeze([2, 4, 8])

/**
 * Time a hook call.
 *
 * @param {Function} fn - the hook.
 * @param {{clock?: Function}} [options] - an injectable clock.
 * @returns {(...args: any[]) => {result: any, costMs: number}} the wrapped hook.
 */
export function measureTick(fn, options = {}) {
  const clock = typeof options.clock === 'function' ? options.clock : () => performance.now()

  return (...args) => {
    if (typeof fn !== 'function') return { result: undefined, costMs: 0 }

    const started = clock()
    const result = fn(...args)
    // Measured even when the hook throws upstream of here? No — a throwing hook is caught
    // by runHook and never reaches this wrapper, so its cost is simply not sampled. A
    // strategy that only throws is not a slow strategy, it is a broken one.
    return { result, costMs: Math.max(0, Number(clock() - started) || 0) }
  }
}

/**
 * Fold one cost sample into a run's estimate.
 *
 * @param {number} prev - the previous estimate.
 * @param {number} costMs - this call's cost.
 * @returns {number} the new estimate.
 */
export function costEwma(prev, costMs) {
  const cost = Number(costMs)
  if (!Number.isFinite(cost)) return Number(prev) || 0

  // Seeded on the first sample by `ewma`, so a new run is judged on what it actually cost
  // rather than climbing out of zero for its first fifty ticks.
  return Number(ewma(prev, cost, COST_ALPHA).toFixed(4))
}

/**
 * Is a run too slow?
 *
 * @param {number} costMs - the run's cost estimate.
 * @param {number} budgetMs - its declared budget.
 * @param {boolean} [throttled] - whether it is currently throttled.
 * @returns {boolean} the verdict.
 */
export function overBudget(costMs, budgetMs, throttled = false) {
  const cost = Number(costMs) || 0
  const budget = Number(budgetMs) > 0 ? Number(budgetMs) : DEFAULT_BUDGET_MS

  // 20% hysteresis. Without it a strategy sitting exactly on its budget flaps between
  // full speed and quarter speed every few ticks, which is worse than either.
  return throttled ? cost > budget * 0.8 : cost > budget
}

/**
 * How hard to throttle.
 *
 * @param {number} costMs - the run's cost estimate.
 * @param {number} budgetMs - its declared budget.
 * @returns {number} the tick stride; 1 means no throttling.
 */
export function throttleStride(costMs, budgetMs) {
  const cost = Number(costMs) || 0
  const budget = Number(budgetMs) > 0 ? Number(budgetMs) : DEFAULT_BUDGET_MS
  if (cost <= budget) return 1

  const ratio = cost / budget
  if (ratio > 8) return STRIDES[2]
  if (ratio > 4) return STRIDES[1]

  return STRIDES[0]
}

/**
 * Should this tick reach the strategy?
 *
 * @param {number} counter - the run's tick count.
 * @param {number} stride - its stride.
 * @returns {boolean} true when the tick should run.
 */
export function shouldRunTick(counter, stride) {
  const n = Number(counter)
  const step = Number(stride)
  if (!Number.isFinite(n)) return true
  if (!Number.isFinite(step) || step <= 1) return true

  return n % step === 0
}

/**
 * Fold a cost sample into a run's budget state.
 *
 * @param {object} run - the run.
 * @param {number} costMs - this call's cost.
 * @returns {{costMs: number, stride: number, throttled: boolean}} the budget state.
 */
export function recordCost(run, costMs) {
  const budget = Number(run?.budgetMs) > 0 ? Number(run.budgetMs) : DEFAULT_BUDGET_MS
  const cost = costEwma(run?.costMs, costMs)
  const throttled = overBudget(cost, budget, run?.throttled === true)
  const stride = throttled ? throttleStride(cost, budget) : 1

  if (run) {
    run.costMs = cost
    run.throttled = throttled
    run.stride = stride
  }

  return { costMs: cost, stride, throttled }
}
