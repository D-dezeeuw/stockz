import { TRANSITIONS, TERMINAL } from '../ticket/lifecycle.js'
import { splitSymbol } from '../lists/ops.js'

/**
 * The execution vocabulary.
 *
 * Phase 15 built a fast path from the ticket to OKX. This is the layer underneath it:
 * one order shape every venue, hotkey and (later) strategy speaks, so venue quirks live
 * in an adapter rather than leaking into the UI.
 *
 * The state table is deliberately *imported* from the order lifecycle rather than
 * redeclared. Two transition tables would drift, and the moment they disagreed the desk
 * would show one status while acting on another.
 */

/** Time-in-force values the desk uses. */
export const TIF = Object.freeze(['gtc', 'ioc', 'fok', 'post_only'])

/** Order kinds. */
export const ORDER_TYPES = Object.freeze(['market', 'limit'])

/**
 * Build a normalised order intent.
 *
 * @param {{venue?: string, symbol?: string, side?: string, size?: number, price?: number,
 *   type?: string, tif?: string, reduceOnly?: boolean, clientId?: string}} input - what
 *   the caller wants.
 * @returns {{ok: boolean, intent: object|null, reason: string}} the validated intent.
 */
export function makeIntent(input = {}) {
  const qualified = String(input.symbol ?? '')
  const { venue: fromSymbol, symbol } = splitSymbol(qualified)
  const instrument = symbol || qualified
  const venue = String(input.venue ?? fromSymbol ?? 'okx').toLowerCase() || 'okx'

  if (!instrument) return { ok: false, intent: null, reason: 'no instrument' }

  const size = Number(input.size)
  if (!Number.isFinite(size) || size <= 0) return { ok: false, intent: null, reason: 'no size' }

  const type = ORDER_TYPES.includes(input.type) ? input.type : 'limit'
  const price = Number(input.price)
  // A limit with no price is the one combination that cannot be repaired by a default:
  // guessing a price is how an order lands somewhere nobody chose.
  if (type === 'limit' && (!Number.isFinite(price) || price <= 0)) {
    return { ok: false, intent: null, reason: 'limit needs a price' }
  }

  return {
    ok: true,
    reason: '',
    intent: {
      venue,
      instrument,
      side: input.side === 'sell' ? 'sell' : 'buy',
      size,
      price: type === 'limit' ? price : 0,
      type,
      // A market order cannot rest, so gtc on one is meaningless; ioc is what it means.
      tif: TIF.includes(input.tif) ? input.tif : type === 'market' ? 'ioc' : 'gtc',
      reduceOnly: input.reduceOnly === true,
      clientId: String(input.clientId ?? ''),
    },
  }
}

/**
 * Advance an order's state, refusing impossible transitions.
 *
 * @param {string} state - the current state.
 * @param {string} event - the state the venue reports.
 * @returns {{state: string, changed: boolean}} the resulting state.
 */
export function advanceOrderState(state, event) {
  const current = TRANSITIONS[state] ? state : 'pending'
  const next = String(event ?? '')

  if (!TRANSITIONS[current].includes(next)) return { state: current, changed: false }
  return { state: next, changed: true }
}

/** Reject reasons the desk understands, whatever the venue called them. */
export const REJECT_REASONS = Object.freeze([
  'insufficient_funds',
  'invalid_price',
  'invalid_size',
  'rate_limited',
  'not_authenticated',
  'market_closed',
  'would_cross',
  'unknown',
])

/** OKX sCode values worth naming. Everything else is 'unknown', honestly. */
const OKX_CODES = Object.freeze({
  51008: 'insufficient_funds',
  51004: 'insufficient_funds',
  51006: 'invalid_price',
  51020: 'invalid_size',
  51121: 'invalid_size',
  50011: 'rate_limited',
  50113: 'not_authenticated',
  51001: 'unknown',
  51400: 'would_cross',
})

/**
 * Normalise a venue rejection into one readable reason.
 *
 * @param {object} error - the venue's error payload.
 * @returns {{reason: string, message: string, raw: object}} the normalised rejection.
 */
export function normalizeReject(error) {
  const code = String(error?.sCode ?? error?.code ?? '')
  const message = String(error?.sMsg ?? error?.msg ?? error?.message ?? '')

  let reason = OKX_CODES[code] ?? ''
  if (!reason) {
    // EToro answers in prose rather than codes, so the message is all there is to read.
    const text = message.toLowerCase()
    if (text.includes('insufficient') || text.includes('balance')) reason = 'insufficient_funds'
    else if (text.includes('price')) reason = 'invalid_price'
    else if (text.includes('size') || text.includes('units')) reason = 'invalid_size'
    else if (text.includes('rate') || text.includes('too many')) reason = 'rate_limited'
    else if (text.includes('auth') || text.includes('credential')) reason = 'not_authenticated'
    else if (text.includes('closed') || text.includes('market hours')) reason = 'market_closed'
    else reason = 'unknown'
  }

  return {
    reason: REJECT_REASONS.includes(reason) ? reason : 'unknown',
    // The venue's own words are kept alongside: the enum is for logic, the message is
    // for the human deciding whether to try again.
    message: message || 'rejected',
    raw: error ?? null,
  }
}

/**
 * Whether an order is finished.
 *
 * @param {string} state - the order state.
 * @returns {boolean} true when nothing more will happen.
 */
export function isSettled(state) {
  return TERMINAL.includes(String(state ?? ''))
}

/**
 * Snap a size and price onto the venue's grid.
 *
 * An off-grid value is rejected outright by every venue, which costs a full round trip to
 * learn something the desk already knew. Rounding here, once, in the shape every adapter
 * shares, is cheaper than each adapter remembering to.
 *
 * @param {{size?: number, price?: number}} values - the raw values.
 * @param {{lotSize?: number, tickSize?: number}} grid - the instrument's increments.
 * @returns {{size: number, price: number}} the snapped values.
 */
export function roundToLotTick(values, grid = {}) {
  const lot = Number(grid.lotSize)
  const tick = Number(grid.tickSize)

  const rawSize = Number(values?.size)
  const rawPrice = Number(values?.price)

  // Size rounds *down*: rounding a size up can exceed a limit that was just checked, and
  // the trader asked for "at most this".
  const size =
    Number.isFinite(rawSize) && rawSize > 0
      ? Number.isFinite(lot) && lot > 0
        ? Number((Math.floor(rawSize / lot) * lot).toFixed(10))
        : rawSize
      : 0

  // Price rounds to *nearest*: a price is a target, and moving it a whole tick in one
  // direction every time would systematically place worse than asked.
  const price =
    Number.isFinite(rawPrice) && rawPrice > 0
      ? Number.isFinite(tick) && tick > 0
        ? Number((Math.round(rawPrice / tick) * tick).toFixed(10))
        : rawPrice
      : 0

  return { size, price }
}
