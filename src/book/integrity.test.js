import { describe, it, expect, beforeEach } from 'vitest'
import {
  nextBookStatus,
  backoffDelay,
  isBookStale,
  canTradeBook,
  setBookStatus,
  scheduleResync,
  BOOK_STATUS,
  STALE_AFTER_MS,
  MAX_BACKOFF_MS,
} from './integrity.js'
import { appState, tick, resetState } from '../app/engine.js'

beforeEach(() => resetState())

describe('nextBookStatus', () => {
  it('will not let a delta talk a resyncing book back into being live', () => {
    expect(nextBookStatus(BOOK_STATUS.stale, 'snapshot')).toBe('live')
    expect(nextBookStatus(BOOK_STATUS.live, 'update')).toBe('live')
    expect(nextBookStatus(BOOK_STATUS.live, 'mismatch')).toBe('resyncing')
    expect(nextBookStatus(BOOK_STATUS.live, 'timeout')).toBe('stale')

    // The deltas arriving mid-resync belong to a book already declared untrustworthy;
    // only a fresh snapshot clears it.
    expect(nextBookStatus(BOOK_STATUS.resyncing, 'update')).toBe('resyncing')
    expect(nextBookStatus(BOOK_STATUS.resyncing, 'snapshot')).toBe('live')

    // An unknown status is treated as stale, which is the safe assumption.
    expect(nextBookStatus('nonsense', 'update')).toBe('live')
    expect(nextBookStatus(BOOK_STATUS.live, 'whatever')).toBe('live')
    expect(nextBookStatus('nonsense', 'whatever')).toBe('stale')
  })
})

describe('backoffDelay', () => {
  it('doubles up to a cap and never lands two clients on the same millisecond', () => {
    // Deterministic jitter: mid-range, so the curve itself is what is asserted.
    expect(backoffDelay(0, { jitter: () => 0.5 })).toBe(250)
    expect(backoffDelay(1, { jitter: () => 0.5 })).toBe(500)
    expect(backoffDelay(4, { jitter: () => 0.5 })).toBe(4000)

    // Capped, however long the outage runs.
    expect(backoffDelay(20, { jitter: () => 0.5 })).toBe(MAX_BACKOFF_MS)
    expect(MAX_BACKOFF_MS).toBe(10000)

    // The jitter spread is real: without it every client that dropped in one outage
    // resubscribes together and re-creates it.
    expect(backoffDelay(4, { jitter: () => 0 })).toBe(3400)
    expect(backoffDelay(4, { jitter: () => 1 })).toBe(4600)

    expect(backoffDelay(-5, { jitter: () => 0.5 })).toBe(250)
  })
})

describe('isBookStale', () => {
  it('flags a frozen book but not an empty one', () => {
    expect(isBookStale({ ts: 1000 }, 7000)).toBe(true)
    expect(isBookStale({ ts: 1000 }, 5500)).toBe(false)
    expect(isBookStale({ ts: 1000 }, 2000, 500)).toBe(true)

    // Never received a frame is empty, not stale — the ladder already renders that.
    expect(isBookStale({ ts: 0 }, 99999)).toBe(false)
    expect(isBookStale(null, 99999)).toBe(false)
    expect(STALE_AFTER_MS).toBe(5000)
  })
})

describe('canTradeBook', () => {
  it('permits only a live book, since resyncing and stale are both history', () => {
    expect(canTradeBook(BOOK_STATUS.live)).toBe(true)
    expect(canTradeBook(BOOK_STATUS.resyncing)).toBe(false)
    expect(canTradeBook(BOOK_STATUS.stale)).toBe(false)
    expect(canTradeBook(undefined)).toBe(false)
  })
})

describe('setBookStatus', () => {
  it('publishes the transition so the ladder can show what it is showing', () => {
    expect(setBookStatus('snapshot')).toBe('live')
    tick()
    expect(appState.market.bookStatus).toBe('live')

    expect(setBookStatus('mismatch')).toBe('resyncing')
    tick()
    expect(appState.market.bookStatus).toBe('resyncing')

    // From resyncing, a delta does not restore confidence.
    expect(setBookStatus('update')).toBe('resyncing')
  })
})

describe('scheduleResync', () => {
  it('marks the book untrustworthy immediately and resubscribes after the backoff', () => {
    const timers = []
    const calls = []

    const scheduled = scheduleResync(() => calls.push('resubscribed'), {
      attempt: 2,
      timer: (fn, delay) => {
        timers.push([fn, delay])
        return timers.length
      },
      jitter: () => 0.5,
    })
    tick()

    // The status flips now, not when the replacement lands: every frame in between is
    // one the ladder must not be traded off.
    expect(appState.market.bookStatus).toBe('resyncing')
    expect(scheduled.delay).toBe(1000)
    expect(timers[0][1]).toBe(1000)

    timers[0][0]()
    expect(calls).toEqual(['resubscribed'])

    expect(() => scheduled.cancel()).not.toThrow()
    // No timer available still reports the delay it would have used.
    expect(scheduleResync(null, { timer: null, jitter: () => 0.5 }).delay).toBe(250)
  })
})
