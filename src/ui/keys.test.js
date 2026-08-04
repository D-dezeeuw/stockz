// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  syncKeyPresence,
  needsKeys,
  submitKeys,
  lockKeys,
  adoptKeys,
  registerKeyActions,
  rememberEnabled,
  toggleRemember,
  applyRemember,
  promptForKeys,
} from './keys.js'
import { clearKeys, hasKeys, setKeys, KEYS_CACHE_KEY } from '../venues/vault.js'
import { defaultSettings } from '../state/settings-schema.js'
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
  it('prefers the URL, falls back to dev env, and records presence', async () => {
    const win = {
      location: { search: '?okxKey=ak&okxSecret=sk&okxPass=pp', pathname: '/stockz/', hash: '' },
      history: { replaceState: () => {} },
    }

    expect(await adoptKeys({ win, bag: {} })).toEqual({ okx: true, etoro: false })

    clearKeys()
    expect(
      await adoptKeys({
        win: { location: { search: '' } },
        bag: { STOCKZ_ETORO_API_KEY: 'ek', STOCKZ_ETORO_USER_KEY: 'uk' },
      }),
    ).toEqual({ okx: false, etoro: true })
  })
})

describe('registerKeyActions', () => {
  it('registers submit and lock so a hotkey can panic-clear credentials', () => {
    expect(registerKeyActions()).toEqual([
      ACTIONS.keys.submit,
      ACTIONS.keys.lock,
      ACTIONS.keys.remember,
    ])
    expect(actionNames()).toContain('keys.lock')

    setKeys('okx', OKX)
    syncKeyPresence()
    tick()

    dispatchAction(ACTIONS.keys.lock)
    tick()
    expect(hasKeys('okx')).toBe(false)
  })
})

describe('rememberEnabled', () => {
  it('reads the setting, and ships on so a revisit does not re-ask', () => {
    // On by default: the desk is opened repeatedly through the day and re-entering three
    // OKX fields each time is how people end up pasting keys into the URL bar instead.
    // Safe to default only because the stored copy is encrypted — see keystore.js.
    expect(defaultSettings().rememberCredentials).toBe(true)

    // Absent from state entirely is still false rather than a crash.
    expect(rememberEnabled({})).toBe(false)

    setValue(PATHS.settings.rememberCredentials, true)
    tick()
    expect(rememberEnabled()).toBe(true)
  })
})

describe('toggleRemember', () => {
  it('flips the setting synchronously, because a checkbox must not await crypto', () => {
    expect(toggleRemember({}, { value: true })).toBe(true)
    tick()
    expect(rememberEnabled()).toBe(true)

    // No argument toggles rather than forcing a value.
    expect(toggleRemember({})).toBe(false)
    tick()
    expect(rememberEnabled()).toBe(false)
  })
})

describe('applyRemember', () => {
  it('writes ciphertext when switched on and removes it when switched off', async () => {
    setKeys('okx', OKX)

    expect(await applyRemember(true)).toBe(true)
    // Remembering *those* keys, and as an envelope: the stored blob must not contain them.
    const stored = localStorage.getItem(KEYS_CACHE_KEY)
    expect(stored).toBeTruthy()
    expect(stored).not.toContain('ak')

    expect(await applyRemember(false)).toBe(true)
    // Switching it off takes the copy with it rather than leaving one behind until a lock.
    expect(localStorage.getItem(KEYS_CACHE_KEY)).toBeNull()
  })
})

describe('promptForKeys', () => {
  it('asks on boot in live mode, and never interrupts paper', () => {
    // Paper mode must stay clickable for somebody who has not handed over credentials.
    setValue(PATHS.trade.mode, 'paper')
    tick()
    expect(promptForKeys()).toBe(false)

    setValue(PATHS.trade.mode, 'live')
    tick()
    expect(promptForKeys()).toBe(true)
    tick()
    expect(appState.ui.modal).toBe('keys')
  })
})
