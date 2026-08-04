import { describe, it, expect, beforeEach } from 'vitest'
import {
  POLL_MS,
  ETORO_BASE,
  etoroHeaders,
  pollIntervalFor,
  etoroRequest,
  fetchInstruments,
  fetchQuotes,
  fetchPortfolio,
  createQuotePoller,
} from './rest.js'
import { learnInstruments, resetInstruments, symbolFor } from './map.js'
import { setKeys, clearKeys } from '../vault.js'

/** A fetch double returning a canned body and recording requests. */
function fakeFetch(body, calls = [], ok = true, status = 200) {
  return async (url, init) => {
    calls.push({ url, init })
    return { ok, status, json: async () => body }
  }
}

/** A timer double capturing scheduled polls instead of waiting. */
function fakeTimer() {
  const scheduled = []
  return {
    scheduled,
    setTimeout: (fn, ms) => {
      scheduled.push({ fn, ms })
      return scheduled.length
    },
    clearTimeout: (id) => scheduled.splice(id - 1, 1),
  }
}

beforeEach(() => {
  clearKeys()
  resetInstruments()
})

describe('etoroHeaders', () => {
  it('sends both keys directly, and nothing at all when either is missing', () => {
    expect(etoroHeaders()).toEqual({})

    setKeys('etoro', { apiKey: 'ak', userKey: 'uk' })
    expect(etoroHeaders()).toMatchObject({ 'X-API-KEY': 'ak', 'X-USER-KEY': 'uk' })

    clearKeys()
    setKeys('etoro', { apiKey: 'ak' })
    expect(etoroHeaders()).toEqual({})
  })
})

describe('pollIntervalFor', () => {
  it('spends the rate budget on what the trader is actually looking at', () => {
    const context = { focus: 'AAPL', watchlist: ['TSLA', 'MSFT'], visible: true }

    expect(pollIntervalFor(context, 'AAPL')).toBe(POLL_MS.focused)
    expect(pollIntervalFor(context, 'TSLA')).toBe(POLL_MS.watchlist)
    expect(pollIntervalFor(context, 'NVDA')).toBe(POLL_MS.background)

    // A hidden tab polls nothing: those quotes would be stale before they are seen, and
    // burning budget there is what makes the focused quote late.
    expect(pollIntervalFor({ ...context, visible: false }, 'AAPL')).toBe(0)
    expect(pollIntervalFor({}, 'AAPL')).toBe(POLL_MS.background)
  })
})

describe('etoroRequest', () => {
  it('refuses without keys, returns results rather than throwing, and maps failures', async () => {
    expect(await etoroRequest({ path: '/x' })).toEqual({
      ok: false,
      error: 'No EToro credentials — add keys to trade',
    })

    setKeys('etoro', { apiKey: 'ak', userKey: 'uk' })
    const calls = []
    expect(await etoroRequest({ path: '/x', fetch: fakeFetch({ a: 1 }, calls) })).toEqual({
      ok: true,
      data: { a: 1 },
    })
    expect(calls[0].url).toBe(`${ETORO_BASE}/x`)

    const rejected = await etoroRequest({
      path: '/x',
      fetch: fakeFetch({ message: 'nope' }, [], false, 401),
    })
    expect(rejected.error).toMatch(/rejected your keys/)

    const dead = await etoroRequest({
      path: '/x',
      fetch: async () => {
        throw new Error('offline')
      },
    })
    expect(dead.error).toMatch(/EToro unreachable: offline/)

    // A POST serialises its body; a GET must not send one at all.
    const posted = []
    await etoroRequest({ path: '/x', method: 'POST', body: { a: 1 }, fetch: fakeFetch({}, posted) })
    expect(posted[0].init.body).toBe('{"a":1}')
    expect(posted[0].init.method).toBe('POST')

    const got = []
    await etoroRequest({ path: '/x', fetch: fakeFetch({}, got) })
    expect(got[0].init.body).toBeUndefined()

    // Latency comes from the calls the desk already makes. The synthetic probe this
    // replaces asked EToro for `/status`, an endpoint it does not publish, so it 404ed
    // every few seconds forever and reported the venue dead however it was behaving.
    const reported = []
    let clock = 0
    await etoroRequest({
      path: '/x',
      fetch: fakeFetch({ a: 1 }),
      clock: () => (clock += 120),
      report: (venue, ms) => reported.push([venue, ms]),
    })
    expect(reported).toEqual([['etoro', 120]])

    // A failure reports -1, never a large number: recording a timeout as "3000ms" would
    // drag the smoothed average around long after the venue came back.
    await etoroRequest({
      path: '/x',
      fetch: fakeFetch({ message: 'nope' }, [], false, 401),
      report: (venue, ms) => reported.push([venue, ms]),
    })
    await etoroRequest({
      path: '/x',
      fetch: async () => {
        throw new Error('offline')
      },
      report: (venue, ms) => reported.push([venue, ms]),
    })
    expect(reported.slice(1)).toEqual([
      ['etoro', -1],
      ['etoro', -1],
    ])
  })
})

