import { describe, it, expect, beforeEach } from 'vitest'
import {
  MOCK_INSTRUMENTS,
  seededRandom,
  mockQuote,
  createMockFetch,
  primeMockInstruments,
} from './mock.js'
import { resetInstruments, symbolFor, mapQuote } from './map.js'
import { setKeys, clearKeys } from '../vault.js'
import { fetchQuotes, fetchInstruments, fetchPortfolio } from './rest.js'

beforeEach(() => {
  resetInstruments()
  clearKeys()
  setKeys('etoro', { apiKey: 'ak', userKey: 'uk' })
})

describe('seededRandom', () => {
  it('is deterministic, so a mocked session can be replayed exactly', () => {
    const a = seededRandom(42)
    const b = seededRandom(42)

    const first = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(first)
    expect(first.every((n) => n >= 0 && n <= 1)).toBe(true)

    // A different seed gives a different walk.
    const c = seededRandom(7)
    expect([c(), c(), c()]).not.toEqual(first)
    expect(seededRandom(NaN)()).toBeTypeOf('number')
  })
})

describe('mockQuote', () => {
  it('produces a venue-shaped quote with a real spread and a moving mid', () => {
    const flat = mockQuote(1001, 0, 0)
    expect(Number(flat.bid)).toBeLessThan(Number(flat.ask))
    expect(Number(flat.bid)).toBeCloseTo(190.2 - 0.019, 1)

    // Drift actually moves the price — a frozen mock teaches nothing about a UI whose
    // job is displaying change.
    const up = mockQuote(1001, 1, 0)
    expect(Number(up.bid)).toBeGreaterThan(Number(flat.bid))

    // An unknown instrument still yields a usable quote.
    expect(Number(mockQuote(9999, 0, 0).bid)).toBeGreaterThan(0)
  })
})

describe('createMockFetch', () => {
  it('answers every endpoint the desk calls, through the real mappers', async () => {
    const fetch = createMockFetch({ seed: 42, now: () => 1785765909000 })

    expect(await fetchInstruments({ fetch })).toEqual({ ok: true, count: 3 })
    expect(symbolFor(1001)).toBe('AAPL')

    const quotes = await fetchQuotes([1001, 1002], { fetch })
    expect(quotes.ticks).toHaveLength(2)
    expect(quotes.ticks[0]).toMatchObject({ venue: 'etoro', symbol: 'AAPL' })
    expect(quotes.ticks[0].ask).toBeGreaterThan(quotes.ticks[0].bid)

    const portfolio = await fetchPortfolio({ fetch })
    expect(portfolio.positions[0]).toMatchObject({ symbol: 'AAPL', side: 'long', sz: 10 })

    // Anything not mocked fails loudly rather than returning empty success.
    const missing = await fetch('https://api.etoro.com/nope')
    expect(missing.ok).toBe(false)
  })
})

describe('primeMockInstruments', () => {
  it('teaches the catalogue without a fetch, for tests that skip the network', () => {
    expect(primeMockInstruments()).toBe(MOCK_INSTRUMENTS.length)
    expect(mapQuote({ instrumentId: 1003, bid: '1', ask: '2' }).symbol).toBe('NVDA')
  })
})
