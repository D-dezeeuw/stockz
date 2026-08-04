import { describe, it, expect } from 'vitest'
import {
  sizeToPct,
  formatSize,
  ladderRows,
  spreadRow,
  visibleMax,
  ladderView,
  LADDER_DEPTH,
} from './ladder.js'

const book = {
  bids: [
    [100.0, 2],
    [99.9, 8],
    [99.8, 1],
  ],
  asks: [
    [100.2, 4],
    [100.1, 1],
    [100.3, 3],
  ],
}

describe('sizeToPct', () => {
  it('scales against the visible peak so a thin book still shows relative depth', () => {
    expect(sizeToPct(5, 10)).toBe(50)
    expect(sizeToPct(10, 10)).toBe(100)
    expect(sizeToPct(0.333, 1)).toBe(33.3)

    // Anything bigger than the peak still fits the bar rather than overflowing the row.
    expect(sizeToPct(20, 10)).toBe(100)

    expect(sizeToPct(5, 0)).toBe(0)
    expect(sizeToPct(0, 10)).toBe(0)
    expect(sizeToPct('x', 10)).toBe(0)
  })
})

describe('formatSize', () => {
  it('shows lot-exact decimals up to a thousand, then magnitude', () => {
    expect(formatSize(1.23456, 0.001)).toBe('1.235')
    expect(formatSize(2, 1)).toBe('2')
    expect(formatSize(0.5, 0.0001)).toBe('0.5000')

    // Past a thousand the exact lot stops mattering and the magnitude starts to.
    expect(formatSize(1234.56, 0.01)).toBe('1.2K')
    expect(formatSize(-1500, 0.01)).toBe('-1.5K')

    // No usable lot size falls back to four decimals rather than float noise.
    expect(formatSize(1.23456789, 0)).toBe('1.2346')
    expect(formatSize(NaN)).toBe('—')
  })
})

describe('ladderRows', () => {
  it('puts the touch on row 0 for both sides and carries cumulative size', () => {
    const bids = ladderRows(book.bids, { side: 'bid', tickSize: 0.1, lotSize: 1 })

    // Bids descend, so the best bid is row 0 — the two sides mirror around the spread.
    expect(bids.map((r) => r.px)).toEqual([100, 99.9, 99.8])
    expect(bids[0]).toMatchObject({ px: 100, sz: 2, side: 'bid', priceLabel: '100.0', total: 2 })
    // Cumulative size is what a sweep through the level would actually cost.
    expect(bids.map((r) => r.total)).toEqual([2, 10, 11])
    // Bars scale against the deepest visible level, here the 8 at 99.9.
    expect(bids.map((r) => r.pct)).toEqual([25, 100, 12.5])

    // Asks ascend: the best offer is row 0 too.
    expect(ladderRows(book.asks, { side: 'ask' }).map((r) => r.px)).toEqual([100.1, 100.2, 100.3])

    // Objects work as well as pairs, and zero-size levels are gone, not drawn empty.
    expect(ladderRows([{ px: 1, sz: 0 }, { px: 2, sz: 3 }], { side: 'bid' })).toHaveLength(1)

    expect(ladderRows(book.bids, { depth: 2 })).toHaveLength(2)
    expect(ladderRows(null)).toEqual([])
    expect(LADDER_DEPTH).toBe(12)
  })
})

describe('spreadRow', () => {
  it('reports the spread in ticks, the unit that decides if a scalp clears its cost', () => {
    const row = spreadRow(book, { tickSize: 0.1 })

    expect(row.bid).toBe(100)
    expect(row.ask).toBe(100.1)
    expect(row.ticks).toBe(1)
    expect(row.spreadLabel).toBe('1t')
    // The true mid (100.05) sits between ticks on a 0.1 instrument; the label rounds to
    // a price that can actually exist rather than inventing precision.
    expect(row.mid).toBe(100.05)
    expect(row.midLabel).toBe('100.0')
    expect(row.bps).toBeCloseTo(9.99, 1)
    expect(row.crossed).toBe(false)

    // A crossed book is stale or corrupt — the ladder says so rather than averaging it.
    expect(spreadRow({ bids: [[101, 1]], asks: [[100, 1]] }, { tickSize: 0.1 }).crossed).toBe(true)

    // One side missing means no spread to quote, not a spread of the whole price.
    expect(spreadRow({ bids: [[100, 1]], asks: [] })).toMatchObject({ ticks: 0, midLabel: '—' })
    expect(spreadRow(null).spreadLabel).toBe('—')
  })
})

describe('visibleMax', () => {
  it('takes one scale across both sides, so a bid and an ask of equal size match', () => {
    expect(visibleMax(book)).toBe(8)

    // Depth-limited: only what is on screen sets the scale.
    expect(visibleMax({ bids: [[100, 2]], asks: [[101, 9]] }, 1)).toBe(9)
    expect(visibleMax({ bids: book.bids, asks: [] })).toBe(8)

    expect(visibleMax({ bids: [], asks: [] })).toBe(0)
    expect(visibleMax(null)).toBe(0)
  })
})

describe('ladderView', () => {
  it('derives both sides and the spread from one snapshot, on one shared scale', () => {
    const view = ladderView(book, { tickSize: 0.1, lotSize: 1, depth: 2 })

    expect(view.bids.map((r) => r.px)).toEqual([100, 99.9])
    expect(view.asks.map((r) => r.px)).toEqual([100.1, 100.2])
    expect(view.spread.ticks).toBe(1)

    // One scale across both sides: the 8-lot bid is the peak, so the 4-lot ask is half
    // its width — comparable across the spread, which two separate scales would not be.
    expect(view.bids[1].pct).toBe(100)
    expect(view.asks[1].pct).toBe(50)

    expect(ladderView(null)).toEqual({ bids: [], asks: [], spread: expect.any(Object) })
  })
})
