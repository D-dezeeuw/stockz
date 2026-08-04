import { describe, it, expect } from 'vitest'
import { CRYPTO, EQUITIES, UNIVERSE, universeSymbols, instrumentName } from './universe.js'

describe('universeSymbols', () => {
  it('lists forty distinct OKX USDT pairs, crypto first', () => {
    const symbols = universeSymbols()

    expect(CRYPTO).toHaveLength(20)
    expect(EQUITIES).toHaveLength(20)
    expect(symbols).toHaveLength(40)
    expect(symbols[0]).toBe('BTC-USDT')

    // A duplicate would render twice and be watched twice.
    expect(new Set(symbols).size).toBe(40)

    // Everything is a USDT spot pair on one venue: the tokenized equities go down exactly
    // the same client, quote feed and order path as the crypto.
    for (const symbol of symbols) expect(symbol.endsWith('-USDT')).toBe(true)

    expect(UNIVERSE.map((l) => l.id)).toEqual(['crypto', 'equities'])
    expect(Object.isFrozen(UNIVERSE)).toBe(true)
  })
})

describe('instrumentName', () => {
  it('names an instrument from either list and stays quiet about strangers', () => {
    expect(instrumentName('BTC-USDT')).toBe('Bitcoin')

    // The whole reason names are carried: nobody reads XMU as Micron.
    expect(instrumentName('XMU-USDT')).toBe('Micron')
    expect(instrumentName('XNVDA-USDT')).toBe('Nvidia')

    // The X prefix marks a tokenized equity, but XRP and XLM are ordinary crypto that
    // happen to start with one — they must not be mistaken for tickers.
    expect(instrumentName('XRP-USDT')).toBe('XRP')

    expect(instrumentName('NOTREAL-USDT')).toBe('')
    expect(instrumentName('')).toBe('')
    expect(instrumentName(null)).toBe('')
  })
})
