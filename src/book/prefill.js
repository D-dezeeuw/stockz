import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { roundToTick } from '../utils/math.js'

/**
 * Click-to-trade prefill.
 *
 * The whole reason the ladder is DOM and not canvas: every price on it is a click
 * target, and clicking one loads the ticket. Nothing is submitted — this is the step
 * *before* the order, and collapsing decision-to-ticket to one click is most of what
 * makes a scalping desk feel fast.
 *
 * No confirmation, by design. A confirm dialog between the click and the ticket would
 * add a round trip to human reaction time on the one path where that cost is felt most.
 */

/**
 * The side a click implies.
 *
 * @param {string} column - 'bid' or 'ask' (the column clicked).
 * @param {boolean} [shift] - whether shift was held.
 * @returns {string} 'buy' or 'sell'.
 */
export function sideForColumn(column, shift = false) {
  // Clicking a bid means joining it — a resting buy. Clicking an ask means joining the
  // offer. Shift flips that: hitting the bid rather than joining it, which is the
  // aggressive entry, and holding a modifier is the fastest way to say so.
  const passive = String(column ?? '').toLowerCase() === 'ask' ? 'sell' : 'buy'
  if (!shift) return passive

  return passive === 'buy' ? 'sell' : 'buy'
}

/**
 * Build the ticket a click should produce.
 *
 * @param {{price: number, column: string, shift?: boolean, size?: number,
 *   tickSize?: number}} click - what was clicked.
 * @returns {{price: number, side: string, size: number}|null} the ticket, or null when
 *   the click carried no usable price.
 */
export function ticketFromClick(click) {
  const price = Number(click?.price)
  if (!Number.isFinite(price) || price <= 0) return null

  const tickSize = Number(click?.tickSize)
  return {
    price: tickSize > 0 ? roundToTick(price, tickSize) : price,
    side: sideForColumn(click?.column, Boolean(click?.shift)),
    size: Number(click?.size) || 0,
  }
}

/**
 * Register the ladder's prefill action.
 *
 * @returns {string} the registered action name.
 */
export function registerPrefillActions() {
  registerAction(ACTIONS.book.prefill, (_state, payload) => {
    const ticket = ticketFromClick({
      price: payload?.price ?? payload?.px,
      column: payload?.side ?? payload?.column,
      shift: payload?.shiftKey,
      // The desk's standard clip, so the only thing a click leaves to decide is whether
      // to send it.
      size: payload?.size ?? appState.settings?.defaultSize ?? 0,
      tickSize: payload?.tickSize,
    })
    if (!ticket) return false

    setValue(PATHS.trade.ticketPrice, ticket.price)
    setValue(PATHS.trade.ticketSide, ticket.side)
    setValue(PATHS.trade.ticketSize, ticket.size)
    // A bump the ticket block watches to flash: visible confirmation the click landed,
    // without a dialog to dismiss.
    setValue(PATHS.trade.ticketFlash, Number(appState.trade?.ticketFlash ?? 0) + 1)

    return true
  })

  return ACTIONS.book.prefill
}
