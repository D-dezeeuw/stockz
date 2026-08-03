// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  syncKeyPresence,
  needsKeys,
  submitKeys,
  lockKeys,
  adoptKeys,
  registerKeyActions,
} from './keys.js'
import { clearKeys, hasKeys, setKeys } from '../venues/vault.js'
import { appState, setValue, tick, resetState, serialize } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { clearActions, actionNames, dispatchAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'

const OKX = { apiKey: 'ak', secretKey: 'sk', passphrase: 'pp' }

beforeEach(() => {
  resetState()
  clearActions()
  clearKeys()
})

describe('syncKeyPresence', () => {
  it('puts booleans in state and never the keys themselves', () => {
    expect(syncKeyPresence()).toEqual({ okx: false, etoro: false })

    setKeys('okx', { ...OKX, apiKey: 'SECRET-VALUE' })
    expect(syncKeyPresence()).toEqual({ okx: true, etoro: false })
    tick()

    expect(appState.ui.keysPresent.okx).toBe(true)
    expect(JSON.stringify(appState) + serialize()).not.toContain('SECRET-VALUE')
  })
})

describe('needsKeys', () => {
  it('never blocks paper mode, so a new user can click a working desk first', () => {
    setValue(PATHS.trade.mode, 'paper')
    tick()
    expect(needsKeys()).toBe(false)

    setValue(PATHS.trade.mode, 'live')
    tick()
    expect(needsKeys()).toBe(true)

    setKeys('okx', OKX)
    syncKeyPresence()
    tick()
    expect(needsKeys()).toBe(false)
    expect(needsKeys({})).toBe(false)
  })
})

describe('submitKeys', () => {
  it('stores what the trader typed and says whether the set was complete', () => {
    expect(submitKeys({}, { venue: 'okx', fields: OKX })).toEqual({ okx: true, etoro: false })
    tick()
    expect(hasKeys('okx')).toBe(true)
    expect(appState.ui.toasts[0].message).toMatch(/accepted/)

    // A partial set is reported rather than silently accepted.
    clearKeys()
    submitKeys({}, { venue: 'okx', fields: { apiKey: 'ak' } })
    tick()
    expect(appState.ui.toasts[0].message).toMatch(/incomplete/)
    expect(submitKeys({}, {})).toEqual({ okx: false, etoro: false })
  })
})

describe('lockKeys', () => {
  it('forgets every credential and reopens the key prompt', () => {
    setKeys('okx', OKX)
    syncKeyPresence()
    tick()

    expect(lockKeys()).toBe(1)
    tick()

    expect(hasKeys('okx')).toBe(false)
    expect(appState.ui.keysPresent.okx).toBe(false)
    expect(appState.ui.modal).toBe('keys')
    expect(appState.ui.toasts[0].message).toMatch(/cleared/)
  })
})

describe('adoptKeys', () => {
  it('prefers the URL, falls back to dev env, and records presence', () => {
    const win = {
      location: { search: '?okxKey=ak&okxSecret=sk&okxPass=pp', pathname: '/stockz/', hash: '' },
      history: { replaceState: () => {} },
    }

    expect(adoptKeys({ win, bag: {} })).toEqual({ okx: true, etoro: false })

    clearKeys()
    expect(
      adoptKeys({
        win: { location: { search: '' } },
        bag: { STOCKZ_ETORO_API_KEY: 'ek', STOCKZ_ETORO_USER_KEY: 'uk' },
      }),
    ).toEqual({ okx: false, etoro: true })
  })
})

describe('registerKeyActions', () => {
  it('registers submit and lock so a hotkey can panic-clear credentials', () => {
    expect(registerKeyActions()).toEqual([ACTIONS.keys.submit, ACTIONS.keys.lock])
    expect(actionNames()).toContain('keys.lock')

    setKeys('okx', OKX)
    syncKeyPresence()
    tick()

    dispatchAction(ACTIONS.keys.lock)
    tick()
    expect(hasKeys('okx')).toBe(false)
  })
})
