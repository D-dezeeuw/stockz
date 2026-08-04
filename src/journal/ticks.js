import { createRing } from '../pipeline/ring.js'

/**
 * The price trail a trade was taken through.
 *
 * MAE and MFE are the two numbers that separate "that trade lost money" from "that trade was
 * never in trouble and then gave it all back", and neither is recoverable from the fills. So
 * something has to remember where price *went* between the entry and the exit.
 *
 * It is deliberately a small in-memory ring, not a recording of every tick. A scalping desk
 * sees thousands of ticks a minute and a trade lasts seconds; a bounded trail per instrument
 * answers the question for every trade that is still recent enough for anybody to be
 * reviewing it, and costs one array write per frame instead of a storage engine. A trade
 * older than the trail simply reports no excursion, which is honest — better than a number
 * reconstructed from candles that were never what the trader was looking at.
 */

/** How many marks each instrument keeps. */
export const TRAIL_SIZE = 2048

/** instrument -> ring of {ts, px}. */
const trails = new Map()

/**
 * Remember where price was.
 *
 * @param {string} instrument - the instrument.
 * @param {number} px - the mid.
 * @param {number} ts - when.
 * @returns {number} how many marks that instrument now holds.
 */
export function recordTick(instrument, px, ts) {
  const symbol = String(instrument ?? '')
  const price = Number(px)
  if (!symbol || !Number.isFinite(price) || price <= 0) return 0

  if (!trails.has(symbol)) trails.set(symbol, createRing(TRAIL_SIZE))

  return trails.get(symbol).push({ ts: Number(ts) || 0, px: price })
}

/**
 * The marks inside a window.
 *
 * @param {string} instrument - the instrument.
 * @param {number} from - window start.
 * @param {number} to - window end.
 * @returns {object[]} the marks, oldest first.
 */
export function ticksBetween(instrument, from, to) {
  const trail = trails.get(String(instrument ?? ''))
  if (!trail) return []

  const start = Number(from) || 0
  // An open trade has no close yet, and its excursion so far is exactly what a trader
  // watching it wants to know.
  const end = Number.isFinite(Number(to)) && Number(to) > 0 ? Number(to) : Infinity

  return trail.toArray().filter((mark) => mark.ts >= start && mark.ts <= end)
}

/**
 * Forget every trail.
 *
 * @returns {boolean} true.
 */
export function resetTicks() {
  trails.clear()
  return true
}
