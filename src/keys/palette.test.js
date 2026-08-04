import { describe, it, expect, beforeEach } from 'vitest'
import {
  fuzzyScore,
  actionCatalog,
  searchActions,
  moveSelection,
  registerPaletteActions,
  ACTION_LABELS,
} from './palette.js'
import { applyDefaultBindings } from './defaults.js'
import { clearBindings } from './keymap.js'
import { clearActions, dispatchAction, registerAction } from '../actions/registry.js'
import { appState, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  clearBindings()
  clearActions()
  resetState()
})

describe('fuzzyScore', () => {
  it('ranks start-of-word hits above letters that merely appear somewhere', () => {
    // "ca" should find "cancel all", not "repeat last order" — both contain c and a.
    expect(fuzzyScore('cancel all working orders', 'ca')).toBeGreaterThan(
      fuzzyScore('repeat last order', 'ca'),
    )

    // A word-start hit beats a mid-word one.
    expect(fuzzyScore('submit order', 'so')).toBeGreaterThan(fuzzyScore('reset settings', 'so'))

    // Out-of-order letters do not match at all.
    expect(fuzzyScore('submit order', 'zz')).toBe(0)
    expect(fuzzyScore('submit order', 'ts')).toBe(0)

    // An empty query matches everything, so the palette opens with a full list.
    expect(fuzzyScore('anything', '')).toBe(1)
    expect(fuzzyScore('', 'a')).toBe(0)
  })
})

describe('actionCatalog', () => {
  it('labels every action in desk language and shows the chord that does it', () => {
    applyDefaultBindings()
    const catalog = actionCatalog()

    const submit = catalog.find((row) => row.action === 'ticket.submit')
    expect(submit.label).toBe('submit order')
    // The chord teaches: a trader who reaches for the palette twice learns the key.
    expect(submit.chord).toBe('B')

    // An action with no chord still appears — the palette is how it is reachable.
    const unbound = catalog.find((row) => row.chord === '')
    expect(unbound).toBeTruthy()

    // Anything without a friendly label falls back to its action name rather than blank.
    const raw = catalog.find((row) => !ACTION_LABELS[row.action])
    expect(raw.label).toBe(raw.action)
  })
})

describe('searchActions', () => {
  it('returns the best matches, and everything when nothing is typed', () => {
    const catalog = [
      { action: 'orders.cancelAll', label: 'cancel all working orders', chord: 'F' },
      { action: 'ticket.submit', label: 'submit order', chord: 'B' },
      { action: 'ticket.arm', label: 'arm / disarm the desk', chord: 'A' },
    ]

    expect(searchActions('cancel', catalog)[0].action).toBe('orders.cancelAll')
    expect(searchActions('arm', catalog)[0].action).toBe('ticket.arm')

    // No match is an empty list, not the whole catalog.
    expect(searchActions('zzzz', catalog)).toEqual([])

    expect(searchActions('', catalog)).toHaveLength(3)
    expect(searchActions('', catalog, 2)).toHaveLength(2)
    expect(searchActions('a', null)).toEqual([])
  })
})

describe('moveSelection', () => {
  it('wraps at both ends, so holding an arrow cycles', () => {
    expect(moveSelection(0, 1, 3)).toBe(1)
    expect(moveSelection(2, 1, 3)).toBe(0)
    expect(moveSelection(0, -1, 3)).toBe(2)

    expect(moveSelection(0, 0, 0)).toBe(0)
    expect(moveSelection('x', 1, 3)).toBe(1)
  })
})

describe('registerPaletteActions', () => {
  it('opens, filters, moves and fires — then closes before the action runs', () => {
    applyDefaultBindings()
    const names = registerPaletteActions()
    expect(names).toContain('ui.palette')

    const ran = []
    registerAction('ticket.reset', () => {
      ran.push('reset')
      return true
    })

    expect(dispatchAction('ui.palette', {})).toBe(true)
    tick()
    expect(appState.ui.modal).toBe('palette')
    expect(appState.ui.paletteRows.length).toBeGreaterThan(0)

    dispatchAction('ui.paletteSearch', { query: 'reset' })
    tick()
    // Several actions reset something. They all match; ties break on the shorter label,
    // so "reset settings" leads "reset the ticket".
    expect(appState.ui.paletteRows.length).toBeGreaterThan(1)
    expect(appState.ui.paletteRows[0].action).toBe('settings.reset')
    expect(appState.ui.paletteIndex).toBe(0)

    // Arrow down to the one actually wanted.
    const wanted = appState.ui.paletteRows.findIndex((row) => row.action === 'ticket.reset')
    expect(wanted).toBeGreaterThan(0)
    for (let i = 0; i < wanted; i += 1) dispatchAction('ui.paletteMove', { delta: 1 })
    tick()
    expect(appState.ui.paletteIndex).toBe(wanted)

    expect(dispatchAction('ui.paletteRun', {})).toBe(true)
    tick()
    // Closed *before* dispatching: the action may open an overlay of its own, and a
    // palette still on screen behind it is a stuck state.
    expect(appState.ui.modal).toBe('')
    expect(ran).toEqual(['reset'])

    // Toggling closed clears the rows rather than leaving a stale list behind.
    dispatchAction('ui.palette', {})
    tick()
    dispatchAction('ui.palette', { open: false })
    tick()
    expect(appState.ui.modal).toBe('')
    expect(appState.ui.paletteRows).toEqual([])

    // Nothing selected is nothing to run.
    expect(dispatchAction('ui.paletteRun', {})).toBe(false)
  })
})
