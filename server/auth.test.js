// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  safeEqual,
  loginRole,
  credentialsConfigured,
  signSession,
  verifySession,
  requestRole,
  parseCookies,
  sessionCookie,
  sessionSecret,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from './auth.js'

const ENV = { STOCKZ_USER_PASSWORD: 'paper-pass', STOCKZ_ADMIN_PASSWORD: 'admin-pass' }

describe('safeEqual', () => {
  it('matches only non-empty equals, without length shortcuts', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
    // Empty never matches empty: an unset password must not equal a blank submission.
    expect(safeEqual('', '')).toBe(false)
    expect(safeEqual('x', undefined)).toBe(false)
  })
})

describe('loginRole', () => {
  it('grants exactly the role whose password matched', () => {
    expect(loginRole('usr', 'paper-pass', ENV)).toBe('usr')
    expect(loginRole('admin', 'admin-pass', ENV)).toBe('admin')

    // The wrong password for the right account, the right password for the wrong
    // account, and an invented account are all the same refusal.
    expect(loginRole('usr', 'admin-pass', ENV)).toBe('')
    expect(loginRole('admin', 'paper-pass', ENV)).toBe('')
    expect(loginRole('root', 'admin-pass', ENV)).toBe('')
    expect(loginRole('usr', 'paper-pass', {})).toBe('')
  })
})

describe('credentialsConfigured', () => {
  it('is true when any account has a password, false on a half-provisioned server', () => {
    expect(credentialsConfigured(ENV)).toBe(true)
    expect(credentialsConfigured({ STOCKZ_ADMIN_PASSWORD: 'x' })).toBe(true)
    expect(credentialsConfigured({})).toBe(false)
    expect(credentialsConfigured({ STOCKZ_USER_PASSWORD: '' })).toBe(false)
  })
})

describe('signSession', () => {
  it('mints role.expiry.mac with the TTL applied', () => {
    const token = signSession('admin', 'secret', 1000)
    const [role, expiry, mac] = token.split('.')
    expect(role).toBe('admin')
    expect(Number(expiry)).toBe(1000 + SESSION_TTL_MS)
    expect(mac.length).toBeGreaterThan(20)
  })
})

describe('verifySession', () => {
  it('accepts only its own unexpired signatures', () => {
    const token = signSession('usr', 'secret', 1000)
    expect(verifySession(token, 'secret', 2000)).toBe('usr')

    // A forged role, a foreign secret, an expired token and garbage are all ''.
    expect(verifySession(token.replace('usr', 'admin'), 'secret', 2000)).toBe('')
    expect(verifySession(token, 'other-secret', 2000)).toBe('')
    expect(verifySession(token, 'secret', 1000 + SESSION_TTL_MS + 1)).toBe('')
    expect(verifySession('nonsense', 'secret', 2000)).toBe('')
    expect(verifySession('ghost.99999999999999.mac', 'secret', 2000)).toBe('')
    expect(verifySession(undefined, 'secret', 2000)).toBe('')
  })
})

describe('requestRole', () => {
  it('reads the session out of a real Cookie header', () => {
    const token = signSession('admin', 's', 1000)
    expect(requestRole(`other=1; ${SESSION_COOKIE}=${token}`, 's', 2000)).toBe('admin')
    expect(requestRole('other=1', 's', 2000)).toBe('')
    expect(requestRole(undefined, 's', 2000)).toBe('')
  })
})

describe('parseCookies', () => {
  it('splits a header into a bag and ignores malformed pairs', () => {
    expect(parseCookies('a=1; b=2 ; c=x=y')).toEqual({ a: '1', b: '2', c: 'x=y' })
    expect(parseCookies('noequals')).toEqual({})
    expect(parseCookies('')).toEqual({})
    expect(parseCookies(undefined)).toEqual({})
  })
})

describe('sessionCookie', () => {
  it('sets HttpOnly SameSite=Strict, and clears with Max-Age=0', () => {
    const set = sessionCookie('tok')
    expect(set).toContain(`${SESSION_COOKIE}=tok`)
    expect(set).toContain('HttpOnly')
    expect(set).toContain('SameSite=Strict')

    expect(sessionCookie('')).toContain('Max-Age=0')
  })
})

describe('sessionSecret', () => {
  it('uses a configured secret and mints an ephemeral one otherwise', () => {
    expect(sessionSecret({ STOCKZ_SESSION_SECRET: 'a-long-enough-secret' })).toBe('a-long-enough-secret')

    // Too short reads as unset — a four-character secret is worse than a random one.
    const minted = sessionSecret({ STOCKZ_SESSION_SECRET: 'shrt' })
    expect(minted).not.toBe('shrt')
    expect(minted.length).toBeGreaterThan(30)
    // Two mints differ: the fallback is random, not a constant.
    expect(sessionSecret({})).not.toBe(sessionSecret({}))
  })
})
