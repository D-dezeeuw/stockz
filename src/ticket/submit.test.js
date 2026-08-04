import { describe, it, expect, beforeEach } from 'vitest'
import {
  makeClientOrderId,
  buildOrderPayload,
  primePayload,
  cachedPayload,
  registerSubmitAction,
  resetSubmit,
} from './submit.js'
import { clearActions, dispatchAction } from '../actions/registry.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  clearActions()
  resetState()
  resetSubmit()
})

/** Put the desk in a state where an order could actually go out. */
function armDesk(overrides = {}) {
  setValue('trade.ticketSymbol', 'okx:BTC-USDT')
  setValue('trade.ticketSize', 0.5)
  setValue('trade.ticketSide', 'buy')
  setValue('trade.ticketMode', 'market')
  setValue('trade.armed', true)
  setValue('market.bid', 100)
  setValue('market.ask', 100.5)
  setValue('market.quoteTs', 1000)
  setValue('market.bookStatus', 'live')
  for (const [path, value] of Object.entries(overrides)) setValue(path, value)
  tick()
}

describe('makeClientOrderId', () => {
  it('stays unique inside one millisecond, so a retry can never double-fill', () => {
    const a = makeClientOrderId(1700000000000)
    const b = makeClientOrderId(1700000000000)

    expect(a).not.toBe(b)
    expect(a.startsWith('stkz')).toBe(true)
    // Well inside OKX's 32-character limit, and alphanumeric throughout.
    expect(a.length).toBeLessThanOrEqual(32)
    expect(a).toMatch(/^[a-z0-9]+$/)

    // Later timestamps sort later, which is what makes the ids diagnosable in a log.
    expect(makeClientOrderId(1700000001000) > a).toBe(true)
    expect(makeClientOrderId(0, 'x').startsWith('x')).toBe(true)
  })
})

describe('buildOrderPayload', () => {
  it('sends a market order as market, never as a limit at the crossed price', () => {
    const ticket = { symbol: 'okx:BTC-USDT', side: 'buy', size: 0.5 }

    const market = buildOrderPayload(ticket, { price: 100.5, source: 'market' }, { now: 1 })
    expect(market).toMatchObject({
      instId: 'BTC-USDT',
      side: 'buy',
      ordType: 'market',
      sz: '0.5',
      tdMode: 'cash',
    })
    // A market order carries no price: sending one would rest an order at a price the
    // trader meant to take.
    expect(market.px).toBeUndefined()
    expect(market.clOrdId).toMatch(/^stkz/)

    const limit = buildOrderPayload(ticket, { price: 100, source: 'bid' }, { clOrdId: 'abc' })
    expect(limit).toMatchObject({ ordType: 'limit', px: '100', clOrdId: 'abc' })

    // Sizes and prices go out as strings — OKX rejects numeric JSON for both.
    expect(typeof limit.sz).toBe('string')
    expect(typeof limit.px).toBe('string')

    expect(buildOrderPayload({ symbol: '', size: 1 }, {})).toBeNull()
    expect(buildOrderPayload({ symbol: 'okx:BTC-USDT', size: 0 }, {})).toBeNull()
  })
})

describe('primePayload', () => {
  it('keeps a payload warm so the click itself does no assembly', () => {
    armDesk()

    const primed = primePayload({ now: 1100 })
    expect(primed).toMatchObject({ instId: 'BTC-USDT', sz: '0.5', _ok: true })
    expect(cachedPayload()).toMatchObject({ instId: 'BTC-USDT' })

    // Primed even when the ticket could not be sent: being ready is the payload's job,
    // and the gate is re-checked at submit time against fresher state.
    setValue('trade.armed', false)
    tick()
    expect(primePayload({ now: 1100 })._ok).toBe(false)
    expect(cachedPayload()).not.toBeNull()

    // Nothing to build from clears the cache rather than leaving a stale payload.
    resetState()
    expect(primePayload({ now: 1100 })).toBeNull()
    expect(cachedPayload()).toBeNull()
  })
})

describe('registerSubmitAction', () => {
  it('paints the order in the same frame as the click and refuses a cold desk', () => {
    const sent = []
    const name = registerSubmitAction({ send: (order) => sent.push(order), now: () => 5000 })
    expect(name).toBe('ticket.submit')

    armDesk({ 'market.quoteTs': 5000 })

    expect(dispatchAction(name, { side: 'buy' })).toBe(true)
    tick()

    // The row exists before the venue has answered — waiting for the ack would put a
    // network round trip inside the one interaction that must feel instant.
    expect(appState.trade.orders).toHaveLength(1)
    expect(appState.trade.orders[0]).toMatchObject({
      instId: 'BTC-USDT',
      side: 'buy',
      state: 'pending',
      ts: 5000,
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].clOrdId).toBe(appState.trade.orders[0].clOrdId)

    // The button pressed wins over whatever the ticket last held.
    dispatchAction(name, { side: 'sell' })
    tick()
    expect(appState.trade.orders[1].side).toBe('sell')
    expect(appState.trade.lastReject).toBe('')

    // A cold desk sends nothing and says why.
    setValue('trade.armed', false)
    tick()
    expect(dispatchAction(name, { side: 'buy' })).toBe(false)
    tick()
    expect(appState.trade.lastReject).toBe('disarmed')
    expect(sent).toHaveLength(2)
  })
})

describe('resetSubmit', () => {
  it('drops the warm payload where it would otherwise be wrong', () => {
    armDesk()
    primePayload({ now: 1100 })
    expect(cachedPayload()).not.toBeNull()

    expect(resetSubmit()).toBe(true)
    expect(cachedPayload()).toBeNull()
  })
})
