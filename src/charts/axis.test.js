import { describe, it, expect } from 'vitest'
import { axisRows, drawAxisGrid } from './axis.js'

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
    fillText: record('fillText'),
  }
}

describe('axisRows', () => {
  it('labels each gridline at the pixel its price actually lands on', () => {
    const rows = axisRows({ min: 0, max: 100 }, 200, { count: 4, tickSize: 0.1 })

    expect(rows.map((r) => r.price)).toEqual([0, 25, 50, 75, 100])
    // Top of the plot is the top of the range: canvas y grows the other way.
    expect(rows[0]).toEqual({ price: 0, y: 200, label: '0.0' })
    expect(rows[4].y).toBe(0)
    expect(rows[2].y).toBe(100)

    // Nothing to divide means no axis rather than a fabricated one.
    expect(axisRows({ min: 5, max: 5 }, 200)).toEqual([])
  })
})

describe('drawAxisGrid', () => {
  it('strokes one hairline per row and prints its label on the right edge', () => {
    const ctx = fakeCtx()
    const drawn = drawAxisGrid(ctx, {
      range: { min: 0, max: 100 },
      width: 300,
      height: 200,
      palette: { grid: '#123', muted: '#456' },
      count: 4,
      tickSize: 1,
    })

    expect(drawn).toBe(5)
    expect(ctx.strokeStyle).toBe('#123')
    expect(ctx.calls.filter(([name]) => name === 'stroke')).toHaveLength(5)

    // Lines snap to a half pixel so a 1px stroke lands on one device pixel.
    const first = ctx.calls.find(([name]) => name === 'moveTo')
    expect(first).toEqual(['moveTo', 0, 200.5])
    expect(ctx.calls).toContainEqual(['lineTo', 300, 200.5])
    expect(ctx.calls).toContainEqual(['fillText', '0', 296, 200.5])

    // Labels off draws the lines only.
    const bare = fakeCtx()
    drawAxisGrid(bare, { range: { min: 0, max: 100 }, width: 300, height: 200, labels: false })
    expect(bare.calls.some(([name]) => name === 'fillText')).toBe(false)

    expect(drawAxisGrid(null, {})).toBe(0)
    expect(drawAxisGrid(fakeCtx())).toBe(0)
  })
})
