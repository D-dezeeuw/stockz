import { describe, it, expect, beforeEach } from 'vitest'
import {
  BREAKER_LIMITS,
  validateBreakerSettings,
  breakerSettings,
  breakerContext,
  refreshBreakerCard,
  watchBreakerSettings,
} from './settings.js'
import { currentThresholds, tripBreaker, trippedCode, resetBreaker, TRIP } from './core.js'
import { appState, tick, setValue, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

beforeEach(() => {
  resetBreaker(0)
  resetState()
})

describe('validateBreakerSettings', () => {
  it('clamps to the default rather than letting NaN disable a breaker', () => {
    expect(validateBreakerSettings({ maxDailyLoss: 300, maxPosition: 2 })).toMatchObject({
      maxDailyLoss: 300,
      maxPosition: 2,
    })

    // Zero is a real answer everywhere: "off" on every field, so a blank box is never a
    // trap that means "stop immediately" on one input and "no limit" on the next.
    expect(validateBreakerSettings({ maxConsecLosses: 0 }).maxConsecLosses).toBe(0)

    // A pasted word or a lone minus sign lands on the default. The hot path compares
    // against these, and NaN silently disables the check.
    expect(validateBreakerSettings({ maxDailyLoss: 'nonsense' }).maxDailyLoss).toBe(500)
    expect(validateBreakerSettings({ maxPosition: -3 }).maxPosition).toBe(1)
    expect(validateBreakerSettings().pauseMinutes).toBe(15)
  })
})

describe('breakerSettings', () => {
  it('reads the limits in force off the live settings', () => {
    setValue(PATHS.settings.maxDailyLoss, 250)
    tick()

    expect(breakerSettings().maxDailyLoss).toBe(250)
    expect(breakerSettings({ maxDailyLoss: 40 }).maxDailyLoss).toBe(40)
  })
})

describe('breakerContext', () => {
  it('shows each limit beside the number it is limiting', () => {
    setValue(PATHS.breaker.dayPnl, -120.5)
    tick()

    const rows = breakerContext({ maxDailyLoss: 500, maxConsecLosses: 0 })
    expect(rows.map((row) => row.key)).toEqual(BREAKER_LIMITS.map((limit) => limit.key))

    // A limit read in the abstract is a limit nobody can tell is about to bind.
    expect(rows[0]).toMatchObject({ now: '-120.50', limit: '500.00', off: false })
    expect(rows[2].off).toBe(true)
  })
})

describe('refreshBreakerCard', () => {
  it('publishes the rows the settings card binds to', () => {
    expect(refreshBreakerCard({ maxPosition: 3 })).toHaveLength(BREAKER_LIMITS.length)
    tick()

    expect(appState.breaker.limits[1]).toMatchObject({ key: 'maxPosition', limit: '3.00' })
  })
})

describe('watchBreakerSettings', () => {
  it('binds a changed limit on the next order and never revives a halt', () => {
    const watcher = watchBreakerSettings()

    watcher({ settings: { maxDailyLoss: 100, maxPosition: 2, maxConsecLosses: 3 } })
    expect(currentThresholds()).toEqual({ dayLossFloor: -100, maxPosition: 2, maxLossStreak: 3 })

    tripBreaker(TRIP.DAILY_LOSS, {}, { kill: () => {} })
    watcher({ settings: { maxDailyLoss: 9000 } })

    // Turning the number up must never be the fastest way past a breaker.
    expect(trippedCode()).toBe(TRIP.DAILY_LOSS)
    expect(currentThresholds().dayLossFloor).toBe(-9000)
  })
})
