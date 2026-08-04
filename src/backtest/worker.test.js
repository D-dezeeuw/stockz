import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadRecordingTicks,
  runRequest,
  handleWorkerMessage,
  resetWorkerCancel,
} from './worker.js'

const TICKS = [
  { symbol: 'BTC-USDT', px: 100, ts: 1000 },
  { symbol: 'BTC-USDT', px: 130, ts: 1001 },
  { symbol: 'BTC-USDT', px: 90, ts: 1002 },
]

/** A database double shaped like the two stores `recordings.js` reads. */
function fakeDb(chunks = [{ sessionId: 'rec-1', seq: 0, ticks: TICKS }], sessions = [{ id: 'rec-1', label: 'quiet open' }]) {
  return {
    transaction: (store) => ({
      objectStore: () => ({
        getAll: () => {
          const request = {}
          const rows = String(store) === 'sessions' ? sessions : chunks
          queueMicrotask(() => request.onsuccess?.())
          Object.defineProperty(request, 'result', { value: rows })
          return request
        },
      }),
    }),
  }
}

beforeEach(() => {
  resetWorkerCancel()
})

describe('loadRecordingTicks', () => {
  it('flattens a session\'s chunks in order and finds its row', async () => {
    const loaded = await loadRecordingTicks('rec-1', { db: fakeDb() })

    expect(loaded.ticks).toEqual(TICKS)
    expect(loaded.session).toEqual({ id: 'rec-1', label: 'quiet open' })

    // Nothing to load is an empty run, never a throw — a recording deleted between the
    // picker rendering and the run starting must fail as data.
    expect(await loadRecordingTicks('', { db: fakeDb() })).toEqual({ ticks: [], session: null })
    expect(await loadRecordingTicks('rec-1', { db: null })).toEqual({ ticks: [], session: null })
  })
})

describe('runRequest', () => {
  it('drives a strategy over a recording and posts progress then a result', async () => {
    const posted = []
    const message = await runRequest(
      { runId: 'bt-1', sessionId: 'rec-1', strategyId: 'momentum-burst', instrument: 'BTC-USDT' },
      (m) => posted.push(m),
      { db: fakeDb(), now: () => 0 },
    )

    expect(message.type).toBe('done')
    expect(message.result).toMatchObject({
      sessionId: 'rec-1',
      strategyId: 'momentum-burst',
      instrument: 'BTC-USDT',
      played: 3,
      total: 3,
      label: 'quiet open',
    })
    expect(posted.filter((m) => m.type === 'progress').length).toBeGreaterThan(0)
    expect(posted.at(-1)).toBe(message)

    // An unknown strategy fails loudly. Scored as a flat run it would read as a strategy
    // that simply never fires.
    const bad = await runRequest({ runId: 'bt-2', sessionId: 'rec-1', strategyId: 'nope' }, () => {}, {
      db: fakeDb(),
    })
    expect(bad).toEqual({ type: 'error', runId: 'bt-2', error: 'unknown strategy: nope' })

    const empty = await runRequest(
      { runId: 'bt-3', sessionId: 'rec-1', strategyId: 'noop' },
      () => {},
      { db: fakeDb([]) },
    )
    expect(empty).toEqual({ type: 'error', runId: 'bt-3', error: 'recording has no ticks' })

    expect((await runRequest({ runId: 'bt-4', strategyId: 'noop' }, null, { db: fakeDb() })).type).toBe('error')
  })
})

describe('handleWorkerMessage', () => {
  it('routes run and cancel, and ignores anything else', async () => {
    const posted = []
    const done = await handleWorkerMessage(
      { type: 'run', runId: 'bt-9', sessionId: 'rec-1', strategyId: 'noop' },
      (m) => posted.push(m),
      { db: fakeDb(), now: () => 0 },
    )
    expect(done.type).toBe('done')

    expect(await handleWorkerMessage({ type: 'cancel' }, () => {})).toBeNull()
    expect(await handleWorkerMessage({ type: 'nonsense' }, () => {})).toBeNull()
    expect(await handleWorkerMessage(null, () => {})).toBeNull()

    // A cancel is cleared by the next run: one left standing would kill the following
    // request before it played a tick.
    const after = await handleWorkerMessage(
      { type: 'run', runId: 'bt-10', sessionId: 'rec-1', strategyId: 'noop' },
      () => {},
      { db: fakeDb(), now: () => 0 },
    )
    expect(after.result.played).toBe(3)
    expect(after.result.cancelled).toBe(false)
  })
})

describe('resetWorkerCancel', () => {
  it('forgets a pending cancel so the next run is not stillborn', async () => {
    await handleWorkerMessage({ type: 'cancel' }, () => {})
    expect(resetWorkerCancel()).toBe(true)

    const message = await runRequest(
      { runId: 'bt-11', sessionId: 'rec-1', strategyId: 'noop' },
      () => {},
      { db: fakeDb(), now: () => 0 },
    )
    expect(message.result.cancelled).toBe(false)
  })
})
