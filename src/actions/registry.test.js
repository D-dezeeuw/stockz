// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerAction,
  dispatchAction,
  actionNames,
  clearActions,
  domPayload,
  setStatus,
  resetApp,
  registerCoreActions,
} from './registry.js'
import { appState, resetState, tick, setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

beforeEach(() => {
  clearActions()
  resetState()
})

describe('registerAction', () => {
  it('registers under a namespaced name and refuses duplicates or malformed input', () => {
    expect(registerAction('trade.submit', () => 'ok')).toBe('trade.submit')
    expect(actionNames()).toEqual(['trade.submit'])

    // A silent overwrite would mean the wrong order gets sent.
    expect(() => registerAction('trade.submit', () => 'other')).toThrow(/already registered/)

    expect(() => registerAction('submit', () => {})).toThrow(/<namespace>\.<verb>/)
    expect(() => registerAction('Trade.Submit', () => {})).toThrow(/<namespace>\.<verb>/)
    expect(() => registerAction(undefined, () => {})).toThrow(/<namespace>\.<verb>/)
    expect(() => registerAction('trade.cancel', 'not a function')).toThrow(/needs a function/)
  })
})

describe('dispatchAction', () => {
  it('invokes the action with state and payload, and survives unknown names', () => {
    const seen = []
    registerAction('ui.probe', (state, payload) => {
      seen.push([state, payload])
      return payload.value * 2
    })

    expect(dispatchAction('ui.probe', { value: 21 })).toBe(42)
    expect(seen[0][0]).toBe(appState)
    expect(seen[0][1]).toEqual({ value: 21 })

    // Payload is optional.
    registerAction('ui.bare', (_s, payload) => payload)
    expect(dispatchAction('ui.bare')).toEqual({})

    // A stale keybinding must not take the desk down mid-session.
    expect(dispatchAction('ui.nope')).toBeNull()
  })
})

describe('actionNames', () => {
  it('lists registrations in order as a detached copy', () => {
    registerAction('ui.a', () => {})
    registerAction('ui.b', () => {})

    const names = actionNames()
    expect(names).toEqual(['ui.a', 'ui.b'])

    names.push('ui.injected')
    expect(actionNames()).toEqual(['ui.a', 'ui.b'])
  })
})

describe('clearActions', () => {
  it('forgets registrations so a name can be reused', () => {
    registerAction('ui.a', () => {})
    clearActions()

    expect(actionNames()).toEqual([])
    expect(dispatchAction('ui.a')).toBeNull()
    expect(() => registerAction('ui.a', () => {})).not.toThrow()
  })
})

describe('setStatus', () => {
  it('writes the status line and falls back to ready for blank input', () => {
    setStatus({}, { status: 'armed' })
    tick()
    expect(appState.ui.status).toBe('armed')

    expect(setStatus({}, { status: '  flat  ' })).toBe('flat')
    tick()
    expect(appState.ui.status).toBe('flat')

    expect(setStatus({}, {})).toBe('ready')
    expect(setStatus({}, { status: '   ' })).toBe('ready')
    expect(setStatus({})).toBe('ready')
  })
})

describe('domPayload', () => {
  it('turns what the engine hands a DOM handler into the payload actions expect', () => {
    const btn = document.createElement('button')
    btn.dataset.action = 'click'
    btn.dataset.fn = 'ui.toggleOverlay'
    btn.dataset.modal = 'keys'

    const payload = domPayload(btn, appState, {}, undefined, undefined)
    // data-* are the parameters; the engine's own attributes are plumbing.
    expect(payload.modal).toBe('keys')
    expect(payload.action).toBeUndefined()
    expect(payload.fn).toBeUndefined()
    expect(payload.el).toBe(btn)

    // A form submit carries its named fields - this is what the key modal sends.
    const form = document.createElement('form')
    form.innerHTML =
      '<input name="apiKey" value="ak"><input name="remember" type="checkbox" checked>'
    const submitted = domPayload(form, appState, {}, undefined, { target: form })
    expect(submitted.apiKey).toBe('ak')
    expect(submitted.remember).toBe(true)
    expect(submitted.event.target).toBe(form)

    // A single bound control carries its own value; an explicit data-value wins.
    const input = document.createElement('input')
    input.value = 'BTC-USDT'
    expect(domPayload(input, appState, {}, undefined, undefined).value).toBe('BTC-USDT')
    expect(domPayload(input, appState, {}, 7, undefined).value).toBe(7)

    const box = document.createElement('input')
    box.type = 'checkbox'
    expect(domPayload(box, appState, {}, undefined, undefined).value).toBe(false)

    // Not a DOM call at all: dispatchAction and the bot runner pass payloads straight
    // through and must keep working unchanged.
    const direct = { section: 'trade' }
    expect(domPayload(direct)).toBe(direct)
    expect(domPayload(null)).toEqual({})
    expect(domPayload(undefined)).toEqual({})
  })
})

describe('resetApp', () => {
  it('rewrites every path back to boot state while keeping build identity', () => {
    setValue(PATHS.app.version, '9.9.9')
    setValue(PATHS.trade.armed, true)
    setValue(PATHS.ui.status, 'panicking')
    tick()

    const count = resetApp({}, { now: 42 })
    tick()

    expect(count).toBeGreaterThan(15)
    expect(appState.trade.armed).toBe(false)
    expect(appState.ui.status).toBe('ready')
    expect(appState.app.bootedAt).toBe(42)
    // Identity of the running build survives a reset.
    expect(appState.app.version).toBe('9.9.9')
  })
})

describe('registerCoreActions', () => {
  it('registers the boot actions once and is safe to call again', () => {
    expect(registerCoreActions()).toEqual(['ui.setStatus', 'app.reset'])
    expect(registerCoreActions()).toEqual([])
    expect(actionNames()).toEqual(['ui.setStatus', 'app.reset'])

    dispatchAction('ui.setStatus', { status: 'live' })
    tick()
    expect(appState.ui.status).toBe('live')
  })
})
