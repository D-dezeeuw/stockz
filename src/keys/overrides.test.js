import { describe, it, expect, beforeEach } from 'vitest'
import {
  mergeBindings,
  validateChord,
  findConflicts,
  migrateBindings,
  effectiveBindings,
  clearedMap,
  registerBindingActions,
  RESERVED_CHORDS,
  BINDINGS_VERSION,
} from './overrides.js'
import { DEFAULT_BINDINGS } from './defaults.js'
import { resolveKey, clearBindings } from './keymap.js'
import { clearActions, dispatchAction } from '../actions/registry.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  clearBindings()
  clearActions()
  resetState()
})

describe('mergeBindings', () => {
  it('layers a trader\'s chords over the stock ones, including unbinding', () => {
    const defaults = [
      { chord: 'KeyB', action: 'ticket.submit', label: 'buy' },
      { chord: 'KeyS', action: 'ticket.submit', label: 'sell' },
    ]

    const merged = mergeBindings(defaults, { KeyB: 'ticket.reset' })
    expect(merged.find((b) => b.chord === 'KeyB').action).toBe('ticket.reset')
    expect(merged.find((b) => b.chord === 'KeyS').label).toBe('sell')

    // An explicit null is how a key is switched off; a missing entry leaves the default
    // alone. Without the distinction there is no way to say "this key does nothing".
    expect(mergeBindings(defaults, { KeyB: null }).map((b) => b.chord)).toEqual(['KeyS'])
    expect(mergeBindings(defaults, {})).toHaveLength(2)

    // A new chord is added rather than rejected.
    expect(mergeBindings(defaults, { KeyQ: 'ticket.arm' })).toHaveLength(3)
    expect(mergeBindings(null, null)).toEqual([])
  })
})

describe('validateChord', () => {
  it('refuses reserved chords and actions that do not exist', () => {
    expect(validateChord('KeyQ', 'ticket.submit')).toEqual({ ok: true, reason: '' })

    // A trader who bound away their panic key finds out at exactly the wrong moment.
    expect(validateChord('Escape', 'ticket.submit').reason).toBe('reserved chord')
    expect(validateChord('shift+Slash', 'ticket.arm').reason).toBe('reserved chord')
    expect(RESERVED_CHORDS).toContain('Escape')

    // A key that silently does nothing is worse than no key at all.
    expect(validateChord('KeyQ', 'ticket.teleport').reason).toBe('unknown action')

    // Unbinding needs no action to validate.
    expect(validateChord('KeyQ', null).ok).toBe(true)
    expect(validateChord('', 'ticket.submit').reason).toBe('no chord')
  })
})

describe('findConflicts', () => {
  it('reports what a candidate chord would take over', () => {
    const bindings = [
      { chord: 'KeyB', action: 'ticket.submit' },
      { chord: 'KeyS', action: 'ticket.submit' },
    ]

    expect(findConflicts('KeyB', bindings)).toEqual([{ chord: 'KeyB', action: 'ticket.submit' }])
    expect(findConflicts('KeyQ', bindings)).toEqual([])
    expect(findConflicts('', bindings)).toEqual([])
    expect(findConflicts('KeyB', null)).toEqual([])
  })
})

describe('migrateBindings', () => {
  it('reads an old saved layout rather than silently losing it', () => {
    // The v0 shape was a bare chord->action map; discarding it on an update would lose a
    // trader's whole layout without telling them.
    expect(migrateBindings({ KeyB: 'ticket.reset' })).toEqual({
      version: BINDINGS_VERSION,
      chords: { KeyB: 'ticket.reset' },
    })

    expect(migrateBindings({ version: 1, chords: { KeyQ: 'ticket.arm' } })).toEqual({
      version: 1,
      chords: { KeyQ: 'ticket.arm' },
    })

    expect(migrateBindings(null)).toEqual({ version: BINDINGS_VERSION, chords: {} })
    expect(migrateBindings({ version: 'x' }).version).toBe(BINDINGS_VERSION)
  })
})

describe('effectiveBindings', () => {
  it('is what the desk is actually bound to right now', () => {
    expect(effectiveBindings()).toHaveLength(DEFAULT_BINDINGS.length)

    setValue('settings.chords', { KeyB: 'ticket.reset' })
    tick()
    expect(effectiveBindings().find((b) => b.chord === 'KeyB').action).toBe('ticket.reset')

    setValue('settings.chords', { KeyB: null })
    tick()
    expect(effectiveBindings().some((b) => b.chord === 'KeyB')).toBe(false)
  })
})

describe('clearedMap', () => {
  it('erases every key, since the engine merges object writes instead of replacing', () => {
    // `setValue(path, {})` is a no-op on this engine — objects merge, and only
    // `undefined` removes a key. Reset has to be spelled out.
    expect(clearedMap({ KeyB: 'x', KeyQ: null })).toEqual({ KeyB: undefined, KeyQ: undefined })
    // The keys stay present with no value — the engine cannot delete one — so every
    // reader treats an undefined entry as "no override".
    expect(Object.keys(clearedMap({ a: 1 }))).toEqual(['a'])

    expect(clearedMap({})).toEqual({})
    expect(clearedMap(null)).toEqual({})
  })
})

describe('registerBindingActions', () => {
  it('rebinds live, and refuses to take away the way out', () => {
    const names = registerBindingActions()
    expect(names).toEqual(['keys.rebind', 'keys.resetBindings'])

    expect(dispatchAction('keys.rebind', { chord: 'KeyQ', action: 'ticket.arm' })).toBe(true)
    tick()
    // Live, not on next reload — otherwise the rebind is discovered by pressing the old
    // key and getting the old action.
    expect(resolveKey('KeyQ').action).toBe('ticket.arm')
    expect(appState.settings.chords).toEqual({ KeyQ: 'ticket.arm' })

    expect(dispatchAction('keys.rebind', { chord: 'Escape', action: 'ticket.arm' })).toBe(false)
    tick()
    expect(appState.ui.statusLine).toContain('reserved chord')

    expect(dispatchAction('keys.rebind', { chord: 'KeyQ', action: 'nope.nope' })).toBe(false)

    // Unbinding removes the chord entirely.
    dispatchAction('keys.rebind', { chord: 'KeyB', action: null })
    tick()
    expect(resolveKey('KeyB')).toBeNull()

    // Reset returns to stock, keys and storage together.
    expect(dispatchAction('keys.resetBindings', {})).toBe(true)
    tick()
    // Every override is cleared of its value, and the stock layout is live again.
    expect(Object.values(appState.settings.chords).every((v) => v === undefined)).toBe(true)
    expect(effectiveBindings()).toHaveLength(DEFAULT_BINDINGS.length)
    expect(resolveKey('KeyB').action).toBe('ticket.submit')
    expect(resolveKey('KeyQ')).toBeNull()
  })
})
