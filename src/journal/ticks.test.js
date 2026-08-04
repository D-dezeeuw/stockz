import { describe, it, expect, beforeEach } from 'vitest'
import { TRAIL_SIZE, recordTick, ticksBetween, resetTicks } from './ticks.js'

beforeEach(() => {
  resetTicks()
})

describe('recordTick', () => {
  it('keeps a bounded trail per instrument and refuses a price that is not one', () => {
    expect(recordTick('BTC-USDT', 100, 1000)).toBe(1)
    expect(recordTick('BTC-USDT', 101, 1001)).toBe(2)
    // Separate trails: two instruments moving together must not share a history.
    expect(recordTick('ETH-USDT', 50, 1000)).toBe(1)

    expect(recordTick('', 100, 1)).toBe(0)
    expect(recordTick('BTC-USDT', 0, 1)).toBe(0)
    expect(recordTick('BTC-USDT', NaN, 1)).toBe(0)
    expect(TRAIL_SIZE).toBeGreaterThan(500)
  })
})

describe('ticksBetween', () => {
  it('windows to the trade, and treats an open trade as still running', () => {
    recordTick('BTC-USDT', 100, 1000)
    recordTick('BTC-USDT', 101, 2000)
    recordTick('BTC-USDT', 102, 3000)

    expect(ticksBetween('BTC-USDT', 1500, 2500).map((mark) => mark.px)).toEqual([101])
    expect(ticksBetween('BTC-USDT', 1000, 3000)).toHaveLength(3)

    // No close yet: the excursion so far is exactly what a trader watching it wants.
    expect(ticksBetween('BTC-USDT', 2000, 0)).toHaveLength(2)

    expect(ticksBetween('SOL-USDT', 0, 9999)).toEqual([])
  })
})

describe('resetTicks', () => {
  it('forgets every trail', () => {
    recordTick('BTC-USDT', 100, 1000)

    expect(resetTicks()).toBe(true)
    expect(ticksBetween('BTC-USDT', 0, 9999)).toEqual([])
  })
})
