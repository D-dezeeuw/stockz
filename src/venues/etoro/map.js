import { toNum } from '../okx/map.js'

/**
 * EToro payload → internal schema.
 *
 * The contract is that these emit **exactly** the same shapes as the OKX mappers. Nothing
 * downstream may branch on venue: a position is a position, and the moment a block writes
 * `if (venue === 'etoro')` the desk has two of everything.
 *
 * EToro differs from OKX in ways that all get absorbed here: numeric instrument ids
 * instead of symbol strings, ISO date strings instead of epoch milliseconds, and
 * `isBuy: true/false` instead of a side string.
 */

/** EToro instrument ids are numbers; the desk speaks symbols. */
const SYMBOLS = new Map()

/**
 * Teach the mapper an instrument id → symbol pairing.
 *
 * @param {Array<{instrumentId: number|string, symbolFull?: string, symbol?: string}>} instruments
 * @returns {number} how many pairings are known.
 */
export function learnInstruments(instruments) {
  for (const item of Array.isArray(instruments) ? instruments : []) {
    const id = String(item?.instrumentId ?? '')
    const symbol = String(item?.symbolFull ?? item?.symbol ?? '')
    if (id && symbol) SYMBOLS.set(id, symbol)
  }
  return SYMBOLS.size
}

/**
 * The symbol for an instrument id.
 *
 * @param {number|string} id - EToro instrument id.
 * @returns {string} the symbol, or a stable `etoro:<id>` placeholder.
 */
export function symbolFor(id) {
  const key = String(id ?? '')
  if (!key) return ''
  // A placeholder rather than an empty string: an unknown instrument should still be
  // traceable in the journal, not silently anonymous.
  return SYMBOLS.get(key) ?? `etoro:${key}`
}

/** Forget learned instruments (tests, and a venue reconnect). */
export function resetInstruments() {
  SYMBOLS.clear()
}

/**
 * Parse an EToro date string into epoch milliseconds.
 *
 * @param {string} value - ISO-ish date.
 * @returns {number} epoch ms, or 0 when unparseable.
 */
export function toEpoch(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0

  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Map an EToro quote to the internal tick shape.
 *
 * @param {object} raw - EToro quote payload.
 * @returns {object|null} internal tick, or null without an instrument.
 */
export function mapQuote(raw) {
  const symbol = symbolFor(raw?.instrumentId)
  if (!symbol) return null

  const bid = toNum(raw.bid)
  const ask = toNum(raw.ask)

  return {
    venue: 'etoro',
    symbol,
    ts: toEpoch(raw.date ?? raw.lastUpdate),
    // EToro quotes carry no explicit last price; mid is the honest stand-in, and saying
    // so here beats every block inventing its own fallback.
    last: bid > 0 && ask > 0 ? (bid + ask) / 2 : bid || ask,
    bid,
    ask,
    bidSize: toNum(raw.bidSize),
    askSize: toNum(raw.askSize),
    open24h: toNum(raw.previousClose),
    vol24h: toNum(raw.volume),
  }
}

/**
 * Map an EToro position to the internal position shape.
 *
 * @param {object} raw - EToro position payload.
 * @returns {object|null} internal position, or null without an instrument.
 */
export function mapPosition(raw) {
  const symbol = symbolFor(raw?.instrumentId)
  if (!symbol) return null

  return {
    venue: 'etoro',
    symbol,
    // isBuy is a boolean here; the desk wants the same 'long'/'short' words as OKX.
    side: raw?.isBuy === false ? 'short' : 'long',
    sz: Math.abs(toNum(raw.amount ?? raw.units)),
    avgPx: toNum(raw.openRate),
    uPnl: toNum(raw.profit),
    rPnl: toNum(raw.realizedProfit),
    fees: toNum(raw.totalFees),
  }
}

/**
 * Map an EToro order to the internal order shape.
 *
 * @param {object} raw - EToro order payload.
 * @returns {object|null} internal order, or null without an id.
 */
export function mapOrder(raw) {
  const id = String(raw?.orderId ?? raw?.positionId ?? '')
  if (!id) return null

  return {
    id,
    clientId: String(raw.clientRequestId ?? ''),
    venue: 'etoro',
    symbol: symbolFor(raw.instrumentId),
    side: raw?.isBuy === false ? 'sell' : 'buy',
    type: raw?.rate ? 'limit' : 'market',
    px: toNum(raw.rate),
    sz: toNum(raw.amount ?? raw.units),
    filled: toNum(raw.filledAmount),
    state: mapOrderState(raw.status ?? raw.orderStatus),
    ts: toEpoch(raw.openDateTime ?? raw.createdDate),
  }
}

/**
 * Normalise EToro order statuses onto the desk's set.
 *
 * @param {string} status - EToro status.
 * @returns {string} 'pending' | 'live' | 'filled' | 'cancelled' | 'rejected'.
 */
export function mapOrderState(status) {
  switch (String(status ?? '').toLowerCase()) {
    case 'open':
    case 'pendingexecution':
      return 'live'
    case 'executed':
    case 'filled':
      return 'filled'
    case 'cancelled':
    case 'canceled':
      return 'cancelled'
    case 'rejected':
    case 'failed':
      return 'rejected'
    default:
      return 'pending'
  }
}

/**
 * Turn an EToro error body into something a trader can act on.
 *
 * @param {object} raw - error payload.
 * @returns {string} human-facing message.
 */
export function mapError(raw) {
  const status = Number(raw?.status ?? raw?.statusCode ?? 0)
  const message = String(raw?.message ?? raw?.error ?? '').trim()

  if (status === 401 || status === 403) return 'EToro rejected your keys'
  if (status === 429) return 'Rate limited by EToro — slow down'
  if (status >= 500) return 'EToro is having problems'

  return message || `EToro error ${status || 'unknown'}`
}
