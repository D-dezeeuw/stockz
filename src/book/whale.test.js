import { describe, it, expect, beforeEach } from 'vitest'
import {
  rollingMedian,
  isWhale,
  multiplierFor,
  flagWhales,
  emitWhale,
  trimWhales,
  WINDOW,
  DEFAULT_MULTIPLIER,
  FEED_CAP,
} from './whale.js'
import { appState, tick, resetState } from '../app/engine.js'

beforeEach(() => resetState())

describe('rollingMedian', () => {
  it('resists one enormous print redefining what normal is', () => {
    expect(rollingMedian([1, 2, 3])).toBe(2)
    expect(rollingMedian([1, 2, 3, 4])).toBe(2.5)

    // The mean here would be 82; the median stays 2, which is what makes the 400 stand
    // out instead of becoming the new baseline.
    expect(rollingMedian([1, 2, 3, 400])).toBe(2.5)

    // Only the window's tail counts, so the baseline follows the session.
    expect(rollingMedian([100, 100, 1, 1, 1], 3)).toBe(1)

    expect(rollingMedian([0, -1, 'x'])).toBe(0)
    expect(rollingMedian(null)).toBe(0)
    expect(WINDOW).toBe(200)
  })
})

describe('isWhale', () => {
  it('measures against the baseline, not against an absolute size', () => {
    expect(isWhale(8, 2, 4)).toBe(true)
    expect(isWhale(7.9, 2, 4)).toBe(false)
    // Exactly on the multiple counts — the rule is >=, so a clean 4× is a whale.
    expect(isWhale(8, 2)).toBe(true)
    expect(DEFAULT_MULTIPLIER).toBe(4)

    // Without a baseline nothing is a whale; a zero median would make everything one.
    expect(isWhale(1000, 0)).toBe(false)
    expect(isWhale('x', 2)).toBe(false)
    // A junk multiplier falls back to the default rather than flagging everything.
    expect(isWhale(8, 2, 0)).toBe(true)
    expect(isWhale(4, 2, 0)).toBe(false)
  })
})

describe('multiplierFor', () => {
  it('lets one market be tuned without changing the rest', () => {
    const overrides = { 'BTC-USDT': 6, 'DOGE-USDT': 0 }

    expect(multiplierFor('BTC-USDT', overrides)).toBe(6)
    // A zero override is not a setting, it is a mistake — fall back rather than flag all.
    expect(multiplierFor('DOGE-USDT', overrides)).toBe(4)
    expect(multiplierFor('ETH-USDT', overrides, 3)).toBe(3)

    expect(multiplierFor('ETH-USDT', null)).toBe(4)
    expect(multiplierFor(null, null, 'x')).toBe(4)
  })
})

describe('flagWhales', () => {
  it('measures a set against its own sizes when no baseline is supplied', () => {
    const rows = flagWhales([{ sz: 1 }, { sz: 2 }, { sz: 3 }, { sz: 40 }], { multiplier: 4 })

    // Median of the set is 2.5, so only the 40 clears 4×.
    expect(rows.map((r) => r.whale)).toEqual([false, false, false, true])
    // The original fields survive — this decorates, it does not replace.
    expect(rows[3]).toEqual({ sz: 40, whale: true })

    // A supplied baseline wins, so a ladder can be judged against the tape if wanted.
    expect(flagWhales([{ sz: 5 }], { median: 1, multiplier: 4 })[0].whale).toBe(true)

    expect(flagWhales(null)).toEqual([])
  })
})

describe('emitWhale', () => {
  it('appends a labelled event carrying the ratio an alert wants to quote', () => {
    expect(emitWhale({ symbol: 'BTC-USDT', px: 100, sz: 12, side: 'sell', ts: 5 }, {
      median: 2,
      multiplier: 4,
    })).toBe(true)
    tick()

    expect(appState.market.whales).toHaveLength(1)
    expect(appState.market.whales[0]).toEqual({
      symbol: 'BTC-USDT',
      px: 100,
      sz: 12,
      side: 'sell',
      ts: 5,
      // "6× normal" is what the alert says; recomputing it downstream would need the
      // whole window.
      ratio: 6,
      multiplier: 4,
    })

    // The labelled counter is what later phases watch — no diffing the feed array.
    expect(appState.market.whaleCount).toBe(1)

    // No baseline means no ratio to quote, not a division by zero.
    emitWhale({ px: 1, sz: 1 }, {})
    tick()
    expect(appState.market.whales[1]).toMatchObject({ ratio: 0, side: 'buy', symbol: '' })
    expect(appState.market.whaleCount).toBe(2)

    expect(emitWhale(null)).toBe(false)
  })
})

describe('trimWhales', () => {
  it('keeps the feed bounded, dropping the oldest events', () => {
    const feed = Array.from({ length: 6 }, (_, i) => ({ ts: i }))

    expect(trimWhales(feed, 3).map((w) => w.ts)).toEqual([3, 4, 5])

    // Under the cap the array is returned untouched — no pointless copy.
    expect(trimWhales(feed, 10)).toBe(feed)
    expect(trimWhales(null)).toEqual([])
    expect(FEED_CAP).toBe(50)
  })
})
