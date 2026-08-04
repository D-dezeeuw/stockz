import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerAdapter,
  adapterFor,
  prepare,
  submit,
  apply,
  cancel,
  publish,
  liveOrders,
  resetEngine,
  startEngine,
  deskMarket,
} from './engine.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetEngine()
  resetState()
})

/** An adapter double recording what the engine asks of it. */
function fakeAdapter(over = {}) {
  const calls = []
  return {
    calls,
    venue: 'okx',
    capabilities: () => ['market', 'limit', 'post_only', 'ioc', 'reduce_only'],
    submit: async (intent) => {
      calls.push(['submit', intent])
      return over.submit ?? { ok: true, clientId: intent.clientId, order: { state: 'live' } }
    },
    cancel: async (order) => {
      calls.push(['cancel', order])
      return over.cancel ?? { ok: true }
    },
  }
}

const order = (over = {}) => ({
  symbol: 'okx:BTC-USDT',
  size: 0.5,
  price: 100,
  type: 'limit',
  ...over,
})

describe('registerAdapter', () => {
  it('takes an adapter that satisfies the contract and refuses one that does not', () => {
    expect(registerAdapter(fakeAdapter())).toBe('okx')
    expect(adapterFor('okx')).toBeTruthy()

    expect(registerAdapter({ venue: 'half', submit: () => {} })).toBe('')
    expect(registerAdapter(null)).toBe('')
    expect(adapterFor('nope')).toBeNull()
  })
})

describe('prepare', () => {
  it('refuses before the network what the venue would refuse after it', () => {
    registerAdapter(fakeAdapter())

    expect(prepare(order()).ok).toBe(true)
    expect(prepare(order({ tif: 'post_only' })).ok).toBe(true)

    // A round trip to be told "no such order type" is a round trip wasted on a path
    // where the whole point is speed.
    expect(prepare(order({ tif: 'fok' })).reason).toBe('no fok')
    expect(prepare(order({ symbol: 'kraken:BTC-USD' })).reason).toBe('no adapter for kraken')
    expect(prepare(order({ size: 0 })).reason).toBe('no size')

    // The guards run here, in the one place every order passes: a check the ticket does
    // and a hotkey forgets is not a check.
    const market = { mid: 100, maxBps: 500, maxSize: 5, bookStatus: 'live' }
    expect(prepare(order({ price: 1000 }), market).reason).toContain('bps from mid')
    expect(prepare(order({ size: 50 }), market).reason).toBe('size over 5')
    expect(prepare(order(), market).ok).toBe(true)
  })
})

describe('submit', () => {
  it('shows the order the moment the trader acts, then reconciles with the venue', async () => {
    const adapter = fakeAdapter()
    registerAdapter(adapter)

    const result = await submit(order({ clientId: 'abc' }), { now: () => 1000 })
    tick()

    expect(result).toEqual({ ok: true, clientId: 'abc', reason: '' })
    expect(adapter.calls[0][1]).toMatchObject({ instrument: 'BTC-USDT', size: 0.5 })
    // Live after the ack; the row existed as 'pending' before it.
    expect(appState.trade.orders[0]).toMatchObject({ clOrdId: 'abc', state: 'live' })
    expect(liveOrders()).toHaveLength(1)

    // A rejection lands on the same row in the desk's vocabulary.
    resetEngine()
    resetState()
    registerAdapter(
      fakeAdapter({ submit: { ok: false, reason: 'insufficient_funds', message: 'no USDT' } }),
    )
    const bad = await submit(order({ clientId: 'def' }), { now: () => 2000 })
    tick()

    expect(bad).toMatchObject({ ok: false, reason: 'insufficient_funds' })
    expect(appState.trade.orders[0]).toMatchObject({ state: 'rejected', reason: 'no USDT' })
    // A rejected order is settled, so it is no longer held live.
    expect(liveOrders()).toEqual([])

    // An intent the engine refuses never reaches the venue at all.
    expect(await submit(order({ size: 0 }))).toMatchObject({ ok: false, reason: 'no size' })
  })
})

