import { describe, it, expect, beforeEach } from 'vitest'
import {
  learnInstruments,
  symbolFor,
  resetInstruments,
  toEpoch,
  mapQuote,
  mapPosition,
  mapOrder,
  mapOrderState,
  mapError,
} from './map.js'
import { mapTicker } from '../okx/map.js'

beforeEach(() => {
  resetInstruments()
})

describe('learnInstruments', () => {
  it('learns id → symbol pairings from the venue catalogue', () => {
    expect(learnInstruments([{ instrumentId: 1001, symbolFull: 'AAPL' }])).toBe(1)
    expect(symbolFor(1001)).toBe('AAPL')

    learnInstruments([{ instrumentId: 1002, symbol: 'TSLA' }])
    expect(symbolFor(1002)).toBe('TSLA')

    expect(learnInstruments([{ instrumentId: 3 }, {}, null])).toBe(2)
    expect(learnInstruments(null)).toBe(2)
  })
})

describe('symbolFor', () => {
  it('falls back to a traceable placeholder rather than an anonymous blank', () => {
    learnInstruments([{ instrumentId: 1001, symbolFull: 'AAPL' }])

    expect(symbolFor(1001)).toBe('AAPL')
    expect(symbolFor('1001')).toBe('AAPL')
    // An unknown instrument must still be identifiable in the journal.
    expect(symbolFor(9999)).toBe('etoro:9999')
    expect(symbolFor('')).toBe('')
  })
})

describe('resetInstruments', () => {
  it('forgets the catalogue, which is what a reconnect wants', () => {
    learnInstruments([{ instrumentId: 1, symbol: 'X' }])
    resetInstruments()
    expect(symbolFor(1)).toBe('etoro:1')
  })
})

describe('toEpoch', () => {
  it('turns EToro date strings into epoch milliseconds', () => {
    expect(toEpoch('2026-08-03T14:05:09Z')).toBe(Date.UTC(2026, 7, 3, 14, 5, 9))
    expect(toEpoch(1785765909000)).toBe(1785765909000)
    expect(toEpoch('not a date')).toBe(0)
    expect(toEpoch(undefined)).toBe(0)
  })
})

describe('mapQuote', () => {
  it('emits exactly the internal tick shape OKX produces', () => {
    learnInstruments([{ instrumentId: 1001, symbolFull: 'AAPL' }])

    const tick = mapQuote({
      instrumentId: 1001,
      bid: '190.10',
      ask: '190.30',
      bidSize: '100',
      askSize: '120',
      date: '2026-08-03T14:05:09Z',
      previousClose: '189.00',
      volume: '5000',
    })

    // Same keys as the OKX mapper: nothing downstream may branch on venue.
    const okxTick = mapTicker({ instId: 'AAPL', ts: '1', last: '1', bidPx: '1', askPx: '1' })
    expect(Object.keys(tick).sort()).toEqual(Object.keys(okxTick).sort())

    expect(tick).toMatchObject({ venue: 'etoro', symbol: 'AAPL', bid: 190.1, ask: 190.3 })
    // No explicit last price from this venue, so mid is the honest stand-in.
    expect(tick.last).toBeCloseTo(190.2)

    expect(mapQuote({ instrumentId: 1001, bid: '5', ask: '' }).last).toBe(5)
    expect(mapQuote({})).toBeNull()
  })
})

describe('mapPosition', () => {
  it('turns the isBuy boolean into the same side words OKX uses', () => {
    learnInstruments([{ instrumentId: 1001, symbolFull: 'AAPL' }])

    expect(
      mapPosition({ instrumentId: 1001, isBuy: false, amount: '10', openRate: '190', profit: '-5' }),
    ).toMatchObject({ venue: 'etoro', symbol: 'AAPL', side: 'short', sz: 10, uPnl: -5 })

    expect(mapPosition({ instrumentId: 1001, isBuy: true, units: '3' })).toMatchObject({
      side: 'long',
      sz: 3,
    })
    expect(mapPosition({})).toBeNull()
  })
})

describe('mapOrderState', () => {
  it('collapses EToro statuses onto the desk set', () => {
    expect(mapOrderState('Open')).toBe('live')
    expect(mapOrderState('pendingExecution')).toBe('live')
    expect(mapOrderState('Executed')).toBe('filled')
    expect(mapOrderState('Cancelled')).toBe('cancelled')
    expect(mapOrderState('Rejected')).toBe('rejected')
    expect(mapOrderState('who knows')).toBe('pending')
  })
})

describe('mapOrder', () => {
  it('maps an order, inferring type from whether a rate was given', () => {
    learnInstruments([{ instrumentId: 1001, symbolFull: 'AAPL' }])

    expect(
      mapOrder({
        orderId: 'o1',
        instrumentId: 1001,
        isBuy: true,
        rate: '190.5',
        amount: '10',
        status: 'Open',
        openDateTime: '2026-08-03T14:05:09Z',
      }),
    ).toMatchObject({ id: 'o1', side: 'buy', type: 'limit', px: 190.5, state: 'live' })

    expect(mapOrder({ positionId: 'p1', instrumentId: 1001 }).type).toBe('market')
    expect(mapOrder({})).toBeNull()
  })
})

describe('mapError', () => {
  it('translates HTTP failures into something a trader can act on', () => {
    expect(mapError({ status: 401 })).toMatch(/rejected your keys/)
    expect(mapError({ statusCode: 429 })).toMatch(/Rate limited/)
    expect(mapError({ status: 503 })).toMatch(/having problems/)
    expect(mapError({ status: 400, message: 'bad instrument' })).toBe('bad instrument')
    expect(mapError({})).toBe('EToro error unknown')
  })
})
