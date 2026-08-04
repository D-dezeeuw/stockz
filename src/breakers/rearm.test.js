// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  HOLD_MS,
  stillOverLimit,
  startHold,
  armHoldProgress,
  cancelHold,
  holdState,
  holdFrame,
  holdLoop,
  mountRelease,
  rearmDesk,
  registerRearmActions,
} from './rearm.js'
import { refreshThresholds, tripBreaker, trippedCode, resetBreaker, TRIP } from './core.js'
import { onRealizedFill, pauseState, resetPause } from './position.js'
import { resetTrip } from './trip.js'
import { resetAlerts } from '../alerts/bus.js'
import { ACTIONS } from '../actions/names.js'
import { clearActions, dispatchAction } from '../actions/registry.js'
import { appState, tick, setValue, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

beforeEach(() => {
  resetBreaker(0)
  resetPause()
  resetTrip()
  resetAlerts()
  resetState()
  clearActions()
  cancelHold()
  refreshThresholds({ maxDailyLoss: 200 })
})

describe('stillOverLimit', () => {
  it('refuses a re-arm back into a limit that is still breached', () => {
    expect(stillOverLimit({ dayPnl: -10 })).toEqual({ over: false, reason: '' })

    // A desk that let the trader back in under a blown limit would trip again on their
    // first order, which reads as a broken breaker rather than a working one.
    const blocked = stillOverLimit({ dayPnl: -250 })
    expect(blocked.over).toBe(true)
    expect(blocked.reason).toMatch(/still past the daily limit/)
  })
})

describe('startHold', () => {
  it('opens a press and zeroes the ring', () => {
    setValue(PATHS.breaker.holdPct, 0.7)

    expect(startHold(5000)).toBe(5000)
    tick()
    expect(appState.breaker.holdPct).toBe(0)
    expect(holdState()).toBe(5000)
  })
})

describe('armHoldProgress', () => {
  it('fills over the hold and reads zero with no press at all', () => {
    expect(armHoldProgress(9999)).toBe(0)

    startHold(1000)
    expect(armHoldProgress(1000 + HOLD_MS / 2)).toBe(0.5)
    // Held past the second: capped, so the ring cannot overfill.
    expect(armHoldProgress(1000 + HOLD_MS * 3)).toBe(1)

    tick()
    expect(appState.breaker.holdPct).toBe(1)
  })
})

describe('cancelHold', () => {
  it('lets go without arming, which is the whole escape from a mis-press', () => {
    expect(cancelHold()).toBe(false)

    startHold(1000)
    armHoldProgress(1400)

    expect(cancelHold()).toBe(true)
    tick()
    expect(appState.breaker.holdPct).toBe(0)
    expect(holdState()).toBeNull()
  })
})

describe('holdState', () => {
  it('reads back whether a finger is down', () => {
    expect(holdState()).toBeNull()
    startHold(77)
    expect(holdState()).toBe(77)

    // Null rather than zero: a monotonic clock reads near zero early in a page's life, and
    // a sentinel a real timestamp can equal is a press that silently never starts.
    startHold(0)
    expect(holdState()).toBe(0)
  })
})

describe('holdFrame', () => {
  it('arms on the press completing, not on the release', () => {
    tripBreaker(TRIP.KILL, {}, { kill: () => {} })
    startHold(1000)

    expect(holdFrame(1500)).toEqual({ pct: 0.5, done: false })
    expect(trippedCode()).toBe(TRIP.KILL)

    // Waiting for a release would mean a trader holding the button for two seconds — the
    // obvious way to be sure — never re-armed at all.
    expect(holdFrame(1000 + HOLD_MS)).toEqual({ pct: 1, done: true })
    expect(trippedCode()).toBe(TRIP.NONE)
    expect(holdState()).toBeNull()
  })
})

describe('rearmDesk', () => {
  it('clears the halt but never the numbers that caused it', () => {
    setValue(PATHS.breaker.dayPnl, -250)
    tick()
    tripBreaker(TRIP.DAILY_LOSS, {}, { kill: () => {} })

    expect(rearmDesk(2000)).toBe(false)
    expect(trippedCode()).toBe(TRIP.DAILY_LOSS)

    setValue(PATHS.breaker.dayPnl, -50)
    tick()
    onRealizedFill(-1, { maxConsecLosses: 1 })

    expect(rearmDesk(3000)).toBe(true)
    tick()
    expect(trippedCode()).toBe(TRIP.NONE)
    expect(appState.breaker.lastRearm).toEqual({ ts: 3000, priorCode: TRIP.DAILY_LOSS })
    // The pause goes with it, or the desk looks armed and refuses every entry.
    expect(pauseState().paused).toBe(false)
    // The robot does not come back. Re-arming is a statement about the human being ready.
    expect(appState.settings?.botArmed).not.toBe(true)

    expect(rearmDesk(4000)).toBe(false)
  })
})

describe('holdLoop', () => {
  it('asks for another frame until the press lands or is let go', () => {
    tripBreaker(TRIP.KILL, {}, { kill: () => {} })

    let time = 0
    const frames = []
    const deps = { raf: (fn) => frames.push(fn), clock: () => time }

    // No finger down: nothing scheduled.
    expect(holdLoop(deps)).toBe(false)
    expect(frames).toHaveLength(0)

    startHold(0)
    expect(holdLoop(deps)).toBe(false)
    expect(frames).toHaveLength(1)

    time = 400
    frames.pop()()
    expect(trippedCode()).toBe(TRIP.KILL)

    time = HOLD_MS
    expect(frames.pop()()).toBe(true)
    expect(trippedCode()).toBe(TRIP.NONE)
  })
})

describe('mountRelease', () => {
  it('cancels wherever the finger comes up, not only over the button', () => {
    startHold(1000)
    const off = mountRelease(window)

    // A finger that slides off the control before lifting would otherwise leave the ring
    // filling under a hand that had already let go.
    window.dispatchEvent(new Event('pointerup'))
    expect(holdState()).toBeNull()

    off()
    startHold(2000)
    window.dispatchEvent(new Event('pointerup'))
    expect(holdState()).toBe(2000)

    expect(mountRelease(null)).toBeInstanceOf(Function)
  })
})

describe('registerRearmActions', () => {
  it('binds the press, the release and the guarded re-arm', () => {
    tripBreaker(TRIP.KILL, {}, { kill: () => {} })

    let time = 0
    const frames = []
    expect(registerRearmActions({ raf: (fn) => frames.push(fn), clock: () => time })).toEqual([
      ACTIONS.breaker.hold,
      ACTIONS.breaker.release,
      ACTIONS.breaker.rearm,
    ])

    dispatchAction(ACTIONS.breaker.hold)
    expect(holdState()).toBe(0)

    time = HOLD_MS
    frames.pop()()
    expect(trippedCode()).toBe(TRIP.NONE)

    // Nothing held: letting go of a press that already landed is not a second event.
    expect(dispatchAction(ACTIONS.breaker.release)).toBe(false)
  })
})
