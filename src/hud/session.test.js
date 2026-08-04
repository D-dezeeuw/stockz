import { describe, it, expect, beforeEach } from 'vitest'
import {
  tradesPerHour,
  paceState,
  paceRatio,
  currentStreak,
  streakTone,
  dayVolume,
  refreshSession,
  STREAK_TIERS,
} from './session.js'
import { appendRealization, resetLedger } from '../positions/ledger.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetLedger()
  resetState()
})

describe('tradesPerHour', () => {
  it('extrapolates the current rhythm rather than counting since the open', () => {
    const now = 4000000
    const closes = [{ ts: 3500000 }, { ts: 3400000 }, { ts: 100 }]

    // The window opens at 400000; the first two closes fall inside it, the third does not.
    expect(tradesPerHour(closes, now)).toEqual({ perHour: 2, inWindow: 2 })

    // Ten trades in the last ten minutes is a pace of sixty an hour — the number that
    // says whether the *current* rhythm is sustainable.
    const recent = Array.from({ length: 10 }, (_, i) => ({ ts: now - i * 1000 }))
    expect(tradesPerHour(recent, now, 600000).perHour).toBe(60)

    expect(tradesPerHour([], now).perHour).toBe(0)
    expect(tradesPerHour(closes, NaN).perHour).toBe(0)
  })
})

describe('paceState', () => {
  it('bands the comparison, so small deviations do not cry off-target', () => {
    expect(paceState(20, 20)).toBe('on')
    expect(paceState(18, 20)).toBe('on')
    expect(paceState(24, 20)).toBe('on')

    expect(paceState(10, 20)).toBe('under')
    expect(paceState(40, 20)).toBe('over')

    // A tile that reports off-target for every wobble is one the trader stops reading.
    expect(paceState(15.1, 20)).toBe('on')
    // No target set means nothing to be off.
    expect(paceState(100, 0)).toBe('on')
  })
})

describe('paceRatio', () => {
  it('fills the meter and stops at full, so an over-pace never breaks the row', () => {
    expect(paceRatio(10, 20)).toBe(0.5)
    expect(paceRatio(20, 20)).toBe(1)

    // Twice the target is still one bar: the 'over' tone already says the rest.
    expect(paceRatio(40, 20)).toBe(1)

    expect(paceRatio(10, 0)).toBe(0)
    expect(paceRatio(0, 20)).toBe(0)
    expect(paceRatio(NaN, 20)).toBe(0)
  })
})

describe('currentStreak', () => {
  it('counts the run in progress, and lets a scratch end it without starting one', () => {
    expect(currentStreak([{ amount: 5 }, { amount: 3 }, { amount: 2 }])).toEqual({
      length: 3,
      kind: 'win',
    })

    // The run is the *most recent* one, not the longest.
    expect(currentStreak([{ amount: 5 }, { amount: -1 }, { amount: -2 }])).toEqual({
      length: 2,
      kind: 'loss',
    })

    // A scratch is neither a win to ride nor a loss to worry about.
    expect(currentStreak([{ amount: -1 }, { amount: 0 }])).toEqual({ length: 0, kind: 'none' })
    expect(currentStreak([])).toEqual({ length: 0, kind: 'none' })
    expect(currentStreak(null)).toEqual({ length: 0, kind: 'none' })
  })
})

describe('streakTone', () => {
  it('calls out the cold run, which is where discipline actually goes', () => {
    expect(streakTone({ length: 3, kind: 'win' })).toBe('hot')
    expect(streakTone({ length: 2, kind: 'win' })).toBe('neutral')

    // The trade after three losses is the one taken too big and too early to get it back.
    expect(streakTone({ length: 3, kind: 'loss' })).toBe('cold')
    expect(streakTone({ length: 2, kind: 'loss' })).toBe('neutral')

    expect(streakTone({ length: 0, kind: 'none' })).toBe('neutral')
    expect(streakTone(null)).toBe('neutral')
    expect(STREAK_TIERS.cold).toBe(3)
  })
})

describe('dayVolume', () => {
  it('adds up what was actually traded, not what it was worth on paper', () => {
    expect(dayVolume([{ qty: 2, px: 100 }, { qty: 1, px: 200 }])).toEqual({
      contracts: 3,
      turnover: 400,
    })

    // Size is absolute: a sell is still volume traded.
    expect(dayVolume([{ qty: -2, px: 100 }]).contracts).toBe(2)

    expect(dayVolume([{ qty: 2 }]).turnover).toBe(0)
    expect(dayVolume(null)).toEqual({ contracts: 0, turnover: 0 })
  })
})

describe('refreshSession', () => {
  it('publishes pace, streak and size from the day the desk actually had', () => {
    setValue('settings.tradesPerHourTarget', 20)
    tick()

    appendRealization({ amount: 5, qty: 1, ts: 3500000 })
    appendRealization({ amount: -2, qty: 1, ts: 3550000 })
    appendRealization({ amount: -3, qty: 2, ts: 3590000 })

    const session = refreshSession({ now: 3600000 })
    tick()

    expect(session.perHour).toBe(3)
    expect(session.paceState).toBe('under')
    expect(session.streak).toBe(2)
    expect(session.streakKind).toBe('loss')
    expect(session.contracts).toBe(4)

    expect(appState.ui.session).toMatchObject({ streakKind: 'loss', paceLabel: '3.0' })
  })
})
