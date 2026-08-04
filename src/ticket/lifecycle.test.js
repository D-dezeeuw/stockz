import { describe, it, expect, beforeEach } from 'vitest'
import {
  orderReducer,
  isTerminal,
  applyOrderEvent,
  ingestOrderEvent,
  ingestOrderEvents,
  partitionOrders,
  TERMINAL,
  TRANSITIONS,
} from './lifecycle.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => resetState())

describe('orderReducer', () => {
  it('advances only through legal transitions and ignores redundant acks', () => {
    const pending = { state: 'pending', filled: 0 }

    const live = orderReducer(pending, { state: 'live', ts: 100 })
    expect(live).toMatchObject({ state: 'live', ts: 100 })

    const partial = orderReducer(live, { state: 'partial', filled: 0.3, avgPx: 100 })
    expect(partial).toMatchObject({ state: 'partial', filled: 0.3, avgPx: 100 })

    const filled = orderReducer(partial, { state: 'filled', filled: 1, avgPx: 100.2 })
    expect(filled).toMatchObject({ state: 'filled', filled: 1, avgPx: 100.2 })

    // Terminal is terminal: a resent 'live' after a fill changes nothing, rather than
    // resurrecting an order the desk is done with.
    expect(orderReducer(filled, { state: 'live' })).toBe(filled)
    expect(orderReducer(filled, { state: 'partial' }).state).toBe('filled')

    // A rejection carries its reason forward.
    expect(orderReducer(pending, { state: 'rejected', reason: 'insufficient balance' })).toMatchObject(
      { state: 'rejected', reason: 'insufficient balance' },
    )

    // An unknown state is not a transition.
    expect(orderReducer(pending, { state: 'vibing' }).state).toBe('pending')
    expect(orderReducer(null, { state: 'live' }).state).toBe('live')
    expect(TRANSITIONS.filled).toEqual([])
  })
})

describe('isTerminal', () => {
  it('knows which orders will never move again', () => {
    expect(isTerminal({ state: 'filled' })).toBe(true)
    expect(isTerminal({ state: 'cancelled' })).toBe(true)
    expect(isTerminal({ state: 'rejected' })).toBe(true)

    expect(isTerminal({ state: 'live' })).toBe(false)
    expect(isTerminal({ state: 'partial' })).toBe(false)
    expect(isTerminal(null)).toBe(false)
    expect(TERMINAL).toEqual(['filled', 'cancelled', 'rejected'])
  })
})

describe('applyOrderEvent', () => {
  it('updates by client id, and keeps events for orders it never sent', () => {
    const orders = [
      { clOrdId: 'a', state: 'pending', filled: 0 },
      { clOrdId: 'b', state: 'live', filled: 0 },
    ]

    const updated = applyOrderEvent(orders, { clOrdId: 'b', state: 'filled', filled: 2 })
    expect(updated[1]).toMatchObject({ clOrdId: 'b', state: 'filled', filled: 2 })
    // The other order is untouched, and the list is a new array.
    expect(updated[0]).toBe(orders[0])
    expect(updated).not.toBe(orders)

    // A fill from another session or a manual venue order still counts — hiding it would
    // misstate the desk's risk.
    const foreign = applyOrderEvent(orders, { clOrdId: 'zzz', state: 'filled', filled: 1 })
    expect(foreign).toHaveLength(3)
    expect(foreign[2]).toMatchObject({ clOrdId: 'zzz', state: 'filled' })

    expect(applyOrderEvent(orders, { state: 'filled' })).toBe(orders)
    expect(applyOrderEvent(null, { clOrdId: 'a', state: 'live' })).toHaveLength(1)
  })
})

describe('ingestOrderEvent', () => {
  it('routes a venue event into the desk\'s order list', () => {
    setValue('trade.orders', [{ clOrdId: 'a', state: 'pending', filled: 0 }])
    tick()

    ingestOrderEvent({ clOrdId: 'a', state: 'live', ts: 50 })
    tick()
    expect(appState.trade.orders[0]).toMatchObject({ state: 'live', ts: 50 })

    ingestOrderEvent({ clOrdId: 'a', state: 'filled', filled: 1, avgPx: 100 })
    tick()
    expect(appState.trade.orders[0]).toMatchObject({ state: 'filled', filled: 1, avgPx: 100 })

    // Reaching a terminal state announces it — once. A second identical event does not
    // re-announce, which is what a watcher diffing the array would get wrong.
    expect(appState.ui.toasts).toHaveLength(1)
    ingestOrderEvent({ clOrdId: 'a', state: 'filled', filled: 1 })
    tick()
    expect(appState.ui.toasts).toHaveLength(1)

    // Backfill and replay can ask for silence.
    setValue('trade.orders', [{ clOrdId: 'z', state: 'pending', filled: 0 }])
    tick()
    ingestOrderEvent({ clOrdId: 'z', state: 'filled' }, { silent: true })
    tick()
    expect(appState.ui.toasts).toHaveLength(1)

    // An event with no id changes nothing.
    expect(ingestOrderEvent({ state: 'cancelled' })).toHaveLength(1)
  })
})

describe('partitionOrders', () => {
  it('separates what is still working from what is done, newest first', () => {
    const { working, done } = partitionOrders([
      { clOrdId: 'a', state: 'filled', ts: 1 },
      { clOrdId: 'b', state: 'live', ts: 3 },
      { clOrdId: 'c', state: 'partial', ts: 2 },
      { clOrdId: 'd', state: 'rejected', ts: 4 },
    ])

    // Working orders are the ones that still carry risk, so they lead.
    expect(working.map((o) => o.clOrdId)).toEqual(['b', 'c'])
    expect(done.map((o) => o.clOrdId)).toEqual(['d', 'a'])

    expect(partitionOrders(null)).toEqual({ working: [], done: [] })
  })
})

describe('ingestOrderEvents', () => {
  it('lands every event in one write, which a loop of single ingests cannot', () => {
    setValue('trade.orders', [
      { clOrdId: 'a', state: 'live', filled: 0 },
      { clOrdId: 'b', state: 'live', filled: 0 },
      { clOrdId: 'c', state: 'live', filled: 0 },
    ])
    tick()

    ingestOrderEvents(
      [
        { clOrdId: 'a', state: 'cancelled', ts: 1 },
        { clOrdId: 'b', state: 'cancelled', ts: 2 },
        { clOrdId: 'c', state: 'cancelled', ts: 3 },
      ],
      { silent: true },
    )
    tick()

    // All three, not just the last: state lands on the next tick, so ingesting inside a
    // loop would have each iteration overwrite the previous one's change.
    expect(appState.trade.orders.map((o) => o.state)).toEqual([
      'cancelled',
      'cancelled',
      'cancelled',
    ])

    // Silence is respected: nothing was announced for those three.
    expect(appState.ui?.toasts ?? []).toHaveLength(0)

    // Each terminal transition otherwise announces exactly once.
    setValue('trade.orders', [{ clOrdId: 'd', state: 'live', filled: 0 }])
    tick()
    ingestOrderEvents([{ clOrdId: 'd', state: 'filled', filled: 1 }])
    tick()
    expect(appState.ui.toasts).toHaveLength(1)

    expect(ingestOrderEvents(null)).toHaveLength(1)
  })
})
