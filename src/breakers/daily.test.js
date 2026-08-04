import { describe, it, expect, beforeEach } from 'vitest'
import { updateDayPnl, dailyPct, dailyLossCheck, refreshDaily, resetDay } from './daily.js'
import { refreshThresholds, resetBreaker, trippedCode, TRIP } from './core.js'
import { appendRealization, resetLedger } from '../positions/ledger.js'
import { resetAlerts } from '../alerts/bus.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

const POSITIONS = [
  { instrument: 'okx:BTC-USDT', unrealized: -40 },
  { instrument: 'okx:ETH-USDT', unrealized: 15 },
]

beforeEach(() => {
  resetBreaker(0)
  resetLedger()
  resetAlerts()
  resetState()
  refreshThresholds({})
})

describe('updateDayPnl', () => {
  it('counts the open loser, which is money already lost', () => {
    appendRealization({ amount: 50, fee: 5, ts: 1000 })

    const day = updateDayPnl({ positions: POSITIONS })
    tick()

    // 45 net realised, 25 open against it.
    expect(day).toEqual({ realized: 45, unrealized: -25, total: 20 })
    expect(appState.breaker.dayPnl).toBe(20)

    // A breaker counting only closed trades lets somebody sit through the exact drawdown
    // it exists to stop.
    expect(updateDayPnl({ positions: [{ unrealized: -500 }] }).total).toBe(-455)
    expect(updateDayPnl({ positions: null, rows: [] }).total).toBe(0)
  })
})

describe('dailyPct', () => {
  it('reads zero on a profitable day and on an unset limit', () => {
    expect(dailyPct(-50, -100)).toBe(0.5)
    expect(dailyPct(-100, -100)).toBe(1)
    // Past the limit is still one: the LED cannot be more than full.
    expect(dailyPct(-250, -100)).toBe(1)

    // A percentage of an unset limit would light a warning for no reason.
    expect(dailyPct(-50, -Infinity)).toBe(0)
    expect(dailyPct(50, -100)).toBe(0)
    expect(dailyPct(-50, 0)).toBe(0)
  })
})

describe('dailyLossCheck', () => {
  it('carries the snapshot into the trip, because "why" is asked hours later', () => {
    refreshThresholds({ maxDailyLoss: 100 })
    setValue('breaker.dayPnl', -50)
    tick()

    expect(dailyLossCheck({ kill: () => {} })).toBe(TRIP.NONE)

    setValue('breaker.dayPnl', -120)
    tick()

    expect(dailyLossCheck({ now: 5000, kill: () => {} })).toBe(TRIP.DAILY_LOSS)
    tick()
    expect(trippedCode()).toBe(TRIP.DAILY_LOSS)
    // By the time somebody asks, the numbers have moved on.
    expect(appState.breaker.values.dayPnl).toBe(-120)
  })
})

describe('refreshDaily', () => {
  it('publishes the warning percentage the LEDs read', () => {
    refreshThresholds({ maxDailyLoss: 100 })
    appendRealization({ amount: -60, ts: 1000 })

    const day = refreshDaily({ positions: [] })
    tick()

    expect(day.total).toBe(-60)
    expect(appState.breaker.dailyPct).toBe(0.6)
  })
})

describe('resetDay', () => {
  it('archives before zeroing, so clearing is safe rather than a number thrown away', () => {
    appendRealization({ amount: -60, ts: 1000 })
    refreshDaily({ positions: [] })
    tick()

    const archived = resetDay(9000)
    tick()

    expect(archived).toMatchObject({ realized: -60, at: 9000 })
    // Yesterday must never block today.
    expect(appState.breaker.dayPnl).toBe(0)
    expect(appState.breaker.values.archived.realized).toBe(-60)
  })
})
