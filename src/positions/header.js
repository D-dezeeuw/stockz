import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { fmtPnl } from './pnl.js'

/**
 * The day's number, always in view.
 *
 * One figure in the header, because the alternative is a trader deciding whether to take
 * the next trade without knowing whether the day is green — and the answer to that
 * question changes what the right next trade is.
 *
 * The pulse exists for the same reason as the tape's colours: peripheral vision reads
 * *change* far faster than it reads digits, and a scalper's eyes are on the chart.
 */

/** How long a pulse lasts. Long enough to register, short enough not to nag. */
export const PULSE_MS = 600

/** The last value seen, so a direction can be worked out. */
let previous = null

/**
 * The desk's day P&L: booked, plus what is still open.
 *
 * @param {{net?: number}} score - the realised ledger score.
 * @param {{unrealized?: number}} pnl - the open-position totals.
 * @returns {number} the day's P&L.
 */
export function dayPnl(score, pnl) {
  const realized = Number(score?.net) || 0
  const floating = Number(pnl?.unrealized) || 0

  // Both halves, always. Showing only realised makes a session look flat while a losing
  // position runs; showing only floating forgets everything already booked.
  return Number((realized + floating).toFixed(8))
}

/**
 * Which way the number just moved.
 *
 * @param {number} next - the new value.
 * @param {number|null} last - the previous value.
 * @param {number} [epsilon] - movement below this is noise.
 * @returns {string} 'up', 'down' or 'flat'.
 */
export function pnlDirection(next, last, epsilon = 0.005) {
  const now = Number(next)
  // `Number(null)` is 0, which is finite — so "no previous value" has to be checked
  // before the conversion, or the first reading always reports a move from zero.
  if (last === null || last === undefined) return 'flat'

  const before = Number(last)
  if (!Number.isFinite(now) || !Number.isFinite(before)) return 'flat'

  const delta = now - before
  // A mark that wobbles a cent is not a move. Pulsing on it would make the header
  // strobe continuously and teach the trader to stop seeing it.
  if (Math.abs(delta) < (Number(epsilon) || 0)) return 'flat'

  return delta > 0 ? 'up' : 'down'
}

/**
 * Compact form for a header that must not reflow.
 *
 * @param {number} amount - the value.
 * @returns {string} e.g. '+1.2K', '−340.50'.
 */
export function compactPnl(amount) {
  const value = Number(amount)
  if (!Number.isFinite(value)) return '—'

  const magnitude = Math.abs(value)
  // Past a thousand the exact cents stop mattering and the width starts to: a header
  // that changes width as the number grows drags the whole nav around with it.
  if (magnitude >= 1e6) return `${value > 0 ? '+' : '−'}${(magnitude / 1e6).toFixed(1)}M`
  if (magnitude >= 1e3) return `${value > 0 ? '+' : '−'}${(magnitude / 1e3).toFixed(1)}K`

  return fmtPnl(value)
}

/**
 * Publish the header's P&L, with a pulse when it moved.
 *
 * @param {{now?: number}} [options] - the clock, for the pulse's expiry.
 * @returns {{value: number, label: string, direction: string}} what was published.
 */
export function refreshDayPnl(options = {}) {
  const value = dayPnl(appState.trade?.score, appState.trade?.pnl)
  const direction = previous === null ? 'flat' : pnlDirection(value, previous)
  previous = value

  setValue(PATHS.trade.dayTotal, value)
  setValue(PATHS.trade.dayLabel, compactPnl(value))
  setValue(PATHS.ui.pnlPulse, direction === 'flat' ? '' : direction)
  setValue(PATHS.ui.pnlPulseAt, direction === 'flat' ? 0 : Number(options.now) || 0)

  return { value, label: compactPnl(value), direction }
}

/**
 * Clear a pulse that has run its course.
 *
 * @param {number} now - the current time.
 * @returns {boolean} true when a pulse was cleared.
 */
export function expirePulse(now) {
  const at = Number(appState.ui?.pnlPulseAt) || 0
  if (!at || !String(appState.ui?.pnlPulse ?? '')) return false
  if (Number(now) - at < PULSE_MS) return false

  setValue(PATHS.ui.pnlPulse, '')
  return true
}

/** Forget the last value — a new session starts without a direction. */
export function resetPnlHeader() {
  previous = null
  return true
}
