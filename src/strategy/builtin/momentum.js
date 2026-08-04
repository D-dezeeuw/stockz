import { defineStrategy } from '../contract.js'
import { createRing } from '../../pipeline/ring.js'

/**
 * Momentum burst breakout.
 *
 * A scalper's version of momentum: not "price went up over five minutes" but "the tape
 * just got fast". Tick *velocity* — prints per second — leads price on a burst, because
 * the flurry of orders arrives before the level breaks. By the time a five-minute candle
 * says momentum, the move is over and the scalper is providing the exit liquidity.
 *
 * The measurement that makes this work is the **baseline**. Twenty prints a second is
 * frantic on a mid-cap and asleep on BTC at the open, so the trigger is always a multiple
 * of what *this* instrument has been doing lately, never an absolute rate.
 *
 * The exit is a time stop first. A burst that has not paid within a few seconds was not a
 * burst, and the trade held "just a bit longer" is where the day's losses come from.
 */

/** Prints a run keeps to measure velocity. */
export const VELOCITY_RING = 256

/**
 * Prints per second over a rolling window.
 *
 * @param {object[]} prints - `{ts, px}` entries, oldest first.
 * @param {number} now - the current time.
 * @param {number} windowMs - the window.
 * @returns {number} prints per second.
 */
export function tickVelocity(prints, now, windowMs) {
  const at = Number(now)
  const span = Math.max(1, Number(windowMs) || 1000)
  if (!Number.isFinite(at)) return 0

  const cutoff = at - span
  const rows = Array.isArray(prints) ? prints : []
  let count = 0
  // Walked backwards and stopped at the first old entry. The ring is ordered, so scanning
  // all 256 every tick would be work proportional to history on the hottest path there is.
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (Number(rows[i]?.ts) <= cutoff) break
    count += 1
  }

  return Number(((count / span) * 1000).toFixed(3))
}

/**
 * Price change across the same window velocity was measured over.
 *
 * @param {object[]} prints - `{ts, px}` entries, oldest first.
 * @param {number} now - the current time.
 * @param {number} windowMs - the window.
 * @returns {number} the delta.
 */
export function windowDelta(prints, now, windowMs) {
  const at = Number(now)
  const span = Math.max(1, Number(windowMs) || 1000)
  const rows = Array.isArray(prints) ? prints : []
  if (!Number.isFinite(at) || rows.length === 0) return 0

  const cutoff = at - span
  const last = Number(rows[rows.length - 1]?.px)
  let first = last
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (Number(rows[i]?.ts) <= cutoff) break
    first = Number(rows[i]?.px)
  }

  return Number.isFinite(last) && Number.isFinite(first) ? Number((last - first).toFixed(10)) : 0
}

/**
 * The calm-market reference a spike is measured against.
 *
 * @param {number} prev - the previous baseline.
 * @param {number} sample - the latest velocity.
 * @param {number} [alpha] - the smoothing.
 * @returns {number} the new baseline.
 */
export function velocityBaseline(prev, sample, alpha = 0.05) {
  const value = Number(sample)
  if (!Number.isFinite(value)) return Number(prev) || 0

  const previous = Number(prev)
  // Seeded on the first sample. A baseline crawling out of zero would call the first
  // thirty seconds of every session a burst.
  if (!Number.isFinite(previous) || previous <= 0) return value

  const a = Number(alpha)
  const rate = Number.isFinite(a) && a > 0 && a <= 1 ? a : 0.05

  // Deliberately slow. The baseline is "what this instrument normally does", and one that
  // chased the burst would erase the very spike it exists to detect.
  return Number((previous + rate * (value - previous)).toFixed(4))
}

/**
 * The go/no-go call.
 *
 * @param {number} velocity - the current velocity.
 * @param {number} baseline - the calm reference.
 * @param {number} multiple - how many times baseline counts as a burst.
 * @param {number} priceDelta - price change across the window.
 * @returns {{action: string, strength: number, reason: string}|null} the signal, or null.
 */
