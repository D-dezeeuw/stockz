/**
 * The tradeable universe.
 *
 * Forty instruments the desk watches by default, fixed rather than discovered. Ranking a
 * watchlist by live volume sounds better than it is: the membership churns under the
 * trader between glances, and the top of an exchange's volume table is mostly stablecoin
 * pairs that do not move and week-old tokens nobody wants a bot trading. A list that is
 * the same every morning is one a person can learn.
 *
 * Everything here is an OKX spot pair quoted in USDT, verified to exist on the venue, and
 * ordered by real 24h traded volume at the time of writing. That matters for the second
 * half of the list: OKX lists tokenized equities and commodities under an `X` prefix, so
 * Nvidia, gold and the Nasdaq-100 are reachable through exactly the same client, quote
 * feed and order path as Bitcoin — no second venue, no separate integration, and they
 * trade around the clock rather than only when New York is open.
 *
 * Beware the prefix: `XRP`, `XLM` and `XTZ` are ordinary cryptocurrencies that happen to
 * begin with X. The tokenized equities are `X` + the underlying ticker.
 */

/** Crypto majors, by OKX 24h volume. */
export const CRYPTO = Object.freeze([
  { symbol: 'BTC-USDT', name: 'Bitcoin' },
  { symbol: 'ETH-USDT', name: 'Ethereum' },
  { symbol: 'SOL-USDT', name: 'Solana' },
  { symbol: 'XRP-USDT', name: 'XRP' },
  { symbol: 'ADA-USDT', name: 'Cardano' },
  { symbol: 'HYPE-USDT', name: 'Hyperliquid' },
  { symbol: 'DOGE-USDT', name: 'Dogecoin' },
  { symbol: 'UNI-USDT', name: 'Uniswap' },
  { symbol: 'PEPE-USDT', name: 'Pepe' },
  { symbol: 'ETC-USDT', name: 'Ethereum Classic' },
  { symbol: 'ZEC-USDT', name: 'Zcash' },
  { symbol: 'WLD-USDT', name: 'Worldcoin' },
  { symbol: 'AVAX-USDT', name: 'Avalanche' },
  { symbol: 'SUI-USDT', name: 'Sui' },
  { symbol: 'BNB-USDT', name: 'BNB' },
  { symbol: 'TRX-USDT', name: 'Tron' },
  { symbol: 'NEAR-USDT', name: 'NEAR' },
  { symbol: 'SHIB-USDT', name: 'Shiba Inu' },
  { symbol: 'LINK-USDT', name: 'Chainlink' },
  { symbol: 'LTC-USDT', name: 'Litecoin' },
])

/** Tokenized equities, ETFs and commodities, by OKX 24h volume. */
export const EQUITIES = Object.freeze([
  { symbol: 'XMU-USDT', name: 'Micron' },
  { symbol: 'XSNDK-USDT', name: 'SanDisk' },
  { symbol: 'XAUT-USDT', name: 'Gold' },
  { symbol: 'XSOXL-USDT', name: 'Semiconductors 3x' },
  { symbol: 'XSKHY-USDT', name: 'SK Hynix' },
  { symbol: 'XCRCL-USDT', name: 'Circle' },
  { symbol: 'PAXG-USDT', name: 'PAX Gold' },
  { symbol: 'XINTC-USDT', name: 'Intel' },
  { symbol: 'XAMD-USDT', name: 'AMD' },
  { symbol: 'XMSTR-USDT', name: 'Strategy' },
  { symbol: 'XMRVL-USDT', name: 'Marvell' },
  { symbol: 'XGOOGL-USDT', name: 'Alphabet' },
  { symbol: 'XORCL-USDT', name: 'Oracle' },
  { symbol: 'XTSLA-USDT', name: 'Tesla' },
  { symbol: 'XNVDA-USDT', name: 'Nvidia' },
  { symbol: 'XAAPL-USDT', name: 'Apple' },
  { symbol: 'XQQQ-USDT', name: 'Nasdaq 100' },
  { symbol: 'XMETA-USDT', name: 'Meta' },
  { symbol: 'XMSFT-USDT', name: 'Microsoft' },
  { symbol: 'XTSM-USDT', name: 'TSMC' },
])

/** The two lists the desk ships with. */
export const UNIVERSE = Object.freeze([
  { id: 'crypto', name: 'Crypto 20', instruments: CRYPTO },
  { id: 'equities', name: 'Stocks 20', instruments: EQUITIES },
])

/**
 * Every symbol in the universe.
 *
 * @returns {string[]} bare OKX symbols, crypto first.
 */
export function universeSymbols() {
  return UNIVERSE.flatMap((list) => list.instruments.map((row) => row.symbol))
}

/**
 * The human name for a symbol.
 *
 * @param {string} symbol - a bare OKX symbol.
 * @returns {string} the instrument's name, or '' when it is not in the universe.
 */
export function instrumentName(symbol) {
  const wanted = String(symbol ?? '')
  for (const list of UNIVERSE) {
    const found = list.instruments.find((row) => row.symbol === wanted)
    if (found) return found.name
  }

  return ''
}
