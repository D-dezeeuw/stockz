// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  VENUE_FIELDS,
  PARAM_MAP,
  setKeys,
  getKey,
  hasKeys,
  keyPresence,
  clearKeys,
  parseKeyParams,
  scrubKeyParams,
  adoptKeysFromUrl,
  adoptKeysFromEnv,
} from './vault.js'
import { serialize, appState, resetState, tick } from '../app/engine.js'

const OKX = { apiKey: 'ak', secretKey: 'sk', passphrase: 'pp' }

beforeEach(() => {
  clearKeys()
  resetState()
})

describe('setKeys', () => {
  it('stores known fields, ignores blanks, and refuses unknown venues', () => {
    expect(setKeys('okx', OKX).sort()).toEqual(['apiKey', 'passphrase', 'secretKey'])

    // Blank or whitespace values must not overwrite a real key with nothing.
    setKeys('okx', { apiKey: '   ' })
    expect(getKey('okx', 'apiKey')).toBe('ak')

    // Values are trimmed — a key pasted with a trailing newline still signs correctly.
    setKeys('etoro', { apiKey: ' ek \n', userKey: 'uk' })
    expect(getKey('etoro', 'apiKey')).toBe('ek')

    expect(setKeys('binance', { apiKey: 'x' })).toEqual([])
    expect(VENUE_FIELDS.okx).toHaveLength(3)
  })
})

describe('getKey', () => {
  it('returns exactly one field and empty string for anything absent', () => {
    setKeys('okx', OKX)

    expect(getKey('okx', 'secretKey')).toBe('sk')
    expect(getKey('okx', 'nope')).toBe('')
    expect(getKey('etoro', 'apiKey')).toBe('')
  })
})

describe('hasKeys', () => {
  it('requires the whole credential set, not just one field', () => {
    expect(hasKeys('okx')).toBe(false)

    setKeys('okx', { apiKey: 'ak', secretKey: 'sk' })
    expect(hasKeys('okx')).toBe(false)

    setKeys('okx', { passphrase: 'pp' })
    expect(hasKeys('okx')).toBe(true)
    expect(hasKeys('binance')).toBe(false)
  })
})

describe('keyPresence', () => {
  it('reports booleans that are safe to log, render and store', () => {
    expect(keyPresence()).toEqual({ okx: false, etoro: false })

    setKeys('okx', OKX)
    expect(keyPresence()).toEqual({ okx: true, etoro: false })

    // The whole point: presence carries no key material.
    expect(JSON.stringify(keyPresence())).not.toContain('ak')
  })
})

describe('clearKeys', () => {
  it('forgets one venue or everything — the lock action', () => {
    setKeys('okx', OKX)
    setKeys('etoro', { apiKey: 'ek', userKey: 'uk' })

    expect(clearKeys('okx')).toBe(1)
    expect(hasKeys('okx')).toBe(false)
    expect(hasKeys('etoro')).toBe(true)
    expect(clearKeys('okx')).toBe(0)

    expect(clearKeys()).toBe(1)
    expect(keyPresence()).toEqual({ okx: false, etoro: false })
  })
})

describe('parseKeyParams', () => {
  it('finds credentials in a query string and ignores everything else', () => {
    const found = parseKeyParams('?okxKey=ak&okxSecret=sk&okxPass=pp&theme=day')

    expect(found).toHaveLength(3)
    expect(found[0]).toEqual({ venue: 'okx', field: 'apiKey', value: 'ak' })

    expect(parseKeyParams('?etoroKey=ek&etoroUser=uk')).toHaveLength(2)
    expect(parseKeyParams('?okxKey=')).toEqual([])
    expect(parseKeyParams('')).toEqual([])
    expect(Object.keys(PARAM_MAP)).toHaveLength(5)
  })
})

describe('scrubKeyParams', () => {
  it('removes only the credentials, keeping the rest of the URL usable', () => {
    expect(scrubKeyParams('/stockz/?okxKey=ak&theme=day&okxSecret=sk')).toBe(
      '/stockz/?theme=day',
    )
    expect(scrubKeyParams('/stockz/?okxKey=ak')).toBe('/stockz/')
    expect(scrubKeyParams('/stockz/?theme=day#book')).toBe('/stockz/?theme=day#book')
    expect(scrubKeyParams('')).toBe('')
  })
})

describe('adoptKeysFromUrl', () => {
  it('loads keys then rewrites the address bar so they cannot linger', () => {
    const replaced = []
    const win = {
      location: { search: '?okxKey=ak&okxSecret=sk&okxPass=pp&theme=day', pathname: '/stockz/', hash: '' },
      history: { replaceState: (_s, _t, url) => replaced.push(url) },
    }

    expect(adoptKeysFromUrl(win)).toEqual({ loaded: 3, scrubbed: true })
    expect(hasKeys('okx')).toBe(true)

    // A key left in the URL reaches browser history, screen shares and Referer headers.
    expect(replaced[0]).toBe('/stockz/?theme=day')
    expect(replaced[0]).not.toContain('ak')

    expect(adoptKeysFromUrl({ location: { search: '' } })).toEqual({
      loaded: 0,
      scrubbed: false,
    })
    expect(adoptKeysFromUrl({})).toEqual({ loaded: 0, scrubbed: false })
  })
})

describe('adoptKeysFromEnv', () => {
  it('falls back to local dev credentials without touching the URL', () => {
    expect(
      adoptKeysFromEnv({
        STOCKZ_OKX_API_KEY: 'ak',
        STOCKZ_OKX_SECRET_KEY: 'sk',
        STOCKZ_OKX_PASSPHRASE: 'pp',
      }),
    ).toEqual({ okx: true, etoro: false })

    expect(adoptKeysFromEnv({})).toEqual({ okx: true, etoro: false })
  })
})

describe('vault isolation', () => {
  it('keeps credentials out of state, history and serialize output', () => {
    setKeys('okx', { apiKey: 'SUPER-SECRET-KEY', secretKey: 'sk', passphrase: 'pp' })
    tick()

    // State is recorded into history, returned by serialize() and exported with the
    // journal. A key that reaches it ends up in a file the trader emails to someone.
    const dump = JSON.stringify(appState) + serialize()
    expect(dump).not.toContain('SUPER-SECRET-KEY')
  })
})
