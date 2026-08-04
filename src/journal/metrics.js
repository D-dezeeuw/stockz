import { setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { journalTrades } from './pairing.js'
import { ticksBetween } from './ticks.js'
import { annotationFor } from './tags.js'

/**
 * Where each scalp actually made or lost its money.
 *
 * A net number tells a trader whether a trade worked. It does not tell them *why*, and on a
 * desk taking hundreds of round trips a day the why is the only thing that compounds. Five
 * numbers, each answering a question the P&L cannot:
 *
 * - **Hold time** — the difference between a scalp and a position that got away.
 * - **Slippage** — what chasing cost, separated from what the idea earned. A profitable
 *   strategy executed badly and a bad strategy executed well look identical in the net.
 * - **Fees** — on a scalping desk these are not a rounding error; past a certain rate they
 *   are the business and the trader is the employee.
 * - **MAE / MFE** — how far it went against, and how far in favour. This is what separates
 *   "that lost money" from "that was never in trouble and then gave it all back", and the
 *   two call for opposite fixes.
 * - **R multiple** — the result in units of what was risked, which is the only way to
 *   compare a trade sized at one clip with one sized at five.
 */

/**
 * How long the trade was on.
 *
 * @param {object} trade - the trade record.
 * @returns {number} milliseconds.
 */
export function holdTime(trade) {
  const open = Number(trade?.openTs) || 0
  const close = Number(trade?.closeTs) || 0
  // An unclosed or clock-skewed trade reads zero rather than negative: a negative duration
  // is a number nobody can act on, and it would sort to the top of every "longest held" view.
  return close > open ? close - open : 0
}

/**
 * That duration, said out loud.
 *
 * @param {number} ms - the duration.
 * @returns {string} a compact label.
 */
export function formatHold(ms) {
  const total = Math.max(0, Number(ms) || 0)
  if (total < 1000) return `${Math.round(total)}ms`
  if (total < 60000) return `${(total / 1000).toFixed(1)}s`
  if (total < 3600000) return `${Math.floor(total / 60000)}m${String(Math.floor((total % 60000) / 1000)).padStart(2, '0')}s`

  return `${Math.floor(total / 3600000)}h${String(Math.floor((total % 3600000) / 60000)).padStart(2, '0')}m`
}

/**
 * What chasing the price cost.
 *
 * @param {object} trade - the trade record.
 * @returns {number} the cost in quote currency, positive being worse.
 */
export function slippage(trade) {
  const legs = [...(trade?.entryFills ?? []), ...(trade?.exitFills ?? [])]

  const total = legs.reduce((sum, fill) => {
    const intent = Number(fill?.intentPx)
    // A fill with no captured intent contributes nothing rather than zero-as-perfect:
    // counting unknowns as perfect flatters the number exactly where it should not.
    if (!Number.isFinite(intent) || intent <= 0) return sum

    const px = Number(fill?.px) || 0
    const qty = Number(fill?.qty) || 0
    // Paying above the intent on a buy and receiving below it on a sell are the same
    // event, so the sign of the quantity carries the direction and one expression covers
    // both legs.
    return sum + (px - intent) * qty
  }, 0)

  return Number(total.toFixed(8))
}

/**
 * What the venues charged.
 *
 * @param {object} trade - the trade record.
 * @returns {number} the total, positive being a charge.
 */
export function sumFees(trade) {
  const legs = [...(trade?.entryFills ?? []), ...(trade?.exitFills ?? [])]
  const total = legs.reduce((sum, fill) => sum + Math.abs(Number(fill?.fee) || 0), 0)

  return Number(total.toFixed(8))
}

/**
 * How far it went against, and how far in favour.
 *
 * @param {object} trade - the trade record.
 * @param {object[]} [ticks] - the price trail.
 * @returns {{mae: number, mfe: number, marks: number}} the excursions, in quote currency.
 */
export function maeMfe(trade, ticks) {
  const trail = ticks ?? ticksBetween(trade?.instrument, trade?.openTs, trade?.closeTs)
  const entry = Number(trade?.entryPx) || 0
  const qty = Number(trade?.qty) || 0
  if (trail.length === 0 || entry <= 0 || qty === 0) return { mae: 0, mfe: 0, marks: 0 }

  const long = trade?.side !== 'short'
  let mae = 0
  let mfe = 0

  for (const mark of trail) {
    const move = ((Number(mark?.px) || 0) - entry) * (long ? 1 : -1) * qty
    if (move < mae) mae = move
    if (move > mfe) mfe = move
  }

  return { mae: Number(mae.toFixed(8)), mfe: Number(mfe.toFixed(8)), marks: trail.length }
}

/**
 * What the trade actually paid.
 *
 * @param {object} trade - the trade record.
 * @returns {number} gross less fees.
 */
export function netPnl(trade) {
  const gross = Number(trade?.pnl) || 0

  return Number((gross - sumFees(trade)).toFixed(8))
}

/**
 * The result in units of what was risked.
 *
 * @param {object} trade - the trade record.
 * @param {number} [stopDist] - the initial stop distance in price.
 * @returns {number} the R multiple, or 0 when no stop was tagged.
 */
export function rMultiple(trade, stopDist = Number(trade?.stopDist)) {
  const risk = Math.abs(Number(stopDist) || 0) * Math.abs(Number(trade?.qty) || 0)
  // No stop, no R. An assumed risk would make the number worse than useless: it would be
  // comparable across trades that never shared an assumption.
  if (risk <= 0) return 0

  return Number((netPnl(trade) / risk).toFixed(4))
}

/**
 * A trade with its metrics attached.
 *
 * @param {object} trade - the trade record.
 * @param {object[]} [ticks] - the price trail.
 * @returns {object} the enriched trade.
 */
export function enrichTrade(trade, ticks) {
  const held = holdTime(trade)
  const excursion = maeMfe(trade, ticks)
  // The annotation rides on the row rather than being looked up in the template: a row
  // that has to reach into a second map to render is a row that renders differently
  // depending on which of the two landed first.
  const annotation = annotationFor(trade?.id)

  return {
    ...trade,
    note: annotation.note,
    tags: annotation.tags,
    annotated: Boolean(annotation.note || annotation.tags.length),
    hold: held,
    holdLabel: formatHold(held),
    slippage: slippage(trade),
    fees: sumFees(trade),
    net: netPnl(trade),
    mae: excursion.mae,
    mfe: excursion.mfe,
    r: rMultiple(trade),
  }
}

/**
 * Publish the enriched rows the journal block reads.
 *
 * @param {object[]} [rows] - the trades.
 * @returns {object[]} the enriched rows, newest first.
 */
export function refreshJournalRows(rows = journalTrades()) {
  // Enriched on publish rather than on close: the excursion of a trade closed a second ago
  // is still moving as its trail fills in, and a number frozen at close would be wrong in
  // the one direction nobody checks.
  const enriched = rows.slice(-200).map((trade) => enrichTrade(trade)).reverse()
  setValue(PATHS.journal.rows, enriched)

  return enriched
}
