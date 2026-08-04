// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  drawdownSeries,
  maxDrawdown,
  currentDepth,
  drawUnderwater,
  refreshDrawdown,
  startUnderwater,
} from './drawdown.js'
import { equitySeries } from './equity.js'
import { appState, tick, resetState } from '../app/engine.js'

const PALETTE = { down: 'O' }

/** Close-ordered trades from a net sequence. */
function run(...nets) {
  return nets.map((net, index) => ({ id: `t${index}`, net, closeTs: 1000 + index }))
}

/** A 2D context stand-in. */
function fakeCtx() {
  const calls = []
  return {
    calls,
    globalAlpha: 1,
    clearRect: () => calls.push(['clear']),
    beginPath: () => calls.push(['begin']),
    moveTo: (...a) => calls.push(['move', ...a]),
    lineTo: (...a) => calls.push(['line', ...a]),
    closePath: () => calls.push(['close']),
    fill() {
      calls.push(['fill', this.fillStyle, this.globalAlpha])
    },
  }
}

beforeEach(() => {
  resetState()
})

describe('drawdownSeries', () => {
  it('is never positive, because a new high is not a drawdown', () => {
    // +10, +6, +8: down four from the peak, then back to two under it.
    const series = drawdownSeries(equitySeries(run(10, -4, 2)))

    expect(series.map((point) => point.depth)).toEqual([0, -4, -2])
    expect(series.map((point) => point.peak)).toEqual([10, 10, 10])

    // Losses from the very first trade still measure against a zero peak.
    expect(drawdownSeries(equitySeries(run(-5)))[0].depth).toBe(-5)
    expect(drawdownSeries(null)).toEqual([])
  })
})

describe('maxDrawdown', () => {
  it('calls an unrecovered slide unrecovered rather than telling the comfortable lie', () => {
    const recovered = maxDrawdown(drawdownSeries(equitySeries(run(10, -6, 8))))
    expect(recovered).toMatchObject({
      depth: -6,
      peakIndex: 0,
      troughIndex: 1,
      recoveredIndex: 2,
      recovered: true,
      duration: 2,
    })

    // Still down at the end: "recovered on the last trade" is the more comfortable lie.
    const open = maxDrawdown(drawdownSeries(equitySeries(run(10, -6, 1))))
    expect(open.recovered).toBe(false)
    expect(open.recoveredIndex).toBeNull()

    expect(maxDrawdown([]).depth).toBe(0)
    // A monotone climb has no drawdown at all.
    expect(maxDrawdown(drawdownSeries(equitySeries(run(1, 2, 3)))).depth).toBe(0)
  })
})

describe('currentDepth', () => {
  it('reads the last point, which is where the desk is standing', () => {
    expect(currentDepth(drawdownSeries(equitySeries(run(10, -4))))).toBe(-4)
    expect(currentDepth(drawdownSeries(equitySeries(run(10))))).toBe(0)
    expect(currentDepth([])).toBe(0)
  })
})

describe('drawUnderwater', () => {
  it('fills the area, because time under water is the thing that breaks people', () => {
    const ctx = fakeCtx()
    const series = drawdownSeries(equitySeries(run(10, -6, 1)))

    expect(drawUnderwater(ctx, series, { width: 100, height: 40 }, PALETTE)).toBe(true)
    const filled = ctx.calls.find((call) => call[0] === 'fill')
    // A line at the same coordinates reads as a value moving around; an area reads as time.
    expect(filled[1]).toBe('O')
    expect(filled[2]).toBeLessThan(1)

    expect(drawUnderwater(ctx, [], { width: 100, height: 40 }, PALETTE)).toBe(false)
    expect(drawUnderwater(null, series, { width: 1, height: 1 }, PALETTE)).toBe(false)
    expect(drawUnderwater(ctx, series, { width: 0, height: 0 }, PALETTE)).toBe(false)
    // One point, and no palette handed in: the theme's own colours and a centred sample.
    expect(drawUnderwater(ctx, series.slice(0, 1), { width: 100, height: 40 })).toBe(true)
  })
})

describe('refreshDrawdown', () => {
  it('reverses the journal and labels the slide in trades, not milliseconds', () => {
    refreshDrawdown([...run(10, -6, 1)].reverse())
    tick()

    expect(appState.analytics.underwater).toHaveLength(3)
    expect(appState.analytics.worstRun).toMatchObject({
      depthLabel: '-6.00',
      // A scalper's drawdown is measured in how many more decisions they had to make.
      durationLabel: '2 trades',
      recovered: false,
      currentLabel: '-5.00',
    })
  })
})

describe('startUnderwater', () => {
  it('does nothing without a canvas and draws once when there is one', () => {
    expect(startUnderwater({ doc: { getElementById: () => null } })).toBeNull()

    const ctx = fakeCtx()
    const canvas = { clientWidth: 100, clientHeight: 40, style: {}, getContext: () => ctx }
    const redraw = startUnderwater({
      doc: { getElementById: () => canvas },
      raf: (fn) => fn(),
      series: () => drawdownSeries(equitySeries(run(10, -6))),
    })

    expect(redraw).toBeInstanceOf(Function)
    expect(ctx.calls.some((call) => call[0] === 'fill')).toBe(true)

    // And with no plumbing at all: the real document, the real rAF, the published series.
    expect(startUnderwater()).toBeNull()

    const real = document.createElement('canvas')
    real.id = 'underwater-canvas'
    document.body.append(real)
    expect(startUnderwater()).toBeInstanceOf(Function)
    real.remove()
  })
})
