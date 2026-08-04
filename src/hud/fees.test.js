import { describe, it, expect, beforeEach } from 'vitest'
import {
  scheduleFor,
  feeForFill,
  addFee,
  burnRate,
  feesVsPnl,
  recordFee,
  flushFees,
  resetFees,
  FEE_SCHEDULE,
  BURN_FLOOR_MS,
} from './fees.js'
import { appendRealization, resetLedger } from '../positions/ledger.js'
import { appState, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetFees()
  resetLedger()
  resetState()
})

describe('scheduleFor', () => {
  it('prices a perpetual differently from spot, which is a third of the cost', () => {
    expect(scheduleFor('okx', 'BTC-USDT')).toEqual({ maker: 8, taker: 10 })
    expect(scheduleFor('okx', 'BTC-USDT-SWAP')).toEqual({ maker: 2, taker: 5 })

    expect(scheduleFor('etoro', 'BTC').maker).toBe(100)

    // An unknown venue is priced as OKX rather than as free: a zero-fee estimate is the
    // one error that makes a losing strategy look profitable.
    expect(scheduleFor('nope', 'BTC-USDT')).toEqual(FEE_SCHEDULE.okx.spot)
    expect(scheduleFor()).toEqual(FEE_SCHEDULE.okx.spot)
  })
})

describe('feeForFill', () => {
  it('lets the venue’s own charge win over any estimate of it', () => {
    // What actually left the account beats what the rate card says it should have been.
    expect(feeForFill({ fee: -0.42, qty: 1, px: 50000, venue: 'okx' })).toEqual({
      amount: 0.42,
      estimated: false,
    })

    // Nothing billed yet: 1 × 50000 taker at 5bp on a swap.
    expect(feeForFill({ qty: 1, px: 50000, venue: 'okx', instrument: 'BTC-USDT-SWAP' })).toEqual({
      amount: 25,
      estimated: true,
    })
    // The maker side of the same fill.
    expect(
      feeForFill({ qty: 1, px: 50000, venue: 'okx', instrument: 'BTC-USDT-SWAP', maker: true })
        .amount,
    ).toBe(10)

    expect(feeForFill({ qty: 0, px: 50000 })).toEqual({ amount: 0, estimated: false })
    expect(feeForFill(null).amount).toBe(0)
  })
})

describe('addFee', () => {
  it('accumulates, and counts what is still only an estimate', () => {
    const first = addFee(null, { amount: 2, estimated: true })
    expect(first).toEqual({ total: 2, count: 1, estimated: 1 })

    expect(addFee(first, { amount: 3 })).toEqual({ total: 5, count: 2, estimated: 1 })

    // A zero or junk fee is not a fill to count.
    expect(addFee(first, { amount: 0 })).toEqual(first)
    expect(addFee(first, { amount: NaN })).toEqual(first)
  })
})

describe('burnRate', () => {
  it('refuses to extrapolate an hour from the first ninety seconds', () => {
    // 10 in half an hour is 20 an hour.
    expect(burnRate(10, 1800000)).toBe(20)

    // Ninety seconds of trading would extrapolate to 400/h — arithmetically true and
    // practically a lie, so the floor prices it as five minutes instead.
    expect(burnRate(10, 90000)).toBe(120)
    expect(BURN_FLOOR_MS).toBe(300000)

    expect(burnRate(0, 1800000)).toBe(0)
    expect(burnRate(10, 0)).toBe(0)
    expect(burnRate(10, NaN)).toBe(0)
  })
})

describe('feesVsPnl', () => {
  it('shows fees eating the gross, including the day where they ate all of it', () => {
    expect(feesVsPnl(25, 100)).toBe(0.25)
    // A losing day is still measured against the size of what was made and lost.
    expect(feesVsPnl(25, -100)).toBe(0.25)

    // Fees paid with nothing made is total burn; calling that zero would hide the worst
    // version of the number.
    expect(feesVsPnl(25, 0)).toBe(1)
    expect(feesVsPnl(0, 100)).toBe(0)
    // Capped, so the tile cannot print a five-digit ratio off one scratch trade.
    expect(feesVsPnl(1000, 0.01)).toBe(9.99)
  })
})

describe('recordFee', () => {
  it('keeps the running total across fills', () => {
    recordFee({ qty: 1, px: 50000, venue: 'okx', instrument: 'BTC-USDT-SWAP' })
    const after = recordFee({ fee: 5 })

    expect(after).toEqual({ total: 30, count: 2, estimated: 1 })
  })
})

describe('flushFees', () => {
  it('lets what the venue billed outrank what the desk estimated', () => {
    appendRealization({ amount: 100, fee: 20, ts: 0 })
    recordFee({ qty: 1, px: 10000, venue: 'okx', instrument: 'BTC-USDT-SWAP' })

    const fees = flushFees({ now: 3600000, since: 0 })
    tick()

    // Billed 20, estimated 5 — the larger is the real one, and taking it never counts the
    // same fill twice.
    expect(fees.total).toBe(20)
    expect(fees.rate).toBe(20)
    expect(fees.ratio).toBe(0.2)
    expect(fees.tone).toBe('ok')
    expect(appState.ui.fees).toMatchObject({
      totalLabel: '20.0',
      rateLabel: '20.0/h',
      estimated: 1,
      barPct: 20,
    })

    // Past half the gross, fees are the business rather than a cost of it.
    appendRealization({ amount: 10, fee: 60, ts: 1000 })
    expect(flushFees({ now: 3600000, since: 0 }).tone).toBe('warn')
  })
})

describe('resetFees', () => {
  it('starts the next session from nothing', () => {
    recordFee({ fee: 5 })

    expect(resetFees()).toBe(true)
    expect(recordFee({ fee: 2 }).total).toBe(2)
  })
})
