import { roundToTick } from '../utils/math.js'

/**
 * Trailing stops.
 *
 * The whole value is in one property: a trail **only ever tightens**. A stop that can
 * loosen is not a stop, it is a hope — and the version of this that loosens by accident
 * (usually by recomputing from the current price instead of the best price seen) is how
 * a scalp that was up two ticks ends up down twenty.
 *
 * So the ratchet takes the *best* price seen, not the last, and returns a new stop only
 * when it would be an improvement of at least one step.
 */

/** trail id -> record. */
const trails = new Map()

/** Trail defaults, in ticks. */
export const TRAIL_DEFAULTS = Object.freeze({ distanceTicks: 10, stepTicks: 1 })

/**
 * The next stop price, or the current one when nothing has improved.
 *
 * @param {number} best - the best price seen since the trail started.
 * @param {number} current - the stop currently in the market.
 * @param {{distanceTicks?: number, stepTicks?: number, tickSize?: number,
 *   side?: string}} config - the trail's shape.
 * @returns {number} the stop to use.
 */
export function nextTrailStop(best, current, config = {}) {
  const peak = Number(best)
  const stop = Number(current) || 0
  const tick = Number(config.tickSize) || 0
  if (!Number.isFinite(peak) || peak <= 0 || tick <= 0) return stop

  const distanceTicks = Number(config.distanceTicks)
  const distance =
    (Number.isFinite(distanceTicks) ? distanceTicks : TRAIL_DEFAULTS.distanceTicks) * tick
  const step = (Number(config.stepTicks) || TRAIL_DEFAULTS.stepTicks) * tick
  const long = String(config.side ?? 'buy').toLowerCase() !== 'sell'

  const candidate = roundToTick(long ? peak - distance : peak + distance, tick)

  // Only ever tighter, and only when the move is worth an amend. A stop that can loosen
  // is not a stop, and an amend per tick is a rate limit waiting to happen.
  if (stop <= 0) return candidate
  if (long) return candidate - stop >= step ? candidate : stop

  return stop - candidate >= step ? candidate : stop
}

/**
 * The best price seen, given a new mark.
 *
 * @param {number} best - the best so far.
 * @param {number} mark - the new price.
 * @param {string} side - the position's side.
 * @returns {number} the new best.
 */
export function bestPrice(best, mark, side) {
  const peak = Number(best) || 0
  const price = Number(mark)
  if (!Number.isFinite(price) || price <= 0) return peak

  const long = String(side ?? 'buy').toLowerCase() !== 'sell'
  if (peak <= 0) return price

  // "Best" is direction-aware: for a short, the best price seen is the *lowest*.
  return long ? Math.max(peak, price) : Math.min(peak, price)
}

/**
 * Start trailing a position or order.
 *
 * @param {string} targetId - what is being trailed.
 * @param {{mark: number, side?: string, distanceTicks?: number, stepTicks?: number,
 *   tickSize?: number}} config - the trail's shape and starting mark.
 * @returns {object|null} the trail record.
 */
export function startTrail(targetId, config = {}) {
  const id = String(targetId ?? '')
  const mark = Number(config.mark)
  if (!id || !Number.isFinite(mark) || mark <= 0) return null

  const record = {
    id,
    side: String(config.side ?? 'buy').toLowerCase() === 'sell' ? 'sell' : 'buy',
    distanceTicks: Number(config.distanceTicks) || TRAIL_DEFAULTS.distanceTicks,
    stepTicks: Number(config.stepTicks) || TRAIL_DEFAULTS.stepTicks,
    tickSize: Number(config.tickSize) || 0,
    best: mark,
    stop: 0,
  }
  record.stop = nextTrailStop(mark, 0, record)
  trails.set(id, record)

  return record
}

/**
 * Advance a trail with a new mark.
 *
 * @param {string} targetId - the trail.
 * @param {number} mark - the new price.
 * @returns {{stop: number, moved: boolean, breached: boolean}|null} what changed.
 */
export function advanceTrail(targetId, mark) {
  const record = trails.get(String(targetId ?? ''))
  if (!record) return null

  const price = Number(mark)
  const best = bestPrice(record.best, price, record.side)
  const stop = nextTrailStop(best, record.stop, record)
  const moved = stop !== record.stop

  trails.set(record.id, { ...record, best, stop })

  const long = record.side === 'buy'
  // Breach is checked against the *live* price, not the best: the stop exists to fire on
  // what the market is doing now.
  const breached = Number.isFinite(price) && stop > 0 && (long ? price <= stop : price >= stop)

  return { stop, moved, breached }
}

/**
 * The trail on a target.
 *
 * @param {string} targetId - the trail.
 * @returns {object|null} the record.
 */
export function trailFor(targetId) {
  return trails.get(String(targetId ?? '')) ?? null
}

/**
 * Stop trailing.
 *
 * @param {string} targetId - the trail.
 * @returns {boolean} true when a trail was removed.
 */
export function stopTrail(targetId) {
  return trails.delete(String(targetId ?? ''))
}

/** Forget every trail. */
export function resetTrails() {
  trails.clear()
  return true
}
