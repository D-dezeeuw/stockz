import { describe, it, expect, beforeEach } from 'vitest'
import {
  clampStrength,
  normalizeSignal,
  isExpired,
  flatten,
  publishSignal,
  sweepSignals,
  signalChip,
  DIR,
  DEFAULT_TTL_MS,
  ACTION_DIR,
} from './signal.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetState()
})

describe('clampStrength', () => {
  it('treats missing conviction as none, never as maximum', () => {
    expect(clampStrength(0.5)).toBe(0.5)
    expect(clampStrength(9)).toBe(1)
    expect(clampStrength(-1)).toBe(0)

    // Defaulting to 1 would make every sloppy return a maximum-confidence signal.
    expect(clampStrength(undefined)).toBe(0)
    expect(clampStrength('loud')).toBe(0)
  })
})

describe('normalizeSignal', () => {
  it('carries direction as a number, so no consumer can get the sign backwards', () => {
    const signal = normalizeSignal(
      { action: 'sell', strength: 0.8, reason: 'stretched' },
      { now: 1000, source: 'mean-rev', instrument: 'okx:BTC-USDT' },
    )

    expect(signal).toEqual({
      dir: DIR.SHORT,
      action: 'sell',
      strength: 0.8,
      reason: 'stretched',
      ttl: DEFAULT_TTL_MS,
      ts: 1000,
      source: 'mean-rev',
      instrument: 'okx:BTC-USDT',
    })

    expect(normalizeSignal({ action: 'buy' }).dir).toBe(DIR.LONG)
    expect(normalizeSignal({ action: 'byu' }).dir).toBe(DIR.FLAT)
    expect(normalizeSignal(null).action).toBe('none')

    // A ttl of 0 is a deliberate "until told otherwise", not a missing value.
    expect(normalizeSignal({ action: 'buy', ttl: 0 }).ttl).toBe(0)
    expect(normalizeSignal({ action: 'buy' }, { ttl: 5000 }).ttl).toBe(5000)
    expect(ACTION_DIR.flat).toBe(DIR.FLAT)
  })
})

describe('isExpired', () => {
  it('stops a twenty-minute-old signal from looking like one from this tick', () => {
    const signal = { ts: 1000, ttl: 5000 }

    expect(isExpired(signal, 5999)).toBe(false)
    expect(isExpired(signal, 6000)).toBe(false)
    expect(isExpired(signal, 6001)).toBe(true)

    // Zero means never: a signal that holds until the strategy replaces it.
    expect(isExpired({ ts: 0, ttl: 0 }, 999999)).toBe(false)
    expect(isExpired(null, 1000)).toBe(false)
    expect(isExpired(signal, NaN)).toBe(false)
  })
})

describe('flatten', () => {
  it('replaces an expired signal with a flat one that says why', () => {
    const flat = flatten({ source: 'mean-rev', instrument: 'okx:BTC-USDT' }, 9000)

    expect(flat).toMatchObject({
      dir: DIR.FLAT,
      action: 'flat',
      reason: 'expired',
      ts: 9000,
      source: 'mean-rev',
      instrument: 'okx:BTC-USDT',
    })
    // The replacement cannot itself expire, or the sweeper would rewrite it forever.
    expect(flat.ttl).toBe(0)
  })
})

describe('publishSignal', () => {
  it('writes one run without disturbing the others', () => {
    publishSignal('a@okx:BTC-USDT', normalizeSignal({ action: 'buy' }, { now: 1 }))
    tick()
    publishSignal('b@okx:ETH-USDT', normalizeSignal({ action: 'sell' }, { now: 2 }))
    tick()

    expect(appState.strategy.signals['a@okx:BTC-USDT'].dir).toBe(DIR.LONG)
    expect(appState.strategy.signals['b@okx:ETH-USDT'].dir).toBe(DIR.SHORT)
    expect(publishSignal('', { dir: 1 })).toEqual({ dir: 1 })
  })
})

describe('sweepSignals', () => {
  it('folds every expiry into one write, because setValue lands next tick', () => {
    setValue('strategy.signals', {
      stale: { ts: 0, ttl: 1000, action: 'buy', dir: 1, source: 'a' },
      fresh: { ts: 9000, ttl: 1000, action: 'sell', dir: -1 },
      forever: { ts: 0, ttl: 0, action: 'buy', dir: 1 },
    })
    tick()

    expect(sweepSignals(9500)).toEqual(['stale'])
    tick()

    expect(appState.strategy.signals.stale).toMatchObject({ action: 'flat', reason: 'expired' })
    expect(appState.strategy.signals.fresh.action).toBe('sell')
    expect(appState.strategy.signals.forever.action).toBe('buy')

    expect(sweepSignals(9500)).toEqual([])
  })
})

describe('signalChip', () => {
  it('carries the reason, or the chip is a number nobody can argue with afterwards', () => {
    expect(signalChip({ dir: DIR.LONG, strength: 0.75, reason: 'squeeze' })).toEqual({
      glyph: '▲',
      tone: 'long',
      pct: 75,
      title: 'squeeze',
    })

    expect(signalChip({ dir: DIR.SHORT }).glyph).toBe('▼')
    expect(signalChip({ dir: DIR.FLAT }).tone).toBe('flat')
    expect(signalChip(null)).toEqual({ glyph: '–', tone: 'flat', pct: 0, title: 'no signal' })
  })
})
