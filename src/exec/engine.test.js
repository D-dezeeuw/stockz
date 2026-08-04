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
  paperMode,
} from './engine.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { openPositions, resetPositions } from '../positions/store.js'

beforeEach(() => {
  resetEngine()
  resetState()
  resetPositions()
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

describe('paperMode', () => {
  it('treats anything that is not explicitly live as paper', () => {
    // The safe reading of an absent or unrecognised mode. A desk that defaulted to live
    // because a setting failed to load would send real orders on a boot failure.
    expect(paperMode({})).toBe(true)
    expect(paperMode({ trade: {} })).toBe(true)
    expect(paperMode({ trade: { mode: 'nonsense' } })).toBe(true)
    expect(paperMode({ trade: { mode: 'paper' } })).toBe(true)

    expect(paperMode({ trade: { mode: 'live' } })).toBe(false)
  })
})

describe('adapterFor', () => {
  it('diverts every venue to the simulator on paper, and lets live through', () => {
    const real = fakeAdapter()
    const paper = { ...fakeAdapter(), venue: 'paper' }
    registerAdapter(real)
    registerAdapter(paper)

    // Paper is the default, and the substitution happens on the one lookup every order
    // goes through — ticket, hotkey, bot and flatten alike.
    expect(adapterFor('okx').venue).toBe('paper')

    setValue(PATHS.trade.mode, 'live')
    tick()
    expect(adapterFor('okx').venue).toBe('okx')

    // An unknown venue stays unknown even on paper: conjuring an adapter for a venue the
    // desk cannot trade would turn a typo into a position.
    setValue(PATHS.trade.mode, 'paper')
    tick()
    expect(adapterFor('binance')).toBeNull()
    expect(adapterFor('')).toBeNull()
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

    // Snapped to the grid before the guards judge it: a size that rounds down under the
    // limit is judged as what will be sent, not as what was typed.
    const grid = { ...market, lotSize: 0.01, tickSize: 0.1 }
    expect(prepare(order({ size: 1.279, price: 100.04 }), grid).intent).toMatchObject({
      size: 1.27,
      price: 100,
    })
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

    // A client id cannot be used twice: at the venue that is either a rejection or,
    // worse, a second order.
    resetEngine()
    registerAdapter(fakeAdapter())
    await submit(order({ clientId: 'once' }))
    expect(await submit(order({ clientId: 'once' }))).toMatchObject({ reason: 'duplicate id' })
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

    // The position book moved on the fill itself, not on the next frame: a position a
    // frame behind is a risk number someone may size against.
    expect(openPositions()[0]).toMatchObject({ instrument: 'BTC-USDT', qty: 0.2 })

    expect(apply('abc', 'filled', { filled: 0.5 }).state).toBe('filled')
    expect(openPositions()[0].qty).toBe(0.5)
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
    expect(startEngine({ okx: fakeAdapter() })).toEqual(['okx', 'etoro', 'paper'])
    expect(adapterFor('okx')).toBeTruthy()
    expect(adapterFor('etoro')).toBeTruthy()
    // Always up, whatever the mode: `adapterFor` swaps it in for whichever venue an order
    // names while the desk is on paper, so it has to exist before the first order.
    expect(adapterFor('paper')).toBeTruthy()
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

    expect(deskMarket()).toMatchObject({ mid: 100, maxBps: 250, maxSize: 3, bookStatus: 'live' })

    // An empty desk yields zeroes, which the guards read as "no limit configured"
    // rather than as "block everything".
    resetState()
    expect(deskMarket()).toMatchObject({ mid: 0, maxBps: 0, maxSize: 0, bookStatus: '' })
  })
})
