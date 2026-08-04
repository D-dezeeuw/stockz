import { describe, it, expect, beforeEach } from 'vitest'
import {
  createSignalRing,
  appendSignal,
  snapshotRing,
  ringStats,
  exportSignals,
  resetHistory,
  SIGNAL_HISTORY,
} from './history.js'
import { DIR, normalizeSignal, publishSignal } from './signal.js'
import { resetState } from '../app/engine.js'

/** A distinct signal per call, so the repeat guard never swallows a fixture. */
function sig(dir, ts, reason = String(ts)) {
  return { dir, ts, reason, action: dir === DIR.LONG ? 'buy' : 'sell', strength: 1 }
}

beforeEach(() => {
  resetHistory()
  resetState()
})

describe('createSignalRing', () => {
  it('gives each run its own bound, so a chatty one cannot evict a quiet one', () => {
    const a = createSignalRing('a@x')

    expect(a.capacity).toBe(SIGNAL_HISTORY)
    // The same run gets the same ring; a new one per call would lose the history it holds.
    expect(createSignalRing('a@x')).toBe(a)
    expect(createSignalRing('b@x')).not.toBe(a)
    expect(createSignalRing('')).toBeNull()
  })
})

describe('appendSignal', () => {
  it('drops a repeat of the same call, which would otherwise fill the whole ring', () => {
    appendSignal('a@x', sig(DIR.LONG, 1, 'stretched'))
    appendSignal('a@x', sig(DIR.LONG, 2, 'stretched'))
    appendSignal('a@x', sig(DIR.LONG, 3, 'stretched'))

    // A strategy holding one opinion for ten seconds would otherwise evict the ten
    // decisions before it.
    expect(snapshotRing('a@x')).toHaveLength(1)

    appendSignal('a@x', sig(DIR.SHORT, 4, 'flipped'))
    expect(snapshotRing('a@x')).toHaveLength(2)
    expect(appendSignal('', sig(DIR.LONG, 5)).ts).toBe(5)
  })
})

describe('snapshotRing', () => {
  it('unrolls to plain data, oldest first, and wraps without losing order', () => {
    for (let i = 0; i < SIGNAL_HISTORY + 5; i += 1) appendSignal('a@x', sig(DIR.LONG, i))

    const rows = snapshotRing('a@x')
    expect(rows).toHaveLength(SIGNAL_HISTORY)
    expect(rows[0].ts).toBe(5)
    expect(rows.at(-1).ts).toBe(SIGNAL_HISTORY + 4)

    expect(snapshotRing('a@x', 3).map((r) => r.ts)).toEqual([
      SIGNAL_HISTORY + 2,
      SIGNAL_HISTORY + 3,
      SIGNAL_HISTORY + 4,
    ])
    expect(snapshotRing('nobody')).toEqual([])
  })
})

describe('ringStats', () => {
  it('says what a run has actually been calling, not just its last word', () => {
    appendSignal('a@x', sig(DIR.LONG, 1))
    appendSignal('a@x', sig(DIR.SHORT, 2))
    appendSignal('a@x', sig(DIR.LONG, 3))
    appendSignal('a@x', { dir: DIR.FLAT, ts: 4, reason: 'quiet' })

    expect(ringStats(snapshotRing('a@x'))).toEqual({
      long: 2,
      short: 1,
      flat: 1,
      total: 4,
      lastTs: 4,
    })

    expect(ringStats([])).toEqual({ long: 0, short: 0, flat: 0, total: 0, lastTs: 0 })
    expect(ringStats(null).total).toBe(0)
  })
})

describe('exportSignals', () => {
  it('reads across runs as one timeline, which insertion order would only be by accident', () => {
    appendSignal('a@x', sig(DIR.LONG, 10))
    appendSignal('b@x', sig(DIR.SHORT, 5))
    appendSignal('a@x', sig(DIR.SHORT, 20))

    expect(exportSignals().map((r) => r.ts)).toEqual([5, 10, 20])
    expect(exportSignals().map((r) => r.runKey)).toEqual(['b@x', 'a@x', 'a@x'])

    expect(exportSignals({ runKey: 'a@x' }).map((r) => r.ts)).toEqual([10, 20])
    expect(exportSignals({ from: 10 }).map((r) => r.ts)).toEqual([10, 20])
    expect(exportSignals({ to: 10 }).map((r) => r.ts)).toEqual([5, 10])
    expect(exportSignals({ limit: 1 }).map((r) => r.ts)).toEqual([20])
  })
})

describe('resetHistory', () => {
  it('forgets every run, so a new session starts empty', () => {
    appendSignal('a@x', sig(DIR.LONG, 1))

    expect(resetHistory()).toBe(true)
    expect(exportSignals()).toEqual([])
  })
})

describe('history on publish', () => {
  it('is appended by the same call that publishes, so no emission path can miss it', () => {
    publishSignal('a@x', normalizeSignal({ action: 'buy', reason: 'edge' }, { now: 1000 }))
    publishSignal('a@x', normalizeSignal({ action: 'sell', reason: 'flip' }, { now: 2000 }))

    expect(snapshotRing('a@x').map((r) => r.dir)).toEqual([DIR.LONG, DIR.SHORT])
  })
})
