import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

/**
 * The day's scoreboard.
 *
 * Realised P&L is the only honest number a scalper has: floating P&L is an opinion about
 * a position that is still open, while a booked close is a fact. So every realisation is
 * appended in order, with its fee, and the session's net is gross minus fees — because a
 * hundred scalps at a two-tick edge and a one-tick fee is a losing day that looks like a
 * winning one on gross.
 *
 * The session boundary is the trader's, not UTC midnight: a desk that rolls over at 00:00
 * cuts an Asian session in half and makes the score meaningless on both sides.
 */

/** Ledger entries retained. A day of scalping, not a career. */
export const LEDGER_CAP = 500

/** The day's entries, newest last. */
let entries = []

/** The session this ledger belongs to, as a YYYY-MM-DD string. */
let sessionDay = ''

/**
 * Normalise a venue fee into a signed cost.
 *
 * @param {{fee?: number, fillFee?: number, feeCcy?: string}} raw - the venue's fee field.
 * @returns {{amount: number, currency: string}} the cost, always positive.
 */
export function parseFee(raw) {
  const value = Number(raw?.fee ?? raw?.fillFee ?? 0)
  const currency = String(raw?.feeCcy ?? raw?.fillFeeCcy ?? '').toUpperCase()

  // OKX reports fees as *negative* numbers (money leaving), EToro as positive. One
  // convention here — a cost is a positive cost — or the netting silently adds fees to
  // profit on one venue and subtracts them on the other.
  return { amount: Number.isFinite(value) ? Math.abs(value) : 0, currency }
}

/**
 * Append a realisation.
 *
 * @param {{instrument?: string, amount?: number, fee?: number, ts?: number,
 *   qty?: number}} event - the close.
 * @returns {object[]} the ledger.
 */
export function appendRealization(event) {
  const amount = Number(event?.amount)
  if (!Number.isFinite(amount)) return entries

  entries = [
    ...entries,
    {
      ts: Number(event?.ts) || 0,
      instrument: String(event?.instrument ?? ''),
      qty: Number(event?.qty) || 0,
      amount: Number(amount.toFixed(10)),
      fee: parseFee(event).amount,
    },
  ].slice(-LEDGER_CAP)

  return entries
}

/**
 * The session's net, after costs.
 *
 * @param {object[]} [list] - the ledger.
 * @returns {{gross: number, fees: number, net: number, count: number, wins: number}} the score.
 */
export function netRealized(list = entries) {
  const rows = Array.isArray(list) ? list : []
  let gross = 0
  let fees = 0
  let wins = 0

  for (const row of rows) {
    gross += Number(row?.amount) || 0
    fees += Number(row?.fee) || 0
    if ((Number(row?.amount) || 0) > 0) wins += 1
  }

  return {
    gross: Number(gross.toFixed(8)),
    fees: Number(fees.toFixed(8)),
    // The number that decides whether the day was worth having: a hundred scalps at a
    // two-tick edge and a one-tick fee is a loss that looks like a win on gross.
    net: Number((gross - fees).toFixed(8)),
    count: rows.length,
    wins,
  }
}

/**
 * The session day a timestamp belongs to.
 *
 * @param {number} ts - epoch milliseconds.
 * @param {number} [startHourUtc] - the hour the trader's day begins.
 * @returns {string} a YYYY-MM-DD session key.
 */
export function sessionKey(ts, startHourUtc = 0) {
  const time = Number(ts)
  if (!Number.isFinite(time)) return ''

  const hour = Math.max(0, Math.min(23, Math.floor(Number(startHourUtc) || 0)))
  // Shifted by the session start so a session that runs past midnight stays one day.
  // Rolling at UTC 00:00 cuts an Asian session in half and makes the score meaningless
  // on both sides of the cut.
  return new Date(time - hour * 3600000).toISOString().slice(0, 10)
}

/**
 * Clear the ledger when the trader's day has turned over.
 *
 * @param {number} now - epoch milliseconds.
 * @param {number} [startHourUtc] - the session start hour.
 * @returns {{rolled: boolean, day: string}} what happened.
 */
export function rolloverIfNewSession(now, startHourUtc = 0) {
  const day = sessionKey(now, startHourUtc)
  if (!day) return { rolled: false, day: sessionDay }
  if (day === sessionDay) return { rolled: false, day }

  const previous = sessionDay
  sessionDay = day
  entries = []

  // A first read is not a rollover: the desk booting into a fresh session should not
  // report that it just wiped a scoreboard that never existed.
  return { rolled: Boolean(previous), day }
}

/** @returns {object[]} the ledger, newest last. */
export function ledger() {
  return [...entries]
}

/**
 * Publish the ledger and its net into state.
 *
 * @returns {object} the score now in state.
 */
export function flushLedger() {
  const score = netRealized()
  setValue(PATHS.trade.ledger, ledger().slice(-20).reverse())
  setValue(PATHS.trade.dayPnl, score.net)
  setValue(PATHS.trade.score, score)

  return score
}

/** Empty the ledger. */
export function resetLedger() {
  entries = []
  sessionDay = ''
  return true
}

/** @returns {string} the session the ledger currently belongs to. */
export function currentSession() {
  return sessionDay || String(appState.app?.sessionDay ?? '')
}
