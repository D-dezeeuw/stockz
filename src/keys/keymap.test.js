// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  normalizeChord,
  registerBinding,
  unregisterBinding,
  resolveKey,
  allBindings,
  clearBindings,
  isTypingTarget,
  mountKeymap,
} from './keymap.js'

beforeEach(() => clearBindings())

describe('normalizeChord', () => {
  it('builds one spelling per chord, off the physical key', () => {
    expect(normalizeChord({ code: 'KeyB' })).toBe('KeyB')
    expect(normalizeChord({ code: 'KeyK', ctrlKey: true })).toBe('ctrl+KeyK')

    // Modifier order is fixed, so one chord has exactly one spelling however it is held.
    expect(normalizeChord({ code: 'KeyK', shiftKey: true, ctrlKey: true })).toBe('ctrl+shift+KeyK')
    expect(normalizeChord({ code: 'KeyK', metaKey: true, altKey: true })).toBe('alt+meta+KeyK')

    // Holding Shift on the way to Shift+B must not resolve to anything on its own.
    expect(normalizeChord({ code: 'ShiftLeft', shiftKey: true })).toBe('')
    expect(normalizeChord({ code: 'ControlRight', ctrlKey: true })).toBe('')
    expect(normalizeChord({})).toBe('')
  })
})

describe('registerBinding', () => {
  it('binds a chord to an action with the label a cheat sheet needs', () => {
    expect(registerBinding('KeyB', 'ticket.submit', { label: 'buy', payload: { side: 'buy' } })).toBe(
      'KeyB',
    )
    expect(resolveKey('KeyB')).toMatchObject({
      action: 'ticket.submit',
      label: 'buy',
      payload: { side: 'buy' },
      enabled: true,
    })

    // Rebinding replaces rather than duplicating.
    registerBinding('KeyB', 'ticket.reset')
    expect(resolveKey('KeyB').action).toBe('ticket.reset')
    expect(allBindings()).toHaveLength(1)

    expect(registerBinding('', 'ticket.submit')).toBe('')
    expect(registerBinding('KeyX', '')).toBe('')
  })
})

describe('unregisterBinding', () => {
  it('removes a chord and reports whether there was one', () => {
    registerBinding('KeyB', 'ticket.submit')

    expect(unregisterBinding('KeyB')).toBe(true)
    expect(resolveKey('KeyB')).toBeNull()
    expect(unregisterBinding('KeyB')).toBe(false)
  })
})

describe('resolveKey', () => {
  it('returns nothing for an unbound or disabled chord', () => {
    registerBinding('KeyB', 'ticket.submit')
    registerBinding('KeyF', 'positions.flatten', { enabled: false })

    expect(resolveKey('KeyB').action).toBe('ticket.submit')
    // A disabled binding is not a binding — the chord falls through to the browser.
    expect(resolveKey('KeyF')).toBeNull()
    expect(resolveKey('KeyZ')).toBeNull()
    expect(resolveKey(null)).toBeNull()
  })
})

describe('allBindings', () => {
  it('lists every chord for the palette and the cheat sheet', () => {
    registerBinding('KeyB', 'ticket.submit', { label: 'buy' })
    registerBinding('ctrl+KeyK', 'ui.palette', { label: 'command palette' })

    expect(allBindings()).toEqual([
      {
        chord: 'KeyB',
        action: 'ticket.submit',
        label: 'buy',
        payload: {},
        enabled: true,
        scope: 'global',
      },
      {
        chord: 'ctrl+KeyK',
        action: 'ui.palette',
        label: 'command palette',
        payload: {},
        enabled: true,
        scope: 'global',
      },
    ])

    // A scoped binding lists under its own chord, not under its registry key.
    registerBinding('PageDown', 'book.setGroup', { scope: 'block:book' })
    expect(allBindings().at(-1)).toMatchObject({ chord: 'PageDown', scope: 'block:book' })
  })
})

describe('clearBindings', () => {
  it('empties the registry', () => {
    registerBinding('KeyB', 'ticket.submit')
    expect(clearBindings()).toBe(true)
    expect(allBindings()).toEqual([])
  })
})

describe('isTypingTarget', () => {
  it('keeps chords out of text fields but never traps Escape inside one', () => {
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const div = document.createElement('div')

    expect(isTypingTarget(input, 'KeyB')).toBe(true)
    expect(isTypingTarget(textarea, 'KeyB')).toBe(true)
    expect(isTypingTarget(div, 'KeyB')).toBe(false)

    // Escape is how a trader leaves a field they opened by accident.
    expect(isTypingTarget(input, 'Escape')).toBe(false)

    const editable = document.createElement('div')
    editable.isContentEditable = true
    expect(isTypingTarget(editable, 'KeyB')).toBe(true)
    expect(isTypingTarget(null, 'KeyB')).toBe(false)
  })
})

describe('mountKeymap', () => {
  it('dispatches on a bound chord and leaves every other key to the browser', () => {
    const dispatched = []
    const stop = mountKeymap(window, { dispatch: (name, payload) => dispatched.push([name, payload]) })

    registerBinding('KeyB', 'ticket.submit', { payload: { side: 'buy' } })

    const hit = new window.KeyboardEvent('keydown', { code: 'KeyB', cancelable: true })
    window.dispatchEvent(hit)
    expect(dispatched).toEqual([['ticket.submit', { side: 'buy', chord: 'KeyB', shiftKey: false }]])
    expect(hit.defaultPrevented).toBe(true)

    // An unbound chord keeps doing whatever the browser does with it — otherwise the
    // desk breaks refresh, devtools and find-in-page.
    const miss = new window.KeyboardEvent('keydown', { code: 'KeyZ', cancelable: true })
    window.dispatchEvent(miss)
    expect(miss.defaultPrevented).toBe(false)
    expect(dispatched).toHaveLength(1)

    // Typing in a field is typing, not trading.
    const input = document.createElement('input')
    document.body.append(input)
    input.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyB', bubbles: true }))
    expect(dispatched).toHaveLength(1)

    stop()
    window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyB' }))
    expect(dispatched).toHaveLength(1)

    expect(() => mountKeymap(null)()).not.toThrow()
  })
})
