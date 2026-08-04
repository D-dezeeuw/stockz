import { describe, it, expect, beforeEach } from 'vitest'
import {
  isSilenced,
  mayInterrupt,
  toggleDnd,
  snooze,
  snoozeLabel,
  expireSnooze,
  refreshDnd,
  registerDndActions,
  SNOOZE_OPTIONS,
} from './dnd.js'
import { ACTIONS } from '../actions/names.js'
import { dispatchAction, clearActions } from '../actions/registry.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetState()
  clearActions()
})

describe('isSilenced', () => {
  it('treats an unexpired snooze as silence, and an expired one as over', () => {
    expect(isSilenced(true, 0, 1000)).toBe(true)
    expect(isSilenced(false, 5000, 1000)).toBe(true)
    expect(isSilenced(false, 5000, 5000)).toBe(false)

    expect(isSilenced(false, 0, 1000)).toBe(false)
    expect(isSilenced(false, NaN, 1000)).toBe(false)
    expect(SNOOZE_OPTIONS).toEqual([5, 15, 60])
  })
})

describe('mayInterrupt', () => {
  it('lets an error through by default, because a missed reject is how muting loses money', () => {
    expect(mayInterrupt({ severity: 'info' }, 1000, {})).toBe(true)

    const muted = { dnd: true }
    expect(mayInterrupt({ severity: 'info' }, 1000, muted)).toBe(false)
    // A mute that could swallow a reject is one nobody switches on.
    expect(mayInterrupt({ severity: 'error' }, 1000, muted)).toBe(true)

    // Turning the bypass off means total silence, which is a choice available to make.
    expect(mayInterrupt({ severity: 'error' }, 1000, { dnd: true, bypassCritical: false })).toBe(false)
    expect(mayInterrupt({ severity: 'warn' }, 1000, { snoozeUntil: 9000 })).toBe(false)
  })
})

describe('toggleDnd', () => {
  it('clears a running snooze when un-muting, so the desk cannot go quiet again unexplained', () => {
    setValue('settings.snoozeUntil', 99999)
    tick()

    expect(toggleDnd(true)).toBe(true)
    tick()
    expect(appState.settings.dnd).toBe(true)

    expect(toggleDnd()).toBe(false)
    tick()
    // The trader made the more explicit statement; a countdown left running behind an
    // un-muted bell is a desk that goes silent again for no visible reason.
    expect(appState.settings.snoozeUntil).toBe(0)
  })
})

describe('snooze', () => {
  it('is "not now" rather than "not ever", which is the honest state', () => {
    expect(snooze(15, 1000)).toBe(1000 + 900000)
    tick()
    expect(appState.settings.snoozeUntil).toBe(901000)

    // Zero or nonsense clears it rather than silencing forever.
    expect(snooze(0, 1000)).toBe(0)
    expect(snooze(NaN, 1000)).toBe(0)
  })
})

describe('snoozeLabel', () => {
  it('rounds up, so a countdown never shows 0m while still silent', () => {
    expect(snoozeLabel(1000 + 900000, 1000)).toBe('15m')
    expect(snoozeLabel(1000 + 30000, 1000)).toBe('1m')

    expect(snoozeLabel(1000, 1000)).toBe('')
    expect(snoozeLabel(0, 1000)).toBe('')
    expect(snoozeLabel(NaN, 1000)).toBe('')
  })
})

describe('expireSnooze', () => {
  it('clears rather than leaving a stale timestamp the gate keeps doing sums on', () => {
    setValue('settings.snoozeUntil', 5000)
    tick()

    expect(expireSnooze(4000)).toBe(false)
    expect(expireSnooze(5000)).toBe(true)
    tick()
    expect(appState.settings.snoozeUntil).toBe(0)
    expect(expireSnooze(9000)).toBe(false)
  })
})

describe('refreshDnd', () => {
  it('publishes one bell state, so the header needs no logic of its own', () => {
    setValue('settings.snoozeUntil', 1000 + 300000)
    tick()

    const state = refreshDnd(1000)
    tick()

    expect(state).toEqual({ silenced: true, muted: false, countdown: '5m' })
    expect(appState.ui.dnd.silenced).toBe(true)
  })
})

describe('registerDndActions', () => {
  it('wires the bell and the snooze menu', () => {
    expect(registerDndActions()).toBe(ACTIONS.alerts.toggleDnd)

    dispatchAction(ACTIONS.alerts.toggleDnd, {})
    tick()
    expect(appState.settings.dnd).toBe(true)

    dispatchAction(ACTIONS.alerts.snooze, { minutes: 5 })
    tick()
    expect(appState.settings.snoozeUntil).toBeGreaterThan(0)
  })
})
