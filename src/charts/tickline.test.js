import { describe, it, expect } from 'vitest'
import {
  downsampleColumn,
  gapSplit,
  pulseRadius,
  drawTickLine,
  trendUp,
} from './tickline.js'

/** A 2D context double recording every call the renderer makes. */
function fakeCtx() {
  const calls = []
  const record =
    (name) =>
    (...args) =>
      calls.push([name, ...args])

  return {
    calls,
    save: record('save'),
    restore: record('restore'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    stroke: record('stroke'),
    arc: record('arc'),
    fill: record('fill'),
  }
}

describe('downsampleColumn', () => {
  it('keeps both extremes per pixel column, so a one-print spike survives', () => {
    // A one-second window across 100px puts ten milliseconds in every pixel column.
    const window = { from: 0, to: 1000 }
    const ticks = [
      { ts: 0, px: 10 },
      { ts: 1, px: 12 },
      { ts: 2, px: 9 },
      { ts: 500, px: 11 },
      { ts: 1000, px: 14 },
    ]

    const columns = downsampleColumn(ticks, window, 100)

    // Three prints inside the first pixel collapse to one column that still remembers
    // the high and the low — an average would erase exactly the print being watched.
    expect(columns).toHaveLength(3)
    expect(columns[0]).toEqual({ x: 0, min: 9, max: 12, first: 10, last: 9 })
    expect(columns[2]).toEqual({ x: 100, min: 14, max: 14, first: 14, last: 14 })

    // Columns come out left to right regardless of arrival order.
    expect(columns.map((c) => c.x)).toEqual([0, 50, 100])

    expect(downsampleColumn([{ ts: NaN, px: 1 }, null], window, 100)).toEqual([])
    expect(downsampleColumn(null, window, 100)).toEqual([])
  })
})

describe('gapSplit', () => {
  it('breaks the line on a stall instead of drawing a market that never traded', () => {
    const runs = gapSplit(
      [{ ts: 0 }, { ts: 100 }, { ts: 5000 }, { ts: 5100 }],
      2000,
    )

    expect(runs).toHaveLength(2)
    expect(runs[0].map((t) => t.ts)).toEqual([0, 100])
    expect(runs[1].map((t) => t.ts)).toEqual([5000, 5100])

    // Spacing inside the threshold stays one continuous run.
    expect(gapSplit([{ ts: 0 }, { ts: 1999 }], 2000)).toHaveLength(1)
    expect(gapSplit([{ ts: 'x' }], 2000)).toEqual([])
    expect(gapSplit(null)).toEqual([])
  })
})

describe('pulseRadius', () => {
  it('snaps open on a print and eases back to a resting dot', () => {
    expect(pulseRadius(1000, 1000)).toBe(6)
    expect(pulseRadius(1400, 1000)).toBe(2.5)
    expect(pulseRadius(1200, 1000)).toBeCloseTo(3.375, 5)

    // Halfway through, the dot is already most of the way home: ease-out, not linear.
    expect(pulseRadius(1200, 1000)).toBeLessThan((6 + 2.5) / 2)

    // A tick from the future, or no tick at all, rests rather than glitching.
    expect(pulseRadius(1000, 2000)).toBe(2.5)
    expect(pulseRadius(1000, NaN)).toBe(2.5)
  })
})

describe('trendUp', () => {
  it('reads direction across the visible span, defaulting to up when empty', () => {
    expect(trendUp([{ px: 10 }, { px: 12 }])).toBe(true)
    expect(trendUp([{ px: 12 }, { px: 10 }])).toBe(false)

    // Unchanged over the window is not a loss.
    expect(trendUp([{ px: 10 }, { px: 10 }])).toBe(true)
    expect(trendUp([])).toBe(true)
    expect(trendUp(null)).toBe(true)
  })
})

describe('drawTickLine', () => {
  it('strokes each run separately and pulses the newest print', () => {
    const ctx = fakeCtx()
    const segments = drawTickLine(ctx, {
      ticks: [
        { ts: 0, px: 10 },
        { ts: 20, px: 12 },
        { ts: 5000, px: 11 },
      ],
      window: { from: 0, to: 5000 },
      range: { min: 9, max: 13 },
      width: 100,
      height: 50,
      palette: { up: '#0f0', down: '#f90' },
      maxGapMs: 2000,
      now: 5000,
    })

    // Two prints 20ms apart share a pixel column on a five-second window, so the first
    // run costs one segment carrying both extremes — that is the downsampling working.
    expect(segments).toBe(2)
    // Rising over the window: the up colour, and a glow rather than a second stroke.
    expect(ctx.strokeStyle).toBe('#0f0')
    expect(ctx.shadowBlur).toBe(6)

    // A stall in the middle means two paths, not one line across dead air.
    expect(ctx.calls.filter(([name]) => name === 'stroke')).toHaveLength(2)

    // The newest print gets the pulse dot at full radius.
    expect(ctx.calls).toContainEqual(['arc', 100, 25, 6, 0, Math.PI * 2])

    const falling = fakeCtx()
    drawTickLine(falling, {
      ticks: [{ ts: 0, px: 12 }, { ts: 10, px: 10 }],
      window: { from: 0, to: 10 },
      range: { min: 9, max: 13 },
      width: 100,
      height: 50,
      palette: { up: '#0f0', down: '#f90' },
      glow: false,
    })
    expect(falling.strokeStyle).toBe('#f90')
    expect(falling.shadowBlur).toBeUndefined()

    // Nothing to draw is not an error; it is a quiet chart.
    expect(drawTickLine(fakeCtx(), {})).toBe(0)
    expect(drawTickLine(null, {})).toBe(0)
  })
})
