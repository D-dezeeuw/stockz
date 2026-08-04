import { describe, it, expect, beforeEach } from 'vitest'
import {
  nextSeq,
  enqueueOrder,
  drainQueue,
  queueOrder,
  takeQueue,
  resetQueue,
  MAX_BURST,
} from './queue.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetState()
  resetQueue()
})

describe('nextSeq', () => {
  it('never repeats, so FIFO survives an out-of-order resolve', () => {
    const a = nextSeq()
    const b = nextSeq()
    const c = nextSeq()

    expect(b).toBe(a + 1)
    expect(c).toBe(b + 1)
    expect([a, b, c].sort((x, y) => x - y)).toEqual([a, b, c])
  })
})

describe('enqueueOrder', () => {
  it('freezes each click at its own price and refuses a runaway burst', () => {
    const payload = { clOrdId: 'a', px: '100', sz: '1' }
    const { queue, accepted } = enqueueOrder([], payload, { now: 500 })

    expect(accepted).toBe(true)
    expect(queue[0]).toMatchObject({ clOrdId: 'a', px: '100', queuedAt: 500 })
    // A frozen copy: mutating the source afterwards must not reprice a queued order.
    payload.px = '999'
    expect(queue[0].px).toBe('100')

    // Sequence stamps preserve click order regardless of how they resolve.
    const two = enqueueOrder(queue, { clOrdId: 'b' }).queue
    expect(two[1].seq).toBeGreaterThan(two[0].seq)

    // A backlog this deep is a stuck key, not intent.
    const full = Array.from({ length: 8 }, (_, i) => ({ clOrdId: `x${i}`, seq: i }))
    expect(enqueueOrder(full, { clOrdId: 'z' }, { max: 8 })).toMatchObject({
      accepted: false,
      reason: 'burst limit',
    })

    expect(enqueueOrder([], null).accepted).toBe(false)
    expect(MAX_BURST).toBe(8)
  })
})

describe('drainQueue', () => {
  it('sends strictly in click order, one at a time, retrying the head once', async () => {
    const sent = []
    const result = await drainQueue(
      [
        { clOrdId: 'c', seq: 3 },
        { clOrdId: 'a', seq: 1 },
        { clOrdId: 'b', seq: 2 },
      ],
      async (payload) => {
        sent.push(payload.clOrdId)
        return true
      },
    )

    // Sorted by sequence, not by array position: the trader's intent was an order.
    expect(sent).toEqual(['a', 'b', 'c'])
    expect(result).toMatchObject({ sent: 3, failed: 0, remaining: [] })

    // One transient failure does not kill an order; a persistent one is counted.
    let attempts = 0
    const flaky = await drainQueue([{ clOrdId: 'a', seq: 1 }], async () => {
      attempts += 1
      return attempts > 1
    })
    expect(flaky.sent).toBe(1)
    expect(attempts).toBe(2)

    const dead = await drainQueue([{ clOrdId: 'a', seq: 1 }], async () => {
      throw new Error('socket closed')
    })
    expect(dead).toMatchObject({ sent: 0, failed: 1 })

    expect(await drainQueue(null, async () => true)).toMatchObject({ sent: 0 })
  })
})

describe('queueOrder', () => {
  it('accepts a burst up to the desk cap and says so when it refuses', () => {
    setValue('settings.maxBurst', 2)
    tick()

    expect(queueOrder({ clOrdId: 'a' }, { now: 100 })).toBe(true)
    tick()
    expect(queueOrder({ clOrdId: 'b' }, { now: 101 })).toBe(true)
    tick()
    expect(appState.trade.queue).toHaveLength(2)

    // The refusal is visible: a click that vanished silently is indistinguishable from
    // one that did not register.
    expect(queueOrder({ clOrdId: 'c' }, { now: 102 })).toBe(false)
    tick()
    expect(appState.trade.queue).toHaveLength(2)
    expect(appState.ui.toasts.at(-1).message).toContain('burst limit')

    // An empty payload is refused quietly — there is nothing to tell the trader.
    const toasts = appState.ui.toasts.length
    expect(queueOrder(null)).toBe(false)
    tick()
    expect(appState.ui.toasts).toHaveLength(toasts)
  })
})

describe('resetQueue', () => {
  it('empties the queue and restarts the sequence', () => {
    queueOrder({ clOrdId: 'a' })
    tick()
    expect(appState.trade.queue).toHaveLength(1)

    expect(resetQueue()).toBe(true)
    tick()
    expect(appState.trade.queue).toEqual([])
  })
})

describe('takeQueue', () => {
  it('empties the queue in one read, so a second click cannot drain the first', () => {
    queueOrder({ clOrdId: 'a' })
    queueOrder({ clOrdId: 'b' })

    const taken = takeQueue()
    expect(taken.map((p) => p.clOrdId)).toEqual(['a', 'b'])

    // Immediately, without waiting for a tick: state is applied a frame later, and a
    // burst arrives well inside one frame.
    expect(takeQueue()).toEqual([])

    queueOrder({ clOrdId: 'c' })
    expect(takeQueue().map((p) => p.clOrdId)).toEqual(['c'])
  })
})
