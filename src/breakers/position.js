import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { openPositions } from '../positions/store.js'
import { currentThresholds } from './core.js'
import { TRIP } from './codes.js'
import { logBreakerEvent } from './log.js'

/**
 * The position breaker, and the loss-streak pause.
 *
 * Two guards that are deliberately **not** trips, and the distinction is the point of this
 * module.
 *
 * A size that would breach the cap is *blocked* — one order refused, the desk untouched.
 * One fat-fingered size should not cancel every working order and flatten the book; the
 * cure would be far worse than the mistake, and a safety feature that punishes typos is one
 * traders route around.
 *
 * A losing streak *pauses* — no new entries, exits always allowed. Trading through a bad
 * run is what turns a bad hour into a bad week, but a trader who cannot close what they
 * already hold is trapped by their own safety net, which is the one thing worse than not
 * having one.
 */

/**
 * How much of an instrument is held.
 *
 * @param {string} instrument - the instrument.
 * @param {object[]} [positions] - the open positions.
 * @returns {number} the signed size.
 */
export function getPosSize(instrument, positions = openPositions()) {
  const symbol = String(instrument ?? '')
  if (!symbol) return 0

  const total = (Array.isArray(positions) ? positions : []).reduce((sum, position) => {
    const held = String(position?.instrument ?? '')
    // Matched on the tail so `okx:BTC-USDT` and `BTC-USDT` are the same instrument: the
    // ticket speaks one and the venue the other, and a cap that missed on the mismatch
    // would be a cap that never fires.
    if (held !== symbol && !held.endsWith(`:${symbol}`) && !symbol.endsWith(`:${held}`)) return sum

    // Signed, not absolute: the direction is what makes a reduce-only exemption possible.
    return sum + (Number(position?.size ?? position?.qty) || 0)
  }, 0)

  return Number(total.toFixed(10))
}

/**
 * Would this order reduce what is already held?
 *
 * @param {{side?: string}} order - the order.
 * @param {number} held - the signed position.
 * @returns {boolean} true when it is an exit.
 */
export function isReducing(order, held) {
  const size = Number(held) || 0
  if (size === 0) return false

  const side = String(order?.side ?? '')
  // A sell against a long, or a buy against a short. Exits go through whatever the cap
  // says — a trader who cannot close what they hold is trapped by their own safety net.
  return size > 0 ? side === 'sell' : side === 'buy'
}

/**
 * Is this order getting the desk *out* of something?
 *
 * @param {{instrument?: string, side?: string, reduceOnly?: boolean}} order - the order.
 * @param {{positions?: object[]}} [sources] - injectable state.
 * @returns {boolean} true when it can only reduce exposure.
 */
export function isExit(order, sources = {}) {
  // The flag is enough on its own: a venue that honours reduce-only cannot turn the order
  // into an opening trade whatever the book does between here and the fill.
  if (order?.reduceOnly === true) return true

  return isReducing(order, getPosSize(order?.instrument, sources.positions ?? openPositions()))
}

/**
 * The per-instrument cap check.
 *
 * @param {{instrument?: string, side?: string, size?: number}} order - the order.
 * @param {{positions?: object[]}} [sources] - injectable state.
 * @returns {{code: number, reason: string}} the verdict.
 */
export function positionCheck(order, sources = {}) {
  const instrument = String(order?.instrument ?? '')
  const held = getPosSize(instrument, sources.positions ?? openPositions())
  // Checked before the cap, not after: an exit is never the thing a position limit was
  // written to stop.
  if (isReducing(order, held)) return { code: TRIP.NONE, reason: '' }

  const cap = capFor(instrument)
  const wanted = Math.abs(Number(order?.size) || 0)
  const after = Math.abs(held) + wanted
  if (after <= cap) return { code: TRIP.NONE, reason: '' }

  return { code: TRIP.POSITION, reason: `position cap ${cap} — holding ${Math.abs(held)}` }
}

/**
 * The cap in force for an instrument.
 *
 * @param {string} instrument - the instrument.
 * @param {object} [state] - the settings slice.
 * @returns {number} the cap.
 */
