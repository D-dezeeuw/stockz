import { describe, it, expect, beforeEach } from 'vitest'
import {
  candleBoxes,
  volumeScale,
  drawCandles,
  drawVolumeBand,
  closeY,
  registerCandleActions,
} from './candlestick.js'
import { clearActions, dispatchAction } from '../actions/registry.js'
import { appState, tick, resetState } from '../app/engine.js'

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
    fillRect: record('fillRect'),
  }
}

describe('candleBoxes', () => {
  it('splits the plot evenly and drops the gap when candles get too thin', () => {
    const boxes = candleBoxes(4, 100)

    expect(boxes).toHaveLength(4)
    expect(boxes[0]).toEqual({ x: 2.5, width: 20, slot: 25 })
    expect(boxes[3].x).toBe(77.5)
    // Every body sits inside its own slot, so no two candles ever overlap.
    expect(boxes[1].x).toBeGreaterThanOrEqual(boxes[0].x + boxes[0].width)

    // Below three pixels a gap costs more than it says: bodies go solid instead.
    const dense = candleBoxes(100, 100)
    expect(dense[0]).toEqual({ x: 0, width: 1, slot: 1 })

    expect(candleBoxes(0, 100)).toEqual([])
    expect(candleBoxes(4, 0)).toEqual([])
  })
})

describe('volumeScale', () => {
  it('takes the peak bar as the reference, ignoring junk volumes', () => {
    expect(volumeScale([{ v: 1 }, { v: 9 }, { v: 4 }])).toBe(9)
    expect(volumeScale([{ v: 'x' }, { v: 2 }])).toBe(2)

    // No volume is not an error; it means no band to scale.
    expect(volumeScale([])).toBe(0)
    expect(volumeScale(null)).toBe(0)
  })
})

describe('drawCandles', () => {
  it('paints bodies in trend colour with a hairline wick down the slot centre', () => {
    const ctx = fakeCtx()
    const drawn = drawCandles(ctx, {
      candles: [
        { o: 100, h: 120, l: 90, c: 110 },
        { o: 110, h: 115, l: 80, c: 85 },
      ],
      range: { min: 80, max: 120 },
      width: 100,
      height: 40,
      palette: { up: '#0f0', down: '#f90' },
    })

    expect(drawn).toBe(2)
    // Two wicks, two bodies — and the last candle sets the last colour.
    expect(ctx.calls.filter(([name]) => name === 'stroke')).toHaveLength(2)
    expect(ctx.calls.filter(([name]) => name === 'fillRect')).toHaveLength(2)
    expect(ctx.fillStyle).toBe('#f90')

    // The rising candle's body spans open→close, top-down in canvas coordinates.
    const bodies = ctx.calls.filter(([name]) => name === 'fillRect')
    expect(bodies[0]).toEqual(['fillRect', 5, 10, 40, 10])
    // Its wick runs high→low through the centre of the same slot, snapped half a pixel.
    expect(ctx.calls.filter(([name]) => name === 'moveTo')[0]).toEqual(['moveTo', 25.5, 0])
    expect(ctx.calls.filter(([name]) => name === 'lineTo')[0]).toEqual(['lineTo', 25.5, 30])

    expect(drawCandles(ctx, { candles: [] })).toBe(0)
    expect(drawCandles(null, { candles: [{ o: 1, c: 1 }] })).toBe(0)
  })
})

describe('drawVolumeBand', () => {
  it('scales bars against the peak and hangs them off the bottom edge', () => {
    const ctx = fakeCtx()
    const drawn = drawVolumeBand(ctx, {
      candles: [
        { o: 1, c: 2, v: 10 },
        { o: 2, c: 1, v: 5 },
        { o: 1, c: 1, v: 0 },
      ],
      width: 90,
      height: 100,
      palette: { up: '#0f0', down: '#f90' },
    })

    // The zero-volume candle gets no bar at all rather than a zero-height artefact.
    expect(drawn).toBe(2)
    expect(ctx.globalAlpha).toBe(0.35)

    const bars = ctx.calls.filter(([name]) => name === 'fillRect')
    // The peak bar fills the band; half the volume is half the height.
    expect(bars[0]).toEqual(['fillRect', 3, 80, 24, 20])
    expect(bars[1]).toEqual(['fillRect', 33, 90, 24, 10])

    // A series with no volume at all draws nothing instead of dividing by zero.
    expect(drawVolumeBand(fakeCtx(), { candles: [{ v: 0 }], width: 10, height: 10 })).toBe(0)
    expect(drawVolumeBand(null, { candles: [{ v: 1 }] })).toBe(0)
  })
})

describe('closeY', () => {
  it('places the close where the level lines and readout expect it', () => {
    const range = { min: 100, max: 200 }

    expect(closeY({ c: 200 }, range, 50)).toBe(0)
    expect(closeY({ c: 150 }, range, 50)).toBe(25)
    // A candle with no close sits on the floor rather than at a fabricated price of 0,
    // which on a $100 instrument would draw far below the plot.
    expect(closeY({}, range, 50)).toBe(50)
  })
})

describe('registerCandleActions', () => {
  beforeEach(() => {
    clearActions()
    resetState()
  })

  it('accepts known intervals and ignores anything that would blank the chart', () => {
    const name = registerCandleActions()
    expect(name).toBe('ui.setCandleInterval')

    expect(dispatchAction(name, { interval: '5s' })).toBe(true)
    tick()
    expect(appState.ui.candleInterval).toBe('5s')

    // A bare string payload works too, since data-action passes one.
    expect(dispatchAction(name, '1m')).toBe(true)
    tick()
    expect(appState.ui.candleInterval).toBe('1m')

    // A fat-fingered interval leaves the chart exactly as it was.
    expect(dispatchAction(name, { interval: '17s' })).toBe(false)
    tick()
    expect(appState.ui.candleInterval).toBe('1m')
  })
})
