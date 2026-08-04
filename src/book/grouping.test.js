import { describe, it, expect, beforeEach } from 'vitest'
import {
  bucketPrice,
  groupLevels,
  groupSizes,
  groupBook,
  registerGroupingActions,
} from './grouping.js'
import { clearActions, dispatchAction } from '../actions/registry.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

describe('bucketPrice', () => {
  it('floors bids and ceils asks, so a grouped book never appears crossed', () => {
    expect(bucketPrice(100.37, 0.5, 'bid')).toBe(100)
    expect(bucketPrice(100.37, 0.5, 'ask')).toBe(100.5)

    // Exactly on a boundary belongs to that boundary on both sides.
    expect(bucketPrice(100.5, 0.5, 'bid')).toBe(100.5)
    expect(bucketPrice(100.5, 0.5, 'ask')).toBe(100.5)

    // Float arithmetic must not leak a price no instrument quotes.
    expect(bucketPrice(0.35, 0.1, 'bid')).toBe(0.3)

    // No group size means no grouping, not a collapse to zero.
    expect(bucketPrice(100.37, 0, 'bid')).toBe(100.37)
    expect(bucketPrice('x', 1, 'bid')).toBe(0)
  })
})

describe('groupLevels', () => {
  it('sums size per bucket and keeps the best price first', () => {
    const bids = groupLevels(
      [
        [100.4, 1],
        [100.1, 2],
        [99.6, 3],
      ],
      0.5,
      'bid',
    )

    // 100.4 and 100.1 both floor to 100.0 and merge; 99.6 floors to 99.5.
    expect(bids).toEqual([
      [100, 3],
      [99.5, 3],
    ])

    const asks = groupLevels([[100.1, 1], [100.4, 2]], 0.5, 'ask')
    // Both ceil to 100.5, and asks come back ascending.
    expect(asks).toEqual([[100.5, 3]])

    // Objects read the same as pairs; zero sizes are not levels.
    expect(groupLevels([{ px: 1, sz: 0 }, { px: 1.2, sz: 4 }], 1, 'bid')).toEqual([[1, 4]])
    expect(groupLevels(null, 1, 'bid')).toEqual([])
  })
})

describe('groupSizes', () => {
  it('offers whole multiples of the tick, never a boundary between quotable prices', () => {
    expect(groupSizes(0.1)).toEqual([0.1, 0.2, 0.5, 1])
    expect(groupSizes(0.01)).toEqual([0.01, 0.02, 0.05, 0.1])
    expect(groupSizes(5)).toEqual([5, 10, 25, 50])

    // No tick size known yet still gives the selector something sensible.
    expect(groupSizes(0)).toEqual([0.01, 0.02, 0.05, 0.1])
    expect(groupSizes('x')).toEqual([0.01, 0.02, 0.05, 0.1])
  })
})

describe('groupBook', () => {
  it('groups both sides at once and leaves the spread no narrower than it was', () => {
    const grouped = groupBook(
      {
        bids: [
          [100.4, 1],
          [100.1, 2],
        ],
        asks: [
          [100.6, 1],
          [100.9, 2],
        ],
      },
      0.5,
    )

    expect(grouped.bids).toEqual([[100, 3]])
    expect(grouped.asks).toEqual([[101, 3]])
    // The real spread was 0.2; grouped it is 1.0 — wider, never narrower, which is what
    // keeps the grouped view honest about cost.
    expect(grouped.asks[0][0] - grouped.bids[0][0]).toBeGreaterThan(0.2)

    expect(groupBook(null, 1)).toEqual({ bids: [], asks: [] })
  })
})

describe('registerGroupingActions', () => {
  beforeEach(() => {
    clearActions()
    resetState()
  })

  it('stores the granularity per instrument, since one size never fits two markets', () => {
    const name = registerGroupingActions()
    expect(name).toBe('book.setGroup')

    setValue('market.focus', 'okx:BTC-USDT')
    tick()

    expect(dispatchAction(name, { group: 0.5 })).toBe(true)
    tick()
    expect(appState.settings.priceGroups['okx:BTC-USDT']).toBe(0.5)

    // Another instrument keeps its own choice rather than inheriting this one.
    expect(dispatchAction(name, { symbol: 'okx:DOGE-USDT', group: 0.0001 })).toBe(true)
    tick()
    expect(appState.settings.priceGroups).toEqual({
      'okx:BTC-USDT': 0.5,
      'okx:DOGE-USDT': 0.0001,
    })

    // Zero is a valid choice — it means ungrouped.
    expect(dispatchAction(name, 0)).toBe(true)
    tick()
    expect(appState.settings.priceGroups['okx:BTC-USDT']).toBe(0)

    expect(dispatchAction(name, { symbol: '', group: 1 })).toBe(false)
    expect(dispatchAction(name, { group: -1 })).toBe(false)
  })
})
