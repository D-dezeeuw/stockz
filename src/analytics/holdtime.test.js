// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  HOLD_BINS,
  binFor,
  holdTimeBuckets,
  medianHold,
  avgHold,
  drawHistogram,
  refreshHoldTimes,
  startHistogram,
} from './holdtime.js'
import { appState, tick, resetState } from '../app/engine.js'

const PALETTE = { up: 'G', down: 'O', grid: 'L', bg: 'B', muted: 'M' }

const TRADES = [
  { hold: 4000, net: 5 },
  { hold: 20000, net: 3 },
  { hold: 20000, net: -1 },
  { hold: 3600000, net: -30 },
]

/** A 2D context stand-in. */
function fakeCtx() {
  const fills = []
  return {
    fills,
    clearRect: () => {},
    fillText: () => {},
    fillRect: (...args) => fills.push([...args, this?.fillStyle]),
  }
}

beforeEach(() => {
  resetState()
})

describe('binFor', () => {
  it('puts a round-number hold in the faster bin, not the slower one', () => {
    expect(binFor(0)).toBe(0)
    expect(binFor(9999)).toBe(0)

    // Upper-exclusive: exactly ten seconds is "under 30s", and a boundary the other way
    // would push every round-number hold one bin slower.
    expect(binFor(10000)).toBe(1)
    expect(binFor(1800000)).toBe(HOLD_BINS.length)
    expect(binFor(NaN)).toBe(0)
    expect(binFor(-5)).toBe(0)
  })
})

describe('holdTimeBuckets', () => {
  it('averages rather than totals, so the busiest bin is not green by construction', () => {
    const buckets = holdTimeBuckets(TRADES)

    expect(buckets).toHaveLength(HOLD_BINS.length + 1)
    expect(buckets[0]).toMatchObject({ count: 1, net: 5, avg: 5 })
    // Two trades, +3 and -1: the bucket averages +1 rather than reporting its +2 total.
    expect(buckets[1]).toMatchObject({ count: 2, net: 2, avg: 1 })
    expect(buckets.at(-1)).toMatchObject({ count: 1, avg: -30 })

    expect(holdTimeBuckets(null).every((bucket) => bucket.count === 0)).toBe(true)
    // Every bin is labelled by its own edge, and the last one says what it catches.
    expect(buckets[0].label).toBe('<10.0s')
    expect(buckets.at(-1).label).toBe('30m00s+')
    // A trade with no hold recorded lands in the fastest bin rather than nowhere.
    expect(holdTimeBuckets([{ net: 1 }])[0].count).toBe(1)
  })
})

describe('medianHold', () => {
  it('resists the one trade held overnight by accident', () => {
    // A mean would be dragged past every hold the trader actually intends to take.
    expect(medianHold(TRADES)).toBe(20000)
    expect(medianHold([{ hold: 1000 }])).toBe(1000)
    expect(medianHold([])).toBe(0)
    // An even count averages the two middle holds rather than picking one arbitrarily.
    expect(medianHold([{ hold: 1000 }, { hold: 3000 }])).toBe(2000)
  })
})

describe('avgHold', () => {
  it('averages the durations', () => {
    expect(avgHold([{ hold: 1000 }, { hold: 3000 }])).toBe(2000)
    expect(avgHold([])).toBe(0)
  })
})

describe('drawHistogram', () => {
  it('draws a bar per bin, including the empty ones', () => {
    const ctx = fakeCtx()

    expect(drawHistogram(ctx, holdTimeBuckets(TRADES), { width: 280, height: 60 }, PALETTE)).toBe(
      HOLD_BINS.length + 1,
    )
    expect(ctx.fills).toHaveLength(HOLD_BINS.length + 1)

    expect(drawHistogram(ctx, [], { width: 280, height: 60 }, PALETTE)).toBe(0)
    expect(drawHistogram(null, [], { width: 1, height: 1 }, PALETTE)).toBe(0)
    expect(drawHistogram(ctx, holdTimeBuckets(TRADES), { width: 0, height: 0 }, PALETTE)).toBe(0)
    // An empty journal still draws its bins: a blank canvas would read as a broken chart.
    expect(drawHistogram(ctx, holdTimeBuckets([]), { width: 280, height: 60 }, PALETTE)).toBe(
      HOLD_BINS.length + 1,
    )
    // No palette handed in: the theme's own colours, which is how the app calls it.
    expect(drawHistogram(ctx, holdTimeBuckets(TRADES), { width: 280, height: 60 })).toBe(
      HOLD_BINS.length + 1,
    )
    expect(drawHistogram(ctx, holdTimeBuckets(TRADES), null, PALETTE)).toBe(0)
  })
})

describe('refreshHoldTimes', () => {
  it('publishes the shape and its centre together', () => {
    refreshHoldTimes(TRADES)
    tick()

    expect(appState.analytics.holds).toHaveLength(HOLD_BINS.length + 1)
    expect(appState.analytics.holdCentre.medianLabel).toBe('20.0s')
  })
})

describe('refreshHoldTimes defaults', () => {
  it('reads the published slice when handed nothing', () => {
    // The frame flush calls this with no arguments, so the default path is the live one.
    expect(refreshHoldTimes()).toHaveLength(HOLD_BINS.length + 1)
  })
})

describe('startHistogram', () => {
  it('does nothing without a canvas and draws once when there is one', () => {
    expect(startHistogram({ doc: { getElementById: () => null } })).toBeNull()

    const ctx = fakeCtx()
    const canvas = { clientWidth: 280, clientHeight: 60, style: {}, getContext: () => ctx }

    const redraw = startHistogram({
      doc: { getElementById: () => canvas },
      raf: (fn) => fn(),
      buckets: () => holdTimeBuckets(TRADES),
    })

    expect(redraw).toBeInstanceOf(Function)
    expect(ctx.fills).toHaveLength(HOLD_BINS.length + 1)

    // And with no plumbing handed in at all: the real document, the real rAF, the published
    // buckets. This is how bootstrap calls it, and a canvas-less page must not throw.
    expect(startHistogram()).toBeNull()

    const real = document.createElement('canvas')
    real.id = 'holds-canvas'
    document.body.append(real)
    expect(startHistogram()).toBeInstanceOf(Function)
    real.remove()
  })
})
