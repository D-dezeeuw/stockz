// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  TRADE_BUFFER,
  publishTick,
  onTick,
  latestTick,
  recentTrades,
  flushToState,
  scheduleFlush,
  busStats,
  resetBus,
} from './bus.js'
import { appState, tick as engineTick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetBus()
  resetState()
})

describe('publishTick', () => {
  it('accepts ticks, keeps only the newest quote, and buffers prints', () => {
    expect(publishTick({ symbol: 'BTC-USDT', bid: 1, ask: 2 })).toBe(true)
    expect(publishTick({ symbol: 'BTC-USDT', bid: 3, ask: 4 })).toBe(true)

    // Only the newest quote matters — old quotes are replaced, not accumulated.
    expect(latestTick('BTC-USDT')).toMatchObject({ bid: 3 })

    // Prints are buffered because the tape and chart look back over them.
    publishTick({ symbol: 'BTC-USDT', px: 100, sz: 1 })
    expect(recentTrades('BTC-USDT')).toHaveLength(1)

    expect(publishTick({})).toBe(false)
    expect(publishTick(null)).toBe(false)
    expect(TRADE_BUFFER).toBeGreaterThan(1000)
  })
})

describe('onTick', () => {
  it('feeds subscribers without going through state', () => {
    const seen = []
    const stop = onTick((t) => seen.push(t.symbol))

    publishTick({ symbol: 'BTC-USDT' })
    expect(seen).toEqual(['BTC-USDT'])

    stop()
    publishTick({ symbol: 'ETH-USDT' })
    expect(seen).toEqual(['BTC-USDT'])

    expect(() => onTick(null)()).not.toThrow()
  })
})

describe('latestTick', () => {
  it('returns the newest tick or null, never undefined', () => {
    expect(latestTick('BTC-USDT')).toBeNull()
    publishTick({ symbol: 'BTC-USDT', bid: 1 })
    expect(latestTick('BTC-USDT').bid).toBe(1)
    expect(latestTick('')).toBeNull()
  })
})

describe('recentTrades', () => {
  it('returns prints oldest-first and caps at the buffer size', () => {
    for (let i = 0; i < 5; i += 1) publishTick({ symbol: 'X', px: i, sz: 1 })

    expect(recentTrades('X').map((t) => t.px)).toEqual([0, 1, 2, 3, 4])
    expect(recentTrades('X', 2).map((t) => t.px)).toEqual([3, 4])
    expect(recentTrades('nothing')).toEqual([])
  })
})

describe('flushToState', () => {
  it('writes one value per path, not one per tick', () => {
    publishTick({ symbol: 'BTC-USDT', bid: 100, ask: 101 })
    publishTick({ symbol: 'BTC-USDT', bid: 102, ask: 103 })

    expect(flushToState('BTC-USDT')).toBe(true)
    engineTick()

    // State sees the latest values once, not both updates.
    expect(appState.market.bid).toBe(102)
    expect(appState.market.ask).toBe(103)
    expect(appState.market.ticks).toBe(2)

    expect(flushToState('nothing-here')).toBe(false)
  })
})

describe('scheduleFlush', () => {
  it('collapses a burst of ticks into a single frame write', () => {
    const frames = []
    const raf = (fn) => frames.push(fn)

    publishTick({ symbol: 'BTC-USDT', bid: 1, ask: 2 })
    expect(scheduleFlush('BTC-USDT', { raf })).toBe(true)

    // Hundreds of ticks in the same frame must not schedule hundreds of writes.
    for (let i = 0; i < 100; i += 1) {
      publishTick({ symbol: 'BTC-USDT', bid: i, ask: i + 1 })
      expect(scheduleFlush('BTC-USDT', { raf })).toBe(false)
    }
    expect(frames).toHaveLength(1)

    frames[0]()
    engineTick()
    expect(appState.market.bid).toBe(99)

    // The next frame can schedule again.
    expect(scheduleFlush('BTC-USDT', { raf })).toBe(true)
    expect(scheduleFlush('BTC-USDT', { raf: null })).toBe(false)
  })
})

describe('busStats', () => {
  it('counts what the HUD needs to show the pipeline is keeping up', () => {
    publishTick({ symbol: 'A', px: 1 })
    publishTick({ symbol: 'B', px: 2 })
    flushToState('A')

    expect(busStats()).toMatchObject({ received: 2, flushes: 1, symbols: 2, dropped: 0 })
  })
})

describe('resetBus', () => {
  it('clears buffers, listeners and counters', () => {
    const seen = []
    onTick(() => seen.push(1))
    publishTick({ symbol: 'A', px: 1 })

    resetBus()

    expect(busStats()).toMatchObject({ received: 0, symbols: 0 })
    expect(recentTrades('A')).toEqual([])
    publishTick({ symbol: 'A', px: 1 })
    expect(seen).toHaveLength(1)
  })
})
