/**
 * Every OKX REST path the desk calls, in one place.
 *
 * These strings are load-bearing twice over: OKX *signs the path*, so the string sent to
 * the venue must be byte-identical to the one hashed — and the rate-limit budget is kept
 * per endpoint, so the tracker's keys must be the same strings the requests use. Scattered
 * copies invite the drift where a signature, a budget entry and a request each name the
 * same endpoint slightly differently and two of the three silently stop applying.
 *
 * Paths only — no hosts, no prefixes. Where a request *goes* is `region.js`'s question
 * (per-platform proxy prefixes) and stays orthogonal to what is being asked for.
 */
export const OKX_ENDPOINTS = Object.freeze({
  /** Authenticated, cheap, side-effect free — the key preflight's "do you know me". */
  config: '/api/v5/account/config',
  balance: '/api/v5/account/balance',
  positions: '/api/v5/account/positions',
  order: '/api/v5/trade/order',
  cancelOrder: '/api/v5/trade/cancel-order',
  ordersPending: '/api/v5/trade/orders-pending',
  instruments: '/api/v5/public/instruments',
  /** Unauthenticated NTP on both platforms — the boot clock sync. */
  time: '/api/v5/public/time',
  /** The instrument universe; callers append their instType query. */
  tickers: '/api/v5/market/tickers',
})
