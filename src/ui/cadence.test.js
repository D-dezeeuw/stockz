// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { AMBIENT_MS, publishAmbient, flushAmbient, resetAmbient } from './cadence.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

/** A timer double that runs its callbacks on demand. */
function fakeTimer() {
  const pending = []
  return {
    pending,
    setTimeout: (fn) => (pending.push(fn), pending.length),
    clearTimeout: (id) => (pending[id - 1] = null),
    run: () => {
      for (const fn of pending.splice(0)) fn?.()
    },
  }
}

beforeEach(() => {
  resetState()
  resetAmbient()
  setValue(PATHS.ui.alertPanel, null)
  tick()
})

describe('publishAmbient', () => {
  it('writes the first at once, coalesces the burst, and ends on the newest', () => {
    const timer = fakeTimer()
    let clock = 1000
    const at = { now: () => clock, timer, everyMs: 200 }

    // Leading edge: a single update appears immediately, so the slow clock is invisible
    // exactly when there is nothing to be slow about.
    expect(publishAmbient(PATHS.ui.alertPanel, { total: 1 }, at)).toBe(true)
    tick()
    expect(appState.ui.alertPanel).toEqual({ total: 1 })

    // Inside the window everything defers, and only one flush is armed however many
    // updates arrive.
    clock = 1050
    expect(publishAmbient(PATHS.ui.alertPanel, { total: 2 }, at)).toBe(false)
    clock = 1100
    expect(publishAmbient(PATHS.ui.alertPanel, { total: 3 }, at)).toBe(false)
    expect(timer.pending.filter(Boolean)).toHaveLength(1)
    tick()
    expect(appState.ui.alertPanel).toEqual({ total: 1 })

    // The newest wins, not the first: a coalesced burst must end on the truth.
    clock = 1200
    timer.run()
    tick()
    expect(appState.ui.alertPanel).toEqual({ total: 3 })

    // Past the window it is immediate again.
    clock = 2000
    expect(publishAmbient(PATHS.ui.alertPanel, { total: 4 }, at)).toBe(true)

    expect(publishAmbient('', { total: 9 }, at)).toBe(false)
    expect(AMBIENT_MS).toBe(200)
  })
})

describe('flushAmbient', () => {
  it('lands every deferred value now, so a burst never ends one update stale', () => {
    const timer = fakeTimer()
    let clock = 1000
    const at = { now: () => clock, timer, everyMs: 200 }

    publishAmbient(PATHS.ui.alertPanel, { total: 1 }, at)
    clock = 1050
    publishAmbient(PATHS.ui.alertPanel, { total: 7 }, at)

    expect(flushAmbient({ timer })).toBe(1)
    tick()
    expect(appState.ui.alertPanel).toEqual({ total: 7 })

    // Nothing pending is not an error.
    expect(flushAmbient({ timer })).toBe(0)
  })
})

describe('resetAmbient', () => {
  it('forgets every lane so a later write is immediate again', () => {
    const timer = fakeTimer()
    let clock = 1000
    const at = { now: () => clock, timer, everyMs: 200 }

    publishAmbient(PATHS.ui.alertPanel, { total: 1 }, at)
    clock = 1050
    publishAmbient(PATHS.ui.alertPanel, { total: 2 }, at)

    expect(resetAmbient({ timer })).toBe(true)
    expect(flushAmbient({ timer })).toBe(0)

    // The lane is gone, so this is a first write rather than one inside a live window.
    expect(publishAmbient(PATHS.ui.alertPanel, { total: 3 }, at)).toBe(true)
  })
})
