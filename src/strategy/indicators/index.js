import { createEma, createRsi, isWarm, crossed } from './trend.js'

/**
 * The indicator barrel.
 *
 * A strategy reaches these as `ctx.ind` with zero imports of its own. That is not sugar —
 * it is what keeps a strategy a *description* rather than a module with its own dependency
 * graph, which is what makes running one from a saved definition possible later.
 */

export { createEma, createRsi, isWarm, crossed }

/**
 * Build the indicator toolkit handed to a strategy.
 *
 * @param {object} [extra] - readings to merge in, e.g. live values the desk already keeps.
 * @returns {object} the toolkit.
 */
export function indicatorKit(extra = {}) {
  return { createEma, createRsi, isWarm, crossed, ...extra }
}
