import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'

/**
 * Price grouping — the structure behind the noise.
 *
 * At tick granularity a book on a liquid instrument is mostly texture: hundreds of
 * one-lot levels a cent apart, none of which is a wall. Group them to 10 or 50 ticks and
 * the actual resting size appears — which is what a scalper is looking for when they
 * squint at depth.
 *
 * Rounding direction is the subtle part. A bid bucketed *up* and an ask bucketed *down*
 * would meet in the middle and produce a grouped book that appears crossed. Bids floor,
 * asks ceil: every bucket then sits on the conservative side of the price it contains,
 * and the grouped spread is never narrower than the real one.
 */

/**
 * The bucket a price belongs to.
 *
 * @param {number} price - the level price.
 * @param {number} group - the bucket size.
 * @param {string} side - 'bid' (floors) or 'ask' (ceils).
 * @returns {number} the bucket's price.
 */
export function bucketPrice(price, group, side) {
  const value = Number(price)
  const size = Number(group)
  if (!Number.isFinite(value)) return 0
  if (!Number.isFinite(size) || size <= 0) return value

  const rounded = side === 'ask' ? Math.ceil(value / size) : Math.floor(value / size)
  // Re-rounded because floats: 0.1 * 3 is 0.30000000000000004, and a book keyed on that
  // renders a price no instrument quotes.
  return Number((rounded * size).toFixed(10))
}

/**
 * Aggregate levels into price buckets.
 *
 * @param {Array<[number, number]|{px: number, sz: number}>} levels - book levels.
 * @param {number} group - the bucket size.
 * @param {string} side - 'bid' or 'ask'.
 * @returns {Array<[number, number]>} bucketed levels, best price first.
 */
export function groupLevels(levels, group, side = 'bid') {
  const buckets = new Map()

  for (const level of Array.isArray(levels) ? levels : []) {
    const px = Number(Array.isArray(level) ? level[0] : level?.px)
    const sz = Number(Array.isArray(level) ? level[1] : level?.sz)
    if (!Number.isFinite(px) || !Number.isFinite(sz) || sz <= 0) continue

    const key = bucketPrice(px, group, side)
    buckets.set(key, Number(((buckets.get(key) ?? 0) + sz).toFixed(8)))
  }

  return [...buckets.entries()].sort((a, b) => (side === 'bid' ? b[0] - a[0] : a[0] - b[0]))
}

/**
 * The group sizes worth offering for an instrument.
 *
 * @param {number} tickSize - the instrument's minimum price increment.
 * @returns {number[]} selectable group sizes, smallest first.
 */
export function groupSizes(tickSize) {
  const step = Number(tickSize)
  if (!Number.isFinite(step) || step <= 0) return [0.01, 0.02, 0.05, 0.1]

  // Multiples of the tick, not round numbers: a group that is not a whole number of
  // ticks puts bucket boundaries between quotable prices.
  return [1, 2, 5, 10].map((m) => Number((step * m).toFixed(10)))
}

/**
 * Group both sides of a book.
 *
 * @param {object} book - {bids, asks}.
 * @param {number} group - the bucket size.
 * @returns {{bids: Array, asks: Array}} the grouped book.
 */
export function groupBook(book, group) {
  return {
    bids: groupLevels(book?.bids, group, 'bid'),
    asks: groupLevels(book?.asks, group, 'ask'),
  }
}

/**
 * Register the group selector action.
 *
 * @returns {string} the registered action name.
 */
export function registerGroupingActions() {
  registerAction(ACTIONS.book.setGroup, (_state, payload) => {
    const symbol = String(payload?.symbol ?? appState.market?.focus ?? '')
    const group = Number(payload?.group ?? payload)
    if (!symbol || !Number.isFinite(group) || group < 0) return false

    // Stored per instrument: a granularity that reads well on BTC is meaningless on a
    // penny alt, and the choice has to survive switching between them.
    setValue(PATHS.settings.priceGroups, {
      ...(appState.settings?.priceGroups ?? {}),
      [symbol]: group,
    })
    return true
  })

  return ACTIONS.book.setGroup
}
