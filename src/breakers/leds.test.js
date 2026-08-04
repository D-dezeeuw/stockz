import { describe, it, expect, beforeEach } from 'vitest'
import { WARN_AT, ledStateFor, exposurePct, streakPct, breakerLeds, refreshLeds } from './leds.js'
import { refreshThresholds, TRIP } from './core.js'
import { onRealizedFill, resetPause } from './position.js'
import { appState, tick, setValue, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

beforeEach(() => {
  resetPause()
  resetState()
  refreshThresholds({ maxDailyLoss: 200, maxPosition: 4 })
})

describe('ledStateFor', () => {
  it('turns orange with room left to react, and red only at the limit', () => {
    expect(ledStateFor(0)).toBe('ok')
    expect(ledStateFor(WARN_AT - 0.01)).toBe('ok')

    // 80%, fixed rather than configurable: a warning threshold that is a setting is one
    // that gets moved to 99% by whoever found it annoying.
    expect(ledStateFor(WARN_AT)).toBe('warn')
    expect(ledStateFor(0.99)).toBe('warn')
    expect(ledStateFor(1)).toBe('tripped')

    // A tripped breaker is red whatever its percentage reads.
    expect(ledStateFor(0, true)).toBe('tripped')
    expect(ledStateFor(NaN)).toBe('ok')
  })
})

describe('exposurePct', () => {
  it('reads zero against an unset cap rather than sitting dark forever', () => {
    expect(exposurePct(2, 4)).toBe(0.5)
    expect(exposurePct(-2, 4)).toBe(0.5)
    expect(exposurePct(9, 4)).toBe(1)

    // A percentage of Infinity is a dot the eye learns to ignore.
    expect(exposurePct(2, Infinity)).toBe(0)
    expect(exposurePct(2, 0)).toBe(0)
  })
})

describe('streakPct', () => {
  it('measures the run against the trader’s own number', () => {
    expect(streakPct(2, 5)).toBe(0.4)
    expect(streakPct(9, 5)).toBe(1)

    // Zero disables the pause, so it disables the light with it.
    expect(streakPct(2, 0)).toBe(0)
    expect(streakPct(2)).toBe(0)
  })
})

describe('breakerLeds', () => {
  it('answers how much room is left, in three dots', () => {
    const leds = breakerLeds({ dailyPct: 0.2, exposure: 1, streak: 0 })

    expect(leds.map((led) => led.id)).toEqual(['daily', 'position', 'streak'])
    expect(leds.map((led) => led.state)).toEqual(['ok', 'ok', 'ok'])
    expect(leds[1].title).toMatch(/exposure 25% of cap 4/)

    const hot = breakerLeds({ dailyPct: 0.9, exposure: 4, streak: 5, paused: true })
    expect(hot.map((led) => led.state)).toEqual(['warn', 'tripped', 'tripped'])

    // A halt paints its own dot red however much room the number says is left.
    expect(breakerLeds({ dailyPct: 0, tripped: TRIP.DAILY_LOSS })[0].state).toBe('tripped')
  })
})

describe('refreshLeds', () => {
  it('publishes what the header binds to', () => {
    setValue(PATHS.settings.maxConsecLosses, 4)
    tick()
    onRealizedFill(-1, { maxConsecLosses: 4 })

    expect(refreshLeds({ dailyPct: 0 })).toHaveLength(3)
    tick()
    expect(appState.breaker.leds[2]).toMatchObject({ id: 'streak', state: 'ok' })
    expect(appState.breaker.leds[2].title).toBe('1 losses in a row')
  })
})