describe('apply', () => {
  it('moves an order only through legal states and drops it once settled', async () => {
    registerAdapter(fakeAdapter())
    await submit(order({ clientId: 'abc' }), { now: () => 1000 })
    tick()

    expect(apply('abc', 'partial', { filled: 0.2, avgPx: 100 })).toMatchObject({
      state: 'partial',
      filled: 0.2,
    })
    tick()
    expect(appState.trade.orders[0]).toMatchObject({ state: 'partial', filled: 0.2 })

    // An illegal transition is ignored rather than throwing on the feed path.
    expect(apply('abc', 'pending').state).toBe('partial')

    expect(apply('abc', 'filled', { filled: 0.5 }).state).toBe('filled')
    // Keeping every order of a session live is how a long session slows down.
    expect(liveOrders()).toEqual([])

    expect(apply('nope', 'filled')).toBeNull()
  })
})

describe('cancel', () => {
  it('cancels a live order and refuses one that is already gone', async () => {
    const adapter = fakeAdapter()
    registerAdapter(adapter)
    await submit(order({ clientId: 'abc' }), { now: () => 1000 })
    tick()

    expect(await cancel('abc', { now: () => 2000 })).toEqual({ ok: true, reason: '' })
    tick()
    expect(appState.trade.orders[0].state).toBe('cancelled')
    expect(adapter.calls.at(-1)[1]).toMatchObject({ clientId: 'abc' })

    // Already settled: there is nothing to cancel.
    expect(await cancel('abc')).toEqual({ ok: false, reason: 'not live' })

    resetEngine()
    resetState()
    registerAdapter(fakeAdapter({ cancel: { ok: false, reason: 'unknown' } }))
    await submit(order({ clientId: 'xyz' }))
    expect(await cancel('xyz')).toMatchObject({ ok: false })
  })
})

describe('publish', () => {
  it('is the one route from the engine into the desk\'s order list', () => {
    publish([{ clOrdId: 'a', state: 'live', ts: 1 }])
    tick()

    expect(appState.trade.orders[0]).toMatchObject({ clOrdId: 'a', state: 'live' })
    expect(publish([])).toHaveLength(1)
  })
})

describe('liveOrders', () => {
  it('lists what is still working, and nothing that has settled', async () => {
    registerAdapter(fakeAdapter())
    await submit(order({ clientId: 'a' }))
    await submit(order({ clientId: 'b' }))

    expect(liveOrders().map((o) => o.clientId)).toEqual(['a', 'b'])

    apply('a', 'filled', { filled: 0.5 })
    expect(liveOrders().map((o) => o.clientId)).toEqual(['b'])
  })
})

describe('startEngine', () => {
  it('brings up the venues this build supports', () => {
    expect(startEngine({ okx: fakeAdapter() })).toEqual(['okx'])
    expect(adapterFor('okx')).toBeTruthy()
  })
})

describe('resetEngine', () => {
  it('forgets every adapter and live order', async () => {
    registerAdapter(fakeAdapter())
    await submit(order({ clientId: 'a' }))

    expect(resetEngine()).toBe(true)
    expect(adapterFor('okx')).toBeNull()
    expect(liveOrders()).toEqual([])
  })
})

describe('deskMarket', () => {
  it('reads the guard\'s inputs off the desk as it stands right now', () => {
    setValue('market.mid', 100)
    setValue('market.bookStatus', 'live')
    setValue('settings.maxDeviationBps', 250)
    setValue('settings.maxPosition', 3)
    tick()

    expect(deskMarket()).toEqual({ mid: 100, maxBps: 250, maxSize: 3, bookStatus: 'live' })

    // An empty desk yields zeroes, which the guards read as "no limit configured"
    // rather than as "block everything".
    resetState()
    expect(deskMarket()).toEqual({ mid: 0, maxBps: 0, maxSize: 0, bookStatus: '' })
  })
})
