import { describe, it, expect, beforeEach } from 'vitest'
import {
  okxTimestamp,
  prehashString,
  toBase64,
  hmacSha256,
  signRequest,
  buildLoginFrame,
} from './sign.js'
import { setKeys, clearKeys } from '../vault.js'
import { webcrypto } from 'node:crypto'

const OKX = { apiKey: 'ak', secretKey: 'sk', passphrase: 'pp' }

beforeEach(() => {
  clearKeys()
})

describe('okxTimestamp', () => {
  it('renders the millisecond ISO form OKX requires', () => {
    expect(okxTimestamp(Date.UTC(2026, 7, 3, 14, 5, 9))).toBe('2026-08-03T14:05:09.000Z')
    expect(okxTimestamp(0)).toBe('1970-01-01T00:00:00.000Z')
    expect(okxTimestamp(NaN)).toBe('1970-01-01T00:00:00.000Z')
  })
})

describe('prehashString', () => {
  it('concatenates in the exact order OKX signs, with an empty body for GET', () => {
    expect(prehashString({ ts: 'T', method: 'get', path: '/api/v5/account/balance' })).toBe(
      'TGET/api/v5/account/balance',
    )

    // A POST signs its JSON body verbatim.
    expect(
      prehashString({ ts: 'T', method: 'POST', path: '/api/v5/trade/order', body: { a: 1 } }),
    ).toBe('TPOST/api/v5/trade/order{"a":1}')

    // The body goes into the hash exactly as it goes on the wire — even a literal '{}'.
    // The old special case dropped '{}' from the prehash while the request still carried
    // it, which is a signature over a different message and a 401 that reads as a bad key.
    expect(prehashString({ ts: 'T', path: '/p', body: {} })).toBe('TGET/p{}')
    expect(prehashString({ ts: 'T', path: '/p', body: '' })).toBe('TGET/p')
    expect(prehashString({ ts: 'T', path: '/p?limit=5' })).toBe('TGET/p?limit=5')

    // The exact example from OKX's own docs, verifiable end-to-end in hmacSha256's test.
    expect(
      prehashString({
        ts: '2020-12-08T09:08:57.715Z',
        method: 'get',
        path: '/api/v5/account/balance?ccy=BTC',
      }),
    ).toBe('2020-12-08T09:08:57.715ZGET/api/v5/account/balance?ccy=BTC')
  })
})

describe('toBase64', () => {
  it('encodes bytes without depending on a browser-only helper', () => {
    expect(toBase64(new Uint8Array([104, 105]).buffer)).toBe('aGk=')
    expect(toBase64(new Uint8Array([]).buffer)).toBe('')
  })
})

describe('hmacSha256', () => {
  it('produces the known HMAC-SHA256 base64 digest, and nothing without a secret', async () => {
    // RFC-style fixed vector: stable across implementations, so a broken signer is caught
    // here rather than by a venue 401.
    await expect(hmacSha256('message', 'secret', webcrypto.subtle)).resolves.toBe(
      'i19IcCmVwVmMVz2x4hhmqbgl1KeU0WnXBgoDYFeWNgs=',
    )

    // The OKX docs' own signing example, expected value computed independently with Node's
    // createHmac — proves this signer and the venue's reference agree end to end.
    await expect(
      hmacSha256(
        '2020-12-08T09:08:57.715ZGET/api/v5/account/balance?ccy=BTC',
        'test-secret-key',
        webcrypto.subtle,
      ),
    ).resolves.toBe('aCsBgsrAUQSCOQRSWb0FS4QZu/1RLrWcurndoXOEp+w=')

    expect(await hmacSha256('message', '', webcrypto.subtle)).toBe('')
    // Explicit null, not undefined: a default parameter only fires on undefined, and
    // globalThis.crypto.subtle exists here.
    expect(await hmacSha256('message', 'secret', null)).toBe('')
  })
})

describe('signRequest', () => {
  it('builds the four OKX headers from vault keys, and nothing when keys are missing', async () => {
    expect(await signRequest({ path: '/api/v5/account/balance' })).toEqual({})

    setKeys('okx', OKX)
    const headers = await signRequest({
      ts: Date.UTC(2026, 7, 3, 14, 5, 9),
      method: 'GET',
      path: '/api/v5/account/balance',
      subtle: webcrypto.subtle,
    })

    expect(headers['OK-ACCESS-KEY']).toBe('ak')
    expect(headers['OK-ACCESS-PASSPHRASE']).toBe('pp')
    expect(headers['OK-ACCESS-TIMESTAMP']).toBe('2026-08-03T14:05:09.000Z')
    expect(headers['OK-ACCESS-SIGN']).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(headers['Content-Type']).toBe('application/json')

    // A partial credential set signs nothing rather than sending a broken request.
    clearKeys()
    setKeys('okx', { apiKey: 'ak' })
    expect(await signRequest({ path: '/p' })).toEqual({})
  })
})

describe('buildLoginFrame', () => {
  it('signs the WS login with a seconds timestamp, unlike REST', async () => {
    expect(await buildLoginFrame()).toBeNull()

    setKeys('okx', OKX)
    const frame = await buildLoginFrame({
      ts: Date.UTC(2026, 7, 3, 14, 5, 9),
      subtle: webcrypto.subtle,
    })

    expect(frame.op).toBe('login')
    // Seconds, not the ISO string REST uses — the venue is inconsistent here and it is a
    // classic cause of an unauthorised socket.
    expect(frame.args[0].timestamp).toBe('1785765909')
    expect(frame.args[0].apiKey).toBe('ak')
    expect(frame.args[0].sign).toMatch(/^[A-Za-z0-9+/]+=*$/)
  })
})
