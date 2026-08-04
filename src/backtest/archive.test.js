import { describe, it, expect } from 'vitest'
import {
  RUN_DB,
  RUN_STORE,
  RUN_LIMIT,
  openRunDb,
  runRecord,
  saveRunResult,
  listRuns,
  deleteRun,
} from './archive.js'

const STATS = {
  strategyId: 'momentum-burst',
  instrument: 'BTC-USDT',
  params: { lookback: 20 },
  fillConfig: { latencyMs: 40 },
  trades: 4,
  net: 12.5,
  expectancy: 3.125,
  winRate: 0.75,
  maxDrawdown: 2,
  profitFactor: 4,
  fees: 0.4,
  curve: [{ i: 0, equity: 5 }],
  tradeList: [{ net: 5 }, { net: 7.5 }],
}

/** An IndexedDB double: one in-memory store, plus the write/read paths archive.js uses. */
function fakeDb(rows = []) {
  const store = new Map(rows.map((row) => [row.id, row]))
  return {
    store,
    db: {
      transaction: () => ({
        objectStore: () => ({
          put: (row) => store.set(row.id, row),
          delete: (id) => store.delete(id),
          getAll: () => {
            const request = {}
            Object.defineProperty(request, 'result', { value: [...store.values()] })
            queueMicrotask(() => request.onsuccess?.())
            return request
          },
        }),
        set oncomplete(fn) {
          queueMicrotask(fn)
        },
        set onerror(_fn) {},
        set onabort(_fn) {},
      }),
    },
  }
}

describe('openRunDb', () => {
  it('resolves null rather than throwing where IndexedDB is unavailable', async () => {
    // Archiving is a convenience; a browser in private mode should cost the trader the
    // archive, never the desk.
    expect(await openRunDb({ factory: null })).toBeNull()
    expect(await openRunDb({ factory: {} })).toBeNull()
    expect(
      await openRunDb({
        factory: {
          open: () => {
            throw new Error('blocked')
          },
        },
      }),
    ).toBeNull()

    const opened = await openRunDb({
      factory: {
        open: (name, version) => {
          const request = { result: { objectStoreNames: { contains: () => false }, createObjectStore: () => {} } }
          expect(name).toBe(RUN_DB)
          expect(version).toBe(1)
          queueMicrotask(() => {
            request.onupgradeneeded?.()
            request.onsuccess?.()
          })
          return request
        },
      },
    })
    expect(opened).toBeTruthy()
  })
})

describe('runRecord', () => {
  it('keeps the whole reproduction recipe and drops what nothing reads', () => {
    const record = runRecord(STATS, { id: 'bt-1', at: 1785000000000, seed: 7 })

    expect(record).toMatchObject({
      id: 'bt-1',
      at: 1785000000000,
      // Params, fill assumptions and seed together are the recipe: a stored result missing
      // any of them is a number nobody can get back to.
      params: { lookback: 20 },
      fillConfig: { latencyMs: 40 },
      seed: 7,
      net: 12.5,
      trades: 4,
    })
    expect(record.label).toBe('momentum-burst BTC-USDT')

    // The curve is what the comparison draws; the trade list is megabytes nothing on that
    // screen reads.
    expect(record.curve).toHaveLength(1)
    expect(record.tradeList).toBeUndefined()

    // An infinite profit factor stores as zero rather than as a value IndexedDB would
    // round-trip into null.
    expect(runRecord({ ...STATS, profitFactor: Infinity }).profitFactor).toBe(0)

    expect(runRecord(null)).toBeNull()
    expect(runRecord(STATS).id).toMatch(/^run-/)
  })
})

describe('saveRunResult', () => {
  it('writes the record, and gives up quietly with no database', async () => {
    const { db, store } = fakeDb()

    expect(await saveRunResult(STATS, { id: 'bt-1', at: 1 }, { db })).toMatchObject({ id: 'bt-1' })
    expect(store.get('bt-1').net).toBe(12.5)

    expect(await saveRunResult(null, {}, { db })).toBeNull()
    expect(await saveRunResult(STATS, {}, { db: null })).toBeNull()
  })
})

describe('listRuns', () => {
  it('returns the archive newest first, capped', async () => {
    const { db } = fakeDb([
      { id: 'old', at: 100 },
      { id: 'new', at: 300 },
      { id: 'mid', at: 200 },
    ])

    // Newest first: the run somebody wants to compare against is almost always the last
    // one they did.
    expect((await listRuns({ db })).map((r) => r.id)).toEqual(['new', 'mid', 'old'])
    expect((await listRuns({ db, limit: 2 })).map((r) => r.id)).toEqual(['new', 'mid'])

    expect(await listRuns({ db: null })).toEqual([])
    expect(RUN_LIMIT).toBe(100)
    expect(RUN_STORE).toBe('runs')
  })
})

describe('deleteRun', () => {
  it('forgets one run and refuses an empty id', async () => {
    const { db, store } = fakeDb([{ id: 'bt-1', at: 1 }])

    expect(await deleteRun('bt-1', { db })).toBe(true)
    expect(store.has('bt-1')).toBe(false)

    expect(await deleteRun('', { db })).toBe(false)
    expect(await deleteRun('bt-1', { db: null })).toBe(false)
  })
})
