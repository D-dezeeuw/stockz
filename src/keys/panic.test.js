import { describe, it, expect, beforeEach } from 'vitest'
import {
  isDoubleTap,
  panicCooldown,
  tapEscape,
  resetPanic,
  registerPanicAction,
  DOUBLE_TAP_MS,
  COOLDOWN_MS,
} from './panic.js'
import { clearActions, dispatchAction } from '../actions/registry.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetPanic()
  clearActions()
  resetState()
})

describe('isDoubleTap', () => {
  it('counts two presses as a gesture only when they are genuinely together', () => {
    expect(isDoubleTap(1000, 900)).toBe(true)
    expect(isDoubleTap(1000, 1000)).toBe(true)
    expect(isDoubleTap(1400, 1000)).toBe(true)

    // Just past the window is a separate press, not a gesture.
    expect(isDoubleTap(1401, 1000)).toBe(false)
    expect(DOUBLE_TAP_MS).toBe(400)

    // No previous press is not a double tap, whatever the clock says.
    expect(isDoubleTap(1000, 0)).toBe(false)
    expect(isDoubleTap(1000, NaN)).toBe(false)
  })
})

describe('panicCooldown', () => {
  it('locks out a second panic long enough to stop a loop', () => {
    expect(panicCooldown(1500, 1000)).toBe(true)
    expect(panicCooldown(2000, 1000)).toBe(false)
    expect(COOLDOWN_MS).toBe(1000)

    expect(panicCooldown(1000, 0)).toBe(false)
    expect(panicCooldown(NaN, 1000)).toBe(false)
  })
})

describe('tapEscape', () => {
  it('makes the first press a close and the second, quickly, a panic', () => {
    // Escape is the most-pressed key on any interface; a flatten on the first press
    // would fire by accident within a day.
    expect(tapEscape(1000)).toEqual({ panic: false, reason: 'single' })
    expect(tapEscape(1200)).toEqual({ panic: true, reason: 'double' })

    // The gesture resets, so a third press is a close again rather than a second panic.
    expect(tapEscape(1300)).toEqual({ panic: false, reason: 'cooldown' })

    resetPanic()
    expect(tapEscape(5000).reason).toBe('single')
    // Too slow to be a gesture: two separate closes.
    expect(tapEscape(9000).reason).toBe('single')
  })
})

describe('resetPanic', () => {
  it('forgets the tap history', () => {
    tapEscape(1000)
    expect(resetPanic()).toBe(true)
    // Without the history, the next press is a first press again.
    expect(tapEscape(1200).reason).toBe('single')
  })
})

describe('registerPanicAction', () => {
  it('goes cold before it cancels, so nothing can be added mid-exit', () => {
    const cancelled = []
    const name = registerPanicAction({ cancel: () => cancelled.push('cancelAll') })
    expect(name).toBe('keys.panic')

    setValue('trade.armed', true)
    setValue('ui.modal', 'palette')
    setValue('trade.orders', [
      { clOrdId: 'a', state: 'live' },
      { clOrdId: 'b', state: 'filled' },
    ])
    tick()

    // First press just closes the overlay.
    expect(dispatchAction(name, { now: 1000 })).toBe(false)
    tick()
    expect(appState.ui.modal).toBe('')
    expect(appState.trade.armed).toBe(true)
    expect(cancelled).toEqual([])

    // Second, quickly: cold desk and every working order cancelled.
    expect(dispatchAction(name, { now: 1200 })).toBe(true)
    tick()
    expect(appState.trade.armed).toBe(false)
    expect(cancelled).toEqual(['cancelAll'])
    // The toast counts only what was actually working.
    expect(appState.ui.toasts.at(-1).message).toContain('cancelling 1')

    // A forced panic skips the gesture, for a breaker or a button.
    resetPanic()
    setValue('trade.armed', true)
    tick()
    expect(dispatchAction(name, { force: true, now: 9000 })).toBe(true)
    tick()
    expect(appState.trade.armed).toBe(false)
    expect(cancelled).toHaveLength(2)
  })
})
