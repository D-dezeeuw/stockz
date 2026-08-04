import { defineStrategy } from '../contract.js'
import { createRing } from '../../pipeline/ring.js'

/**
 * Tape pressure shift.
 *
 * Where the imbalance strategy reads intention, this one reads what actually happened: who
 * crossed the spread. A print that lifted the offer is a buyer who wanted it now; one that
 * hit the bid is a seller who did. The share of volume that was buyer-initiated is the
 * cleanest read of urgency there is.
 *
 * The signal is the **shift**, not the level. A tape running at 70% buy volume all session
 * is just an instrument with a bid to it — by the time it shows up, it is priced in. A tape
 * that goes from 45% to 70% in ten seconds is somebody arriving, and that is the trade.
 *
 * Volume-weighted, never print-counted. Fifty one-lot prints against one big block is a
 * tape that reads bullish by count and bearish by size, and the size is what moved.
 */

/** Prints a run keeps. */
export const TAPE_RING = 512

/**
 * Which side crossed the spread.
 *
 * @param {object} print - the trade.
 * @param {number} prevPx - the previous print's price, for the tick-rule fallback.
 * @returns {number} 1 buyer-initiated, -1 seller-initiated, 0 unknown.
 */
export function classifyAggressor(print, prevPx) {
  const side = String(print?.side ?? '').toLowerCase()
  // The venue's own label when there is one: OKX's trades channel reports the taker side,
  // and no inference beats being told.
  if (side === 'buy') return 1
  if (side === 'sell') return -1

  const px = Number(print?.px)
  const prev = Number(prevPx)
  if (!Number.isFinite(px) || !Number.isFinite(prev)) return 0

  // The tick rule: a print above the last is a lift, below is a hit. An unchanged print is
  // genuinely unknown — guessing would bias the ratio toward whatever the last real print
  // happened to be.
  if (px > prev) return 1
  return px < prev ? -1 : 0
}

/**
 * The share of recent volume that was buyer-initiated.
 *
 * @param {object[]} prints - `{ts, size, dir}` entries, oldest first.
 * @param {number} now - the current time.
 * @param {number} windowMs - the window.
 * @returns {{ratio: number, prints: number, volume: number}} the reading.
 */
export function aggressorRatio(prints, now, windowMs) {
  const at = Number(now)
  const span = Math.max(1, Number(windowMs) || 10000)
  const rows = Array.isArray(prints) ? prints : []
  if (!Number.isFinite(at)) return { ratio: 0.5, prints: 0, volume: 0 }

  const cutoff = at - span
  let buy = 0
  let total = 0
  let count = 0

  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i]
    if (Number(row?.ts) <= cutoff) break

    // Volume-weighted, never print-counted: fifty one-lots against one block is a tape
    // that reads bullish by count and bearish by size, and the size is what moved.
    const size = Math.abs(Number(row?.size) || 0)
    const dir = Number(row?.dir) || 0
    if (size <= 0 || dir === 0) continue

    total += size
    if (dir > 0) buy += size
    count += 1
  }

  // An empty window is 0.5 — balanced — rather than 0, which would read as maximum selling
  // pressure on a quiet tape.
  if (total <= 0) return { ratio: 0.5, prints: 0, volume: 0 }

  return { ratio: Number((buy / total).toFixed(6)), prints: count, volume: Number(total.toFixed(8)) }
}

/**
 * How fast the pressure moved.
 *
 * @param {number} ratioNow - the current ratio.
 * @param {number} ratioPrev - the ratio one shift-window ago.
 * @returns {number} the signed shift, -1..1.
 */
export function ratioShift(ratioNow, ratioPrev) {
  const now = Number(ratioNow)
  const before = Number(ratioPrev)
  if (!Number.isFinite(now) || !Number.isFinite(before)) return 0

  return Number((now - before).toFixed(6))
}

/**
 * The entry call.
 *
 * @param {number} shift - the signed shift.
 * @param {number} threshold - how big a shift counts.
 * @param {number} printCount - prints behind the reading.
 * @param {number} minPrints - the minimum that makes it meaningful.
 * @returns {{action: string, strength: number, reason: string}|null} the signal, or null.
 */
