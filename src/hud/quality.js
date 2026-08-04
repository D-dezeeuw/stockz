import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { createRing } from '../pipeline/ring.js'
import { rollingMean, percentile } from './metrics.js'

/**
 * Execution quality, and the spread that produces it.
 *
 * Slippage is the cost a scalper cannot see without measuring: a two-tick edge taken at
 * one tick of slippage is half a strategy, and nothing on the screen says so unless
 * something keeps score. The sign convention here is the important part — **positive is
 * always worse**, whichever side was traded — because a column where a good buy and a bad
 * sell share a sign is a column that cannot be averaged.
 *
 * The spread alert is the other half: slippage is what already happened, a widening
 * spread is what is about to.
 */

/** Fills kept for the session's averages. */
export const SLIP_WINDOW = 200

/** clientId -> the price the trader meant to get. */
const intents = new Map()

const slips = createRing(SLIP_WINDOW)
let worst = null

/**
 * Remember what a submit was aiming at.
 *
 * @param {string} clientId - the order.
 * @param {{price?: number, side?: string, instrument?: string}} intent - the aim.
 * @returns {object|null} what was captured.
 */
export function captureIntent(clientId, intent) {
  const id = String(clientId ?? '')
  const price = Number(intent?.price)
  // A market order has no intended price at submit time; its reference is the touch it
  // was aiming to take, which the caller passes explicitly or not at all.
  if (!id || !Number.isFinite(price) || price <= 0) return null

  const record = {
    price,
    side: intent?.side === 'sell' ? 'sell' : 'buy',
    instrument: String(intent?.instrument ?? ''),
  }
  intents.set(id, record)

  return record
}

/**
 * The signed cost of a fill against its intent.
 *
 * @param {number} fillPx - the price actually filled at.
 * @param {number} intentPx - the price aimed at.
 * @param {string} side - the side traded.
 * @returns {number} basis points, positive meaning worse than intended.
 */
export function slippageBps(fillPx, intentPx, side) {
  const fill = Number(fillPx)
  const intent = Number(intentPx)
  if (!Number.isFinite(fill) || !Number.isFinite(intent) || intent <= 0 || fill <= 0) return 0

  // Positive is always worse: a buy filled above its intent and a sell filled below it
  // are the same event, and a column where they carry opposite signs cannot be averaged.
  const raw = side === 'sell' ? intent - fill : fill - intent
  return Number(((raw / intent) * 10000).toFixed(4))
}

/**
 * Keep the most expensive fill of the session.
 *
 * @param {object|null} previous - the worst so far.
 * @param {{bps: number, instrument?: string, ts?: number}} fill - the scored fill.
 * @returns {object|null} the worst fill.
 */
export function trackWorst(previous, fill) {
  const bps = Number(fill?.bps)
  if (!Number.isFinite(bps)) return previous ?? null

  // Only positive slippage can be "worst": a fill better than intended is not a problem
  // to report, and letting it win would make the tile meaningless.
  if (bps <= 0) return previous ?? null
  if (previous && Number(previous.bps) >= bps) return previous

  return { bps, instrument: String(fill?.instrument ?? ''), ts: Number(fill?.ts) || 0 }
}

/**
 * Score a fill against what it was aiming at.
 *
 * @param {{clientId?: string, px?: number, instrument?: string, ts?: number}} fill - the fill.
 * @returns {{bps: number, scored: boolean}} the score.
 */
export function scoreFill(fill) {
  const id = String(fill?.clientId ?? '')
  const intent = intents.get(id)
  // A fill with no captured intent is not scored as zero — zero is a perfect fill, and
  // counting unknowns as perfect flatters the average exactly where it should not.
  if (!intent) return { bps: 0, scored: false }

  intents.delete(id)
  const bps = slippageBps(fill?.px, intent.price, intent.side)
  slips.push(bps)
  worst = trackWorst(worst, { bps, instrument: intent.instrument || fill?.instrument, ts: fill?.ts })

  return { bps, scored: true }
}

/**
 * The session's execution quality.
 *
 * @returns {{last: number, avg: number, p95: number, worst: object|null, count: number}} the score.
 */
export function slippageStats() {
  const samples = slips.toArray()

  return {
    last: samples.length ? samples[samples.length - 1] : 0,
    avg: Number(rollingMean(samples).toFixed(2)),
    p95: Number(percentile(samples, 0.95).toFixed(2)),
    worst,
    count: samples.length,
  }
}

/**
 * Whether the spread has crossed the trader's limit.
 *
 * @param {number} bps - the current spread.
 * @param {number} limitBps - the trader's line.
 * @returns {boolean} true when it is too wide to scalp.
 */
export function spreadBreached(bps, limitBps) {
  const value = Number(bps)
  const limit = Number(limitBps)
  // No limit set is not a breach, and no spread measured is not either — an alert that
  // fires on missing data is an alert that gets muted.
  if (!Number.isFinite(value) || value <= 0) return false
  if (!Number.isFinite(limit) || limit <= 0) return false

  return value > limit
}

/**
 * Publish execution quality and the spread alert.
 *
 * @param {number} spreadNowBps - the current spread.
 * @returns {object} what was published.
 */
export function flushQuality(spreadNowBps) {
  const stats = slippageStats()
  const limit = Number(appState.settings?.spreadLimitBps) || 0
  const breached = spreadBreached(spreadNowBps, limit)

  setValue(PATHS.ui.slippage, stats)
  setValue(PATHS.ui.spreadAlert, breached)

  return { ...stats, spreadAlert: breached }
}

/** Forget the session's fills. */
export function resetQuality() {
  intents.clear()
  slips.clear()
  worst = null
  return true
}
