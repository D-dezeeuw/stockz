import { describe, it, expect } from 'vitest'
import {
  TICKERS_PATH,
  QUOTE,
  NOT_TRADEABLE,
  mapTicker,
  rankBlueChips,
  fetchTickers,
} from './tickers.js'
import { okxPublicBase } from './region.js'

/** One raw OKX ticker row. */
const row = (instId, last, open24h, volCcy24h) => ({ instId, last, open24h, volCcy24h })

describe('mapTicker', () => {
  it('normalises a row and computes the move, refusing anything unpriced', () => {
    expect(mapTicker(row('BTC-USDT', '60000', '50000', '900'))).toEqual({
      symbol: 'BTC-USDT',
      last: 60000,
      open: 50000,
      changePct: 20,
      volume: 900,
    })

    // No open means no move to report, rather than a division by zero.
    expect(mapTicker(row('ETH-USDT', '2000', '0', '10')).changePct).toBe(0)
    expect(mapTicker(row('ETH-USDT', '2000', 'nonsense', 'nope'))).toMatchObject({
      open: 0,
      changePct: 0,
      volume: 0,
    })

    // A row with no usable price is not a quote.
    expect(mapTicker(row('X-USDT', '0', '1', '1'))).toBeNull()
    expect(mapTicker(row('', '1', '1', '1'))).toBeNull()
    expect(mapTicker(null)).toBeNull()
  })
})

describe('rankBlueChips', () => {
  it('ranks by quote-currency volume and drops what cannot be scalped', () => {
    const ranked = rankBlueChips(
      [
        row('USDC-USDT', '1', '1', '9999999'), // biggest book on the venue, moves nothing
        row('BTC-USDT', '60000', '59000', '500'),
        row('ETH-USDT', '2000', '1900', '900'),
        row('ETH-BTC', '0.03', '0.03', '8000'), // volume denominated in BTC, not comparable
        row('SOL-USDT', '150', '140', '100'),
      ],
      2,
    )

    expect(ranked.map((r) => r.symbol)).toEqual(['ETH-USDT', 'BTC-USDT'])

    // A stablecoin pair tops every volume table and is not a trade; ranking across quote
    // currencies compares numbers that are not comparable.
    expect(rankBlueChips([row('USDC-USDT', '1', '1', '9')], 8)).toEqual([])
    expect(rankBlueChips([row('ETH-BTC', '1', '1', '9')], 8)).toEqual([])

    expect(rankBlueChips([], 8)).toEqual([])
    expect(rankBlueChips(null)).toEqual([])
    // A nonsense limit still returns a usable list rather than nothing.
    expect(rankBlueChips([row('BTC-USDT', '1', '1', '9')], 0)).toHaveLength(1)
    expect(QUOTE).toBe('USDT')
    expect(NOT_TRADEABLE).toContain('USDC')
  })
})

describe('fetchTickers', () => {
  it('reads the public endpoint and never throws, so the desk opens regardless', async () => {
    const calls = []
    const ok = await fetchTickers({
      fetch: async (url) => {
        calls.push(url)
        return { json: async () => ({ code: '0', data: [row('BTC-USDT', '1', '1', '1')] }) }
      },
    })

    expect(ok).toEqual({ ok: true, rows: [row('BTC-USDT', '1', '1', '1')] })
    // Unsigned and public: this is what lets the watchlist quote itself before any key
    // has been entered. Always the global host — the shared global book, and the only
    // OKX that answers browsers.
    expect(calls[0]).toBe(`${okxPublicBase()}${TICKERS_PATH}`)

    const refused = await fetchTickers({
      fetch: async () => ({ json: async () => ({ code: '1', msg: 'nope' }) }),
    })
    expect(refused).toEqual({ ok: false, error: 'nope' })

    // A dead network is a result, not an exception: the watchlist keeps what it has.
    const dead = await fetchTickers({
      fetch: async () => {
        throw new Error('offline')
      },
    })
    expect(dead).toEqual({ ok: false, error: 'offline' })

    const empty = await fetchTickers({ fetch: async () => ({ json: async () => ({ code: '0' }) }) })
    expect(empty).toEqual({ ok: true, rows: [] })
  })
})
