// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  syncKeyPresence,
  needsKeys,
  submitKeys,
  lockKeys,
  adoptKeys,
  registerKeyActions,
  readFields,
  clearVenueForm,
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
  it('stores what a real form submit delivers, which is flat and not nested', () => {
    // The shape the DOM actually sends. The previous test hand-built `{fields: OKX}` — the
    // shape the code happened to expect — so it passed while the modal saved nothing.
    expect(submitKeys({}, { venue: 'okx', ...OKX })).toEqual({ okx: true, etoro: false })
    tick()
    expect(hasKeys('okx')).toBe(true)
    expect(appState.ui.toasts[0].message).toMatch(/accepted/)

    // A partial set is reported rather than silently accepted.
    clearKeys()
    submitKeys({}, { venue: 'okx', apiKey: 'ak' })
    tick()
    expect(appState.ui.toasts[0].message).toMatch(/incomplete/)
    expect(submitKeys({}, {})).toEqual({ okx: false, etoro: false })
  })
})

describe('readFields', () => {
  it('takes the flat form shape and the nested one, and nothing else', () => {
    expect(readFields('okx', { venue: 'okx', ...OKX })).toEqual(OKX)
    expect(readFields('okx', { fields: OKX })).toEqual(OKX)

    // Only the fields that venue declares: a stray input, or a `venue` key riding along on
    // the same payload, must not be mistaken for a credential.
    expect(readFields('etoro', { apiKey: 'ak', userKey: 'uk', bogus: 'x' })).toEqual({
      apiKey: 'ak',
      userKey: 'uk',
    })
    expect(readFields('okx', { apiKey: '   ' })).toEqual({})
    expect(readFields('nonsense', OKX)).toEqual({})
  })
})

describe('clearVenueForm', () => {
  it('empties the inputs, so the secret does not sit in the DOM all session', () => {
    document.body.innerHTML =
      '<form data-venue="okx"><input name="apiKey" value="ak"></form>'

    expect(clearVenueForm('okx')).toBe(true)
    expect(document.querySelector('input').value).toBe('')

    expect(clearVenueForm('etoro')).toBe(false)
    expect(clearVenueForm('okx', null)).toBe(false)
    document.body.innerHTML = ''
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
    // OKX fields each time is how people end up pasting keys into the URL bar instead —
    // which puts them in browser history and Referer headers, a strictly worse place than
    // localStorage. The stored copy is plaintext, so the label says so and the real
    // mitigation is a trade-only venue key with an IP allowlist.
    expect(defaultSettings().rememberCredentials).toBe(true)

    // Absent from state entirely is still false rather than a crash.
    expect(rememberEnabled({})).toBe(false)

    setValue(PATHS.settings.rememberCredentials, true)
    tick()
    expect(rememberEnabled()).toBe(true)
  })
})

describe('toggleRemember', () => {
  it('flips the setting and acts on it in both directions', () => {
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
  it('stores the keys when switched on and removes them when switched off', () => {
    setKeys('okx', OKX)

    // Switching it on with keys already loaded remembers *those* keys, rather than waiting
    // for the next submit to write anything.
    expect(applyRemember(true)).toBe(true)
    expect(JSON.parse(localStorage.getItem(KEYS_CACHE_KEY))).toEqual({ okx: OKX })

    expect(applyRemember(false)).toBe(true)
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