export function burstSignal(velocity, baseline, multiple, priceDelta) {
  const speed = Number(velocity) || 0
  const calm = Number(baseline) || 0
  const times = Number(multiple) > 0 ? Number(multiple) : 3
  const delta = Number(priceDelta) || 0

  // Nothing to compare against yet is not a burst; a zero baseline would make the first
  // print of the session infinitely fast.
  if (calm <= 0 || speed < calm * times) return null
  // Fast and going nowhere is a two-sided fight, not a breakout — and it is the most
  // expensive thing on the board to trade, because both sides are there in size.
  if (delta === 0) return null

  const ratio = speed / calm

  return {
    action: delta > 0 ? 'buy' : 'sell',
    // Conviction scales with the overage and saturates: past roughly twice the trigger it
    // is a news print, not a burst worth chasing harder.
    strength: Math.min(1, 0.5 + (ratio - times) / (times * 2)),
    reason: `${ratio.toFixed(1)}× baseline, ${delta > 0 ? 'up' : 'down'}`,
  }
}

/**
 * Should the burst trade be closed?
 *
 * @param {number} entryTs - when the burst fired.
 * @param {number} now - the current time.
 * @param {number} velocity - the current velocity.
 * @param {number} baseline - the calm reference.
 * @param {number} timeStopMs - the hard time stop.
 * @returns {string} '' to hold, or the reason to exit.
 */
export function decayExit(entryTs, now, velocity, baseline, timeStopMs) {
  const entry = Number(entryTs)
  const at = Number(now)
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(at)) return ''

  const stop = Number(timeStopMs) > 0 ? Number(timeStopMs) : 8000
  // The time stop first and unconditionally. A burst that has not paid within a few
  // seconds was not a burst.
  if (at - entry >= stop) return 'time stop'

  const speed = Number(velocity) || 0
  const calm = Number(baseline) || 0
  // Back to normal tape means the flow that was carrying the trade has gone.
  return calm > 0 && speed < calm * 1.2 ? 'burst decayed' : ''
}

/**
 * One tick of the strategy, extracted so it has a test of its own.
 *
 * @param {object} ctx - the strategy context.
 * @param {object} tick - the print.
 * @returns {object|null} the signal, or null.
 */
export function momentumTick(ctx, tick) {
  const state = ctx?.state
  const px = Number(tick?.px)
  const ts = Number(tick?.ts) || Number(ctx?.now) || 0
  if (!state?.prints || !Number.isFinite(px)) return null

  state.prints.push({ ts, px })
  const window = Number(ctx.params?.windowMs) || 1000
  const prints = state.prints.toArray()
  const velocity = tickVelocity(prints, ts, window)
  state.baseline = velocityBaseline(state.baseline, velocity, ctx.params?.alpha)

  if (state.entryTs > 0) {
    const exit = decayExit(state.entryTs, ts, velocity, state.baseline, ctx.params?.timeStopMs)
    if (!exit) return null

    state.entryTs = 0
    return { action: 'flat', strength: 1, reason: exit }
  }

  const signal = burstSignal(velocity, state.baseline, ctx.params?.multiple, windowDelta(prints, ts, window))
  if (!signal) return null

  state.entryTs = ts
  return signal
}

/**
 * The strategy.
 */
export const momentumStrategy = defineStrategy({
  id: 'momentum-burst',
  name: 'Momentum burst',
  params: {
    windowMs: {
      kind: 'number',
      label: 'velocity window (ms)',
      default: 1000,
      min: 200,
      max: 10000,
      step: 100,
    },
    multiple: { kind: 'number', label: 'burst multiple', default: 3, min: 1.5, max: 10, step: 0.5 },
    timeStopMs: {
      kind: 'number',
      label: 'time stop (ms)',
      default: 8000,
      min: 1000,
      max: 60000,
      step: 500,
    },
    alpha: { kind: 'number', label: 'baseline smoothing', default: 0.05, min: 0.01, max: 0.5, step: 0.01 },
  },
  // The ring lives in the run's own scratchpad rather than in module scope, so two runs on
  // two instruments never share a tape.
  init: (ctx) => {
    ctx.state.prints = createRing(VELOCITY_RING)
    ctx.state.baseline = 0
    ctx.state.entryTs = 0
    return ctx.state
  },
  onTick: momentumTick,
  onCandle: () => null,
})
