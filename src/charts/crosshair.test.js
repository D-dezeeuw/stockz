// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  pointerToChart,
  trackPointer,
  snapToTick,
  crosshairReadout,
  formatClock,
  drawCrosshair,
} from './crosshair.js'

/** A 2D context double recording every call the overlay makes. */
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
    clearRect: record('clearRect'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    stroke: record('stroke'),
    setLineDash: record('setLineDash'),
    fillRect: record('fillRect'),
    fillText: record('fillText'),
  }
}

describe('pointerToChart', () => {
  it('subtracts the canvas origin and flags a cursor that has left the plot', () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 }

    expect(pointerToChart({ clientX: 150, clientY: 80 }, rect)).toEqual({
      x: 50,
      y: 30,
      inside: true,
    })

    // Just past the right edge is outside — the overlay must clear, not clamp.
    expect(pointerToChart({ clientX: 301, clientY: 80 }, rect).inside).toBe(false)
    expect(pointerToChart({ clientX: 99, clientY: 80 }, rect).inside).toBe(false)

    expect(pointerToChart({}, rect)).toEqual({ x: 0, y: 0, inside: false })
    // No rectangle means no plot to be inside of.
    expect(pointerToChart({ clientX: 5, clientY: 5 }, null)).toEqual({ x: 5, y: 5, inside: false })
  })
})

describe('snapToTick', () => {
  it('finds the nearest real print, including at both ends of the buffer', () => {
    const ticks = [
      { ts: 100, px: 1 },
      { ts: 200, px: 2 },
      { ts: 300, px: 3 },
      { ts: 400, px: 4 },
    ]

    // Nearest, not next: 240 is closer to 200 than to 300.
    expect(snapToTick(ticks, 240).ts).toBe(200)
    expect(snapToTick(ticks, 260).ts).toBe(300)
    expect(snapToTick(ticks, 200).ts).toBe(200)

    // Before the first print and after the last one both clamp to the edge.
    expect(snapToTick(ticks, 0).ts).toBe(100)
    expect(snapToTick(ticks, 9999).ts).toBe(400)

    // No timestamp at all means "now", which is the newest print.
    expect(snapToTick(ticks, NaN).ts).toBe(400)
    expect(snapToTick([], 100)).toBeNull()
    expect(snapToTick(null, 100)).toBeNull()
  })
})

describe('crosshairReadout', () => {
  it('snaps time to a real print while price follows the cursor', () => {
    const context = {
      ticks: [
        { ts: 1000, px: 100 },
        { ts: 2000, px: 110 },
      ],
      window: { from: 1000, to: 2000 },
      range: { min: 100, max: 110 },
      width: 100,
      height: 50,
      tickSize: 0.1,
    }

    const readout = crosshairReadout({ x: 90, y: 25 }, context)

    // x 90 is 1900ms — nearest print is the one at 2000, and it is pinned to its own x.
    expect(readout.ts).toBe(2000)
    expect(readout.x).toBe(100)
    expect(readout.price).toBe(110)
    expect(readout.priceLabel).toBe('110.0')
    expect(readout.snapped).toBe(true)

    // With no prints to snap to, price is read straight off the cursor's y.
    const bare = crosshairReadout({ x: 50, y: 25 }, { ...context, ticks: [] })
    expect(bare.snapped).toBe(false)
    expect(bare.price).toBe(105)
    expect(bare.ts).toBe(1500)

    expect(crosshairReadout(null, context).snapped).toBe(true)
  })
})

describe('formatClock', () => {
  it('keeps milliseconds, because two prints in one second is routine', () => {
    expect(formatClock(Date.UTC(2026, 7, 3, 14, 5, 9, 42))).toBe('14:05:09.042')
    expect(formatClock(Date.UTC(2026, 7, 3, 0, 0, 0, 0))).toBe('00:00:00.000')

    expect(formatClock(NaN)).toBe('--:--:--.---')
  })
})

describe('drawCrosshair', () => {
  it('wipes its own surface each frame and pills the price and time', () => {
    const ctx = fakeCtx()
    const drawn = drawCrosshair(ctx, {
      readout: { x: 60, y: 20, priceLabel: '110.0', timeLabel: '14:05:09.042' },
      width: 200,
      height: 100,
      palette: { muted: '#666', ink: '#eee', bg: '#000' },
    })

    expect(drawn).toBe(true)
    // The overlay owns its surface: one wipe, then the hairlines.
    expect(ctx.calls[0]).toEqual(['clearRect', 0, 0, 200, 100])
    expect(ctx.calls).toContainEqual(['setLineDash', [3, 3]])
    expect(ctx.calls).toContainEqual(['moveTo', 0, 20.5])
    expect(ctx.calls).toContainEqual(['lineTo', 60.5, 100])

    // Price pill on the right axis, time pill on the bottom edge.
    expect(ctx.calls).toContainEqual(['fillText', '110.0', 196, 20.5])
    expect(ctx.calls).toContainEqual(['fillText', '14:05:09.042', 60.5, 92])

    // A cursor that left the plot clears the overlay and draws nothing else.
    const gone = fakeCtx()
    expect(drawCrosshair(gone, { readout: {}, width: 200, height: 100, visible: false })).toBe(
      false,
    )
    expect(gone.calls).toEqual([['clearRect', 0, 0, 200, 100]])

    expect(drawCrosshair(null, {})).toBe(false)
    expect(drawCrosshair(fakeCtx(), { width: 10, height: 10 })).toBe(false)
  })
})

describe('trackPointer', () => {
  it('reports chart-space moves and clears the moment the pointer leaves', () => {
    const host = document.createElement('div')
    host.getBoundingClientRect = () => ({ left: 10, top: 20, width: 100, height: 50 })

    const seen = []
    const stop = trackPointer(host, (position) => seen.push(position))

    // A drag over the chart must not scroll the page out from under it.
    expect(host.style.touchAction).toBe('none')

    host.dispatchEvent(new window.PointerEvent('pointermove', { clientX: 60, clientY: 40 }))
    expect(seen).toEqual([{ x: 50, y: 20, inside: true }])

    // Outside the plot reads the same as gone: null, so the overlay clears.
    host.dispatchEvent(new window.PointerEvent('pointermove', { clientX: 500, clientY: 40 }))
    expect(seen[1]).toBeNull()

    host.dispatchEvent(new window.PointerEvent('pointerleave', {}))
    expect(seen[2]).toBeNull()

    stop()
    host.dispatchEvent(new window.PointerEvent('pointermove', { clientX: 60, clientY: 40 }))
    expect(seen).toHaveLength(3)

    expect(() => trackPointer(null, () => {})()).not.toThrow()
    expect(() => trackPointer(host, null)()).not.toThrow()
  })
})
