import { describe, it, expect, beforeEach } from 'vitest'
import { applyBookFrame, bookFor, flushBook, onResync, resetBooks } from './state.js'
import { appState, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetBooks()
  resetState()
})

describe('applyBookFrame', () => {
  it('keeps a book per symbol and asks for a resync the moment one goes bad', () => {
    const asks = []
    onResync((symbol, reason) => asks.push([symbol, reason]))

    applyBookFrame('BTC-USDT', {
      action: 'snapshot',
      bids: [[100, 2]],
      asks: [[100.5, 1]],
      seqId: 1,
    })
    applyBookFrame('ETH-USDT', { action: 'snapshot', bids: [[10, 1]], seqId: 1 })

    // Two instruments, two books — a delta for one never touches the other.
    expect(bookFor('BTC-USDT').bids).toEqual([[100, 2]])
    expect(bookFor('ETH-USDT').bids).toEqual([[10, 1]])
    expect(asks).toEqual([])

    // A gap fires the resync immediately: every further frame applied to a known-bad
    // book only makes it wronger.
    applyBookFrame('BTC-USDT', { prevSeqId: 99, seqId: 100 })
    expect(asks).toEqual([['BTC-USDT', 'seq-gap']])
    expect(bookFor('BTC-USDT').valid).toBe(false)

    expect(applyBookFrame('', {}).resync).toBe(false)
  })
})

describe('bookFor', () => {
  it('answers with an empty book rather than undefined before anything arrives', () => {
    expect(bookFor('NOPE')).toMatchObject({ bids: [], asks: [], seqId: 0, valid: true })

    applyBookFrame('BTC-USDT', { action: 'snapshot', bids: [[1, 1]], seqId: 1 })
    expect(bookFor('BTC-USDT').bids).toEqual([[1, 1]])
    expect(bookFor(null).seqId).toBe(0)
  })
})

describe('flushBook', () => {
  it('writes once per frame for the focused symbol only', () => {
    applyBookFrame('BTC-USDT', { action: 'snapshot', bids: [[100, 2]], seqId: 1 })
    applyBookFrame('BTC-USDT', { bids: [[100, 5]], prevSeqId: 1, seqId: 2 })

    // Two deltas, one write — the ladder re-derives once, not twice.
    expect(flushBook('BTC-USDT')).toBe(true)
    tick()
    expect(appState.market.book.bids).toEqual([[100, 5]])

    // Nothing new since the flush: no write at all.
    expect(flushBook('BTC-USDT')).toBe(false)
    expect(flushBook('')).toBe(false)

    // A symbol nobody is looking at does not reach state.
    applyBookFrame('ETH-USDT', { action: 'snapshot', bids: [[9, 1]], seqId: 1 })
    expect(flushBook('BTC-USDT')).toBe(false)
  })
})

describe('onResync', () => {
  it('registers one handler and unregisters cleanly', () => {
    const seen = []
    const stop = onResync((symbol, reason) => seen.push(`${symbol}:${reason}`))

    applyBookFrame('BTC-USDT', { action: 'snapshot', bids: [[100, 2]], seqId: 1 })
    applyBookFrame('BTC-USDT', { prevSeqId: 50, seqId: 51 })
    expect(seen).toEqual(['BTC-USDT:seq-gap'])

    stop()
    applyBookFrame('BTC-USDT', { prevSeqId: 70, seqId: 71 })
    expect(seen).toHaveLength(1)

    // A non-function clears the handler rather than throwing on the next bad frame.
    onResync(null)
    expect(() => applyBookFrame('BTC-USDT', { prevSeqId: 80, seqId: 81 })).not.toThrow()
  })
})

describe('resetBooks', () => {
  it('forgets every book and the resync handler with them', () => {
    const seen = []
    onResync(() => seen.push('called'))
    applyBookFrame('BTC-USDT', { action: 'snapshot', bids: [[1, 1]], seqId: 1 })

    resetBooks()

    expect(bookFor('BTC-USDT').bids).toEqual([])
    applyBookFrame('BTC-USDT', { action: 'snapshot', bids: [[1, 1]], seqId: 1 })
    applyBookFrame('BTC-USDT', { prevSeqId: 99, seqId: 100 })
    expect(seen).toEqual([])
  })
})
