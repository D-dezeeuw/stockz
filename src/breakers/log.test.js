import { describe, it, expect, beforeEach } from 'vitest'
import {
  LOG_SIZE,
  RETENTION_MS,
  LOG_KEY,
  eventLabel,
  logBreakerEvent,
  breakerEvents,
  flushBreakerLog,
  loadBreakerLog,
  pruneBreakerEvents,
  copyBreakerLog,
  registerLogActions,
  resetBreakerLog,
} from './log.js'
import { TRIP } from './codes.js'
import { ACTIONS } from '../actions/names.js'
import { clearActions, dispatchAction } from '../actions/registry.js'
import { appState, tick, resetState } from '../app/engine.js'

/** A localStorage stand-in that can be told to fail. */
function fakeStorage(broken = false) {
  const map = new Map()
  return {
    map,
    getItem: (key) => {
      if (broken) throw new Error('no storage')
      return map.get(key) ?? null
    },
    setItem: (key, value) => {
      if (broken) throw new Error('quota')
      map.set(key, value)
    },
  }
}

beforeEach(() => {
  resetBreakerLog()
  resetState()
  clearActions()
})

describe('eventLabel', () => {
  it('says what happened without making the reader decode a number', () => {
    expect(eventLabel({ kind: 'trip', code: TRIP.DAILY_LOSS })).toBe('trip — daily loss limit')
    expect(eventLabel({ kind: 'block', reason: 'position cap 1' })).toBe('block — position cap 1')

    expect(eventLabel({ kind: 'pause' })).toBe('pause')
    expect(eventLabel(null)).toBe('event')
  })
})

describe('logBreakerEvent', () => {
  it('records newest-first and defers the write off the hot path', () => {
    const deferred = []
    const deps = { defer: (fn) => deferred.push(fn), storage: fakeStorage() }

    logBreakerEvent({ kind: 'trip', code: TRIP.KILL, ts: 1000 }, deps)
    logBreakerEvent({ kind: 'block', reason: 'position cap 1', ts: 2000 }, deps)
    tick()

    expect(breakerEvents()[0]).toMatchObject({ kind: 'block', ts: 2000 })
    expect(appState.breaker.log[0].label).toBe('block — position cap 1')

    // Coalesced behind one flag: a burst of blocks serialises once, not once per block.
    expect(deferred).toHaveLength(1)
    deferred[0]()

    expect(JSON.parse(deps.storage.map.get(LOG_KEY))).toHaveLength(2)

    // Bounded, because the hundredth-oldest trip is not what anybody is looking for.
    for (let i = 0; i < LOG_SIZE + 10; i += 1) logBreakerEvent({ kind: 'block', ts: i }, deps)
    expect(breakerEvents()).toHaveLength(LOG_SIZE)
  })
})

describe('breakerEvents', () => {
  it('reads the ring back, newest first', () => {
    expect(breakerEvents()).toEqual([])

    logBreakerEvent({ kind: 'trip', ts: 1 }, { defer: () => {} })
    logBreakerEvent({ kind: 'pause', ts: 2 }, { defer: () => {} })

    expect(breakerEvents().map((entry) => entry.kind)).toEqual(['pause', 'trip'])
  })
})

describe('flushBreakerLog', () => {
  it('swallows a full quota rather than interrupting trading over a log', () => {
    logBreakerEvent({ kind: 'trip', ts: 1 }, { defer: () => {} })

    const storage = fakeStorage()
    expect(flushBreakerLog(storage)).toBe(true)
    expect(storage.map.get(LOG_KEY)).toContain('trip')

    expect(flushBreakerLog(fakeStorage(true))).toBe(false)
  })
})

describe('loadBreakerLog', () => {
  it('degrades to an empty log rather than stopping the desk from booting', () => {
    const storage = fakeStorage()
    storage.setItem(LOG_KEY, JSON.stringify([{ ts: 5, kind: 'trip', label: 'trip' }]))

    expect(loadBreakerLog(storage)).toHaveLength(1)
    tick()
    expect(appState.breaker.log[0].kind).toBe('trip')

    storage.setItem(LOG_KEY, '{not json')
    expect(loadBreakerLog(storage)).toEqual([])
    expect(loadBreakerLog(fakeStorage(true))).toEqual([])
  })
})

describe('pruneBreakerEvents', () => {
  it('drops what is past the window and leaves the rest alone', () => {
    const storage = fakeStorage()
    const now = RETENTION_MS * 2

    logBreakerEvent({ kind: 'trip', ts: now - 1000 }, { defer: () => {} })
    logBreakerEvent({ kind: 'trip', ts: now - RETENTION_MS - 1 }, { defer: () => {} })

    expect(pruneBreakerEvents(now, storage)).toBe(1)
    expect(breakerEvents()).toHaveLength(1)

    // Nothing to drop is not a write: the store should not be rewritten every session
    // start for no reason.
    expect(pruneBreakerEvents(now, storage)).toBe(0)
  })
})

describe('copyBreakerLog', () => {
  it('hands over JSON without waiting on the permission prompt', () => {
    logBreakerEvent({ kind: 'trip', ts: 7 }, { defer: () => {} })

    const written = []
    const payload = copyBreakerLog({ writeText: (text) => (written.push(text), Promise.resolve()) })

    expect(JSON.parse(payload)[0].ts).toBe(7)
    expect(written).toHaveLength(1)

    // No clipboard at all is not a crash: the button simply returns what it would copy.
    expect(copyBreakerLog(null)).toBe(payload)
  })
})

describe('registerLogActions', () => {
  it('wires the copy button', () => {
    expect(registerLogActions()).toBe(ACTIONS.breaker.copyLog)
    expect(dispatchAction(ACTIONS.breaker.copyLog)).toBeGreaterThan(0)
  })
})

describe('resetBreakerLog', () => {
  it('forgets the record so a fresh session starts clean', () => {
    logBreakerEvent({ kind: 'trip', ts: 1 }, { defer: () => {} })

    expect(resetBreakerLog()).toBe(true)
    tick()
    expect(breakerEvents()).toEqual([])
    expect(appState.breaker.log).toEqual([])
  })
})