export function capFor(instrument, state = appState?.settings) {
  const symbol = String(instrument ?? '').split(':').pop()
  const override = Number(state?.botCapOverrides?.[symbol])
  if (Number.isFinite(override) && override >= 0) return override

  return currentThresholds().maxPosition
}

/** The realised-loss streak, and whether entries are paused. */
let lossStreak = 0
let paused = false

/**
 * Fold a closed trade into the streak.
 *
 * @param {number} pnl - the realised amount.
 * @param {object} [state] - the settings slice.
 * @returns {{streak: number, paused: boolean}} the state after.
 */
export function onRealizedFill(pnl, state = appState?.settings) {
  const amount = Number(pnl)
  if (!Number.isFinite(amount) || amount === 0) return { streak: lossStreak, paused }

  if (amount > 0) {
    lossStreak = 0
    return { streak: 0, paused }
  }

  lossStreak += 1
  const limit = Number(state?.maxConsecLosses)
  // Zero disables it. A limit of zero meaning "pause immediately" would be an unusable
  // default for anyone who left the field blank.
  if (Number.isFinite(limit) && limit > 0 && lossStreak >= limit) pauseTrading()

  return { streak: lossStreak, paused }
}

/**
 * The streak check.
 *
 * @param {object} [state] - the settings slice.
 * @returns {{code: number, reason: string}} the verdict.
 */
export function streakCheck(state = appState?.settings) {
  const limit = Number(state?.maxConsecLosses)
  if (!Number.isFinite(limit) || limit <= 0 || lossStreak < limit) return { code: TRIP.NONE, reason: '' }

  return { code: TRIP.LOSS_STREAK, reason: `${lossStreak} losses in a row — entries paused` }
}

/**
 * Stop new entries.
 *
 * @returns {boolean} true.
 */
export function pauseTrading(now = 0) {
  paused = true
  logBreakerEvent({ kind: 'pause', code: TRIP.LOSS_STREAK, ts: now, values: { streak: lossStreak } })
  setValue(PATHS.breaker.paused, true)
  setValue(PATHS.breaker.lossStreak, lossStreak)

  return true
}

/**
 * Let entries through again.
 *
 * @returns {boolean} true when a pause was lifted.
 */
export function clearPause() {
  if (!paused) return false

  paused = false
  lossStreak = 0
  setValue(PATHS.breaker.paused, false)
  setValue(PATHS.breaker.lossStreak, 0)

  return true
}

/**
 * Is the desk paused, and does this order care?
 *
 * @param {object} order - the order.
 * @param {{positions?: object[]}} [sources] - injectable state.
 * @returns {{code: number, reason: string}} the verdict.
 */
export function pauseCheck(order, sources = {}) {
  if (!paused) return { code: TRIP.NONE, reason: '' }

  const held = getPosSize(order?.instrument, sources.positions ?? openPositions())
  // Exits always pass. Trading through a bad run turns a bad hour into a bad week, but a
  // trader who cannot close what they hold is trapped by their own safety net.
  if (isReducing(order, held)) return { code: TRIP.NONE, reason: '' }

  return { code: TRIP.LOSS_STREAK, reason: `paused after ${lossStreak} losses` }
}

/**
 * Record a blocked order so the ticket can flash it.
 *
 * @param {string} reason - why it was blocked.
 * @param {number} now - the current time.
 * @returns {object} the block record.
 */
export function recordBlock(reason, now) {
  const record = { reason: String(reason ?? ''), at: Number(now) || 0 }
  setValue(PATHS.breaker.lastBlock, record)
  logBreakerEvent({ kind: 'block', code: TRIP.POSITION, reason: record.reason, ts: record.at })
  // A running count of saves. It is the number that tells a trader whether their cap is
  // doing anything or just sitting there.
  setValue(PATHS.breaker.blocked, (Number(appState.breaker?.blocked) || 0) + 1)

  return record
}

/**
 * The streak and pause state.
 *
 * @returns {{streak: number, paused: boolean}} the state.
 */
export function pauseState() {
  return { streak: lossStreak, paused }
}

/**
 * Forget the streak and the pause.
 *
 * @returns {boolean} true.
 */
export function resetPause() {
  lossStreak = 0
  paused = false
  return true
}
