import { describe, it, expect, vi } from 'vitest'
import {
  fetchAccountInstruments,
  alternativeQuotes,
  fetchAccountConfig,
  canTrade,
  fetchInstruments,
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

    expect(result).toEqual({ ok: true, id: '99', code: '0', error: '' })

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
    // The numeric code travels with the message. Diagnosing from prose alone is exactly
    // what the browser client warns against — a message is the venue's to reword, the code
    // is the contract, and two rounds of this were spent guessing which refusal it was.
    expect(refused).toEqual({ ok: false, id: '', code: '51008', error: 'Insufficient balance' })
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

describe('canTrade', () => {
  it('reads the permission list OKX actually returns', () => {
    // Permissions belong to the KEY, not to an instrument. There is no "instruments you may
    // trade" endpoint — a key either carries `trade` and can reach everything the account
    // can, or it carries none of it.
    expect(canTrade('read_only,trade')).toBe(true)
    expect(canTrade('trade')).toBe(true)
    expect(canTrade(' read_only , TRADE ')).toBe(true)

    expect(canTrade('read_only')).toBe(false)
    expect(canTrade('read_only,withdraw')).toBe(false)
    expect(canTrade('')).toBe(false)
    expect(canTrade(undefined)).toBe(false)
    // Not a substring match: 'trade' must be its own entry.
    expect(canTrade('no_trade_permission')).toBe(false)
  })
})

describe('fetchAccountConfig', () => {
  it('reports what the key may do, once, instead of per order', async () => {
    const ok = await fetchAccountConfig(CONFIG, {
      fetch: fakeFetch({ code: '0', data: [{ uid: '42', perm: 'read_only,trade' }] }),
      now: () => 1000,
    })
    expect(ok).toEqual({ ok: true, perm: 'read_only,trade', uid: '42', error: '' })

    const refused = await fetchAccountConfig(CONFIG, {
      fetch: fakeFetch({ code: '50119', msg: "API key doesn't exist" }),
      now: () => 1000,
    })
    expect(refused).toMatchObject({ ok: false, perm: '', error: "API key doesn't exist" })
  })
})

describe('fetchAccountInstruments', () => {
  it('asks what THIS ACCOUNT may trade, not what exists', async () => {
    const calls = []
    const result = await fetchAccountInstruments(CONFIG, 'SPOT', {
      fetch: fakeFetch({ code: '0', data: [
        { instId: 'BTC-EUR', state: 'live', quoteCcy: 'EUR' },
        { instId: 'ETH-EUR', state: 'live', quoteCcy: 'EUR' },
        { instId: 'OLD-EUR', state: 'suspend', quoteCcy: 'EUR' },
      ] }, calls),
      now: () => 1000,
    })

    // The AUTHENTICATED path. The public list is identical on the EEA and global platforms
    // and marks everything live — verified by probe — so it can say a market exists and
    // never that this account may trade it.
    expect(calls[0].url).toContain('/api/v5/account/instruments')
    expect(calls[0].init.headers['OK-ACCESS-KEY']).toBe('ak')
    expect(result.tradable).toEqual(['BTC-EUR', 'ETH-EUR'])

    const refused = await fetchAccountInstruments(CONFIG, 'SPOT', {
      fetch: fakeFetch({ code: '50119', msg: "API key doesn't exist" }),
      now: () => 1000,
    })
    expect(refused).toEqual({ ok: false, tradable: [], error: "API key doesn't exist" })
  })
})

describe('alternativeQuotes', () => {
  it('offers the same base in a currency the account can actually trade', () => {
    const tradable = ['BTC-EUR', 'BTC-USDC', 'ETH-EUR', 'SOL-EUR', 'BTC-USDT']

    // A desk configured for BTC-USDT on a EUR account does not need to be told the symbol
    // is wrong; it needs to be told which symbol is right.
    expect(alternativeQuotes('BTC-USDT', tradable)).toEqual(['BTC-EUR', 'BTC-USDC'])
    expect(alternativeQuotes('ETH-USDT', tradable)).toEqual(['ETH-EUR'])

    // Never suggests the instrument that was refused, and never a different base.
    expect(alternativeQuotes('BTC-USDT', tradable)).not.toContain('BTC-USDT')
    expect(alternativeQuotes('DOGE-USDT', tradable)).toEqual([])
    expect(alternativeQuotes('', tradable)).toEqual([])
    expect(alternativeQuotes('BTC-USDT', undefined)).toEqual([])
  })
})

describe('fetchInstruments', () => {
  it('lists only what the venue will actually accept an order for', async () => {
    const calls = []
    const result = await fetchInstruments(CONFIG, 'SPOT', {
      fetch: fakeFetch({ code: '0', data: [
        { instId: 'BTC-USDT', state: 'live' },
        // Listed and untradable, which looks exactly like a working symbol right up until
        // the first order is refused.
        { instId: 'OLD-USDT', state: 'suspend' },
        { instId: 'NEW-USDT', state: 'preopen' },
        { instId: 'ETH-USDT', state: 'live' },
      ] }, calls),
      now: () => 1000,
    })

    expect(result.ok).toBe(true)
    expect(result.live).toEqual(['BTC-USDT', 'ETH-USDT'])
    expect(calls[0].url).toContain('instType=SPOT')

    const failed = await fetchInstruments(CONFIG, 'SPOT', {
      fetch: fakeFetch({ code: '1', msg: 'nope' }),
      now: () => 1000,
    })
    expect(failed).toEqual({ ok: false, live: [], error: 'nope' })
  })
})
