// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  TOAST_LEVELS,
  TOAST_LIMIT,
  makeToast,
  pushToast,
  dismissToast,
  expireToasts,
  describeEngineError,
  wireEngineErrors,
} from './toast.js'
import { appState, tick, resetState, setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

/** Push a toast and flush it into state in one step. */
function push(message, level, now) {
  const toast = pushToast(message, level, now)
  tick()
  return toast
}

beforeEach(() => {
  resetState()
  setValue(PATHS.ui.toasts, [])
  tick()
})

describe('makeToast', () => {
  it('stamps a unique id, a valid level and an expiry that suits the severity', () => {
    const info = makeToast('feed connected', 'info', 1000)
    expect(info.message).toBe('feed connected')
    expect(info.level).toBe('info')
    expect(info.until).toBe(5000)

    // Errors linger far longer than successes - they matter longer.
    expect(makeToast('x', 'error', 0).until).toBeGreaterThan(makeToast('x', 'success', 0).until)

    // Ids are unique so dismissal targets one toast.
    expect(makeToast('a').id).not.toBe(makeToast('a').id)

    // Bad input degrades instead of rendering blank or crashing.
    expect(makeToast('  ', 'nonsense').level).toBe('info')
    expect(makeToast('').message).toBe('something happened')
    expect(TOAST_LEVELS).toEqual(['info', 'success', 'warn', 'error'])
  })
})

describe('pushToast', () => {
  it('shows newest first and caps the stack so errors cannot bury the prices', () => {
    push('first', 'info', 0)
    push('second', 'warn', 0)

    expect(appState.ui.toasts[0].message).toBe('second')
    expect(appState.ui.toasts).toHaveLength(2)

    // A venue outage can emit the same error dozens of times a second.
    for (let i = 0; i < 10; i += 1) push(`burst ${i}`, 'error', 0)

    expect(appState.ui.toasts).toHaveLength(TOAST_LIMIT)
    expect(appState.ui.toasts[0].message).toBe('burst 9')
  })
})

describe('dismissToast', () => {
  it('removes one toast by id and reports when there was nothing to remove', () => {
    const keep = push('keep me', 'info', 0)
    const drop = push('dismiss me', 'info', 0)

    expect(dismissToast(drop.id)).toBe(true)
    tick()
    expect(appState.ui.toasts.map((t) => t.id)).toEqual([keep.id])

    expect(dismissToast(drop.id)).toBe(false)
    expect(dismissToast(9999)).toBe(false)
  })
})

describe('expireToasts', () => {
  it('drops toasts whose time is up, computed from the clock not per-toast timers', () => {
    push('quick', 'success', 0) // until 2500
    push('slow', 'error', 0) // until 10000

    expect(expireToasts(1000)).toBe(0)

    expect(expireToasts(3000)).toBe(1)
    tick()
    expect(appState.ui.toasts.map((t) => t.message)).toEqual(['slow'])

    expect(expireToasts(20000)).toBe(1)
    tick()
    expect(appState.ui.toasts).toEqual([])

    // Nothing to expire is not an error.
    expect(expireToasts(30000)).toBe(0)
  })
})

describe('describeEngineError', () => {
  it('translates engine codes into something a trader can act on', () => {
    expect(describeEngineError({ code: 'E_TICK_OVERFLOW' })).toMatch(/falling behind the feed/)
    expect(describeEngineError({ code: 'E_COMPUTED_SELF_DEP' })).toMatch(/derived value/)

    // Unknown faults stay readable rather than being swallowed.
    expect(describeEngineError({ message: 'socket closed' })).toBe('socket closed')
    expect(describeEngineError('plain string')).toBe('plain string')
    expect(describeEngineError(null)).toBe('unknown error')
  })
})

describe('wireEngineErrors', () => {
  it('turns an engine fault into an error toast instead of console noise', () => {
    const handler = wireEngineErrors({ now: () => 500 })

    const toast = handler({ code: 'E_TICK_OVERFLOW', message: 'raw internal text' })
    tick()

    expect(toast.level).toBe('error')
    expect(toast.message).toMatch(/falling behind the feed/)
    expect(appState.ui.toasts[0].id).toBe(toast.id)
    expect(appState.ui.toasts[0].at).toBe(500)
  })
})
