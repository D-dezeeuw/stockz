import { describe, it, expect, vi } from 'vitest'
import {
  okxTimestamp,
  signHeaders,
  venueRequest,
  placeMarketOrder,
  fetchVenuePositions,
  OKX_HOSTS,
} from './venue.js'

const KEYS = { apiKey: 'ak', secretKey: 'sk', passphrase: 'pp' }
const CONFIG = { keys: KEYS, eea: true, demo: false }

/** A fetch double returning a canned OKX envelope and recording the call. */
function fakeFetch(body, calls = []) {
  return async (url, init) => {
    calls.push({ url, init })
    return { json: async () => body }
  }
}

describe('okxTimestamp', () => {
  it('renders the millisecond ISO form OKX requires', () => {
    expect(okxTimestamp(Date.UTC(2026, 7, 7, 14, 5, 9))).toBe('2026-08-07T14:05:09.000Z')
    expect(okxTimestamp(0)).toBe('1970-01-01T00:00:00.000Z')
    expect(okxTimestamp(NaN)).toBe('1970-01-01T00:00:00.000Z')
  })
})

describe('signHeaders', () => {
  it('signs with node crypto and announces demo only when asked', () => {
    const headers = signHeaders(
      { ts: Date.UTC(2026, 7, 7, 14, 5, 9), method: 'GET', path: '/api/v5/account/config' },
      KEYS,
    )

    expect(headers['OK-ACCESS-KEY']).toBe('ak')
    expect(headers['OK-ACCESS-PASSPHRASE']).toBe('pp')
    expect(headers['OK-ACCESS-TIMESTAMP']).toBe('2026-08-07T14:05:09.000Z')
    expect(headers['OK-ACCESS-SIGN']).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(headers['x-simulated-trading']).toBeUndefined()

    expect(signHeaders({ ts: 0, method: 'GET', path: '/p' }, KEYS, true)['x-simulated-trading']).toBe('1')

    // The signature must be deterministic for a given (ts, method, path, body) — that is
    // the entire contract with the venue, and a drifting one is a 401 that reads as a bad
    // key. Same inputs, same digest.
    const again = signHeaders(
      { ts: Date.UTC(2026, 7, 7, 14, 5, 9), method: 'GET', path: '/api/v5/account/config' },
      KEYS,
    )
    expect(again['OK-ACCESS-SIGN']).toBe(headers['OK-ACCESS-SIGN'])

    // A body changes it; so does the path. Both go into the prehash.
    expect(signHeaders({ ts: 0, method: 'POST', path: '/p', body: '{"a":1}' }, KEYS)['OK-ACCESS-SIGN'])
      .not.toBe(signHeaders({ ts: 0, method: 'POST', path: '/p', body: '{"a":2}' }, KEYS)['OK-ACCESS-SIGN'])

    // No credentials signs nothing rather than sending a broken request.
    expect(signHeaders({ ts: 0, path: '/p' }, { apiKey: 'ak' })).toEqual({})
  })
})

describe('venueRequest', () => {
  it('talks to the platform the keys live on and never throws', async () => {
    const calls = []
    const ok = await venueRequest({ path: '/api/v5/account/config' }, CONFIG, {
      fetch: fakeFetch({ code: '0', data: [{ uid: '1' }] }, calls),
      now: () => 1000,
    })

    expect(ok).toEqual({ ok: true, code: '0', data: [{ uid: '1' }], error: '' })
    // The server calls OKX directly — no proxy prefix, unlike the browser which must go
    // same-origin because OKX EU sends no CORS headers.
    expect(calls[0].url).toBe(`${OKX_HOSTS.eea}/api/v5/account/config`)

    const global = await venueRequest({ path: '/p' }, { ...CONFIG, eea: false }, {
      fetch: fakeFetch({ code: '0', data: [] }, calls),
      now: () => 1000,
    })
    expect(global.ok).toBe(true)
    expect(calls[1].url).toBe(`${OKX_HOSTS.global}/p`)

    // A business failure arrives as HTTP 200 with a non-zero code; the code travels so a
    // caller can branch on it rather than matching on prose.
    const refused = await venueRequest({ path: '/p' }, CONFIG, {
      fetch: fakeFetch({ code: '50101', msg: 'APIKey does not match current environment.' }),
      now: () => 1000,
    })
    expect(refused).toMatchObject({ ok: false, code: '50101' })
    expect(refused.error).toMatch(/does not match/)

    // A per-item rejection carries its own code, and that is the one worth reporting.
    const item = await venueRequest({ path: '/p' }, CONFIG, {
      fetch: fakeFetch({ code: '1', data: [{ sCode: '51008', sMsg: 'Insufficient balance' }] }),
      now: () => 1000,
    })
    expect(item.code).toBe('51008')
    expect(item.error).toBe('Insufficient balance')

    // Never throws: an exception on the order path leaves the caller unsure whether the
    // order went.
    const dead = await venueRequest({ path: '/p' }, CONFIG, {
      fetch: async () => {
        throw new Error('offline')
      },
      now: () => 1000,
    })
    expect(dead.ok).toBe(false)
    expect(dead.error).toMatch(/unreachable: offline/)

    // No keys refuses before reaching the network.
    const untouched = vi.fn()
    const keyless = await venueRequest({ path: '/p' }, { keys: {} }, { fetch: untouched })
    expect(keyless.error).toMatch(/no OKX credentials/)
    expect(untouched).not.toHaveBeenCalled()
  })
})

describe('placeMarketOrder', () => {
  it('sends a spot market order sized in base currency', async () => {
    const calls = []
    const result = await placeMarketOrder(
      { instId: 'BTC-USDT', side: 'BUY', size: 0.001, clientId: 'c1' },
      CONFIG,
      { fetch: fakeFetch({ code: '0', data: [{ ordId: '99' }] }, calls), now: () => 1000 },
    )

    expect(result).toEqual({ ok: true, id: '99', error: '' })

    const body = JSON.parse(calls[0].init.body)
    expect(body.ordType).toBe('market')
    expect(body.tdMode).toBe('cash')
    expect(body.side).toBe('buy')
    // Base currency, so `sz` means the same thing on a buy as on a sell — OKX otherwise
    // reads a spot market buy's size as quote currency.
    expect(body.tgtCcy).toBe('base_ccy')
    expect(body.sz).toBe('0.001')
    expect(body.clOrdId).toBe('c1')

    const refused = await placeMarketOrder({ instId: 'BTC-USDT', side: 'buy', size: 1 }, CONFIG, {
      fetch: fakeFetch({ code: '1', data: [{ sCode: '51008', sMsg: 'Insufficient balance' }] }),
      now: () => 1000,
    })
    expect(refused).toEqual({ ok: false, id: '', error: 'Insufficient balance' })
  })
})

describe('fetchVenuePositions', () => {
  it('normalises the venue snapshot into the desk shape', async () => {
    const result = await fetchVenuePositions(CONFIG, {
      fetch: fakeFetch({ code: '0', data: [{ instId: 'BTC-USDT', pos: '0.5', avgPx: '60000' }] }),
      now: () => 1000,
    })

    expect(result.ok).toBe(true)
    expect(result.positions).toEqual([{ instrument: 'BTC-USDT', qty: 0.5, avgPx: 60000 }])

    const failed = await fetchVenuePositions(CONFIG, {
      fetch: fakeFetch({ code: '50119', msg: "API key doesn't exist" }),
      now: () => 1000,
    })
    expect(failed).toEqual({ ok: false, positions: [], error: "API key doesn't exist" })
  })
})
