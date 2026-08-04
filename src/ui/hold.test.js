// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createHold } from './hold.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

/** A timer double that runs its callbacks on demand. */
function fakeTimer() {
  const timeouts = []
  const intervals = []
  return {
    timeouts,
    intervals,
    setTimeout: (fn) => (timeouts.push(fn), timeouts.length),
    clearTimeout: (id) => (timeouts[id - 1] = null),
    setInterval: (fn) => (intervals.push(fn), intervals.length),
    clearInterval: (id) => (intervals[id - 1] = null),
  }
}

/** A document double that records which listeners are armed. */
function fakeDoc() {
  const armed = new Map()
  return {
    armed,
    addEventListener: (type, fn) => armed.set(type, fn),
    removeEventListener: (type) => armed.delete(type),
  }
}

beforeEach(() => {
  resetState()
  setValue(PATHS.trade.holdPct, 0)
  tick()
})

describe('createHold', () => {
  it('fills from the timer, fires once, and cannot be left half-armed', () => {
    const fired = []
    const timer = fakeTimer()
    const doc = fakeDoc()
    let clock = 0
    const hold = createHold({ path: PATHS.trade.holdPct, ms: 600, onComplete: (p) => fired.push(p) })

    expect(hold.active()).toBe(false)
    expect(hold.begin(null, { timer, doc, now: () => clock, holdMs: 600 })).toBe(true)
    expect(hold.active()).toBe(true)

    // A second press while one is running is the same press: two timers would fire the
    // action twice.
    hold.begin(null, { timer, doc })
    expect(timer.timeouts.filter(Boolean)).toHaveLength(1)

    // The ring fills from the timer. A CSS animation running beside the timeout would
    // finish at a different moment and the trader would learn to trust the wrong one.
    clock = 300
    timer.intervals[0]()
    tick()
    expect(appState.trade.holdPct).toBe(0.5)

    // Release listens on the *document*: a pointer that goes down on the button and up
    // elsewhere is a person changing their mind.
    expect([...doc.armed.keys()]).toEqual(['pointerup', 'pointercancel'])

    timer.timeouts[0]()
    tick()
    expect(fired).toHaveLength(1)
    expect(hold.active()).toBe(false)
    expect(appState.trade.holdPct).toBe(0)
    // Both listeners go, not only the one that fired: a leftover `pointercancel` would
    // kill the next hold before it started.
    expect(doc.armed.size).toBe(0)
  })

  it('cancels cleanly, and cancelling nothing is not an error', () => {
    const fired = []
    const timer = fakeTimer()
    const doc = fakeDoc()
    const hold = createHold({ path: PATHS.trade.holdPct, ms: 600, onComplete: () => fired.push(1) })

    hold.begin(null, { timer, doc })
    expect(hold.cancel(null, { timer, doc })).toBe(true)
    tick()

    expect(timer.timeouts[0]).toBeNull()
    expect(fired).toEqual([])
    expect(doc.armed.size).toBe(0)
    expect(appState.trade.holdPct).toBe(0)

    expect(hold.cancel(null, {})).toBe(false)

    // A hold with no state path and no document still works — it is a gesture, not a
    // rendering concern.
    const bare = createHold({ onComplete: () => fired.push(2) })
    expect(bare.begin(null, { timer, doc: null })).toBe(true)
    timer.timeouts.at(-1)()
    expect(fired).toEqual([2])
  })
})
