import { describe, it, expect, beforeEach } from 'vitest'
import { acceptChord, capturePreview, registerCaptureActions } from './capture.js'
import { applyDefaultBindings } from './defaults.js'
import { registerBindingActions } from './overrides.js'
import { resolveKey, clearBindings } from './keymap.js'
import { clearActions, dispatchAction } from '../actions/registry.js'
import { appState, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  clearBindings()
  clearActions()
  resetState()
})

describe('acceptChord', () => {
  it('waits for a real key and refuses the ones that must stay put', () => {
    expect(acceptChord('KeyQ', 'ticket.arm')).toEqual({ ok: true, reason: '' })

    // An empty chord is what normalizeChord returns while a modifier is still being
    // held — recording is not finished, so there is nothing to accept yet.
    expect(acceptChord('', 'ticket.arm')).toEqual({ ok: false, reason: 'keep holding' })

    expect(acceptChord('Escape', 'ticket.arm').reason).toBe('reserved chord')
    expect(acceptChord('KeyQ', 'not.anaction').reason).toBe('unknown action')
  })
})

describe('capturePreview', () => {
  it('shows the chord as it is pressed, with any clash named before saving', () => {
    const free = capturePreview({ code: 'KeyQ', ctrlKey: true }, 'ticket.arm')
    expect(free).toMatchObject({ chord: 'ctrl+KeyQ', label: 'Ctrl+Q', ok: true, conflicts: [] })

    // Taking a key from another action is allowed — it just should not be a surprise.
    const taken = capturePreview({ code: 'KeyB' }, 'ticket.arm')
    expect(taken.ok).toBe(true)
    expect(taken.conflicts).toContain('ticket.submit')

    // Rebinding an action to the chord it already has reports no conflict with itself.
    expect(capturePreview({ code: 'KeyB' }, 'ticket.submit').conflicts).toEqual([])

    // Mid-press: a bare modifier previews as an ellipsis rather than as a bad chord.
    expect(capturePreview({ code: 'ShiftLeft', shiftKey: true }, 'ticket.arm')).toMatchObject({
      chord: '',
      label: '…',
      ok: false,
    })

    expect(capturePreview({ code: 'Escape' }, 'ticket.arm').reason).toBe('reserved chord')
  })
})

describe('registerCaptureActions', () => {
  it('records, previews, and commits only when the trader confirms', () => {
    applyDefaultBindings()
    registerBindingActions()
    const names = registerCaptureActions()
    expect(names).toContain('keys.capture')

    expect(dispatchAction('keys.capture', { action: 'ticket.arm' })).toBe(true)
    tick()
    expect(appState.ui.captureFor).toBe('ticket.arm')

    // A press previews but commits nothing: a chord that saved on the first press could
    // never be corrected, and every rebind would be final.
    expect(dispatchAction('keys.captureKey', { code: 'KeyQ' })).toBe(true)
    tick()
    expect(appState.ui.capturePreview).toMatchObject({ chord: 'KeyQ', label: 'Q', ok: true })
    expect(resolveKey('KeyQ')).toBeNull()

    // Enter commits.
    expect(dispatchAction('keys.captureSave', {})).toBe(true)
    tick()
    expect(resolveKey('KeyQ').action).toBe('ticket.arm')
    expect(appState.ui.captureFor).toBe('')
    expect(appState.ui.capturePreview).toBeNull()

    // Nothing recording means nothing to capture or save.
    expect(dispatchAction('keys.captureKey', { code: 'KeyZ' })).toBe(false)
    expect(dispatchAction('keys.captureSave', {})).toBe(false)

    // A refused chord previews its reason and cannot be saved. The tick between the two
    // dispatches is not ceremony: `captureFor` is written by the first and read by the
    // second, and state lands on the next frame. In use these are separate frames — one
    // is a click, the other a keypress.
    dispatchAction('keys.capture', { action: 'ticket.arm' })
    tick()
    dispatchAction('keys.captureKey', { code: 'Escape' })
    tick()
    expect(appState.ui.capturePreview.reason).toBe('reserved chord')
    expect(dispatchAction('keys.captureSave', {})).toBe(false)

    // Cancelling clears the field without touching the bindings.
    expect(dispatchAction('keys.capture', { action: 'ticket.arm', recording: false })).toBe(false)
    tick()
    expect(appState.ui.captureFor).toBe('')
  })
})
