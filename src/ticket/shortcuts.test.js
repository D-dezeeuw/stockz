import { describe, it, expect, beforeEach } from 'vitest'
import {
  workingOrders,
  orderSummary,
  cancelAll,
  repeatPayload,
  registerShortcutActions,
  rememberOrder,
} from './shortcuts.js'
import { clearActions, dispatchAction } from '../actions/registry.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  clearActions()
  resetState()
})

describe('workingOrders', () => {
  it('targets exactly the orders that still carry risk', () => {
    const orders = [
      { clOrdId: 'a', state: 'live' },
      { clOrdId: 'b', state: 'filled' },
      { clOrdId: 'c', state: 'partial' },
      { clOrdId: 'd', state: 'rejected' },
      { state: 'live' },
    ]

    // A partial is still working — the unfilled remainder is live risk.
    expect(workingOrders(orders).map((o) => o.clOrdId)).toEqual(['a', 'c'])

    // An order with no id cannot be cancelled, so it is not a target.
    expect(workingOrders(orders)).toHaveLength(2)
    expect(workingOrders(null)).toEqual([])
  })
})

describe('orderSummary', () => {
  it('labels the repeat button with exactly what would refire', () => {
    expect(orderSummary({ side: 'buy', sz: '0.5', instId: 'BTC-USDT', px: '100' })).toBe(
      'BUY 0.5 BTC-USDT @ 100',
    )
    // A market order says so rather than showing a price it would not use.
    expect(orderSummary({ side: 'sell', sz: '1', instId: 'ETH-USDT' })).toBe('SELL 1 ETH-USDT @ mkt')

    expect(orderSummary({})).toBe('')
    expect(orderSummary(null)).toBe('')
  })
})

describe('cancelAll', () => {
  it('cancels every working order and reports the count', async () => {
    setValue('trade.orders', [
      { clOrdId: 'a', state: 'live', instId: 'BTC-USDT' },
      { clOrdId: 'b', state: 'filled', instId: 'BTC-USDT' },
      { clOrdId: 'c', state: 'partial', instId: 'ETH-USDT' },
    ])
    tick()

    const asked = []
    const result = await cancelAll({
      cancel: async (order) => {
        // The venue call takes the symbol and the client id, which is how a cancel finds
        // an order that has no venue id yet.
        asked.push([order.symbol, order.clientId])
        return { ok: true }
      },
      now: () => 500,
    })
    tick()

    expect(asked).toEqual([
      ['BTC-USDT', 'a'],
      ['ETH-USDT', 'c'],
    ])
    expect(result).toEqual({ cancelled: 2, failed: 0 })
    expect(appState.trade.orders[0].state).toBe('cancelled')
    // The filled one is untouched.
    expect(appState.trade.orders[1].state).toBe('filled')
    expect(appState.ui.toasts.at(-1).message).toBe('cancelled 2')

    // A venue that refuses is counted, not swallowed.
    setValue('trade.orders', [{ clOrdId: 'z', state: 'live', instId: 'BTC-USDT' }])
    tick()
    const failed = await cancelAll({
      cancel: async () => {
        throw new Error('gateway')
      },
      now: () => 1,
    })
    expect(failed).toEqual({ cancelled: 0, failed: 1 })

    // Already flat: no venue round trip at all, since the button is always enabled.
    setValue('trade.orders', [])
    tick()
    let called = false
    expect(await cancelAll({ cancel: async () => ((called = true), { ok: true }) })).toEqual({
      cancelled: 0,
      failed: 0,
    })
    expect(called).toBe(false)
  })
})

describe('repeatPayload', () => {
  it('refires the same order under a fresh client id', () => {
    const last = { instId: 'BTC-USDT', side: 'buy', sz: '0.5', px: '100', clOrdId: 'old', seq: 3 }
    const next = repeatPayload(last, 1700000000000)

    expect(next).toMatchObject({ instId: 'BTC-USDT', side: 'buy', sz: '0.5', px: '100' })
    // Reusing the id would be rejected as a duplicate — and worse, could match the wrong
    // fill in the order list.
    expect(next.clOrdId).not.toBe('old')
    expect(next.seq).toBeUndefined()

    expect(repeatPayload({ instId: 'BTC-USDT' }, 1)).toBeNull()
    expect(repeatPayload(null, 1)).toBeNull()
  })
})

describe('rememberOrder', () => {
  it('stores the last order with a label the button can wear', () => {
    const stored = rememberOrder({ instId: 'BTC-USDT', side: 'sell', sz: '2', px: '99' })
    tick()

    expect(stored).toMatchObject({ instId: 'BTC-USDT' })
    expect(appState.trade.lastOrder.sz).toBe('2')
    expect(appState.trade.lastOrderSummary).toBe('SELL 2 BTC-USDT @ 99')

    expect(rememberOrder({})).toBeNull()
    expect(rememberOrder(null)).toBeNull()
  })
})

describe('registerShortcutActions', () => {
  it('keeps the exit available even while the desk is cold', async () => {
    const sent = []
    const names = registerShortcutActions({
      send: (payload) => sent.push(payload),
      cancel: async () => ({ ok: true }),
      now: () => 1000,
    })
    expect(names).toEqual(['orders.cancelAll', 'ticket.repeatLast'])

    setValue('trade.orders', [{ clOrdId: 'a', state: 'live', instId: 'BTC-USDT' }])
    setValue('trade.armed', false)
    tick()

    // Arming gates *entering* risk; leaving it is never gated.
    expect(dispatchAction('orders.cancelAll', {})).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    tick()
    expect(appState.trade.orders[0].state).toBe('cancelled')

    // Nothing to repeat yet is a refusal, not an empty order.
    expect(dispatchAction('ticket.repeatLast', {})).toBe(false)

    rememberOrder({ instId: 'BTC-USDT', side: 'buy', sz: '1' })
    tick()
    expect(dispatchAction('ticket.repeatLast', {})).toBe(true)
    expect(sent[0]).toMatchObject({ instId: 'BTC-USDT', sz: '1' })
  })
})
