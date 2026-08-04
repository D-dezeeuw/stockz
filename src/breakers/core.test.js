import { describe, it, expect, beforeEach } from 'vitest'
import {
  refreshThresholds,
  currentThresholds,
  checkBreakers,
  trippedCode,
  tripBreaker,
  resetBreaker,
  breakerRejection,
  TRIP,
  TRIP_REASONS,
} from './core.js'
import { watchThresholds } from './index.js'
import { resetAlerts, alertLog } from '../alerts/bus.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetBreaker(0)
  resetAlerts()
  resetState()
  refreshThresholds({})
})

describe('refreshThresholds', () => {
  it('pre-negates the loss limit, so the hot path is one comparison', () => {
    const cache = refreshThresholds({ maxDailyLoss: 100, maxPosition: 2, maxConsecLosses: 3 })

    // `dayPnl <= dayLossFloor` with no arithmetic in it.
    expect(cache).toEqual({ dayLossFloor: -100, maxPosition: 2, maxLossStreak: 3 })

    // An unset limit is no limit, not a limit of zero — which would halt the desk instantly.
    expect(refreshThresholds({})).toEqual({
      dayLossFloor: -Infinity,
      maxPosition: Infinity,
      maxLossStreak: Infinity,
    })
    expect(refreshThresholds({ maxDailyLoss: 0 }).dayLossFloor).toBe(-Infinity)
    expect(currentThresholds().maxPosition).toBe(Infinity)
  })
})

describe('checkBreakers', () => {
  it('is primitive comparisons only, and short-circuits once tripped', () => {
    refreshThresholds({ maxDailyLoss: 100, maxPosition: 2, maxConsecLosses: 3 })

    expect(checkBreakers({ dayPnl: -50, position: 1, lossStreak: 1 })).toBe(TRIP.NONE)
    expect(checkBreakers({ dayPnl: -100 })).toBe(TRIP.DAILY_LOSS)
    expect(checkBreakers({ dayPnl: 0, position: 2.5 })).toBe(TRIP.POSITION)
    // A short is exposure exactly like a long is.
    expect(checkBreakers({ dayPnl: 0, position: -2.5 })).toBe(TRIP.POSITION)
    expect(checkBreakers({ dayPnl: 0, lossStreak: 3 })).toBe(TRIP.LOSS_STREAK)

    // Already stopped: re-deciding why on every order is work with no possible new answer.
    tripBreaker(TRIP.DAILY_LOSS, { dayPnl: -100 }, { kill: () => {} })
    expect(checkBreakers({ dayPnl: 0, position: 0 })).toBe(TRIP.DAILY_LOSS)
    expect(checkBreakers(null)).toBe(TRIP.DAILY_LOSS)
  })
})

describe('trippedCode', () => {
  it('answers what stopped the desk without exposing the latch', () => {
    expect(trippedCode()).toBe(TRIP.NONE)

    tripBreaker(TRIP.KILL, {}, { kill: () => {} })
    expect(trippedCode()).toBe(TRIP.KILL)
  })
})

describe('tripBreaker', () => {
  it('kills the bot first and latches, so a failing market cannot fire it forty times', () => {
    const killed = []

    expect(
      tripBreaker(TRIP.DAILY_LOSS, { dayPnl: -120 }, { now: 1000, kill: (r) => killed.push(r) }),
    ).toBe(true)
    tick()

    // The bot goes first and synchronously: anything queued leaves a window for one more
    // order, and "one more" is what the breaker existed to prevent.
    expect(killed).toEqual(['breaker: daily loss limit'])
    expect(appState.breaker).toMatchObject({ tripped: TRIP.DAILY_LOSS, reason: 'daily loss limit' })
    expect(appState.breaker.values.dayPnl).toBe(-120)
    expect(alertLog().at(-1)).toMatchObject({ severity: 'error', kind: 'trip' })

    // The latch: a second trip while tripped changes nothing.
    expect(tripBreaker(TRIP.POSITION, {}, { kill: () => killed.push('again') })).toBe(false)
    expect(killed).toHaveLength(1)
    expect(tripBreaker(TRIP.NONE, {}, {})).toBe(false)
  })
})

describe('resetBreaker', () => {
  it('announces the resume, because clearing a halt is a decision', () => {
    tripBreaker(TRIP.DAILY_LOSS, {}, { kill: () => {} })

    expect(resetBreaker(2000)).toBe(true)
    tick()
    expect(appState.breaker.tripped).toBe(TRIP.NONE)
    // The record of the day should show the decision was made, not that the halt stopped
    // mattering.
    expect(alertLog().at(-1)).toMatchObject({ kind: 'reset' })

    expect(resetBreaker(3000)).toBe(false)
  })
})

describe('breakerRejection', () => {
  it('is an object, never a dialog', () => {
    // A breaker that asks is a breaker that gets clicked through at exactly the moment it
    // was built for.
    expect(breakerRejection(TRIP.DAILY_LOSS)).toEqual({
      ok: false,
      clientId: '',
      reason: 'halted — daily loss limit',
    })

    expect(breakerRejection(TRIP.KILL).reason).toMatch(TRIP_REASONS[TRIP.KILL])
    expect(breakerRejection(99).reason).toBe('halted — breaker')
  })
})

describe('breaker hot path', () => {
  it('stays far under the per-order budget, or it is a net people turn off', () => {
    refreshThresholds({ maxDailyLoss: 100, maxPosition: 2, maxConsecLosses: 3 })
    const ctx = { dayPnl: -50, position: 1, lossStreak: 1 }

    const started = performance.now()
    for (let i = 0; i < 1000000; i += 1) checkBreakers(ctx)
    const perCall = (performance.now() - started) / 1000000

    // A microsecond a call is a hundredth of a percent of the desk's latency budget. The
    // ceiling is loose on purpose — it catches an accidental state read or allocation, not
    // a slow afternoon on CI.
    expect(perCall).toBeLessThan(0.001)
  })
})

describe('watchThresholds', () => {
  it('rebuilds the cache on change, or a raised limit never takes effect', () => {
    const watcher = watchThresholds()
    expect(typeof watcher).toBe('function')

    setValue('settings.maxDailyLoss', 250)
    tick()

    // The whole point of the cache is that the hot path never touches settings; a stale
    // one would be a limit the trader raised that quietly did nothing.
    expect(currentThresholds().dayLossFloor).toBe(-250)
  })
})
