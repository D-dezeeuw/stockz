import { describe, it, expect, beforeEach } from 'vitest'
import {
  positionKey,
  positionFor,
  upsertPosition,
  ingestFill,
  markPosition,
  openPositions,
  grossExposure,
  pnlTotals,
  flushPositions,
  resetPositions,
} from './store.js'
import { appState, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetPositions()
  resetState()
})

describe('positionKey', () => {
  it('resolves one slot per venue and instrument, however the caller spells it', () => {
    expect(positionKey('okx', 'BTC-USDT')).toBe('okx:BTC-USDT')
    expect(positionKey('OKX', 'btc-usdt')).toBe('okx:BTC-USDT')

    // A qualified symbol carries its own venue — taking it from there stops one position
    // living in two slots depending on which caller wrote it.
    expect(positionKey('', 'okx:BTC-USDT')).toBe('okx:BTC-USDT')
    expect(positionKey('etoro', 'okx:BTC-USDT')).toBe('etoro:BTC-USDT')

    expect(positionKey('okx', '')).toBe('')
    expect(positionKey('', '')).toBe('')
  })
})

describe('positionFor', () => {
  it('answers with a flat position rather than nothing', () => {
    expect(positionFor('okx:BTC-USDT')).toMatchObject({
      venue: 'okx',
      instrument: 'BTC-USDT',
      qty: 0,
    })

    ingestFill({ venue: 'okx', instrument: 'BTC-USDT', side: 'buy', qty: 1, px: 100 })
    expect(positionFor('okx:BTC-USDT').qty).toBe(1)
  })
})

describe('upsertPosition', () => {
  it('prunes a flat position instead of keeping a zero row', () => {
    expect(upsertPosition('okx:BTC-USDT', { qty: 2, avgPx: 100 })).toMatchObject({ qty: 2 })
    expect(openPositions()).toHaveLength(1)

    // Keeping zero rows would put a whole session's history in the risk view and make
    // "am I flat?" a reading exercise.
    expect(upsertPosition('okx:BTC-USDT', { qty: 0, avgPx: 100 })).toBeNull()
    expect(openPositions()).toEqual([])

    expect(upsertPosition('', { qty: 1 })).toBeNull()
  })
})

describe('ingestFill', () => {
  it('turns venue sides into signed quantity, once, so nothing downstream guesses', () => {
    const opened = ingestFill({
      venue: 'okx',
      instrument: 'BTC-USDT',
      side: 'buy',
      qty: 2,
      px: 100,
      ts: 1000,
    })
    expect(opened.position).toMatchObject({ qty: 2, avgPx: 100 })

    const sold = ingestFill({ venue: 'okx', instrument: 'BTC-USDT', side: 'sell', qty: 1, px: 110 })
    expect(sold.position.qty).toBe(1)
    expect(sold.realized).toBe(10)

    // A qualified symbol works without a venue field.
    ingestFill({ symbol: 'etoro:AAPL', side: 'buy', qty: 3, px: 190 })
    expect(positionFor('etoro:AAPL').qty).toBe(3)

    expect(ingestFill({ side: 'buy', qty: 1, px: 1 }).key).toBe('')
  })
})

describe('markPosition', () => {
  it('marks an open position and ignores one that is not there', () => {
    ingestFill({ venue: 'okx', instrument: 'BTC-USDT', side: 'buy', qty: 2, px: 100 })

    expect(markPosition('okx:BTC-USDT', 110).mark).toBe(110)
    expect(openPositions()[0].unrealized).toBe(20)

    expect(markPosition('okx:NOPE', 110)).toBeNull()
    expect(markPosition('okx:BTC-USDT', 0)).toBeNull()
  })
})

describe('openPositions', () => {
  it('reports side and live P&L alongside the raw record', () => {
    ingestFill({ venue: 'okx', instrument: 'BTC-USDT', side: 'sell', qty: 2, px: 100 })
    markPosition('okx:BTC-USDT', 90)

    expect(openPositions()[0]).toMatchObject({ side: 'short', qty: -2, unrealized: 20 })
    expect(openPositions()).toHaveLength(1)
  })
})

describe('grossExposure', () => {
  it('sizes risk at the mark, or at entry when no tick has arrived yet', () => {
    ingestFill({ venue: 'okx', instrument: 'BTC-USDT', side: 'buy', qty: 2, px: 100 })

    // No mark yet: a position with no tick still has size on it.
    expect(grossExposure()).toBe(200)

    markPosition('okx:BTC-USDT', 110)
    expect(grossExposure()).toBe(220)

    // Shorts add to gross exposure rather than netting against longs.
    ingestFill({ venue: 'etoro', instrument: 'AAPL', side: 'sell', qty: 1, px: 190 })
    expect(grossExposure()).toBe(410)
  })
})

describe('pnlTotals', () => {
  it('adds up what is open, what is booked and what it cost', () => {
    ingestFill({ venue: 'okx', instrument: 'BTC-USDT', side: 'buy', qty: 2, px: 100, fee: 0.2 })
    ingestFill({ venue: 'okx', instrument: 'BTC-USDT', side: 'sell', qty: 1, px: 110, fee: 0.1 })
    markPosition('okx:BTC-USDT', 120)

    expect(pnlTotals()).toEqual({
      unrealized: 20,
      realized: 10,
      fees: Number((0.3).toFixed(8)),
      count: 1,
    })

    resetPositions()
    expect(pnlTotals()).toEqual({ unrealized: 0, realized: 0, fees: 0, count: 0 })
  })
})

describe('flushPositions', () => {
  it('publishes once per frame however many fills landed', () => {
    ingestFill({ venue: 'okx', instrument: 'BTC-USDT', side: 'buy', qty: 1, px: 100 })
    ingestFill({ venue: 'okx', instrument: 'BTC-USDT', side: 'buy', qty: 1, px: 110 })
    markPosition('okx:BTC-USDT', 120)

    expect(flushPositions()).toBe(true)
    tick()

    expect(appState.trade.positions).toHaveLength(1)
    expect(appState.trade.positions[0]).toMatchObject({ qty: 2, avgPx: 105 })
    expect(appState.trade.pnl).toMatchObject({ unrealized: 30, count: 1 })

    // Nothing changed since: no second write.
    expect(flushPositions()).toBe(false)
  })
})

describe('resetPositions', () => {
  it('empties the book', () => {
    ingestFill({ venue: 'okx', instrument: 'BTC-USDT', side: 'buy', qty: 1, px: 100 })

    expect(resetPositions()).toBe(true)
    expect(openPositions()).toEqual([])
  })
})
