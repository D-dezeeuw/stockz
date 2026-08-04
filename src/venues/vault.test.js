// @vitest-environment jsdom
import 'fake-indexeddb/auto'
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
  KEYS_CACHE_KEY,
  cacheKeys,
  loadCachedKeys,
  forgetCachedKeys,
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

/** A localStorage stand-in that can be told to fail. */
function fakeStorage(broken = false) {
  const map = new Map()
  return {
    map,
    getItem: (key) => {
      if (broken) throw new Error('blocked')
      return map.get(key) ?? null
    },
    setItem: (key, value) => {
      if (broken) throw new Error('quota')
      map.set(key, value)
    },
    removeItem: (key) => {
      if (broken) throw new Error('blocked')
      map.delete(key)
    },
  }
}

describe('cacheKeys', () => {
  it('writes ciphertext, never the key, and loses only the convenience on failure', async () => {
    clearKeys()
    setKeys('okx', { apiKey: 'ak-plaintext-canary', secretKey: 'sk', passphrase: 'pp' })

    const storage = fakeStorage()
    expect(await cacheKeys(storage)).toBe(1)

    // The whole point: a localStorage dump yields an envelope, not a credential.
    const written = storage.map.get(KEYS_CACHE_KEY)
    expect(written).not.toContain('ak-plaintext-canary')
    expect(JSON.parse(written)).toMatchObject({ iv: expect.any(Array), data: expect.any(Array) })

    // The keys are already in the vault; this call is only about surviving a revisit.
    expect(await cacheKeys(fakeStorage(true))).toBe(0)
    expect(hasKeys('okx')).toBe(true)
  })
})

describe('loadCachedKeys', () => {
  it('round-trips through the keystore and still filters what it decrypts', async () => {
    clearKeys()
    setKeys('okx', { apiKey: 'ak', secretKey: 'sk', passphrase: 'pp' })
    const storage = fakeStorage()
    await cacheKeys(storage)

    clearKeys()
    expect(await loadCachedKeys(storage)).toBe(1)
    expect(getKey('okx', 'apiKey')).toBe('ak')
    // Decrypted contents go through `setKeys` like anything else, so an envelope written by
    // an older build cannot smuggle a field past the filter.
    expect(getKey('okx', 'bogus')).toBe('')

    // Tampered ciphertext means "ask again", never a thrown boot.
    storage.map.set(KEYS_CACHE_KEY, JSON.stringify({ iv: [1, 2, 3], data: [4, 5, 6] }))
    expect(await loadCachedKeys(storage)).toBe(0)

    storage.map.set(KEYS_CACHE_KEY, '{not json')
    expect(await loadCachedKeys(storage)).toBe(0)
    expect(await loadCachedKeys(fakeStorage(true))).toBe(0)
  })
})

describe('forgetCachedKeys', () => {
  it('destroys the wrapping key, so copies of the ciphertext become permanent noise', async () => {
    clearKeys()
    setKeys('okx', { apiKey: 'ak', secretKey: 'sk', passphrase: 'pp' })
    const storage = fakeStorage()
    await cacheKeys(storage)
    const stolenCopy = storage.map.get(KEYS_CACHE_KEY)

    expect(await forgetCachedKeys(storage)).toBe(true)
    // A lock that left an empty object would be one the next reader has to interpret.
    expect(storage.map.has(KEYS_CACHE_KEY)).toBe(false)

    // The ciphertext may already be on a backup somewhere; without the key it is noise.
    clearKeys()
    storage.map.set(KEYS_CACHE_KEY, stolenCopy)
    expect(await loadCachedKeys(storage)).toBe(0)

    expect(await forgetCachedKeys(fakeStorage(true))).toBe(false)
  })
})
