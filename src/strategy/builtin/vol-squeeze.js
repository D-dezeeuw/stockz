import { defineStrategy } from '../contract.js'
import { createRing } from '../../pipeline/ring.js'
import { percentile } from '../../hud/metrics.js'

/**
 * Volatility squeeze expansion.
 *
 * Volatility mean-reverts far more reliably than price does. A market that has gone quiet
 * will get loud again; the only questions are when and which way. This strategy answers
 * "when" with a percentile — the squeeze is a range in the bottom quintile of its own
 * recent history — and refuses to answer "which way" at all until the expansion itself
 * says so.
 *
 * That refusal is the design. Guessing direction during the squeeze is what turns a good
 * volatility read into a coin flip, and the whole edge here is that the *first* bucket of
 * the expansion is directional information that arrives before the move is obvious.
 *
 * Volatility is measured against **its own history, per instrument**, never an absolute
 * range. Two ticks a second is dead on BTC and a riot on a stablecoin pair.
 */

/** Closed one-second buckets a run keeps. */
export const SQUEEZE_RING = 300

/**
 * Fold a print into one-second buckets.
 *
 * @param {object} state - the run's scratchpad.
 * @param {number} px - the print price.
 * @param {number} ts - the print time.
 * @returns {{range: number, close: number, delta: number}|null} the bucket that just closed.
 */
export function microRange(state, px, ts) {
  const price = Number(px)
  const at = Number(ts)
  if (!state || !Number.isFinite(price) || !Number.isFinite(at)) return null

  const bucket = Math.floor(at / 1000)
  const open = state.bucket

  if (!open || open.id !== bucket) {
    const closed = open
      ? {
          range: Number((open.high - open.low).toFixed(10)),
          close: open.close,
          // The bucket's own direction, which is what turns the expansion reading into an
          // entry side.
          delta: Number((open.close - open.open).toFixed(10)),
        }
      : null

    state.bucket = { id: bucket, open: price, high: price, low: price, close: price }
    return closed
  }

  open.high = Math.max(open.high, price)
  open.low = Math.min(open.low, price)
  open.close = price

  return null
}

/**
 * Is the market compressed?
 *
 * @param {number[]} ranges - recent bucket ranges, oldest first.
 * @param {number} lookback - how many buckets count as "recent".
 * @param {number} pct - the percentile that counts as quiet.
 * @returns {{active: boolean, avg: number, level: number}} the verdict.
 */
export function squeezeDetect(ranges, lookback, pct) {
  const rows = (Array.isArray(ranges) ? ranges : []).map(Number).filter(Number.isFinite)
  const window = Math.max(5, Math.floor(Number(lookback) || 60))
  const share = Number(pct) > 0 && Number(pct) < 1 ? Number(pct) : 0.2

  // Not enough history is not a squeeze. Calling one on four buckets would fire on the
  // first quiet moment of every session.
  if (rows.length < window) return { active: false, avg: 0, level: 0 }

  const recent = rows.slice(-window)
  const level = percentile(recent, share)
  const current = recent.at(-1)
  const avg = Number((recent.reduce((sum, r) => sum + r, 0) / recent.length).toFixed(10))

  // Measured against its own history, per instrument: two ticks a second is dead on BTC
  // and a riot on a stablecoin pair.
  return { active: current <= level, avg, level }
}

/**
 * Has the range exploded?
 *
 * @param {{range?: number, delta?: number}} bucket - the bucket that just closed.
 * @param {number} squeezeAvg - the average range during the squeeze.
 * @param {number} k - how many times the average counts as expansion.
 * @returns {string} 'buy', 'sell' or ''.
 */
export function expansionTrigger(bucket, squeezeAvg, k) {
  const range = Number(bucket?.range)
  const avg = Number(squeezeAvg)
  const times = Number(k) > 0 ? Number(k) : 3
  if (!Number.isFinite(range) || !Number.isFinite(avg) || avg <= 0) return ''
  if (range < avg * times) return ''

  const delta = Number(bucket?.delta) || 0
  // A wide bucket that closed where it opened is a two-sided fight, and taking a side in
  // one is the most expensive way to be right about volatility.
  if (delta === 0) return ''

  return delta > 0 ? 'buy' : 'sell'
}

/**
 * The entry call.
 *
 * @param {boolean} squeezeActive - whether the market was compressed.
 * @param {string} expansion - the expansion direction.
 * @param {{range?: number}} bucket - the bucket.
 * @param {number} squeezeAvg - the squeeze average.
 * @returns {{action: string, strength: number, reason: string}|null} the signal, or null.
 */
