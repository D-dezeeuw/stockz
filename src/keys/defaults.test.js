import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_BINDINGS,
  applyDefaultBindings,
  groupBindings,
  chordLabel,
  hotkeyRows,
} from './defaults.js'
import { allBindings, resolveKey, clearBindings } from './keymap.js'
import { allActionNames } from '../actions/names.js'
import { appState, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  clearBindings()
  resetState()
})

describe('applyDefaultBindings', () => {
  it('binds the stock layout, and lets a trader override any of it', () => {
    const chords = applyDefaultBindings()

    expect(chords).toContain('KeyB')
    expect(resolveKey('KeyB')).toMatchObject({
      action: 'ticket.submit',
      payload: { side: 'buy' },
    })
    expect(resolveKey('KeyS').payload).toEqual({ side: 'sell' })
    // Escape and F both flatten: the panic key must be the one already under the finger.
    expect(resolveKey('Escape').action).toBe('orders.cancelAll')
    expect(resolveKey('shift+ArrowUp').payload).toEqual({ ticks: 10 })

    // An override wins over the stock binding for the same chord.
    applyDefaultBindings({ KeyB: 'ticket.reset' })
    expect(resolveKey('KeyB').action).toBe('ticket.reset')

    // An empty override is not a binding — it leaves the stock one in place.
    applyDefaultBindings({ KeyB: '' })
    expect(resolveKey('KeyB').action).toBe('ticket.submit')

    // Applying twice does not duplicate.
    const count = allBindings().length
    applyDefaultBindings()
    expect(allBindings()).toHaveLength(count)

    // The sheet is published from the *live* bindings: one that listed the defaults
    // after a trader rebound them would be worse than none.
    applyDefaultBindings({ KeyB: 'ticket.reset' })
    tick()
    expect(appState.ui.chordSheet.find((row) => row.key === 'B').action).toBe('ticket.reset')
  })
})

describe('DEFAULT_BINDINGS', () => {
  it('binds only actions the desk actually registers', () => {
    const known = new Set(allActionNames())

    for (const binding of DEFAULT_BINDINGS) {
      // A chord bound to an action nobody registered is a key that silently does
      // nothing — the worst possible outcome on a trading keyboard.
      expect(known.has(binding.action), `${binding.chord} -> ${binding.action}`).toBe(true)
      expect(binding.label.length).toBeGreaterThan(0)
    }

    // No chord is bound twice, which would make the layout order-dependent.
    const chords = DEFAULT_BINDINGS.map((b) => b.chord)
    expect(new Set(chords).size).toBe(chords.length)
  })
})

describe('groupBindings', () => {
  it('groups by action namespace, matching how the desk is already organised', () => {
    const grouped = groupBindings([
      { chord: 'KeyB', action: 'ticket.submit' },
      { chord: 'KeyF', action: 'orders.cancelAll' },
      { chord: 'Digit1', action: 'ticket.setSize' },
      { chord: 'KeyZ' },
    ])

    expect(grouped.map((g) => g.group)).toEqual(['ticket', 'orders', 'other'])
    expect(grouped[0].rows).toHaveLength(2)
    expect(groupBindings(null)).toEqual([])
  })
})

describe('chordLabel', () => {
  it('prints a chord the way a trader reads it off a cheat sheet', () => {
    expect(chordLabel('KeyB')).toBe('B')
    expect(chordLabel('Digit1')).toBe('1')
    expect(chordLabel('ctrl+shift+KeyK')).toBe('Ctrl+Shift+K')

    // Arrows and Escape get their glyphs rather than their code names.
    expect(chordLabel('ArrowUp')).toBe('↑')
    expect(chordLabel('shift+ArrowDown')).toBe('Shift+↓')
    expect(chordLabel('Escape')).toBe('Esc')

    expect(chordLabel('')).toBe('')
  })
})

describe('hotkeyRows', () => {
  it('renders the sheet with chords a trader can read, skipping disabled keys', () => {
    applyDefaultBindings()
    const rows = hotkeyRows(allBindings())

    expect(rows[0]).toEqual({ key: 'B', label: 'buy', action: 'ticket.submit' })
    expect(rows.some((row) => row.key === '↑')).toBe(true)
    expect(rows).toHaveLength(DEFAULT_BINDINGS.length)

    // A disabled binding is not on the sheet — a key that does nothing must not be
    // advertised as one that does.
    expect(hotkeyRows([{ chord: 'KeyZ', label: 'off', enabled: false }])).toEqual([])
    expect(hotkeyRows(null)).toEqual([])
  })
})
