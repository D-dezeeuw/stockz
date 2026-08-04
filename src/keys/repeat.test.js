// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  nextRepeatDelay,
  getNudgeStep,
  isRepeatable,
  createRepeater,
  guardRepeat,
  REPEATABLE,
  FIRST_DELAY_MS,
  MIN_DELAY_MS,
} from './repeat.js'

/** A timer double that lets the test drive the clock. */
function fakeTimer() {
  const pending = []
  return {
    pending,
    setTimeout: (fn, delay) => {
      pending.push({ fn, delay })
      return pending.length
    },
    clearTimeout: () => pending.splice(0, pending.length),
    fire: () => pending.shift()?.fn(),
  }
}

describe('nextRepeatDelay', () => {
  it('starts slow enough that a tap is one step, then accelerates to a floor', () => {
    // The first wait is long: a short press must move exactly one tick.
    expect(nextRepeatDelay(0)).toBe(FIRST_DELAY_MS)
    expect(nextRepeatDelay(1)).toBeLessThan(FIRST_DELAY_MS)
    expect(nextRepeatDelay(2)).toBe(175)

    // It reaches the floor and stays there, rather than approaching zero.
    expect(nextRepeatDelay(8)).toBe(MIN_DELAY_MS)
    expect(nextRepeatDelay(100)).toBe(MIN_DELAY_MS)

    expect(nextRepeatDelay(-5)).toBe(FIRST_DELAY_MS)
  })
})

describe('getNudgeStep', () => {
  it('walks one tick, or ten with shift for when the price has really moved', () => {
    expect(getNudgeStep({ ticks: 1 })).toBe(1)
    expect(getNudgeStep({ ticks: -1 })).toBe(-1)
    expect(getNudgeStep({ ticks: 1, shiftKey: true })).toBe(10)
    expect(getNudgeStep({ ticks: -1, shiftKey: true })).toBe(-10)

    // No direction stated means up by one, not nowhere.
    expect(getNudgeStep({})).toBe(1)
    expect(getNudgeStep({ ticks: 0 })).toBe(1)
    expect(getNudgeStep(null)).toBe(1)
  })
})

describe('isRepeatable', () => {
  it('allows only the actions where a stuck key is harmless', () => {
    expect(isRepeatable('ticket.nudge')).toBe(true)
    expect(isRepeatable('ui.paletteMove')).toBe(true)

    // A stuck key repeating *submit* would be a hundred orders — structurally refused,
    // not merely discouraged.
    expect(isRepeatable('ticket.submit')).toBe(false)
    expect(isRepeatable('orders.cancelAll')).toBe(false)
    expect(isRepeatable(null)).toBe(false)
    expect(REPEATABLE).toContain('ticket.nudge')
  })
})

describe('createRepeater', () => {
  it('fires immediately, accelerates while held, and refuses unsafe actions', () => {
    const timer = fakeTimer()
    const fired = []
    const repeater = createRepeater({
      dispatch: (action, payload) => fired.push([action, payload]),
      timer,
    })

    expect(repeater.start('ticket.nudge', { ticks: 1 })).toBe(true)
    // The first step lands on the press, not after the first delay.
    expect(fired).toEqual([['ticket.nudge', { ticks: 1 }]])
    expect(timer.pending[0].delay).toBe(FIRST_DELAY_MS)
    expect(repeater.running()).toBe(true)

    timer.fire()
    expect(fired).toHaveLength(2)
    // Each repeat comes sooner than the last.
    expect(timer.pending[0].delay).toBeLessThan(FIRST_DELAY_MS)

    // The browser resends keydown while a key is held; re-arming would restart the
    // acceleration curve from the top every time.
    const count = repeater.count()
    repeater.start('ticket.nudge', { ticks: 1 })
    expect(repeater.count()).toBe(count)

    repeater.stop()
    expect(repeater.running()).toBe(false)
    expect(repeater.count()).toBe(0)

    expect(repeater.start('ticket.submit', {})).toBe(false)
    expect(fired).toHaveLength(2)
  })
})

describe('guardRepeat', () => {
  it('stops on release, and on the blur that never sends a keyup', () => {
    let stops = 0
    const repeater = { stop: () => (stops += 1) }
    const off = guardRepeat(repeater, window)

    window.dispatchEvent(new window.KeyboardEvent('keyup', { code: 'ArrowUp' }))
    expect(stops).toBe(1)

    // A key held while the tab loses focus never sends its keyup — a nudge still walking
    // in a background tab would be discovered as a filled order.
    window.dispatchEvent(new window.Event('blur'))
    expect(stops).toBe(2)

    document.dispatchEvent(new window.Event('visibilitychange'))
    expect(stops).toBe(3)

    off()
    window.dispatchEvent(new window.KeyboardEvent('keyup', { code: 'ArrowUp' }))
    expect(stops).toBe(3)

    expect(() => guardRepeat(null, window)()).not.toThrow()
    expect(() => guardRepeat(repeater, null)()).not.toThrow()
  })
})
