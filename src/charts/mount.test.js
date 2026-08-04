// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { tickWindow, markOnTick, mountTickChart, mountCandleChart, startChart } from './mount.js'
import { publishTick, resetBus } from '../pipeline/bus.js'
import { addTrade, resetCandles } from '../pipeline/candles.js'
import { createScheduler } from './loop.js'

beforeEach(() => {
  resetBus()
  resetCandles()
})

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
      fillRect: record('fillRect'),
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

describe('mountCandleChart', () => {
  it('frames the series by its wicks and draws volume under the bodies', () => {
    const canvas = fakeCanvas()
    const frames = []
    let interval = '1s'

    addTrade('BTC-USDT', { px: 100, sz: 2, ts: 1000 })
    addTrade('BTC-USDT', { px: 130, sz: 1, ts: 1400 })
    addTrade('BTC-USDT', { px: 110, sz: 3, ts: 2000 })

    const chart = mountCandleChart(canvas, {
      symbol: 'BTC-USDT',
      interval: () => interval,
      raf: (fn) => frames.push(fn),
    })

    frames.shift()()
    expect(chart.loop.drawCount()).toBe(1)

    const bars = canvas.calls.filter(([name]) => name === 'fillRect')
    // Two candles: two bodies plus two volume bars, all sharing one x geometry.
    expect(bars).toHaveLength(4)
    // The spike to 130 is inside the frame — a range built from closes would clip it.
    expect(bars.every(([, x]) => x >= 0 && x <= 200)).toBe(true)

    // Flipping the interval is just a different read of the same prints.
    interval = '1m'
    chart.loop.markDirty()
    frames.shift()()
    expect(chart.loop.drawCount()).toBe(2)

    chart.dispose()
    expect(chart.draw(null, { width: 10, height: 10 })).toBe(0)
  })
})

describe('startChart', () => {
  it('runs any renderer on a loop that stops cleanly when disposed', () => {
    const frames = []
    const drawn = []
    const chart = startChart(
      (_ctx, size) => drawn.push(size),
      { raf: (fn) => frames.push(fn), size: () => ({ width: 10, height: 5 }), symbol: 'X' },
    )

    frames.shift()()
    expect(drawn).toEqual([{ width: 10, height: 5 }])
    expect(chart.loop.running()).toBe(true)

    // Dispose stops the loop and unsubscribes, so a later print draws nothing.
    chart.dispose()
    publishTick({ symbol: 'X', px: 1, ts: 1, venue: 'okx' })
    expect(chart.loop.frame()).toBe(false)
    expect(drawn).toHaveLength(1)

    // Handed a shared scheduler, the chart registers on it instead of holding its own
    // frame — so forty sparklines cannot outvote the price chart for a frame.
    const sharedFrames = []
    const scheduler = createScheduler({ raf: (fn) => sharedFrames.push(fn), clock: () => 0 })
    const shared = startChart(
      (_ctx, size) => drawn.push(size),
      { scheduler, id: 'chart-1', priority: 'high', symbol: 'X', size: () => ({ width: 1, height: 1 }) },
    )

    expect(scheduler.stats().surfaces).toBe(1)
    sharedFrames.shift()()
    expect(drawn).toHaveLength(2)

    publishTick({ symbol: 'X', px: 2, ts: 2, venue: 'okx' })
    expect(scheduler.stats().pending).toBe(1)

    shared.dispose()
    expect(scheduler.stats().surfaces).toBe(0)
  })
})
