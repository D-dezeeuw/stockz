// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { tickWindow, markOnTick, mountTickChart } from './mount.js'
import { publishTick, resetBus } from '../pipeline/bus.js'

beforeEach(() => resetBus())

/** A canvas double with a recording 2D context. */
function fakeCanvas() {
  const calls = []
  const record =
    (name) =>
    (...args) =>
      calls.push([name, ...args])

  return {
    calls,
    style: {},
    width: 0,
    height: 0,
    clientWidth: 200,
    clientHeight: 100,
    getContext: () => ({
      calls,
      setTransform: record('setTransform'),
      clearRect: record('clearRect'),
      save: record('save'),
      restore: record('restore'),
      beginPath: record('beginPath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      stroke: record('stroke'),
      fillText: record('fillText'),
      arc: record('arc'),
      fill: record('fill'),
    }),
  }
}

describe('tickWindow', () => {
  it('ends the window at now, so the present sits at the right edge', () => {
    expect(tickWindow(10000, 1000)).toEqual({ from: 9000, to: 10000 })
    expect(tickWindow(10000)).toEqual({ from: -50000, to: 10000 })

    // A broken clock still yields a usable span rather than NaN pixels.
    expect(tickWindow(NaN, 1000)).toEqual({ from: 0, to: 1000 })
    expect(tickWindow(10000, 0)).toEqual({ from: 9999, to: 10000 })
  })
})

describe('markOnTick', () => {
  it('repaints on its own symbol only, never on someone else trading', () => {
    let dirty = 0
    const stop = markOnTick('BTC-USDT', { markDirty: () => (dirty += 1) })

    publishTick({ symbol: 'BTC-USDT', px: 1, ts: 1, venue: 'okx' })
    expect(dirty).toBe(1)

    publishTick({ symbol: 'ETH-USDT', px: 1, ts: 2, venue: 'okx' })
    expect(dirty).toBe(1)

    stop()
    publishTick({ symbol: 'BTC-USDT', px: 2, ts: 3, venue: 'okx' })
    expect(dirty).toBe(1)

    // An empty symbol is a wildcard: the block follows whatever the desk is focused on.
    let any = 0
    markOnTick('', { markDirty: () => (any += 1) })
    publishTick({ symbol: 'SOL-USDT', px: 1, ts: 4, venue: 'okx' })
    expect(any).toBe(1)

    expect(() => markOnTick('BTC-USDT', null)()).not.toThrow()
  })
})

describe('mountTickChart', () => {
  it('draws once per frame however many prints land between frames', () => {
    const canvas = fakeCanvas()
    const frames = []
    let now = 10000

    const chart = mountTickChart(canvas, {
      symbol: 'BTC-USDT',
      spanMs: 1000,
      clock: () => now,
      raf: (fn) => frames.push(fn),
    })

    publishTick({ symbol: 'BTC-USDT', px: 100, ts: 9500, venue: 'okx' })
    publishTick({ symbol: 'BTC-USDT', px: 101, ts: 9800, venue: 'okx' })
    publishTick({ symbol: 'BTC-USDT', px: 102, ts: 10000, venue: 'okx' })

    // Three prints, one frame, one draw — the whole point of the dirty flag.
    frames.shift()()
    expect(chart.loop.drawCount()).toBe(1)

    // The canvas was sized from its box and wiped before the line went down.
    expect(canvas.width).toBe(200)
    expect(canvas.calls).toContainEqual(['clearRect', 0, 0, 200, 100])
    expect(canvas.calls.some(([name]) => name === 'stroke')).toBe(true)
    // The newest print carries the pulse dot.
    expect(canvas.calls.some(([name]) => name === 'arc')).toBe(true)

    // Nothing new: the next frame skips the draw entirely.
    frames.shift()()
    expect(chart.loop.drawCount()).toBe(1)

    now = 10500
    publishTick({ symbol: 'BTC-USDT', px: 103, ts: 10500, venue: 'okx' })
    frames.shift()()
    expect(chart.loop.drawCount()).toBe(2)

    chart.dispose()
    expect(chart.loop.running()).toBe(false)
    expect(chart.draw(null, { width: 10, height: 10 })).toBe(0)
  })
})
