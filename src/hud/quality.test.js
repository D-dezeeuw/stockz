import { describe, it, expect, beforeEach } from 'vitest'
import {
  captureIntent,
  slippageBps,
  trackWorst,
  scoreFill,
  slippageStats,
  spreadBreached,
  flushQuality,
  resetQuality,
  SLIP_WINDOW,
} from './quality.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetQuality()
  resetState()
})

describe('captureIntent', () => {
  it('remembers the price the trader meant to get', () => {
    expect(captureIntent('a', { price: 100, side: 'sell', instrument: 'BTC-USDT' })).toEqual({
      price: 100,
      side: 'sell',
      instrument: 'BTC-USDT',
    })

    // A market order has no intended price at submit time; the caller supplies the touch
    // it was aiming at, or nothing is captured.
    expect(captureIntent('b', {})).toBeNull()
    expect(captureIntent('', { price: 100 })).toBeNull()
  })
})

describe('slippageBps', () => {
  it('makes positive always mean worse, whichever side was traded', () => {
    // A buy filled above its intent cost money.
    expect(slippageBps(100.1, 100, 'buy')).toBeCloseTo(10, 1)
    // A sell filled below its intent cost the same money — and must carry the same sign,
    // or a column of both cannot be averaged.
    expect(slippageBps(99.9, 100, 'sell')).toBeCloseTo(10, 1)

    // Price improvement is negative on both sides.
    expect(slippageBps(99.9, 100, 'buy')).toBeCloseTo(-10, 1)
    expect(slippageBps(100.1, 100, 'sell')).toBeCloseTo(-10, 1)

    expect(slippageBps(100, 100, 'buy')).toBe(0)
    expect(slippageBps(100, 0, 'buy')).toBe(0)
  })
})

describe('trackWorst', () => {
  it('keeps the most expensive fill and ignores the good ones', () => {
    const first = trackWorst(null, { bps: 12, instrument: 'BTC-USDT', ts: 1 })
    expect(first).toEqual({ bps: 12, instrument: 'BTC-USDT', ts: 1 })

    expect(trackWorst(first, { bps: 5 })).toBe(first)
    expect(trackWorst(first, { bps: 30 }).bps).toBe(30)

    // A fill better than intended is not a problem to report, and letting it win would
    // make the tile meaningless.
    expect(trackWorst(null, { bps: -20 })).toBeNull()
    expect(trackWorst(first, { bps: NaN })).toBe(first)
  })
})

describe('scoreFill', () => {
  it('scores against the captured intent and refuses to guess without one', () => {
    captureIntent('a', { price: 100, side: 'buy', instrument: 'BTC-USDT' })

    const scored = scoreFill({ clientId: 'a', px: 100.1, ts: 1000 })
    expect(scored.scored).toBe(true)
    expect(scored.bps).toBeCloseTo(10, 1)

    // Counting unknowns as zero would flatter the average exactly where it should not:
    // zero is a *perfect* fill, not an unmeasured one.
    expect(scoreFill({ clientId: 'nope', px: 100 })).toEqual({ bps: 0, scored: false })

    // The intent is consumed, so a duplicate ack cannot score twice.
    expect(scoreFill({ clientId: 'a', px: 100.1 }).scored).toBe(false)
    expect(slippageStats().count).toBe(1)
  })
})

describe('slippageStats', () => {
  it('reports the session average and the one fill that hurt most', () => {
    captureIntent('a', { price: 100, side: 'buy' })
    scoreFill({ clientId: 'a', px: 100.1 })
    captureIntent('b', { price: 100, side: 'buy', instrument: 'ETH-USDT' })
    scoreFill({ clientId: 'b', px: 100.5, ts: 2000 })

    const stats = slippageStats()
    expect(stats.count).toBe(2)
    expect(stats.last).toBeCloseTo(50, 0)
    expect(stats.avg).toBeCloseTo(30, 0)
    expect(stats.worst).toMatchObject({ instrument: 'ETH-USDT', ts: 2000 })

    resetQuality()
    expect(slippageStats()).toMatchObject({ count: 0, avg: 0, worst: null })
    expect(SLIP_WINDOW).toBe(200)
  })
})

describe('spreadBreached', () => {
  it('fires on a real widening and never on missing data', () => {
    expect(spreadBreached(6, 5)).toBe(true)
    expect(spreadBreached(5, 5)).toBe(false)
    expect(spreadBreached(4, 5)).toBe(false)

    // An alert that fires on missing data is an alert that gets muted.
    expect(spreadBreached(0, 5)).toBe(false)
    expect(spreadBreached(6, 0)).toBe(false)
    expect(spreadBreached(NaN, 5)).toBe(false)
  })
})

describe('flushQuality', () => {
  it('publishes the score and the alert together', () => {
    setValue('settings.spreadLimitBps', 5)
    tick()

    captureIntent('a', { price: 100, side: 'buy' })
    scoreFill({ clientId: 'a', px: 100.1 })

    const published = flushQuality(9)
    tick()

    expect(published.spreadAlert).toBe(true)
    expect(appState.ui.spreadAlert).toBe(true)
    expect(appState.ui.slippage).toMatchObject({ count: 1 })

    expect(flushQuality(2).spreadAlert).toBe(false)
  })
})

describe('resetQuality', () => {
  it('clears the session, including intents nothing ever filled', () => {
    captureIntent('a', { price: 100, side: 'buy' })

    expect(resetQuality()).toBe(true)
    expect(scoreFill({ clientId: 'a', px: 100.1 }).scored).toBe(false)
  })
})
