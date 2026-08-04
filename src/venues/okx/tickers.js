import { OKX_REST_BASE } from './rest.js'
import { createLogger } from '../../utils/log.js'

/**
 * Public spot tickers — the desk's only unauthenticated market source.
 *
 * Everything else on this venue is signed, which means a desk with no keys yet shows a
 * screen full of blanks. This endpoint needs no credentials and returns *every* spot pair
 * in one call, so the watchlist can populate itself and quote itself before the trader has
 * typed anything.
 *
 * One call for all symbols rather than one per symbol: a watchlist of thirty rows must not
 * cost thirty requests, and the per-instrument stream is reserved for the one instrument
 * actually being traded.
 */

const log = createLogger('okx-tickers')

/** The public tickers endpoint. Unsigned — deliberately not routed through `okxRequest`. */
export const TICKERS_PATH = '/api/v5/market/tickers?instType=SPOT'

/**
 * What counts as a quote currency worth ranking.
 *
 * Ranking across quote currencies compares numbers that are not comparable — a pair quoted
 * in BTC has a volume denominated in BTC. Restricting to USDT makes "biggest" mean one
 * thing, and it is the deepest book on this venue besides.
 */
export const QUOTE = 'USDT'

/**
 * Stablecoins and wrapped dollars, which top every volume table and are not trades.
 *
 * A blue-chip list that opens with USDC-USDT is technically correct and useless: it is the
 * highest-volume pair on the venue and it moves half a basis point a day. A scalper needs
 * instruments that *move*.
 */
export const NOT_TRADEABLE = Object.freeze(['USDC', 'DAI', 'TUSD', 'FDUSD', 'USDD', 'PYUSD', 'EURT'])

/**
 * Normalise one raw ticker row.
 *
 * @param {object} row - an OKX ticker entry.
 * @returns {{symbol: string, last: number, open: number, changePct: number,
 *   volume: number}|null} the row, or null when unusable.
 */
export function mapTicker(row) {
  const symbol = String(row?.instId ?? '')
  const last = Number(row?.last)
  if (!symbol || !Number.isFinite(last) || last <= 0) return null

  const open = Number(row?.open24h)
  // `volCcy24h` is volume in the *quote* currency — dollars, here — which is the only
  // figure comparable across instruments. `vol24h` counts coins, so a cheap token looks
  // enormous next to BTC.
  const volume = Number(row?.volCcy24h)

  return {
    symbol,
    last,
    open: Number.isFinite(open) ? open : 0,
    changePct: Number.isFinite(open) && open > 0 ? ((last - open) / open) * 100 : 0,
    volume: Number.isFinite(volume) ? volume : 0,
  }
}

/**
 * The most-traded instruments worth scalping, biggest first.
 *
 * @param {object[]} rows - raw ticker rows.
 * @param {number} [limit] - how many to keep.
 * @returns {object[]} the ranked instruments.
 */
export function rankBlueChips(rows, limit = 8) {
  const list = Array.isArray(rows) ? rows : []
  const count = Math.max(1, Math.floor(Number(limit)) || 8)

  return list
    .map(mapTicker)
    .filter(Boolean)
    .filter((row) => {
      const [base, quote] = row.symbol.split('-')
      return quote === QUOTE && base && !NOT_TRADEABLE.includes(base)
    })
    .sort((a, b) => b.volume - a.volume)
    .slice(0, count)
}

/**
 * Fetch the public spot tickers.
 *
 * @param {{fetch?: Function}} [options] - injected fetch.
 * @returns {Promise<{ok: boolean, rows?: object[], error?: string}>} the outcome.
 */
export async function fetchTickers(options = {}) {
  const { fetch: fetchImpl = globalThis.fetch } = options

  try {
    const response = await fetchImpl(`${OKX_REST_BASE}${TICKERS_PATH}`)
    const parsed = await response.json()

    if (String(parsed?.code ?? '') !== '0') {
      return { ok: false, error: String(parsed?.msg ?? 'tickers unavailable') }
    }
    return { ok: true, rows: Array.isArray(parsed.data) ? parsed.data : [] }
  } catch (err) {
    // Never throws: the watchlist falls back to its seeded majors and the desk still opens.
    const message = err?.message ?? String(err)
    log.warn(`tickers unavailable: ${message}`)
    return { ok: false, error: message }
  }
}
