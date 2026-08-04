import { describe, it, expect } from 'vitest'
import { levelColor, clampLevel, drawLevelLine, chartLevels, LEVEL_DASH } from './levels.js'

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
    setLineDash: record('setLineDash'),
    fillText: record('fillText'),
  }
}

const palette = { up: '#0f0', down: '#f90', ink: '#eee', muted: '#666' }

describe('levelColor', () => {
  it('paints winning green whichever way the position points', () => {
    expect(levelColor({ side: 'long', entry: 100 }, 110, palette)).toBe('#0f0')
    expect(levelColor({ side: 'long', entry: 100 }, 90, palette)).toBe('#f90')

    // A short in profit is a market *below* its entry — orange there would read as a loss.
    expect(levelColor({ side: 'short', entry: 100 }, 90, palette)).toBe('#0f0')
    expect(levelColor({ side: 'SHORT', entry: 100 }, 110, palette)).toBe('#f90')

    // Flat is not losing.
    expect(levelColor({ side: 'long', entry: 100 }, 100, palette)).toBe('#0f0')
    // A position without an entry has no P&L to colour.
    expect(levelColor({}, 100, palette)).toBe('#666')
    expect(levelColor(null, null, palette)).toBe('#666')
  })
})

describe('clampLevel', () => {
  it('pins an off-plot level to its edge and says which way it went', () => {
    const range = { min: 100, max: 200 }

    expect(clampLevel(150, range, 50)).toEqual({ y: 25, offscreen: false, direction: 'none' })
    expect(clampLevel(300, range, 50)).toEqual({ y: 0, offscreen: true, direction: 'up' })
    expect(clampLevel(50, range, 50)).toEqual({ y: 50, offscreen: true, direction: 'down' })

    // Exactly on an edge is still on screen.
    expect(clampLevel(200, range, 50).offscreen).toBe(false)
    expect(clampLevel(100, range, 50).offscreen).toBe(false)
  })
})

describe('drawLevelLine', () => {
  it('dashes by kind and keeps the tag when the level runs off the plot', () => {
    const ctx = fakeCtx()
    const drawn = drawLevelLine(ctx, {
      price: 150,
      label: '150.0 × 2',
      color: '#0f0',
      kind: 'entry',
      range: { min: 100, max: 200 },
      width: 200,
      height: 50,
    })

    expect(drawn).toBe(true)
    // Entry lines dash, so they are never read as gridlines.
    expect(ctx.calls).toContainEqual(['setLineDash', [6, 4]])
    expect(ctx.calls).toContainEqual(['moveTo', 0, 25.5])
    expect(ctx.calls).toContainEqual(['lineTo', 200, 25.5])
    expect(ctx.calls).toContainEqual(['fillText', '150.0 × 2', 196, 25.5])

    // The last-price line is solid, and unlabelled levels tag themselves.
    const last = fakeCtx()
    drawLevelLine(last, {
      price: 150,
      kind: 'last',
      range: { min: 100, max: 200 },
      width: 200,
      height: 50,
      tickSize: 0.01,
    })
    expect(last.calls).toContainEqual(['setLineDash', []])
    expect(last.calls).toContainEqual(['fillText', '150.00', 196, 25.5])
    expect(LEVEL_DASH.last).toEqual([])

    // Above the plot: pinned to the top with an arrow rather than vanishing.
    const above = fakeCtx()
    drawLevelLine(above, {
      price: 500,
      label: '500',
      range: { min: 100, max: 200 },
      width: 200,
      height: 50,
    })
    expect(above.calls).toContainEqual(['fillText', '▲ 500', 196, 8])

    const below = fakeCtx()
    drawLevelLine(below, {
      price: 10,
      label: '10',
      kind: 'unknown-kind',
      range: { min: 100, max: 200 },
      width: 200,
      height: 50,
    })
    expect(below.calls).toContainEqual(['fillText', '▼ 10', 196, 42])

    expect(drawLevelLine(ctx, { price: NaN })).toBe(false)
    expect(drawLevelLine(null, { price: 1 })).toBe(false)
  })
})

describe('chartLevels', () => {
  it('lists the last price plus every entry, coloured by whether it is winning', () => {
    const levels = chartLevels({
      price: 110,
      positions: [
        { side: 'long', entry: 100, size: 2 },
        { side: 'short', entry: 120, size: 1 },
        { side: 'long', size: 5 },
      ],
      palette,
      tickSize: 0.1,
    })

    // Three levels: the market, and the two positions that have an entry to draw.
    expect(levels).toHaveLength(3)
    expect(levels[0]).toEqual({ price: 110, label: '110.0', color: '#eee', kind: 'last' })
    // Size rides on the tag: the distance only means money once you know the size.
    expect(levels[1]).toEqual({ price: 100, label: '100.0 × 2', color: '#0f0', kind: 'entry' })
    // The short entered at 120 with the market at 110 is in profit — green, not orange.
    expect(levels[2]).toEqual({ price: 120, label: '120.0 × 1', color: '#0f0', kind: 'entry' })

    // No price yet is a chart with no levels, not a chart with a zero line on it.
    expect(chartLevels({ positions: [{ entry: 100, size: 1 }] })).toHaveLength(1)
    expect(chartLevels()).toEqual([])
  })
})
