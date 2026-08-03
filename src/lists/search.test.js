import { describe, it, expect } from 'vitest'
import { fuzzyScore, searchInstruments } from './search.js'

const CATALOGUE = [
  { symbol: 'BTC-USDT', venue: 'okx' },
  { symbol: 'ETH-USDT', venue: 'okx' },
  { symbol: 'BTC-USDC', venue: 'okx' },
  { symbol: 'AAPL', venue: 'etoro' },
]

describe('fuzzyScore', () => {
  it('ranks exact over prefix over subsequence, and rejects a non-match', () => {
    expect(fuzzyScore('BTC-USDT', 'BTC-USDT')).toBe(1000)
    expect(fuzzyScore('BTC-USDT', 'btc')).toBeGreaterThan(400)

    // Subsequence matching is what makes three fast letters find the right instrument.
    expect(fuzzyScore('BTC-USDT', 'btu')).toBeGreaterThan(0)
    expect(fuzzyScore('BTC-USDT', 'bcd')).toBeGreaterThan(0)
    expect(fuzzyScore('BTC-USDT', 'xyz')).toBe(0)

    expect(fuzzyScore('BTC-USDT', '')).toBe(1)
    expect(fuzzyScore('', 'btc')).toBe(0)
  })
})

describe('searchInstruments', () => {
  it('puts what the trader meant first and qualifies every result', () => {
    const results = searchInstruments(CATALOGUE, 'btc')

    expect(results[0].symbol).toMatch(/^BTC/)
    expect(results[0].id).toBe('okx:BTC-USDC')
    expect(results.every((r) => r.id.includes(':'))).toBe(true)

    // Cross-venue search works from one box.
    expect(searchInstruments(CATALOGUE, 'aapl')[0].venue).toBe('etoro')

    expect(searchInstruments(CATALOGUE, 'zzz')).toEqual([])
    expect(searchInstruments(CATALOGUE, 'b', 1)).toHaveLength(1)
    expect(searchInstruments(null, 'b')).toEqual([])
  })
})