export function squeezeSignal(squeezeActive, expansion, bucket, squeezeAvg) {
  // Expansion out of nowhere in particular is just a volatile market. The squeeze is what
  // makes the first leg worth taking.
  if (squeezeActive !== true || !expansion) return null

  const range = Number(bucket?.range) || 0
  const avg = Number(squeezeAvg) || 0
  const ratio = avg > 0 ? range / avg : 0

  return {
    action: expansion,
    strength: Math.min(1, 0.5 + ratio / 20),
    reason: `expansion ${ratio.toFixed(1)}× squeeze`,
  }
}

/**
 * Should the position be closed?
 *
 * @param {{side?: string, px?: number}} entry - the open trade.
 * @param {{range?: number}} bucket - the bucket that just closed.
 * @param {number} squeezeAvg - the squeeze average.
 * @param {number} px - the current price.
 * @param {number} targetTicks - the target, in ticks.
 * @param {number} tickSize - the instrument's tick.
 * @returns {string} '' to hold, or the reason to exit.
 */
export function contractionExit(entry, bucket, squeezeAvg, px, targetTicks, tickSize) {
  if (!entry?.side) return ''

  const price = Number(px)
  const from = Number(entry.px)
  const tick = Number(tickSize) > 0 ? Number(tickSize) : 0.01
  const target = Number(targetTicks) > 0 ? Number(targetTicks) : 10

  if (Number.isFinite(price) && Number.isFinite(from)) {
    const moved = Number((((price - from) / tick) * (entry.side === 'buy' ? 1 : -1)).toFixed(6))
    if (moved >= target) return 'target hit'
  }

  const range = Number(bucket?.range)
  const avg = Number(squeezeAvg)
  if (!Number.isFinite(range) || !Number.isFinite(avg) || avg <= 0) return ''

  // Back into contraction means the expansion is over. The trade was the volatility, not
  // the direction, so when the volatility goes the reason to hold goes with it.
  return range <= avg * 1.2 ? 'back into contraction' : ''
}

/**
 * One print.
 *
 * @param {object} ctx - the strategy context.
 * @param {object} tick - the print.
 * @returns {object|null} the signal, or null.
 */
export function squeezeTick(ctx, tick) {
  const state = ctx?.state
  const px = Number(tick?.px)
  if (!state?.ranges || !Number.isFinite(px)) return null

  const closed = microRange(state, px, Number(tick?.ts) || Number(ctx.now) || 0)
  // Everything downstream is per closed bucket. A strategy that recomputed a percentile on
  // every print would be the slowest thing in the frame by an order of magnitude.
  if (!closed) return null

  state.ranges.push(closed.range)
  const squeeze = squeezeDetect(state.ranges.toArray(), ctx.params?.lookback, ctx.params?.pctThreshold)

  if (state.entry) {
    const exit = contractionExit(
      state.entry,
      closed,
      state.squeezeAvg,
      px,
      ctx.params?.targetTicks,
      ctx.params?.tickSize,
    )
    if (!exit) return null

    state.entry = null
    return { action: 'flat', strength: 1, reason: exit }
  }

  const wasSqueezed = state.squeezed === true
  state.squeezed = squeeze.active
  if (squeeze.active) state.squeezeAvg = squeeze.avg

  const signal = squeezeSignal(
    wasSqueezed,
    expansionTrigger(closed, state.squeezeAvg, ctx.params?.k),
    closed,
    state.squeezeAvg,
  )
  if (!signal) return null

  state.entry = { side: signal.action, px }
  state.squeezed = false

  return signal
}

/**
 * The strategy.
 */
export const volSqueezeStrategy = defineStrategy({
  id: 'vol-squeeze',
  name: 'Volatility squeeze',
  params: {
    lookback: { kind: 'number', label: 'lookback (buckets)', default: 60, min: 10, max: 300, step: 10 },
    pctThreshold: { kind: 'number', label: 'squeeze percentile', default: 0.2, min: 0.05, max: 0.5, step: 0.05 },
    k: { kind: 'number', label: 'expansion multiple', default: 3, min: 1.5, max: 10, step: 0.5 },
    targetTicks: { kind: 'number', label: 'target (ticks)', default: 10, min: 1, max: 200, step: 1 },
    tickSize: { kind: 'number', label: 'tick size', default: 0.01, min: 0.00000001, max: 100, step: 0.01 },
  },
  init: (ctx) => {
    ctx.state.ranges = createRing(SQUEEZE_RING)
    ctx.state.bucket = null
    ctx.state.squeezed = false
    ctx.state.squeezeAvg = 0
    ctx.state.entry = null
    return ctx.state
  },
  onTick: squeezeTick,
  onCandle: () => null,
})
