import { describe, it, expect } from 'vitest'
import { layoutMarkers, clusterFills, hitTestMarker, drawMarkers } from './markers.js'

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
    closePath: record('closePath'),
    fill: record('fill'),
    fillText: record('fillText'),
  }
}

const plot = {
  window: { from: 1000, to: 2000 },
  range: { min: 100, max: 200 },
  width: 100,
  height: 50,
}

describe('layoutMarkers', () => {
  it('projects fills onto the plot and drops the ones outside the window', () => {
    const markers = layoutMarkers(
      [
        { ts: 2000, px: 200, side: 'SELL', sz: 0.5 },
        { ts: 1000, px: 100, side: 'buy', sz: 1 },
        { ts: 500, px: 150, side: 'buy', sz: 1 },
        { ts: 1500, px: 'x', side: 'buy', sz: 1 },
      ],
      plot,
    )

    // The pre-window fill is dropped, not clamped: an edge marker would claim a trade
    // happened at a time it did not.
    expect(markers).toHaveLength(2)
    expect(markers.map((m) => m.ts)).toEqual([1000, 2000])
    expect(markers[0]).toEqual({ x: 0, y: 50, side: 'buy', sz: 1, ts: 1000, px: 100 })
    // Sides normalise, so a venue shouting SELL and one whispering sell cluster together.
    expect(markers[1].side).toBe('sell')
    expect(markers[1]).toMatchObject({ x: 100, y: 0 })

    expect(layoutMarkers(null, plot)).toEqual([])
    expect(layoutMarkers([{ ts: 1500, px: 150 }], {})).toHaveLength(1)
  })
})

describe('clusterFills', () => {
  it('merges a rapid-fire run into one badge but never merges across sides', () => {
    const clusters = clusterFills(
      [
        { x: 10, y: 20, side: 'buy', sz: 1 },
        { x: 14, y: 22, side: 'buy', sz: 2 },
        { x: 16, y: 21, side: 'sell', sz: 1 },
        { x: 40, y: 20, side: 'buy', sz: 3 },
      ],
      8,
    )

    expect(clusters).toHaveLength(3)
    expect(clusters[0]).toMatchObject({ count: 2, totalSz: 3, side: 'buy' })
    // The badge sits on the run's centre of mass, not on whichever fill arrived first.
    expect(clusters[0].x).toBe(12)

    // A sell inside the same 8px is the interesting case — it stays its own glyph.
    expect(clusters[1]).toMatchObject({ count: 1, side: 'sell' })
    expect(clusters[2]).toMatchObject({ count: 1, totalSz: 3, x: 40 })

    // Far apart in price is far apart, even at the same instant.
    expect(clusterFills([
      { x: 10, y: 10, side: 'buy', sz: 1 },
      { x: 10, y: 40, side: 'buy', sz: 1 },
    ])).toHaveLength(2)

    expect(clusterFills(null)).toEqual([])
  })
})

describe('hitTestMarker', () => {
  it('returns the nearest marker in range and nothing when the cursor is off them', () => {
    const markers = [
      { x: 10, y: 10, side: 'buy' },
      { x: 14, y: 12, side: 'sell' },
      { x: 90, y: 40, side: 'buy' },
    ]

    // Two markers overlap the cursor; the closer one wins.
    expect(hitTestMarker(markers, { x: 13, y: 12 }, 10).side).toBe('sell')
    expect(hitTestMarker(markers, { x: 10, y: 10 }, 10).side).toBe('buy')

    expect(hitTestMarker(markers, { x: 50, y: 50 }, 10)).toBeNull()
    expect(hitTestMarker(markers, null)).toBeNull()
    expect(hitTestMarker(null, { x: 10, y: 10 })).toBeNull()
  })
})

describe('drawMarkers', () => {
  it('points buys up from below and sells down from above, badging the clusters', () => {
    const ctx = fakeCtx()
    const drawn = drawMarkers(ctx, {
      markers: [
        { x: 20, y: 30, side: 'buy', count: 3 },
        { x: 60, y: 10, side: 'sell', count: 1 },
      ],
      palette: { up: '#0f0', down: '#f90', ink: '#eee' },
      size: 5,
    })

    expect(drawn).toBe(2)
    // The buy triangle's tip is above its fill price, so the glyph never covers it.
    expect(ctx.calls).toContainEqual(['moveTo', 20, 25])
    expect(ctx.calls).toContainEqual(['lineTo', 15, 35])
    // The sell points the other way, from above.
    expect(ctx.calls).toContainEqual(['moveTo', 60, 15])
    expect(ctx.calls).toContainEqual(['lineTo', 55, 5])

    // Only the cluster gets a count badge; a lone fill needs no explaining.
    const badges = ctx.calls.filter(([name]) => name === 'fillText')
    expect(badges).toEqual([['fillText', '3', 20, 43]])

    expect(drawMarkers(ctx, { markers: [] })).toBe(0)
    expect(drawMarkers(null, { markers: [{ x: 1, y: 1 }] })).toBe(0)
  })
})
