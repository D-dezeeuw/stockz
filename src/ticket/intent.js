import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { yToPrice } from '../charts/scale.js'
import { roundToTick } from '../utils/math.js'
import { canSubmit, resolvePrice } from './state.js'
import { sideForColumn } from '../book/prefill.js'

/**
 * Click-to-trade.
 *
 * The ladder and the chart are the two places a scalper is already looking when they
 * decide, so those are the two places the decision should be expressible. A trade intent
 * is the vocabulary: a price, a source, and the modifier keys that were held.
 *
 * A disarmed click still stages the ticket. That is the point of separating arming from
 * clicking — the trader can build the exact order they want with the desk cold, look at
 * it, and then arm. A click that silently did nothing would teach them the surface is
 * unreliable.
 */

/** Where a trade intent came from. */
export const INTENT_SOURCES = Object.freeze(['ladder', 'chart', 'ticket'])

/**
 * The price under a click on the chart.
 *
 * @param {number} y - the click's y coordinate, in CSS pixels within the plot.
 * @param {{range: object, height: number, tickSize?: number}} plot - the plot's geometry.
 * @returns {number} the price, snapped to a tradable tick.
 */
export function priceFromY(y, plot = {}) {
  const price = yToPrice(y, plot.range, plot.height)
  const tickSize = Number(plot.tickSize)
  if (!Number.isFinite(price) || price <= 0) return 0

  // Snapped: a chart click lands between ticks almost always, and an order at an
  // unquotable price is a rejection dressed up as an entry.
  return tickSize > 0 ? roundToTick(price, tickSize) : price
}

/**
 * Translate a click into ticket changes.
 *
 * @param {{price: number, source?: string, column?: string, shift?: boolean,
 *   side?: string}} intent - the click.
 * @param {{tickSize?: number}} [context] - instrument precision.
 * @returns {{price: number, side: string, mode: string}|null} the ticket changes.
 */
export function intentToOrder(intent, context = {}) {
  const price = Number(intent?.price)
  if (!Number.isFinite(price) || price <= 0) return null

  const tickSize = Number(context.tickSize)
  const side = intent?.side ?? sideForColumn(intent?.column, Boolean(intent?.shift))

  return {
    price: tickSize > 0 ? roundToTick(price, tickSize) : price,
    side: side === 'sell' ? 'sell' : 'buy',
    // Plain click rests at the level; shift crosses it. The modifier is the whole
    // passive/aggressive distinction, and it is one key rather than a mode switch.
    mode: intent?.shift ? 'market' : 'limit',
  }
}

/**
 * Register the trade-intent action.
 *
 * @param {{submit?: (payload: object) => unknown, now?: () => number}} [deps] - the
 *   submit call, injected so a staged click can be tested without a venue.
 * @returns {string} the registered action name.
 */
export function registerIntentAction(deps = {}) {
  const { submit = null, now = () => Date.now() } = deps

  registerAction(ACTIONS.ticket.intent, (_state, payload) => {
    const order = intentToOrder(
      {
        price: payload?.price ?? payload?.px,
        column: payload?.column ?? payload?.side,
        shift: payload?.shiftKey,
      },
      { tickSize: payload?.tickSize },
    )
    if (!order) return false

    setValue(PATHS.trade.ticketSide, order.side)
    setValue(PATHS.trade.ticketMode, order.mode)
    setValue(PATHS.trade.ticketLimit, order.mode === 'limit' ? order.price : 0)
    setValue(PATHS.trade.ticketFlash, Number(appState.trade?.ticketFlash ?? 0) + 1)

    const ticket = {
      symbol: String(appState.trade?.ticketSymbol || appState.market?.focus || ''),
      side: order.side,
      size: Number(appState.trade?.ticketSize) || 0,
      mode: order.mode,
      limit: order.price,
    }
    const resolved = resolvePrice(
      ticket,
      { bid: appState.market?.bid, ask: appState.market?.ask, ts: appState.market?.quoteTs },
      { now: now() },
    )
    const verdict = canSubmit(ticket, resolved, {
      bookStatus: appState.market?.bookStatus,
      armed: appState.trade?.armed,
    })

    // A cold desk stages the ticket and stops. The trader can see exactly what they
    // built, then arm — a click that silently did nothing would teach them the surface
    // is unreliable.
    if (!verdict.ok) {
      setValue(PATHS.trade.lastReject, verdict.reason)
      return false
    }

    submit?.({ side: order.side })
    return true
  })

  return ACTIONS.ticket.intent
}
