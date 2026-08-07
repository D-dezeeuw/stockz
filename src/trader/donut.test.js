// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { drawDonut, sliceColor, startTraderDonut, DONUT_ID, HOLE } from './donut.js'
import { decisionBreakdown } from './mirror.js'
import { setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

const PALETTE = { up: '#0f0', down: '#f80', muted: '#888', grid: '#333', bg: '#000', ink: '#fff' }

/** A recording 2D context — jsdom has no canvas, and the calls are what matters here. */
function fakeCtx() {
  const calls = []
  const rec = (name) => (...args) => calls.push({ name, args })
  return {
    calls,
    clearRect: rec('clearRect'),
    beginPath: rec('beginPath'),
    moveTo: rec('moveTo'),
    arc: rec('arc'),
    closePath: rec('closePath'),
    fill: rec('fill'),
    stroke: rec('stroke'),
    fillText: rec('fillText'),
  }
}

beforeEach(() => {
  resetState()
  document.body.innerHTML = ''
})

describe('sliceColor', () => {
  it('uses the desk\'s own meanings, never a categorical rainbow', () => {
    // On this desk colour already means profit and loss. A third meaning would break both.
    expect(sliceColor('up', PALETTE)).toBe(PALETTE.up)
    expect(sliceColor('down', PALETTE)).toBe(PALETTE.down)
    expect(sliceColor('muted', PALETTE)).toBe(PALETTE.muted)
    expect(sliceColor('unknown', PALETTE)).toBe(PALETTE.muted)
  })
})

describe('drawDonut', () => {
  it('draws one arc per slice, a hole, and the taken count in it', () => {
    const ctx = fakeCtx()
    const slices = decisionBreakdown({ entry: 3, exit: 1, benched: 16 })

    expect(drawDonut(ctx, { width: 100, height: 100 }, slices, PALETTE)).toBe(3)

    // Three wedges plus the hole punch — every arc call after the wedges is the hole.
    const arcs = ctx.calls.filter((c) => c.name === 'arc')
    expect(arcs).toHaveLength(4)
    // From twelve o'clock: the only start a reader assumes without being told.
    expect(arcs[0].args[3]).toBeCloseTo(-Math.PI / 2, 6)
    // The full circle is accounted for — no gap, no overlap.
    const swept = arcs.slice(0, 3).reduce((sum, a) => sum + (a.args[4] - a.args[3]), 0)
    expect(swept).toBeCloseTo(Math.PI * 2, 6)
    // The hole is punched at the configured fraction of the radius.
    expect(arcs[3].args[2]).toBeCloseTo(48 * HOLE, 6)

    // The number in the middle is the one fact worth reading across the room, so it is
    // text rather than an arc anybody has to estimate: 3 entries + 1 exit.
    const labels = ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0])
    expect(labels).toContain('4')
    expect(labels).toContain('taken')
  })

  it('draws an empty ring rather than nothing at all', () => {
    const ctx = fakeCtx()
    // A blank block reads as broken; a drawn-but-empty ring reads as "nothing yet", which
    // is the truth.
    expect(drawDonut(ctx, { width: 80, height: 80 }, [], PALETTE)).toBe(0)
    expect(ctx.calls.some((c) => c.name === 'arc')).toBe(true)
    expect(ctx.calls.some((c) => c.name === 'fillText')).toBe(false)

    // No surface is no drawing, not a crash.
    expect(drawDonut(ctx, { width: 0, height: 0 }, [], PALETTE)).toBe(0)
    expect(drawDonut(null, { width: 80, height: 80 }, [], PALETTE)).toBe(0)
  })
})

describe('startTraderDonut', () => {
  it('finds its own block\'s canvas and redraws when the snapshot changes', () => {
    document.body.innerHTML = `
      <section class="block" data-block-id="watchlist">
        <canvas id="${DONUT_ID}"></canvas>
      </section>
      <section class="block" data-block-id="trader">
        <canvas id="${DONUT_ID}"></canvas>
      </section>`

    const draw = vi.fn(() => 2)
    let fire = null
    const chart = startTraderDonut({
      doc: document,
      draw,
      watch: (paths, fn) => {
        fire = fn
        expect(paths).toEqual([PATHS.trader.view])
        return () => {}
      },
    })

    expect(draw).toHaveBeenCalledTimes(1)

    setValue(PATHS.trader.view, { breakdown: decisionBreakdown({ entry: 1, benched: 4 }) })
    tick()
    fire()
    expect(draw).toHaveBeenCalledTimes(2)
    // The breakdown reaches the renderer, not an empty default.
    expect(draw.mock.calls[1][2].map((s) => s.key)).toEqual(['entry', 'benched'])

    chart.stop()
  })

  it('does nothing when its canvas is not in the document', () => {
    const draw = vi.fn()
    const chart = startTraderDonut({ doc: document, draw, watch: () => () => {} })
    expect(chart.redraw()).toBe(0)
    expect(draw).not.toHaveBeenCalled()
  })
})
