import { describe, it, expect, beforeEach } from 'vitest'
import {
  midFor,
  multiplierFor,
  floatingPnl,
  toAccountCcy,
  fmtPnl,
  pnlClass,
  priceBook,
} from './pnl.js'
import { applyBookFrame, resetBooks } from '../book/state.js'
import { publishTick, resetBus } from '../pipeline/bus.js'
import { makePosition } from './math.js'
import { setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetBooks()
  resetBus()
  resetState()
})

describe('midFor', () => {
  it('marks at what the position could be closed at, falling back honestly', () => {
    applyBookFrame('BTC-USDT', {
      action: 'snapshot',
      bids: [[100, 1]],
      asks: [[101, 1]],
      seqId: 1,
    })
    expect(midFor('BTC-USDT')).toEqual({ mark: 100.5, source: 'mid' })

    // A one-sided book still marks: the resting side is a real price someone would
    // trade at, and it beats no mark at all.
    applyBookFrame('ETH-USDT', { action: 'snapshot', bids: [[10, 1]], seqId: 1 })
    expect(midFor('ETH-USDT')).toEqual({ mark: 10, source: 'bid' })

    // No book at all falls back to the tape.
    publishTick({ symbol: 'SOL-USDT', px: 25, ts: 1, venue: 'okx' })
    expect(midFor('SOL-USDT')).toEqual({ mark: 25, source: 'last' })

    expect(midFor('NOTHING')).toEqual({ mark: 0, source: 'none' })
  })
})

describe('multiplierFor', () => {
  it('uses the contract value where there is one, since a swap is not one unit', () => {
    const meta = { 'BTC-USDT-SWAP': { ctVal: 0.01 }, 'BTC-USDT': {} }

    expect(multiplierFor('okx', 'BTC-USDT-SWAP', meta)).toBe(0.01)
    // Spot is one-for-one.
    expect(multiplierFor('okx', 'BTC-USDT', meta)).toBe(1)
    expect(multiplierFor('okx', 'UNKNOWN', meta)).toBe(1)
    expect(multiplierFor('okx', 'BTC-USDT-SWAP', null)).toBe(1)
  })
})

describe('floatingPnl', () => {
  it('scales by the multiplier, which is what a swap P&L is out by without it', () => {
    const long = makePosition({ qty: 100, avgPx: 30000 })

    expect(floatingPnl(long, 30010, 1)).toBe(1000)
    // 100 contracts of 0.01 BTC each is 1 BTC, so a $10 move is $10.
    expect(floatingPnl(long, 30010, 0.01)).toBe(10)

    expect(floatingPnl(long, 30010, 0)).toBe(1000)
    expect(floatingPnl(makePosition(), 30010, 1)).toBe(0)
  })
})

describe('toAccountCcy', () => {
  it('converts with a cached rate and leaves the number readable without one', () => {
    const fx = { account: 'USDT', rates: { EURUSDT: 1.1 } }

    expect(toAccountCcy(100, 'USDT', fx)).toBe(100)
    expect(toAccountCcy(100, 'EUR', fx)).toBe(110)

    // No cached rate means no conversion, not a guess: an FX fetch on the hot path costs
    // more than the number is worth, and a wrong rate is worse than an unconverted one.
    expect(toAccountCcy(100, 'JPY', fx)).toBe(100)
    expect(toAccountCcy(100, undefined, fx)).toBe(100)
    expect(toAccountCcy('x', 'EUR', fx)).toBe(0)
  })
})

describe('fmtPnl', () => {
  it('signs the profits too, so a column of numbers reads at a glance', () => {
    expect(fmtPnl(12.4)).toBe('+12.40')
    expect(fmtPnl(-3.1)).toBe('−3.10')

    // Zero wears no sign; a "+0.00" reads as a win that is not there.
    expect(fmtPnl(0)).toBe('0.00')
    expect(fmtPnl(0.001)).toBe('0.00')

    expect(fmtPnl(1.23456, 4)).toBe('+1.2346')
    expect(fmtPnl(NaN)).toBe('—')
  })
})

describe('pnlClass', () => {
  it('colours only a real result', () => {
    expect(pnlClass(1)).toBe('pnl pnl--up')
    expect(pnlClass(-1)).toBe('pnl pnl--down')
    expect(pnlClass(0)).toBe('pnl')
    expect(pnlClass(NaN)).toBe('pnl')
  })
})

describe('priceBook', () => {
  it('marks every position and hands the template everything it needs', () => {
    applyBookFrame('BTC-USDT', {
      action: 'snapshot',
      bids: [[100, 1]],
      asks: [[101, 1]],
      seqId: 1,
    })
    setValue('market.instrumentMeta', { 'BTC-USDT': {} })
    tick()

    const rows = priceBook([
      makePosition({ venue: 'okx', instrument: 'BTC-USDT', qty: 2, avgPx: 90 }),
      makePosition({ venue: 'okx', instrument: 'NOTHING', qty: 1, avgPx: 50 }),
    ])

    expect(rows[0]).toMatchObject({
      mark: 100.5,
      markSource: 'mid',
      side: 'long',
      unrealized: 21,
      unrealizedLabel: '+21.00',
      pnlClass: 'pnl pnl--up',
    })

    // An unmarkable position reports zero rather than a made-up P&L.
    expect(rows[1]).toMatchObject({ mark: 0, markSource: 'none', unrealized: 0 })
    expect(priceBook(null)).toEqual([])
  })
})
