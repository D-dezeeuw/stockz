import { describe, it, expect } from 'vitest'
import {
  toNum,
  mapTicker,
  mapTrade,
  mapBook,
  mapOrder,
  mapOrderState,
  mapPosition,
  mapError,
} from './map.js'

describe('toNum', () => {
  it('coerces venue strings and never lets NaN through', () => {
    expect(toNum('27384.5')).toBe(27384.5)
    expect(toNum(12)).toBe(12)

    // OKX sends '' for an absent price; NaN in a PnL calculation is worse than zero.
    expect(toNum('')).toBe(0)
    expect(toNum(null)).toBe(0)
    expect(toNum(undefined)).toBe(0)
    expect(toNum('abc')).toBe(0)
    expect(toNum('abc', 1)).toBe(1)
  })
})

describe('mapTicker', () => {
  it('turns an OKX ticker into an internal tick', () => {
    expect(
      mapTicker({
        instId: 'BTC-USDT',
        ts: '1785765909000',
        last: '27384.5',
        bidPx: '27384.0',
        askPx: '27385.0',
        bidSz: '1.5',
        askSz: '',
        open24h: '27000',
        vol24h: '1234',
      }),
    ).toEqual({
      venue: 'okx',
      symbol: 'BTC-USDT',
      ts: 1785765909000,
      last: 27384.5,
      bid: 27384,
      ask: 27385,
      bidSize: 1.5,
      askSize: 0,
      open24h: 27000,
      vol24h: 1234,
    })

    expect(mapTicker({})).toBeNull()
    expect(mapTicker(null)).toBeNull()
  })
})

describe('mapTrade', () => {
  it('keeps the aggressor side, which is what the tape colours by', () => {
    const trade = mapTrade({
      instId: 'BTC-USDT',
      ts: '1785765909000',
      px: '27384.5',
      sz: '0.01',
      side: 'sell',
      tradeId: '99',
    })

    expect(trade).toMatchObject({ symbol: 'BTC-USDT', px: 27384.5, sz: 0.01, side: 'sell' })

    // Anything that is not an explicit sell reads as a buy — getting this backwards
    // inverts the read of who is in control.
    expect(mapTrade({ instId: 'X', side: 'buy' }).side).toBe('buy')
    expect(mapTrade({ instId: 'X', side: undefined }).side).toBe('buy')
    expect(mapTrade({})).toBeNull()
  })
})

describe('mapBook', () => {
  it('numbers the levels, drops empty ones and keeps the checksum', () => {
    const book = mapBook({
      instId: 'BTC-USDT',
      ts: '1785765909000',
      bids: [['27384.0', '1.5'], ['', '2']],
      asks: [['27385.0', '0.5']],
      checksum: '-1234567',
    })

    expect(book.bids).toEqual([[27384, 1.5]])
    expect(book.asks).toEqual([[27385, 0.5]])
    expect(book.checksum).toBe(-1234567)

    // Deltas omit instId, so the caller supplies it.
    expect(mapBook({ bids: [] }, 'ETH-USDT').symbol).toBe('ETH-USDT')
    expect(mapBook(null).bids).toEqual([])
    expect(Number.isNaN(mapBook({}).checksum)).toBe(true)
  })
})

describe('mapOrderState', () => {
  it('collapses OKX states onto the four the desk renders', () => {
    expect(mapOrderState('live')).toBe('live')
    expect(mapOrderState('partially_filled')).toBe('live')
    expect(mapOrderState('filled')).toBe('filled')
    expect(mapOrderState('canceled')).toBe('cancelled')
    expect(mapOrderState('failed')).toBe('rejected')
    expect(mapOrderState('anything else')).toBe('pending')
  })
})

describe('mapOrder', () => {
  it('maps an order and keeps the client id used to dedupe on reconnect', () => {
    const order = mapOrder({
      ordId: '123',
      clOrdId: 'stockz-1',
      instId: 'BTC-USDT',
      side: 'buy',
      ordType: 'ioc',
      px: '27384',
      sz: '0.01',
      accFillSz: '0.004',
      state: 'partially_filled',
      uTime: '1785765909000',
    })

    expect(order).toMatchObject({
      id: '123',
      clientId: 'stockz-1',
      type: 'ioc',
      filled: 0.004,
      state: 'live',
    })

    expect(mapOrder({ cTime: '1', ordId: '1' }).ts).toBe(1)
    expect(mapOrder({})).toBeNull()
  })
})

describe('mapPosition', () => {
  it('turns a signed size into an explicit side plus magnitude', () => {
    expect(mapPosition({ instId: 'BTC-USDT', pos: '-0.5', avgPx: '27000', upl: '-12.5' }))
      .toMatchObject({ side: 'short', sz: 0.5, avgPx: 27000, uPnl: -12.5 })

    expect(mapPosition({ instId: 'BTC-USDT', pos: '0.5' }).side).toBe('long')
    expect(mapPosition({ instId: 'BTC-USDT', pos: '0' }).side).toBe('long')
    expect(mapPosition({})).toBeNull()
  })
})

describe('mapError', () => {
  it('translates venue codes into something a trader can act on', () => {
    expect(mapError({ code: '50011' })).toMatch(/Rate limited/)
    expect(mapError({ code: '51008' })).toMatch(/Insufficient balance/)
    expect(mapError({ code: '60009' })).toMatch(/check your keys/)

    // An unknown code keeps the venue's own words rather than swallowing them.
    expect(mapError({ code: '99999', msg: 'something odd' })).toBe('something odd')
    expect(mapError({ code: '99999' })).toBe('OKX error 99999')
    expect(mapError({})).toBe('OKX error unknown')
  })
})
