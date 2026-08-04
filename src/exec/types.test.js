import { describe, it, expect } from 'vitest'
import {
  makeIntent,
  advanceOrderState,
  normalizeReject,
  isSettled,
  roundToLotTick,
  TIF,
  ORDER_TYPES,
  REJECT_REASONS,
} from './types.js'

describe('makeIntent', () => {
  it('normalises one order shape and refuses the combinations nothing can repair', () => {
    const { ok, intent } = makeIntent({
      symbol: 'okx:BTC-USDT',
      side: 'sell',
      size: 0.5,
      price: 100,
      type: 'limit',
    })

    expect(ok).toBe(true)
    expect(intent).toEqual({
      venue: 'okx',
      instrument: 'BTC-USDT',
      side: 'sell',
      size: 0.5,
      price: 100,
      type: 'limit',
      tif: 'gtc',
      reduceOnly: false,
      clientId: '',
    })

    // A market order cannot rest, so gtc on one is meaningless — ioc is what it means.
    expect(makeIntent({ symbol: 'BTC-USDT', size: 1, type: 'market' }).intent.tif).toBe('ioc')
    expect(makeIntent({ symbol: 'BTC-USDT', size: 1, type: 'market' }).intent.price).toBe(0)

    // Guessing a price is how an order lands somewhere nobody chose.
    expect(makeIntent({ symbol: 'BTC-USDT', size: 1, type: 'limit' }).reason).toBe(
      'limit needs a price',
    )
    expect(makeIntent({ symbol: 'BTC-USDT', size: 0, type: 'market' }).reason).toBe('no size')
    expect(makeIntent({ size: 1 }).reason).toBe('no instrument')

    // The venue comes off the qualified symbol when not stated.
    expect(makeIntent({ symbol: 'etoro:AAPL', size: 1, type: 'market' }).intent.venue).toBe('etoro')
    expect(TIF).toContain('post_only')
    expect(ORDER_TYPES).toEqual(['market', 'limit'])
  })
})

describe('advanceOrderState', () => {
  it('shares one transition table with the order lifecycle, refusing the rest', () => {
    expect(advanceOrderState('pending', 'live')).toEqual({ state: 'live', changed: true })
    expect(advanceOrderState('live', 'partial')).toEqual({ state: 'partial', changed: true })
    expect(advanceOrderState('partial', 'filled')).toEqual({ state: 'filled', changed: true })

    // Terminal is terminal: a resent ack after a fill changes nothing.
    expect(advanceOrderState('filled', 'live')).toEqual({ state: 'filled', changed: false })
    expect(advanceOrderState('cancelled', 'partial').changed).toBe(false)

    // An unknown current state is treated as pending, which is where an order starts.
    expect(advanceOrderState('nonsense', 'live')).toEqual({ state: 'live', changed: true })
    expect(advanceOrderState('live', 'vibing')).toEqual({ state: 'live', changed: false })
  })
})

describe('normalizeReject', () => {
  it('names the reason in one vocabulary while keeping the venue\'s own words', () => {
    expect(normalizeReject({ sCode: '51008', sMsg: 'Order failed. Insufficient USDT' })).toMatchObject(
      { reason: 'insufficient_funds', message: 'Order failed. Insufficient USDT' },
    )
    expect(normalizeReject({ code: '50011' }).reason).toBe('rate_limited')

    // EToro answers in prose rather than codes, so the message is all there is to read.
    expect(normalizeReject({ message: 'Insufficient balance for this trade' }).reason).toBe(
      'insufficient_funds',
    )
    expect(normalizeReject({ message: 'Invalid price level' }).reason).toBe('invalid_price')
    expect(normalizeReject({ message: 'Market is closed' }).reason).toBe('market_closed')

    // Anything unrecognised says so rather than guessing.
    expect(normalizeReject({ message: 'kaboom' }).reason).toBe('unknown')
    expect(normalizeReject(null)).toEqual({ reason: 'unknown', message: 'rejected', raw: null })
    expect(REJECT_REASONS).toContain('would_cross')
  })
})

describe('isSettled', () => {
  it('knows which states nothing follows', () => {
    expect(isSettled('filled')).toBe(true)
    expect(isSettled('cancelled')).toBe(true)
    expect(isSettled('rejected')).toBe(true)

    expect(isSettled('live')).toBe(false)
    expect(isSettled('partial')).toBe(false)
    expect(isSettled(null)).toBe(false)
  })
})

describe('roundToLotTick', () => {
  it('rounds size down and price to nearest, which are different asks', () => {
    // Size down: rounding up can exceed a limit that was just checked, and the trader
    // asked for "at most this".
    expect(roundToLotTick({ size: 1.279, price: 100.04 }, { lotSize: 0.01, tickSize: 0.1 })).toEqual(
      { size: 1.27, price: 100 },
    )

    // Price to nearest: a price is a target, and always moving it one way would place
    // systematically worse than asked.
    expect(roundToLotTick({ size: 1, price: 100.06 }, { lotSize: 1, tickSize: 0.1 }).price).toBe(
      100.1,
    )

    // Under one whole lot is no order at all.
    expect(roundToLotTick({ size: 0.5, price: 100 }, { lotSize: 1 }).size).toBe(0)

    // No grid known yet leaves the values alone rather than zeroing the ticket.
    expect(roundToLotTick({ size: 1.279, price: 100.04 }, {})).toEqual({
      size: 1.279,
      price: 100.04,
    })
    expect(roundToLotTick({}, { lotSize: 1, tickSize: 1 })).toEqual({ size: 0, price: 0 })
  })
})
