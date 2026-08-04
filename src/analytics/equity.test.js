import { describe, it, expect, beforeEach } from 'vitest'
import {
  equitySeries,
  equityRange,
  drawdown,
  drawEquity,
  nearestPoint,
  refreshEquity,
  mountEquity,
  startEquityChart,
} from './equity.js'
import { appState, tick, resetState } from '../app/engine.js'

const TRADES = [
  { id: 'a', net: 10, closeTs: 100 },
  { id: 'b', net: -4, closeTs: 200 },
  { id: 'c', net: 2, closeTs: 300 },
]

const PALETTE = { up: 'g', down: 'o', muted: 'm', grid: 'l' }

/** A 2D context stand-in that records what it was asked to draw. */
function fakeCtx() {
  const calls = []
  return {
    calls,
    strokes: [],
    clearRect: (...args) => calls.push(['clear', ...args]),
    beginPath: () => calls.push(['begin']),
    moveTo: (x, y) => calls.push(['move', x, y]),
    lineTo: (x, y) => calls.push(['line', x, y]),
    stroke() {
      this.strokes.push(this.strokeStyle)
      calls.push(['stroke'])
    },
  }
}

beforeEach(() => {
  resetState()
})

describe('equitySeries', () => {
  it('accumulates, so the point is the account and not the trade', () => {
    const series = equitySeries(TRADES)

    expect(series.map((point) => point.equity)).toEqual([10, 6, 8])
    expect(series[0]).toMatchObject({ i: 0, ts: 100, net: 10, id: 'a' })

    expect(equitySeries(null)).toEqual([])
  })
})

describe('equityRange', () => {
  it('always contains zero, or a losing session looks like a rising one', () => {
    const range = equityRange(equitySeries(TRADES), 0)
    expect(range).toEqual({ min: 0, max: 10 })

    // Every trade a loser: the waterline is still the top of the chart.
    expect(equityRange(equitySeries([{ net: -5 }]), 0)).toEqual({ min: -5, max: 0 })

    // A flat curve still gets a range to draw inside.
    expect(equityRange([{ equity: 0 }], 0)).toEqual({ min: -1, max: 1 })
    expect(equityRange([], 0)).toEqual({ min: -1, max: 1 })
  })
})

describe('drawdown', () => {
  it('measures from the running peak, not from zero', () => {
    // Up 10, back to 6: a four-point drawdown despite never going red.
    expect(drawdown(equitySeries(TRADES))).toEqual({ maxDrawdown: -4, peak: 10, trough: 6 })

    expect(drawdown(equitySeries([{ net: 1 }, { net: 2 }]))).toMatchObject({ maxDrawdown: 0 })
    expect(drawdown(null).maxDrawdown).toBe(0)
  })
})

describe('drawEquity', () => {
  it('splits colour at the waterline, so no legend is needed', () => {
    const ctx = fakeCtx()

    expect(drawEquity(ctx, equitySeries([{ net: 5 }, { net: -20 }]), { width: 100, height: 50 }, PALETTE)).toBe(true)
    // The last segment ends underwater and is drawn in the loss colour.
    expect(ctx.strokes.at(-1)).toBe('o')
    expect(ctx.calls[0][0]).toBe('clear')

    expect(drawEquity(ctx, [], { width: 100, height: 50 }, PALETTE)).toBe(false)
    expect(drawEquity(null, [], { width: 1, height: 1 }, PALETTE)).toBe(false)
    expect(drawEquity(ctx, equitySeries(TRADES), { width: 0, height: 0 }, PALETTE)).toBe(false)
  })
})

describe('nearestPoint', () => {
  it('snaps to a trade, because equity between two trades never existed', () => {
    const series = equitySeries(TRADES)

    expect(nearestPoint(0, series, 100).id).toBe('a')
    expect(nearestPoint(50, series, 100).id).toBe('b')
    expect(nearestPoint(100, series, 100).id).toBe('c')

    // Off the ends clamps rather than returning nothing.
    expect(nearestPoint(-40, series, 100).id).toBe('a')
    expect(nearestPoint(999, series, 100).id).toBe('c')
    expect(nearestPoint(10, [], 100)).toBeNull()
  })
})

describe('refreshEquity', () => {
  it('reverses the journal, because the list reads newest-first and a curve does not', () => {
    // The journal publishes newest-first for reading; a curve drawn that way runs backwards.
    const series = refreshEquity([...TRADES].reverse())
    tick()

    expect(series.map((point) => point.id)).toEqual(['a', 'b', 'c'])
    expect(appState.analytics.equity.at(-1).equity).toBe(8)
    expect(appState.analytics.drawdown.maxDrawdown).toBe(-4)
  })
})

describe('mountEquity', () => {
  it('re-rasterises on each draw rather than trusting the last size', () => {
    const ctx = fakeCtx()
    const canvas = {
      clientWidth: 120,
      clientHeight: 60,
      style: {},
      getContext: () => ctx,
    }

    const redraw = mountEquity(canvas, { series: () => equitySeries(TRADES) })
    redraw()

    // A block that changed size between frames would otherwise stretch the old bitmap.
    expect(canvas.width).toBeGreaterThan(0)
    expect(ctx.strokes.length).toBeGreaterThan(0)

    expect(mountEquity(null)).toBeInstanceOf(Function)
    expect(mountEquity(null)()).toBeUndefined()
  })
})

describe('startEquityChart', () => {
  it('does nothing without a canvas, and redraws on a frame when there is one', () => {
    // A block the trader has hidden has no canvas, and the chart must not be the reason
    // boot throws.
    expect(startEquityChart({ doc: { getElementById: () => null } })).toBeNull()

    const ctx = fakeCtx()
    const canvas = { clientWidth: 100, clientHeight: 40, style: {}, getContext: () => ctx }
    const frames = []

    const redraw = startEquityChart({
      doc: { getElementById: () => canvas },
      raf: (fn) => frames.push(fn),
      series: () => equitySeries(TRADES),
    })

    expect(redraw).toBeInstanceOf(Function)
    // Drawn once immediately: an empty chart until the next trade closes would look broken.
    expect(ctx.strokes.length).toBeGreaterThan(0)
  })
})
