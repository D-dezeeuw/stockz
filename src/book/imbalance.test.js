import { describe, it, expect, beforeEach } from 'vitest'
import { appState, tick, resetState } from '../app/engine.js'
import {
  updateImbalance,
  resetImbalance,
  sumDepth,
  computeImbalance,
  emaSmooth,
  imbalanceGauge,
  DEPTH_OPTIONS,
} from './imbalance.js'

const book = {
  bids: [
    [100, 3],
    [99.9, 4],
    [99.8, 1],
  ],
  asks: [
    [100.1, 1],
    [100.2, 1],
    [100.3, 6],
  ],
}

describe('sumDepth', () => {
  it('counts only the top N levels, so the reading matches the depth selected', () => {
    expect(sumDepth(book.bids, 2)).toBe(7)
    expect(sumDepth(book.bids, 10)).toBe(8)
    expect(sumDepth(book.asks, 2)).toBe(2)

    // Objects read the same as pairs; junk and zero sizes contribute nothing.
    expect(sumDepth([{ sz: 2 }, { sz: 0 }, { sz: 'x' }], 5)).toBe(2)

    expect(sumDepth(book.bids, 0)).toBe(0)
    expect(sumDepth(null, 5)).toBe(0)
  })
})

describe('computeImbalance', () => {
  it('reads +1 for an all-bid book and −1 for an all-offer one', () => {
    // Top 2: 7 bid against 2 ask — heavily bid.
    expect(computeImbalance(book, 2)).toBeCloseTo(0.5556, 3)
    // Top 3 pulls in a 6-lot offer and flips the read, which is the point of the depth
    // selector: the touch and the structure behind it disagree constantly.
    expect(computeImbalance(book, 3)).toBeCloseTo(0, 4)

    expect(computeImbalance({ bids: [[1, 5]], asks: [] }, 5)).toBe(1)
    expect(computeImbalance({ bids: [], asks: [[1, 5]] }, 5)).toBe(-1)

    // No data reads as centred, not as pressure in either direction.
    expect(computeImbalance({ bids: [], asks: [] })).toBe(0)
    expect(computeImbalance(null)).toBe(0)
  })
})

describe('emaSmooth', () => {
  it('seeds on the first reading and then lags, so noise cannot swing the gauge', () => {
    // Nothing to smooth into: the gauge must not crawl out of zero for a second.
    expect(emaSmooth(undefined, 0.8)).toBe(0.8)

    // A spike moves the value by alpha, not all the way.
    expect(emaSmooth(0, 1, 0.2)).toBe(0.2)
    expect(emaSmooth(0.2, 1, 0.2)).toBe(0.36)
    // A quiet reading decays back the same way.
    expect(emaSmooth(0.36, 0, 0.5)).toBe(0.18)

    expect(emaSmooth(0.5, NaN)).toBe(0.5)
    expect(emaSmooth(0.5, 1, 0)).toBe(0.5)
    expect(emaSmooth(0.5, 1, 1)).toBe(1)
  })
})

describe('imbalanceGauge', () => {
  it('splits the reading into two bar widths and flags a crossed threshold', () => {
    const gauge = imbalanceGauge(book, { depth: 2, previous: undefined, threshold: 0.4 })

    expect(gauge.raw).toBeCloseTo(0.5556, 3)
    expect(gauge.side).toBe('bid')
    expect(gauge.hot).toBe(true)
    expect(gauge.label).toBe('+56%')
    // The two widths sum to 100, so the split bar binds directly with no template maths.
    expect(gauge.bidPct + gauge.askPct).toBe(100)
    expect(gauge.bidPct).toBeCloseTo(77.8, 1)

    // Smoothed against a previous reading, one frame cannot swing the bar.
    const smoothed = imbalanceGauge(book, { depth: 2, previous: 0, alpha: 0.2 })
    expect(smoothed.value).toBeCloseTo(0.1111, 3)
    expect(smoothed.hot).toBe(false)

    const heavyOffer = imbalanceGauge({ bids: [], asks: [[1, 5]] }, { previous: -1 })
    expect(heavyOffer.side).toBe('ask')
    expect(heavyOffer.label).toBe('-100%')

    expect(imbalanceGauge(null)).toMatchObject({ side: 'flat', hot: false, bidPct: 50 })
    expect(DEPTH_OPTIONS).toEqual([5, 10, 20])
  })
})

describe('updateImbalance', () => {
  beforeEach(() => {
    resetState()
    resetImbalance()
  })

  it('publishes a reading that lags its own history rather than the render cycle', () => {
    // First reading seeds: the gauge does not crawl out of zero.
    const first = updateImbalance({ bids: [[1, 5]], asks: [] }, { depth: 5, alpha: 0.5 })
    expect(first.value).toBe(1)
    tick()
    expect(appState.market.imbalance.side).toBe('bid')

    // The book flips hard; the published value moves by alpha, not all the way.
    const second = updateImbalance({ bids: [], asks: [[1, 5]] }, { depth: 5, alpha: 0.5 })
    expect(second.raw).toBe(-1)
    expect(second.value).toBe(0)

    const third = updateImbalance({ bids: [], asks: [[1, 5]] }, { depth: 5, alpha: 0.5 })
    expect(third.value).toBe(-0.5)
  })
})

describe('resetImbalance', () => {
  it('drops the lag on a symbol change, where carrying it over would be a lie', () => {
    updateImbalance({ bids: [[1, 5]], asks: [] }, { depth: 5, alpha: 0.2 })
    expect(resetImbalance()).toBe(true)

    // Seeded fresh: the new instrument's first reading is its own, not the old one's.
    expect(updateImbalance({ bids: [], asks: [[1, 5]] }, { depth: 5, alpha: 0.2 }).value).toBe(-1)
  })
})