export function pressureSignal(shift, threshold, printCount, minPrints) {
  const move = Number(shift) || 0
  const level = Number(threshold) > 0 ? Number(threshold) : 0.15
  const count = Number(printCount) || 0
  const need = Math.max(1, Math.floor(Number(minPrints) || 20))

  // Three prints can swing a ratio from 0 to 1 and mean nothing at all. Without this the
  // strategy fires hardest exactly when the tape is thinnest.
  if (count < need) return null
  if (Math.abs(move) < level) return null

  return {
    action: move > 0 ? 'buy' : 'sell',
    strength: Math.min(1, Math.abs(move) / (level * 2)),
    reason: `pressure ${move > 0 ? '+' : ''}${(move * 100).toFixed(0)}% over ${count} prints`,
  }
}

/**
 * Should the position be closed?
 *
 * @param {{side?: string, ts?: number}} entry - the open trade.
 * @param {number} ratio - the current ratio.
 * @param {number} now - the current time.
 * @param {number} neutralBand - how close to 0.5 counts as normalised.
 * @param {number} timeStopMs - the hard time stop.
 * @returns {string} '' to hold, or the reason to exit.
 */
export function normalizeExit(entry, ratio, now, neutralBand, timeStopMs) {
  if (!entry?.side) return ''

  const at = Number(now)
  const from = Number(entry.ts)
  const stop = Number(timeStopMs) > 0 ? Number(timeStopMs) : 20000
  // The time stop is unconditional. Urgency is by definition short-lived, and a pressure
  // trade held past it is a directional bet nobody decided to take.
  if (Number.isFinite(at) && Number.isFinite(from) && at - from >= stop) return 'time stop'

  const value = Number(ratio)
  const band = Number(neutralBand) > 0 ? Number(neutralBand) : 0.05
  if (!Number.isFinite(value)) return ''

  // Pressure back near balanced means whoever was in a hurry has finished.
  return Math.abs(value - 0.5) <= band ? 'pressure normalised' : ''
}

/**
 * One print.
 *
 * @param {object} ctx - the strategy context.
 * @param {object} tick - the print.
 * @returns {object|null} the signal, or null.
 */
export function pressureTick(ctx, tick) {
  const state = ctx?.state
  const px = Number(tick?.px)
  if (!state?.prints || !Number.isFinite(px)) return null

  const ts = Number(tick?.ts) || Number(ctx.now) || 0
  const dir = classifyAggressor(tick, state.lastPx)
  state.lastPx = px
  state.prints.push({ ts, size: Number(tick?.size ?? tick?.sz) || 1, dir })

  const rows = state.prints.toArray()
  const window = Number(ctx.params?.windowMs) || 10000
  const now = aggressorRatio(rows, ts, window)
  // The reference is the same window ending one shift-window ago, so the comparison is
  // like for like — a shorter baseline would report every quiet patch as a shift.
  const before = aggressorRatio(rows, ts - (Number(ctx.params?.shiftMs) || 10000), window)

  if (state.entry) {
    const exit = normalizeExit(state.entry, now.ratio, ts, ctx.params?.neutralBand, ctx.params?.timeStopMs)
    if (!exit) return null

    state.entry = null
    return { action: 'flat', strength: 1, reason: exit }
  }

  const signal = pressureSignal(
    ratioShift(now.ratio, before.ratio),
    ctx.params?.threshold,
    now.prints,
    ctx.params?.minPrints,
  )
  if (!signal) return null

  state.entry = { side: signal.action, ts }
  return signal
}

/**
 * The strategy.
 */
export const tapePressureStrategy = defineStrategy({
  id: 'tape-pressure',
  name: 'Tape pressure',
  params: {
    windowMs: { kind: 'number', label: 'pressure window (ms)', default: 10000, min: 1000, max: 120000, step: 1000 },
    shiftMs: { kind: 'number', label: 'shift lookback (ms)', default: 10000, min: 1000, max: 120000, step: 1000 },
    threshold: { kind: 'number', label: 'shift threshold', default: 0.15, min: 0.02, max: 0.5, step: 0.01 },
    minPrints: { kind: 'number', label: 'min prints', default: 20, min: 1, max: 500, step: 5 },
    neutralBand: { kind: 'number', label: 'neutral band', default: 0.05, min: 0.01, max: 0.3, step: 0.01 },
    timeStopMs: { kind: 'number', label: 'time stop (ms)', default: 20000, min: 1000, max: 120000, step: 1000 },
  },
  init: (ctx) => {
    ctx.state.prints = createRing(TAPE_RING)
    ctx.state.lastPx = NaN
    ctx.state.entry = null
    return ctx.state
  },
  onTick: pressureTick,
  onCandle: () => null,
})
