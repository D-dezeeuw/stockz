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
  coalesceToast,
  pauseToast,
  toastFromAlert,
  registerToastActions,
  wireAlertToasts,
} from './toast.js'
import { appState, tick, resetState, setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { ACTIONS } from '../actions/names.js'
import { dispatchAction, clearActions } from '../actions/registry.js'
import { emitAlert, resetAlerts } from '../alerts/bus.js'

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

describe('coalesceToast', () => {
  it('bumps a repeat instead of filling the cap with one message', () => {
    resetState()

    coalesceToast('venue error', 'error', 1000)
    tick()
    const bumped = coalesceToast('venue error', 'error', 1200)
    tick()

    // Forty errors a second would otherwise push out the three others the trader needed.
    expect(appState.ui.toasts).toHaveLength(1)
    expect(bumped.count).toBe(2)

    coalesceToast('something else', 'info', 1300)
    tick()
    expect(appState.ui.toasts).toHaveLength(2)
  })
})

describe('pauseToast', () => {
  it('freezes the clock, so a message never vanishes mid-word', () => {
    resetState()

    const toast = pushToast('read me', 'info', 1000)
    tick()

    const paused = pauseToast(toast.id, true, 2000)
    tick()
    expect(paused.paused).toBe(true)
    expect(paused.remaining).toBe(3000)

    // A paused toast never expires.
    expect(expireToasts(999999)).toBe(0)

    const resumed = pauseToast(toast.id, false, 5000)
    tick()
    expect(resumed.until).toBe(8000)
    // Resuming again re-banks the same remaining time from the new now: the countdown is
    // what was left when the pointer arrived, not a fixed deadline.
    expect(pauseToast(toast.id, false, 9000).until).toBe(12000)
    // A toast that was never paused has nothing banked and expires at once rather than
    // living forever.
    const fresh = pushToast('never paused', 'info', 1000)
    tick()
    expect(pauseToast(fresh.id, false, 9000).until).toBe(9000)
    expect(pauseToast(9999, true, 1000)).toBeNull()
  })
})

describe('toastFromAlert', () => {
  it('keeps one severity vocabulary, so error cannot quietly become warn', () => {
    resetState()

    const toast = toastFromAlert({ text: 'REJECT BUY x', severity: 'error', ts: 1000 })
    tick()

    expect(toast).toMatchObject({ message: 'REJECT BUY x', level: 'error' })
    expect(appState.ui.toasts).toHaveLength(1)
    // An alert with no severity is info, and one with no timestamp uses the caller's clock.
    expect(toastFromAlert({ text: 'plain' }, 2000).level).toBe('info')
    expect(toastFromAlert({ text: '  ' })).toBeNull()
  })
})

describe('registerToastActions', () => {
  it('wires click-to-dismiss', () => {
    resetState()
    clearActions()

    expect(registerToastActions()).toBe(ACTIONS.ui.dismissToast)

    const toast = pushToast('gone soon', 'info', 1000)
    tick()
    dispatchAction(ACTIONS.ui.dismissToast, { id: toast.id })
    tick()

    expect(appState.ui.toasts).toEqual([])

    // A bare id works too: the markup binds one attribute, not an object.
    const second = pushToast('also gone', 'info', 1000)
    tick()
    dispatchAction(ACTIONS.ui.dismissToast, second.id)
    tick()
    expect(appState.ui.toasts).toEqual([])
  })
})

describe('wireAlertToasts', () => {
  it('subscribes once, because a new alert type must not need a new wire', () => {
    resetState()
    resetAlerts()

    // The default clock path, exercised before the injected one.
    wireAlertToasts()()

    const off = wireAlertToasts({ now: () => 1000 })
    emitAlert({ text: 'BUY BTC', key: 'k', severity: 'warn', ts: 1000 })
    tick()

    expect(appState.ui.toasts[0]).toMatchObject({ message: 'BUY BTC', level: 'warn' })

    off()
    emitAlert({ text: 'SELL BTC', key: 'j', ts: 2000 })
    tick()
    expect(appState.ui.toasts).toHaveLength(1)
  })
})
