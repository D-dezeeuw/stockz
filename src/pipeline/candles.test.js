import { describe, it, expect, beforeEach } from 'vitest'
import {
  TIMEFRAMES,
  bucketStart,
  foldTrade,
  addTrade,
  candles,
  vwap,
  resetCandles,
} from './candles.js'
import { createRing } from './ring.js'

beforeEach(() => {
  resetCandles()
})

describe('bucketStart', () => {
  it('aligns to the wall clock so two instruments produce comparable bars', () => {
    expect(bucketStart(1785765909123, 1000)).toBe(1785765909000)
    expect(bucketStart(1785765909123, 5000)).toBe(1785765905000)
    expect(bucketStart(1785765909123, 60000)).toBe(1785765900000)

    expect(bucketStart(NaN, 1000)).toBe(0)
    expect(bucketStart(1000, 0)).toBe(0)
  })
})

describe('foldTrade', () => {
  it('opens a candle and extends it, tracking high, low, close and volume', () => {
    const first = foldTrade(null, { px: 100, sz: 1 }, 1000)
    expect(first).toEqual({ ts: 1000, o: 100, h: 100, l: 100, c: 100, v: 1, n: 1 })

    const up = foldTrade(first, { px: 102, sz: 2 }, 1000)
    expect(up).toMatchObject({ o: 100, h: 102, l: 100, c: 102, v: 3, n: 2 })

    const down = foldTrade(up, { px: 98, sz: 1 }, 1000)
    expect(down).toMatchObject({ o: 100, h: 102, l: 98, c: 98, v: 4, n: 3 })

    // A new bucket starts a fresh candle rather than extending the old one.
    expect(foldTrade(down, { px: 105 }, 2000)).toEqual({
      ts: 2000, o: 105, h: 105, l: 105, c: 105, v: 0, n: 1,
    })
  })
})

describe('addTrade', () => {
  it('builds every timeframe at once, updating the open candle in place', () => {
    const open = addTrade('BTC-USDT', { px: 100, sz: 1, ts: 1000 })
    expect(Object.keys(open).sort()).toEqual(Object.keys(TIMEFRAMES).sort())

    addTrade('BTC-USDT', { px: 102, sz: 1, ts: 1400 })

    // Same second: one candle, not two — otherwise the chart draws hundreds of
    // one-print bars per second.
    const oneSecond = candles('BTC-USDT', '1s')
    expect(oneSecond).toHaveLength(1)
    expect(oneSecond[0]).toMatchObject({ o: 100, c: 102, h: 102, n: 2 })

    addTrade('BTC-USDT', { px: 105, sz: 1, ts: 2100 })
    expect(candles('BTC-USDT', '1s')).toHaveLength(2)
    // The 5s bar still holds all three prints.
    expect(candles('BTC-USDT', '5s')[0].n).toBe(3)

    expect(addTrade('', { px: 1 })).toEqual({})
    expect(addTrade('X', { px: 'nope' })).toEqual({})
  })
})

describe('candles', () => {
  it('returns a series oldest-first, and nothing for an unknown symbol', () => {
    addTrade('X', { px: 1, sz: 1, ts: 1000 })
    addTrade('X', { px: 2, sz: 1, ts: 2000 })

    expect(candles('X', '1s').map((c) => c.c)).toEqual([1, 2])
    expect(candles('X', '1s', 1).map((c) => c.c)).toEqual([2])
    expect(candles('nope', '1s')).toEqual([])
    expect(candles('X', '1h')).toEqual([])
  })
})

describe('vwap', () => {
  it('weights price by volume, ignoring bars that carry none', () => {
    expect(vwap([{ h: 10, l: 10, c: 10, v: 1 }, { h: 20, l: 20, c: 20, v: 3 }])).toBe(17.5)
    expect(vwap([{ h: 10, l: 10, c: 10, v: 0 }])).toBe(0)
    expect(vwap([])).toBe(0)
    expect(vwap(null)).toBe(0)
  })
})

describe('resetCandles', () => {
  it('forgets every series', () => {
    addTrade('X', { px: 1, sz: 1, ts: 1000 })
    resetCandles()
    expect(candles('X', '1s')).toEqual([])
  })
})

describe('replaceLast', () => {
  it('overwrites the newest entry without growing the buffer', () => {
    const ring = createRing(2)
    expect(ring.replaceLast('x')).toBe(false)

    ring.push('a')
    expect(ring.replaceLast('A')).toBe(true)
    expect(ring.toArray()).toEqual(['A'])
    expect(ring.size()).toBe(1)
  })
})
