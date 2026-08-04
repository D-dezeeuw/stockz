import { describe, it, expect } from 'vitest'
import { envBag, readEnv, hasEnv, venueKeyPresence, keyPresenceBanner } from './env.js'

describe('envBag', () => {
  it('returns the ambient Vite env object', () => {
    const bag = envBag()
    expect(bag).toBeTypeOf('object')
    expect(bag).not.toBeNull()
    // Vite always injects MODE; this proves we read the real bag, not a stub.
    expect(typeof bag.MODE).toBe('string')
  })
})

describe('readEnv', () => {
  it('returns string values, and empty string for missing or non-string ones', () => {
    const bag = { STOCKZ_OKX_API_KEY: 'key-1', STOCKZ_FLAG: true, STOCKZ_EMPTY: '' }

    expect(readEnv('STOCKZ_OKX_API_KEY', bag)).toBe('key-1')
    expect(readEnv('STOCKZ_EMPTY', bag)).toBe('')
    expect(readEnv('STOCKZ_ABSENT', bag)).toBe('')
    expect(readEnv('STOCKZ_FLAG', bag)).toBe('')
    // Default bag: reading an unset name off the real env is still safe.
    expect(readEnv('STOCKZ_DEFINITELY_UNSET')).toBe('')
  })
})

describe('hasEnv', () => {
  it('reports presence for non-empty values and false for blank or missing ones', () => {
    const bag = { A: 'k', BLANK: '   ', EMPTY: '' }

    expect(hasEnv('A', bag)).toBe(true)
    expect(hasEnv('BLANK', bag)).toBe(false)
    expect(hasEnv('EMPTY', bag)).toBe(false)
    expect(hasEnv('MISSING', bag)).toBe(false)
    expect(hasEnv('STOCKZ_DEFINITELY_UNSET')).toBe(false)
  })
})

describe('venueKeyPresence', () => {
  it('flags a venue only when its whole credential set is configured', () => {
    expect(venueKeyPresence({})).toEqual({ okx: false, etoro: false })

    const full = {
      STOCKZ_OKX_API_KEY: 'a',
      STOCKZ_OKX_SECRET_KEY: 'b',
      STOCKZ_OKX_PASSPHRASE: 'c',
      STOCKZ_ETORO_API_KEY: 'd',
      STOCKZ_ETORO_USER_KEY: 'e',
    }
    expect(venueKeyPresence(full)).toEqual({ okx: true, etoro: true })

    // A partial set never counts as configured.
    expect(venueKeyPresence({ ...full, STOCKZ_OKX_PASSPHRASE: '' })).toEqual({
      okx: false,
      etoro: true,
    })
    expect(venueKeyPresence({ ...full, STOCKZ_ETORO_USER_KEY: '  ' })).toEqual({
      okx: true,
      etoro: false,
    })
  })
})

describe('keyPresenceBanner', () => {
  it('renders presence booleans only, never key material', () => {
    const bag = {
      STOCKZ_OKX_API_KEY: 'super-secret-value',
      STOCKZ_OKX_SECRET_KEY: 'super-secret-value',
      STOCKZ_OKX_PASSPHRASE: 'super-secret-value',
    }

    const banner = keyPresenceBanner(bag)

    // Says "env" out loud: this reports build-time STOCKZ_* variables only, and prints
    // before the vault has adopted anything from the URL — so an unqualified
    // "keys okx:false" above "adopted 5 credential fields" reads as a contradiction.
    expect(banner).toBe('env keys okx:true etoro:false')
    expect(banner).not.toContain('super-secret-value')
    expect(keyPresenceBanner({})).toBe('env keys okx:false etoro:false')
  })
})
