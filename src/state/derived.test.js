// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  spreadOf,
  midOf,
  exposureOf,
  openOrderCount,
  statusLineOf,
  registerDerived,
} from './derived.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from './paths.js'

beforeEach(() => {
  resetState()
})

describe('spreadOf', () => {
  it('measures ask minus bid and refuses missing or crossed books', () => {
    expect(spreadOf(100, 100.5)).toBeCloseTo(0.5)
    expect(spreadOf(27384, 27384.5)).toBeCloseTo(0.5)

    // A crossed or one-sided book has no meaningful spread.
    expect(spreadOf(101, 100)).toBe(0)
    expect(spreadOf(100, 100)).toBe(0)
    expect(spreadOf(0, 100)).toBe(0)
    expect(spreadOf(100, 0)).toBe(0)
    expect(spreadOf(NaN, 100)).toBe(0)
  })
})

describe('midOf', () => {
  it('averages both sides and falls back to whichever side exists', () => {
    expect(midOf(100, 102)).toBe(101)
    expect(midOf(100, 0)).toBe(100)
    expect(midOf(0, 102)).toBe(102)
    expect(midOf(0, 0)).toBe(0)
    expect(midOf(NaN, NaN)).toBe(0)
  })
})

describe('exposureOf', () => {
  it('sums signed notional, so size and price both count', () => {
    const positions = [
      { side: 'long', sz: 2, avgPx: 100 },
      { side: 'short', sz: 1, avgPx: 50 },
    ]
    expect(exposureOf(positions)).toBeCloseTo(150)

    // One lot of a 60k instrument is not one lot of a 3k instrument.
    expect(exposureOf([{ side: 'long', sz: 1, avgPx: 60000 }])).toBeCloseTo(60000)
    expect(exposureOf([{ side: 'short', sz: 1, avgPx: 60000 }])).toBeCloseTo(-60000)

    expect(exposureOf([])).toBe(0)
    expect(exposureOf(null)).toBe(0)
    expect(exposureOf([{ side: 'long', sz: 'x', avgPx: 10 }])).toBe(0)
  })
})

describe('openOrderCount', () => {
  it('counts only orders still working at the venue', () => {
    const orders = [
      { state: 'pending' },
      { state: 'live' },
      { state: 'filled' },
      { state: 'rejected' },
      {},
    ]
    expect(openOrderCount(orders)).toBe(2)
    expect(openOrderCount([])).toBe(0)
    expect(openOrderCount(undefined)).toBe(0)
  })
})

describe('statusLineOf', () => {
  it('renders arm state, mode, market, exposure and PnL in one glance', () => {
    expect(
      statusLineOf({
        status: 'live',
        armed: true,
        mode: 'live',
        mid: 27384.5,
        spread: 0.5,
        exposure: 1200,
        dayPnl: 42.1,
      }),
    ).toBe('ARMED · LIVE · 27384.50 (0.50) · exp 1200.00 · +42.10 · live')

    // Defaults are the safe reading: not armed, paper, flat.
    expect(statusLineOf()).toBe('SAFE · PAPER · 0.00 (0.00) · exp 0.00 · 0.00 · ready')
  })
})

describe('registerDerived', () => {
  it('keeps derived paths correct as their dependencies move', () => {
    const paths = registerDerived()
    expect(paths).toContain(PATHS.market.mid)

    setValue(PATHS.market.bid, 100)
    setValue(PATHS.market.ask, 102)
    setValue(PATHS.trade.positions, [{ side: 'long', sz: 3, avgPx: 100 }])
    setValue(PATHS.trade.orders, [{ state: 'live' }, { state: 'filled' }])
    tick()

    expect(appState.market.mid).toBe(101)
    expect(appState.market.spread).toBeCloseTo(2)
    expect(appState.trade.exposure).toBeCloseTo(300)
    expect(appState.trade.openOrders).toBe(1)
    expect(appState.ui.statusLine).toContain('101.00 (2.00)')

    // Moving one dependency re-derives without any manual recalculation.
    setValue(PATHS.market.ask, 100.5)
    tick()
    expect(appState.market.mid).toBe(100.25)
    expect(appState.market.spread).toBeCloseTo(0.5)
  })
})
