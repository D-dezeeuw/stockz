import { describe, it, expect } from 'vitest'
import { offsetsFromTicks, makeBracket, bracketPlan, oppositeLeg } from './bracket.js'

const entry = (over = {}) => ({
  symbol: 'okx:BTC-USDT',
  side: 'buy',
  size: 1,
  price: 100,
  type: 'limit',
  ...over,
})

describe('offsetsFromTicks', () => {
  it('puts the exits on the right sides, which is the whole subtlety', () => {
    // A long takes profit above and stops below.
    expect(offsetsFromTicks(100, { tpTicks: 10, slTicks: 5, tickSize: 0.1, side: 'buy' })).toEqual({
      tp: 101,
      sl: 99.5,
    })

    // A short does the exact opposite; backwards would close the trade at a loss on
    // arrival.
    expect(offsetsFromTicks(100, { tpTicks: 10, slTicks: 5, tickSize: 0.1, side: 'sell' })).toEqual({
      tp: 99,
      sl: 100.5,
    })

    // A missing leg is zero, not a price at the entry.
    expect(offsetsFromTicks(100, { tpTicks: 10, tickSize: 0.1 }).sl).toBe(0)
    expect(offsetsFromTicks(100, { tpTicks: 10 })).toEqual({ tp: 0, sl: 0 })
    expect(offsetsFromTicks(0, { tpTicks: 10, tickSize: 0.1 })).toEqual({ tp: 0, sl: 0 })
  })
})

describe('makeBracket', () => {
  it('expands one gesture into three linked orders, with reduce-only exits', () => {
    const { ok, bracket } = makeBracket(entry(), { tpTicks: 10, slTicks: 5, tickSize: 0.1 })

    expect(ok).toBe(true)
    expect(bracket.entry).toMatchObject({ side: 'buy', price: 100, size: 1 })
    expect(bracket.tp).toMatchObject({ side: 'sell', price: 101, reduceOnly: true, kind: 'tp' })
    expect(bracket.sl).toMatchObject({ side: 'sell', price: 99.5, reduceOnly: true, kind: 'sl' })

    // All three share one id, which is what makes them cancellable as a unit.
    expect(bracket.tp.bracketId).toBe(bracket.id)
    expect(bracket.sl.bracketId).toBe(bracket.id)
    // Client ids are distinct, or the venue would reject the second leg as a duplicate.
    expect(bracket.tp.clientId).not.toBe(bracket.sl.clientId)

    // A market entry has no price yet, so the exits cannot be priced from it — the
    // caller must say what to bracket around rather than have one invented.
    expect(makeBracket(entry({ type: 'market' }), { tpTicks: 10, tickSize: 0.1 }).reason).toBe(
      'no reference price',
    )
    expect(
      makeBracket(entry({ type: 'market', reference: 100 }), { tpTicks: 10, tickSize: 0.1 }).ok,
    ).toBe(true)

    // A bracket with no exits is just an order.
    expect(makeBracket(entry(), { tickSize: 0.1 }).reason).toBe('no exits')
    // A bad entry fails as an entry would, with the first thing that is wrong.
    expect(makeBracket({ size: 0 }, {}).reason).toBe('no instrument')
    expect(makeBracket(entry({ size: 0 }), { tpTicks: 10, tickSize: 0.1 }).reason).toBe('no size')
  })
})

describe('bracketPlan', () => {
  it('rides along with the entry on OKX and is engine-run on EToro', () => {
    const { bracket } = makeBracket(entry(), { tpTicks: 10, slTicks: 5, tickSize: 0.1 })

    expect(bracketPlan(bracket, 'okx')).toMatchObject({ native: true, emulated: false })
    expect(bracketPlan(bracket, 'okx').legs).toHaveLength(2)

    // EToro has no attached orders: the engine places the legs and cancels the loser.
    expect(bracketPlan(bracket, 'etoro')).toMatchObject({ native: false, emulated: true })

    // A venue with no brackets at all offers no legs rather than pretending.
    expect(bracketPlan(bracket, 'kraken')).toEqual({ native: false, emulated: false, legs: [] })
  })
})

describe('oppositeLeg', () => {
  it('names the leg that must die when the other fills', () => {
    const { bracket } = makeBracket(entry(), { tpTicks: 10, slTicks: 5, tickSize: 0.1 })

    // A take-profit that fills while its stop stays live leaves the trader short a
    // position they already closed.
    expect(oppositeLeg(bracket, 'tp')).toBe(bracket.sl)
    expect(oppositeLeg(bracket, 'sl')).toBe(bracket.tp)

    expect(oppositeLeg(bracket, 'entry')).toBeNull()
    expect(oppositeLeg(null, 'tp')).toBeNull()
  })
})
