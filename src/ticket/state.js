import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { canTradeBook } from '../book/integrity.js'

/**
 * The order ticket.
 *
 * Everything the desk has built so far exists to make this one block correct and fast:
 * the ladder prefills it, the book tells it whether its price is real, the feed keeps
 * that book honest.
 *
 * The ticket holds *intent*, not an order. Nothing here talks to a venue — F15.x builds
 * the submit path on top of this state. Keeping them separate is what makes the ticket
 * testable without a network and what stops a rendering bug from sending anything.
 */

/** Order sides. */
export const SIDES = Object.freeze(['buy', 'sell'])

/** How the ticket prices an order. */
export const MODES = Object.freeze(['market', 'bid', 'ask', 'limit'])

/** A quote older than this cannot be priced off. */
export const QUOTE_STALE_MS = 1500

/**
 * The ticket's default state.
 *
 * @param {{symbol?: string, size?: number, mode?: string}} [seed] - boot values.
 * @returns {Record<string, unknown>} state paths to values.
 */
export function buildTicketState(seed = {}) {
  const mode = MODES.includes(seed.mode) ? seed.mode : 'market'

  return {
    [PATHS.trade.ticketSymbol]: String(seed.symbol ?? ''),
    [PATHS.trade.ticketSide]: 'buy',
    [PATHS.trade.ticketSize]: Number(seed.size) || 0,
    [PATHS.trade.ticketMode]: mode,
    [PATHS.trade.ticketPrice]: 0,
    [PATHS.trade.ticketLimit]: 0,
    [PATHS.trade.ticketFlash]: 0,
  }
}

/**
 * The price an order would go out at.
 *
 * @param {{mode: string, side: string, limit?: number}} ticket - the ticket.
 * @param {{bid?: number, ask?: number, ts?: number}} quote - top of book.
 * @param {{now?: number, staleMs?: number}} [context] - staleness check.
 * @returns {{price: number, source: string, stale: boolean}} the resolved price.
 */
export function resolvePrice(ticket, quote, context = {}) {
  const { now = 0, staleMs = QUOTE_STALE_MS } = context
  const bid = Number(quote?.bid) || 0
  const ask = Number(quote?.ask) || 0
  const age = Number(now) - Number(quote?.ts ?? 0)
  const stale = Number(quote?.ts) > 0 && Number.isFinite(age) && age > staleMs

  const mode = MODES.includes(ticket?.mode) ? ticket.mode : 'market'

  if (mode === 'limit') {
    const limit = Number(ticket?.limit)
    // A limit of zero is an unfilled field, not an instruction to trade at zero.
    if (Number.isFinite(limit) && limit > 0) return { price: limit, source: 'limit', stale }
  }

  // A stale quote cannot be joined — the bid it names may be long gone. Market is the
  // honest fallback: it says "whatever it costs now" rather than naming a dead price.
  if (!stale && mode === 'bid' && bid > 0) return { price: bid, source: 'bid', stale }
  if (!stale && mode === 'ask' && ask > 0) return { price: ask, source: 'ask', stale }

  const side = ticket?.side === 'sell' ? 'sell' : 'buy'
  // Market crosses: a buy takes the offer, a sell hits the bid.
  const marketPrice = side === 'buy' ? ask : bid

  return { price: marketPrice, source: 'market', stale }
}

/**
 * Whether the ticket can be sent right now.
 *
 * @param {{size?: number, symbol?: string}} ticket - the ticket.
 * @param {{price?: number}} resolved - the resolved price.
 * @param {{bookStatus?: string, armed?: boolean}} [desk] - desk state.
 * @returns {{ok: boolean, reason: string}} the verdict.
 */
export function canSubmit(ticket, resolved, desk = {}) {
  if (!String(ticket?.symbol ?? '')) return { ok: false, reason: 'no instrument' }
  if (!(Number(ticket?.size) > 0)) return { ok: false, reason: 'no size' }
  if (!(Number(resolved?.price) > 0)) return { ok: false, reason: 'no price' }
  // The book guard is not a nicety: a price read off a stale ladder is a price that may
  // not exist, and the order would be a market order in disguise.
  if (!canTradeBook(desk.bookStatus)) return { ok: false, reason: 'book not live' }

  return { ok: true, reason: '' }
}

/**
 * Publish the resolved price so the ticket shows what it would send.
 *
 * @param {{now?: number}} [context] - the clock.
 * @returns {object} the resolved price now in state.
 */
export function refreshTicketPrice(context = {}) {
  const ticket = {
    mode: appState.trade?.ticketMode,
    side: appState.trade?.ticketSide,
    limit: appState.trade?.ticketLimit,
  }
  const resolved = resolvePrice(
    ticket,
    { bid: appState.market?.bid, ask: appState.market?.ask, ts: appState.market?.quoteTs },
    context,
  )

  setValue(PATHS.trade.ticketPrice, resolved.price)
  setValue(PATHS.trade.ticketSource, resolved.source)

  return resolved
}