describe('fetchInstruments', () => {
  it('teaches the mappers the id → symbol catalogue', async () => {
    setKeys('etoro', { apiKey: 'ak', userKey: 'uk' })

    const result = await fetchInstruments({
      fetch: fakeFetch({
        instrumentDisplayDatas: [{ instrumentId: 1001, symbolFull: 'AAPL' }],
      }),
    })

    expect(result).toEqual({ ok: true, count: 1 })
    expect(symbolFor(1001)).toBe('AAPL')

    // The venue also returns a bare array on some deployments.
    resetInstruments()
    expect(await fetchInstruments({ fetch: fakeFetch([{ instrumentId: 7, symbol: 'X' }]) })).toEqual({
      ok: true,
      count: 1,
    })
    // The catalogue is cumulative: an empty response teaches nothing but forgets nothing,
    // so a partial refresh cannot blank out instruments the desk is already showing.
    expect(await fetchInstruments({ fetch: fakeFetch(null) })).toEqual({ ok: true, count: 1 })

    expect((await fetchInstruments({ fetch: fakeFetch({}, [], false, 500) })).ok).toBe(false)
  })
})

describe('fetchQuotes', () => {
  it('maps quotes into internal ticks and skips the call when nothing is asked for', async () => {
    setKeys('etoro', { apiKey: 'ak', userKey: 'uk' })
    learnInstruments([{ instrumentId: 1001, symbolFull: 'AAPL' }])

    const calls = []
    const result = await fetchQuotes([1001], {
      fetch: fakeFetch({ rates: [{ instrumentId: 1001, bid: '190.1', ask: '190.3' }] }, calls),
    })

    expect(result.ticks).toHaveLength(1)
    expect(result.ticks[0]).toMatchObject({ venue: 'etoro', symbol: 'AAPL' })
    expect(calls[0].url).toContain('instrumentIds=1001')

    // No instruments means no request at all.
    expect(await fetchQuotes([])).toEqual({ ok: true, ticks: [] })
    expect(await fetchQuotes(null)).toEqual({ ok: true, ticks: [] })

    // A bare array response is handled the same as the wrapped form.
    const bare = await fetchQuotes([1001], {
      fetch: fakeFetch([{ instrumentId: 1001, bid: '1', ask: '2' }]),
    })
    expect(bare.ticks).toHaveLength(1)
    expect((await fetchQuotes([1001], { fetch: fakeFetch({}, [], false, 500) })).ok).toBe(false)
    expect((await fetchQuotes([1001], { fetch: fakeFetch(null) })).ticks).toEqual([])
  })
})

describe('fetchPortfolio', () => {
  it('maps positions into the internal shape', async () => {
    setKeys('etoro', { apiKey: 'ak', userKey: 'uk' })
    learnInstruments([{ instrumentId: 1001, symbolFull: 'AAPL' }])

    const result = await fetchPortfolio({
      fetch: fakeFetch({ positions: [{ instrumentId: 1001, isBuy: false, amount: '5' }] }),
    })

    expect(result.positions[0]).toMatchObject({ side: 'short', sz: 5, symbol: 'AAPL' })
    const bare = await fetchPortfolio({
      fetch: fakeFetch([{ instrumentId: 1001, isBuy: true, amount: '2' }]),
    })
    expect(bare.positions).toHaveLength(1)
    expect((await fetchPortfolio({ fetch: fakeFetch(null) })).positions).toEqual([])
    expect((await fetchPortfolio({ fetch: fakeFetch({}, [], false, 429) })).ok).toBe(false)
  })
})

describe('createQuotePoller', () => {
  it('polls at the focused rate and stops cleanly', async () => {
    const timer = fakeTimer()
    const delivered = []
    let visible = true

    const poller = createQuotePoller({
      fetchQuotes: async () => ({ ok: true, ticks: [{ symbol: 'AAPL' }] }),
      timer,
      onTicks: (ticks) => delivered.push(...ticks),
      context: () => ({ instrumentIds: [1001], focus: 'AAPL', visible }),
    })

    await poller.start()
    expect(delivered).toHaveLength(1)
    expect(poller.running()).toBe(true)
    expect(timer.scheduled.at(-1).ms).toBe(POLL_MS.focused)

    // Hidden: the next wake is a cheap re-check, not a quote fetch.
    visible = false
    await timer.scheduled.at(-1).fn()
    expect(timer.scheduled.at(-1).ms).toBe(POLL_MS.background)

    poller.stop()
    expect(poller.running()).toBe(false)

    // Nothing to poll: it reschedules instead of calling the venue.
    const idle = createQuotePoller({ timer, context: () => ({ instrumentIds: [] }) })
    await idle.start()
    expect(idle.running()).toBe(true)
    idle.stop()

    // A failing fetch is simply not delivered — the poller keeps its rhythm.
    const quiet = createQuotePoller({
      fetchQuotes: async () => ({ ok: false, error: 'down' }),
      timer,
      context: () => ({ instrumentIds: [1], focus: 'AAPL', visible: true }),
    })
    await quiet.start()
    expect(quiet.running()).toBe(true)
    quiet.stop()

    // Defaults: no callbacks and no context supplied must not throw.
    const bare = createQuotePoller({ timer })
    await bare.start()
    bare.stop()

    // A stopped poller schedules nothing further.
    const stopped = createQuotePoller({
      fetchQuotes: async () => ({ ok: true, ticks: [] }),
      timer,
      context: () => ({ instrumentIds: [1] }),
    })
    stopped.stop()
    expect(await stopped.start()).not.toBeUndefined()
  })
})
