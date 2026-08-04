// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  pushScope,
  popScope,
  activeScope,
  scopeChain,
  resetScopes,
  trackBlockFocus,
  SCOPE_ORDER,
} from './scopes.js'
import { registerBinding, resolveKey, clearBindings } from './keymap.js'
import { appState, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetScopes()
  clearBindings()
  resetState()
})

describe('pushScope', () => {
  it('pushes a scope once, however many times focus fires', () => {
    pushScope('block', 'book')
    tick()
    expect(activeScope()).toEqual({ kind: 'block', id: 'book' })
    expect(appState.ui.scope).toBe('block')

    // focusin fires again on every click inside an already-focused block; a duplicate
    // scope would then need two pops to leave.
    pushScope('block', 'book')
    expect(activeScope()).toEqual({ kind: 'block', id: 'book' })

    pushScope('block', 'tape')
    expect(activeScope()).toEqual({ kind: 'block', id: 'tape' })

    // 'global' is the floor, not something that can be pushed onto the stack.
    pushScope('global', '')
    expect(activeScope().kind).toBe('block')
    pushScope('nonsense', 'x')
    expect(activeScope().kind).toBe('block')
    expect(SCOPE_ORDER).toEqual(['modal', 'block', 'global'])
  })
})

describe('popScope', () => {
  it('removes exactly the scope named, leaving the rest of the stack', () => {
    pushScope('block', 'book')
    pushScope('modal', 'palette')
    expect(activeScope().kind).toBe('modal')

    popScope('modal', 'palette')
    tick()
    // Back to the block underneath, not all the way to global.
    expect(activeScope()).toEqual({ kind: 'block', id: 'book' })
    expect(appState.ui.scope).toBe('block')

    popScope('block', 'book')
    expect(activeScope()).toEqual({ kind: 'global', id: '' })

    // Popping something that was never pushed is harmless.
    expect(() => popScope('block', 'ghost')).not.toThrow()
  })
})

describe('activeScope', () => {
  it('gives a modal the keyboard whatever else has focus underneath it', () => {
    expect(activeScope()).toEqual({ kind: 'global', id: '' })

    pushScope('modal', 'palette')
    pushScope('block', 'book')
    // The block was pushed later, but a modal is by definition what the trader is doing.
    expect(activeScope()).toEqual({ kind: 'modal', id: 'palette' })

    popScope('modal', 'palette')
    expect(activeScope().kind).toBe('block')
  })
})

describe('scopeChain', () => {
  it('resolves nearest-first, and a modal does not fall through to the desk', () => {
    expect(scopeChain()).toEqual(['global'])

    pushScope('block', 'book')
    expect(scopeChain()).toEqual(['block:book', 'global'])

    // This is what makes typing in the palette safe: B is a letter, not a buy.
    pushScope('modal', 'palette')
    expect(scopeChain()).toEqual(['modal:palette'])
  })
})

describe('resetScopes', () => {
  it('drops every scope, which is what closing the last overlay means', () => {
    pushScope('block', 'book')
    pushScope('modal', 'palette')

    expect(resetScopes()).toBe(true)
    tick()
    expect(activeScope()).toEqual({ kind: 'global', id: '' })
    expect(appState.ui.scope).toBe('global')
  })
})

describe('scoped resolveKey', () => {
  it('lets one chord mean different things in different places', () => {
    registerBinding('KeyB', 'ticket.submit')
    registerBinding('PageDown', 'book.setGroup', { scope: 'block:book' })

    // Global chord, global scope.
    expect(resolveKey('KeyB').action).toBe('ticket.submit')
    expect(resolveKey('PageDown')).toBeNull()

    // Inside the book block, the scoped chord resolves and the global one still works.
    pushScope('block', 'book')
    expect(resolveKey('PageDown').action).toBe('book.setGroup')
    expect(resolveKey('KeyB').action).toBe('ticket.submit')

    // Inside a modal, nothing falls through — B is a letter being typed.
    pushScope('modal', 'palette')
    expect(resolveKey('KeyB')).toBeNull()
    expect(resolveKey('PageDown')).toBeNull()

    registerBinding('Enter', 'ui.paletteRun', { scope: 'modal:palette' })
    expect(resolveKey('Enter').action).toBe('ui.paletteRun')
  })
})

describe('trackBlockFocus', () => {
  it('follows focus into a block and only leaves when focus really does', () => {
    document.body.innerHTML = `
      <section data-block-id="book"><input id="a"><input id="b"></section>
      <section data-block-id="tape"><input id="c"></section>`

    const stop = trackBlockFocus(document)
    const a = document.querySelector('#a')
    const b = document.querySelector('#b')
    const c = document.querySelector('#c')

    a.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }))
    expect(activeScope()).toEqual({ kind: 'block', id: 'book' })

    // Moving between two inputs inside one block must not drop the scope mid-edit.
    a.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: b }))
    expect(activeScope().id).toBe('book')

    // Leaving for another block does.
    b.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: c }))
    expect(activeScope().kind).toBe('global')

    stop()
    a.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }))
    expect(activeScope().kind).toBe('global')

    expect(() => trackBlockFocus(null)()).not.toThrow()
  })
})
