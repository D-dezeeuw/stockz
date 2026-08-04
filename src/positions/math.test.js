import { describe, it, expect } from 'vitest'
import {
  makePosition,
  sideOf,
  avgEntryAfterAdd,
  realizedFrom,
  splitFlipFill,
  applyFill,
  unrealizedPnl,
  DUST,
} from './math.js'

describe('makePosition', () => {
  it('starts flat with every field a P&L calculation needs', () => {
    expect(makePosition({ venue: 'okx', instrument: 'BTC-USDT' })).toEqual({
      venue: 'okx',
      instrument: 'BTC-USDT',
      qty: 0,
      avgPx: 0,
      realized: 0,
      fees: 0,
      openedAt: 0,
      mark: 0,
    })

    expect(makePosition({ qty: -2, avgPx: 100 })).toMatchObject({ qty: -2, avgPx: 100 })
    expect(makePosition()).toMatchObject({ qty: 0 })
  })
})

describe('sideOf', () => {
  it('derives the side from the sign rather than storing it twice', () => {
    expect(sideOf(1)).toBe('long')
    expect(sideOf(-1)).toBe('short')
    expect(sideOf(0)).toBe('flat')

    // Float residue from a closed position is flat, not a microscopic long.
    expect(sideOf(DUST / 2)).toBe('flat')
    expect(sideOf(NaN)).toBe('flat')
  })
})

describe('avgEntryAfterAdd', () => {
  it('weights by size, which is what the naive version gets wrong', () => {
    // Overwriting the entry with the last fill price would say 110 here.
    expect(avgEntryAfterAdd(1, 100, 1, 110)).toBe(105)
    expect(avgEntryAfterAdd(3, 100, 1, 120)).toBe(105)

    // A short's average moves the same way: the sign is carried by the quantity, and
    // letting it into this arithmetic drifts the average the wrong way.
    expect(avgEntryAfterAdd(-1, 100, -1, 110)).toBe(105)

    expect(avgEntryAfterAdd(0, 0, 2, 100)).toBe(100)
    expect(avgEntryAfterAdd(1, 100, -1, 110)).toBe(0)
  })
})

describe('realizedFrom', () => {
  it('books a short\'s profit when it closes below entry, not above', () => {
    expect(realizedFrom(2, 100, 110, 'long')).toBe(20)
    expect(realizedFrom(2, 100, 90, 'long')).toBe(-20)

    // The sign flip that gets dropped, turning a winning short into a reported loss.
    expect(realizedFrom(2, 100, 90, 'short')).toBe(20)
    expect(realizedFrom(2, 100, 110, 'short')).toBe(-20)

    expect(realizedFrom(0, 100, 110, 'long')).toBe(0)
    expect(realizedFrom(2, 0, 110, 'long')).toBe(0)
  })
})

describe('splitFlipFill', () => {
  it('cuts a through-zero fill into the close and the open it really is', () => {
    // Long 1, sell 3: closes the 1 and opens a short 2.
    expect(splitFlipFill(1, -3)).toEqual({ closing: -1, opening: -2, flips: true })
    expect(splitFlipFill(-2, 5)).toEqual({ closing: 2, opening: 3, flips: true })

    // A plain reduce does not flip.
    expect(splitFlipFill(3, -1)).toEqual({ closing: -1, opening: 0, flips: false })
    // An add is all opening.
    expect(splitFlipFill(1, 2)).toEqual({ closing: 0, opening: 2, flips: false })
    expect(splitFlipFill(0, 2)).toEqual({ closing: 0, opening: 2, flips: false })
  })
})

describe('applyFill', () => {
  it('adds, reduces and flips — each priced the way the position actually moved', () => {
    const flat = makePosition({ venue: 'okx', instrument: 'BTC-USDT' })

    // Open.
    const opened = applyFill(flat, { qty: 2, px: 100, fee: 0.1, ts: 1000 })
    expect(opened.position).toMatchObject({ qty: 2, avgPx: 100, fees: 0.1, openedAt: 1000 })
    expect(opened.realized).toBe(0)

    // Add: the average moves, nothing is booked.
    const added = applyFill(opened.position, { qty: 2, px: 110 })
    expect(added.position).toMatchObject({ qty: 4, avgPx: 105 })
    expect(added.realized).toBe(0)

    // Reduce: the entry stays put — what remains was opened at the same average — and
    // the difference is booked.
    const reduced = applyFill(added.position, { qty: -2, px: 115 })
    expect(reduced.position).toMatchObject({ qty: 2, avgPx: 105, realized: 20 })
    expect(reduced.realized).toBe(20)

    // Flip: closes the rest, books it, and opens the other way at the flip price.
    const flipped = applyFill(reduced.position, { qty: -5, px: 120, ts: 2000 })
    expect(flipped.position).toMatchObject({ qty: -3, avgPx: 120, openedAt: 2000 })
    expect(flipped.realized).toBe(30)
    expect(flipped.position.realized).toBe(50)

    // Fully closed: flat, and the average goes with it.
    const closed = applyFill(flipped.position, { qty: 3, px: 110 })
    expect(closed.position).toMatchObject({ qty: 0, avgPx: 0 })
    expect(closed.realized).toBe(30)

    expect(applyFill(flat, { qty: 0, px: 100 }).position.qty).toBe(0)
    expect(applyFill(flat, { qty: 1, px: 0 }).realized).toBe(0)
  })
})

describe('unrealizedPnl', () => {
  it('marks a position to price, both ways round', () => {
    const long = makePosition({ qty: 2, avgPx: 100 })
    expect(unrealizedPnl(long, 110)).toBe(20)
    expect(unrealizedPnl(long, 90)).toBe(-20)

    const short = makePosition({ qty: -2, avgPx: 100 })
    expect(unrealizedPnl(short, 90)).toBe(20)
    expect(unrealizedPnl(short, 110)).toBe(-20)

    // Flat has nothing to mark, and no mark means nothing to mark against.
    expect(unrealizedPnl(makePosition(), 110)).toBe(0)
    expect(unrealizedPnl(long, 0)).toBe(0)
  })
})
