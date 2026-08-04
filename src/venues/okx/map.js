/**
 * OKX payload → internal schema.
 *
 * Pure functions, one test each. Every venue oddity is absorbed here so nothing
 * downstream knows OKX exists: strings instead of numbers, millisecond epochs as strings,
 * `instId` instead of `symbol`, and `side: 'buy'` meaning the *aggressor*, not the
 * trader's own side.
 *
 * Everything numeric is coerced with `toNum`, because OKX sends `""` for an absent price
 * and `NaN` leaking into a PnL calculation is far worse than a zero.
 */

/**
 * Coerce a venue string to a number.
 *
 * @param {unknown} value - raw field.
 * @param {number} [fallback] - value when unparseable.
 * @returns {number} the number.
 */
export function toNum(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

/**
 * Map an OKX `tickers` entry to an internal tick.
 *
 * @param {object} raw - OKX ticker payload.
 * @returns {object|null} internal tick, or null without an instrument.
 */
export function mapTicker(raw) {
  const symbol = String(raw?.instId ?? '')
  if (!symbol) return null

  return {
    venue: 'okx',
    symbol,
    ts: toNum(raw.ts),
    last: toNum(raw.last),
    bid: toNum(raw.bidPx),
    ask: toNum(raw.askPx),
    bidSize: toNum(raw.bidSz),
    askSize: toNum(raw.askSz),
    open24h: toNum(raw.open24h),
    vol24h: toNum(raw.vol24h),
  }
}

/**
 * Map an OKX `trades` entry to an internal trade print.
 *
 * `side` is the aggressor: 'buy' means someone lifted the offer. The tape colours by this,
 * so getting it backwards inverts the read of who is in control.
 *
 * @param {object} raw - OKX trade payload.
 * @returns {object|null} internal trade, or null without an instrument.
 */
export function mapTrade(raw) {
  const symbol = String(raw?.instId ?? '')
  if (!symbol) return null

  return {
    venue: 'okx',
    symbol,
    ts: toNum(raw.ts),
    px: toNum(raw.px),
    sz: toNum(raw.sz),
    side: raw.side === 'sell' ? 'sell' : 'buy',
    tradeId: String(raw.tradeId ?? ''),
  }
}

/**
 * Map an OKX book snapshot or delta.
 *
 * @param {object} raw - OKX books payload.
 * @param {string} [symbol] - instrument, when the payload omits it (deltas do).
 * @returns {object} internal book update.
 */
export function mapBook(raw, symbol = '') {
  const levels = (side) =>
    (Array.isArray(raw?.[side]) ? raw[side] : [])
      .map((level) => [toNum(level?.[0]), toNum(level?.[1])])
      .filter(([px]) => px > 0)

  return {
    venue: 'okx',
    symbol: String(raw?.instId ?? symbol),
    ts: toNum(raw?.ts),
    bids: levels('bids'),
    asks: levels('asks'),
    checksum: toNum(raw?.checksum, NaN),
  }
}

/**
 * Map an OKX order to the internal order shape.
 *
 * @param {object} raw - OKX order payload.
 * @returns {object|null} internal order, or null without an id.
 */
export function mapOrder(raw) {
  const id = String(raw?.ordId ?? '')
  if (!id) return null

  return {
    id,
    clientId: String(raw.clOrdId ?? ''),
    venue: 'okx',
    symbol: String(raw.instId ?? ''),
    side: raw.side === 'sell' ? 'sell' : 'buy',
    type: String(raw.ordType ?? 'limit'),
    px: toNum(raw.px),
    sz: toNum(raw.sz),
    filled: toNum(raw.accFillSz),
    state: mapOrderState(raw.state),
    ts: toNum(raw.uTime ?? raw.cTime),
  }
}

/**
 * Normalise OKX order states onto the desk's four.
 *
 * @param {string} state - OKX state.
 * @returns {string} 'pending' | 'live' | 'filled' | 'cancelled' | 'rejected'.
 */
export function mapOrderState(state) {
  switch (String(state ?? '')) {
    case 'live':
    case 'partially_filled':
      return 'live'
    case 'filled':
      return 'filled'
    case 'canceled':
    case 'cancelled':
      return 'cancelled'
    case 'failed':
    case 'rejected':
      return 'rejected'
    default:
      return 'pending'
  }
}

/**
 * Map an OKX position.
 *
 * @param {object} raw - OKX position payload.
 * @returns {object|null} internal position, or null without an instrument.
 */
export function mapPosition(raw) {
  const symbol = String(raw?.instId ?? '')
  if (!symbol) return null

  const size = toNum(raw.pos)
  return {
    venue: 'okx',
    symbol,
    // OKX signs the size rather than naming a side; the desk wants both.
    side: size < 0 ? 'short' : 'long',
    sz: Math.abs(size),
    avgPx: toNum(raw.avgPx),
    uPnl: toNum(raw.upl),
    rPnl: toNum(raw.realizedPnl),
    fees: toNum(raw.fee),
  }
}

/**
 * Turn an OKX error code into something a trader can act on.
 *
 * @param {object} raw - OKX error payload (`code`, `msg`).
 * @returns {string} human-facing message.
 */
export function mapError(raw) {
  const code = String(raw?.code ?? '')
  const msg = String(raw?.msg ?? '').trim()

  const known = {
    '50011': 'Rate limited by OKX — slow down',
    '50013': 'OKX is busy, retrying',
    // The 401 family. Every one of these arrives as the same bare HTTP 401, and without
    // naming them the trader sees an unauthorised request and reasonably concludes the key
    // is wrong — when four of the five are something else entirely.
    '50102': 'OKX rejected the timestamp — this machine’s clock is off',
    '50103': 'OKX request header OK-ACCESS-KEY is missing',
    '50104': 'OKX request header OK-ACCESS-PASSPHRASE is missing',
    '50105': 'OKX request header OK-ACCESS-TIMESTAMP is missing',
    '50111': 'OKX rejected the API key — check it was copied whole',
    '50112': 'OKX rejected the timestamp — this machine’s clock is off',
    '50113': 'OKX rejected the signature — the secret key does not match the API key',
    '50114': 'OKX rejected the request — the key may be IP-restricted, or a demo key used live',
    '50115': 'OKX rejected the request method',
    '51008': 'Insufficient balance for this order',
    '51400': 'Order already cancelled',
    '60009': 'OKX login failed — check your keys',
    '60012': 'Invalid OKX request',
  }

  return known[code] ?? (msg || `OKX error ${code || 'unknown'}`)
}
