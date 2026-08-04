import { describe, it, expect, beforeEach } from 'vitest'
import { rejectionEvent, acceptEvent, sendOrder } from './send.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { setKeys, clearKeys } from '../venues/vault.js'

beforeEach(() => {
  resetState()
  clearKeys('okx')
})

describe('rejectionEvent', () => {
  it('carries a reason a trader can read off the order row', () => {
    expect(rejectionEvent('a', { msg: 'insufficient balance' }, 100)).toEqual({
      clOrdId: 'a',
      state: 'rejected',
      ts: 100,
      reason: 'insufficient balance',
    })

    // Whatever the venue gave us, in order of usefulness.
    expect(rejectionEvent('a', { message: 'network down' }, 1).reason).toBe('network down')
    expect(rejectionEvent('a', { code: '51008' }, 1).reason).toBe('51008')
    expect(rejectionEvent('a', {}, 1).reason).toBe('rejected')
  })
})

describe('acceptEvent', () => {
  it('treats an acknowledgement as live, never as a fill', () => {
    const event = acceptEvent('a', { state: 'live', filled: 0 }, 100)
    expect(event).toEqual({ clOrdId: 'a', state: 'live', filled: 0, avgPx: 0, ts: 100 })

    // An ack that already reports a fill is honoured; anything else is merely live —
    // treating an ack as a fill is how a desk double-sizes the next trade.
    expect(acceptEvent('a', { state: 'filled', filled: 2, avgPx: 100 }, 1)).toMatchObject({
      state: 'filled',
      filled: 2,
      avgPx: 100,
    })
    expect(acceptEvent('a', { state: 'partial' }, 1).state).toBe('live')

    // The venue's own id wins when it echoes one back.
    expect(acceptEvent('a', { clientId: 'venue-1' }, 1).clOrdId).toBe('venue-1')
  })
})

describe('sendOrder', () => {
  it('folds every outcome back onto the order row, including having no keys', async () => {
    setValue('trade.orders', [{ clOrdId: 'a', state: 'pending', filled: 0 }])
    tick()

    // No credentials: still a visible outcome, because a click that produces nothing is
    // indistinguishable from a click that did not register.
    const cold = await sendOrder({ clOrdId: 'a', instId: 'BTC-USDT' }, { now: () => 1 })
    expect(cold).toEqual({ ok: false, reason: 'no credentials' })
    tick()
    expect(appState.trade.orders[0]).toMatchObject({ state: 'rejected', reason: 'no credentials' })

    setKeys('okx', { apiKey: 'k', secretKey: 's', passphrase: 'p' })
    setValue('trade.orders', [{ clOrdId: 'b', state: 'pending', filled: 0 }])
    tick()

    const sent = []
    const ok = await sendOrder(
      { clOrdId: 'b', instId: 'BTC-USDT', side: 'buy', ordType: 'limit', px: '100', sz: '1' },
      {
        place: async (order) => {
          sent.push(order)
          return { ok: true, order: { clientId: 'b', state: 'live' } }
        },
        now: () => 500,
      },
    )

    expect(ok.ok).toBe(true)
    expect(sent[0]).toMatchObject({ symbol: 'BTC-USDT', side: 'buy', type: 'limit', sz: '1' })
    tick()
    expect(appState.trade.orders[0]).toMatchObject({ state: 'live', ts: 500 })

    // A venue rejection lands on the row with its reason.
    setValue('trade.orders', [{ clOrdId: 'c', state: 'pending', filled: 0 }])
    tick()
    const bad = await sendOrder(
      { clOrdId: 'c' },
      { place: async () => ({ ok: false, error: { msg: 'price out of band' } }), now: () => 2 },
    )
    expect(bad).toEqual({ ok: false, reason: 'rejected' })
    tick()
    expect(appState.trade.orders[0].reason).toBe('price out of band')

    // A thrown transport error is the same story, not a crash on the order path.
    setValue('trade.orders', [{ clOrdId: 'd', state: 'pending', filled: 0 }])
    tick()
    await sendOrder(
      { clOrdId: 'd' },
      {
        place: async () => {
          throw new Error('socket closed')
        },
        now: () => 3,
      },
    )
    tick()
    expect(appState.trade.orders[0]).toMatchObject({ state: 'rejected', reason: 'socket closed' })
  })
})
