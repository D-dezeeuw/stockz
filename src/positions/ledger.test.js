import { describe, it, expect, beforeEach } from 'vitest'
import {
  parseFee,
  appendRealization,
  netRealized,
  sessionKey,
  rolloverIfNewSession,
  ledger,
  flushLedger,
  resetLedger,
  currentSession,
  LEDGER_CAP,
} from './ledger.js'
import { appState, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetLedger()
  resetState()
})

describe('parseFee', () => {
  it('makes a cost a positive cost, whichever sign the venue used', () => {
    // OKX reports fees as negative (money leaving), EToro as positive. One convention
    // here, or netting adds fees to profit on one venue and subtracts them on the other.
    expect(parseFee({ fillFee: -0.42, fillFeeCcy: 'usdt' })).toEqual({
      amount: 0.42,
      currency: 'USDT',
    })
    expect(parseFee({ fee: 0.42, feeCcy: 'USD' })).toEqual({ amount: 0.42, currency: 'USD' })

    expect(parseFee({})).toEqual({ amount: 0, currency: '' })
    expect(parseFee(null).amount).toBe(0)
  })
})

describe('appendRealization', () => {
  it('keeps the day in order and bounded', () => {
    appendRealization({ instrument: 'BTC-USDT', amount: 12, fee: -0.2, ts: 1000, qty: 1 })
    appendRealization({ instrument: 'BTC-USDT', amount: -3, fee: -0.2, ts: 2000, qty: 1 })

    expect(ledger()).toHaveLength(2)
    expect(ledger()[0]).toEqual({
      ts: 1000,
      instrument: 'BTC-USDT',
      qty: 1,
      amount: 12,
      fee: 0.2,
    })

    // A realisation with no amount is not a realisation.
    expect(appendRealization({ instrument: 'X' })).toHaveLength(2)

    // Bounded: a day of scalping, not a career.
    for (let i = 0; i < LEDGER_CAP + 10; i += 1) appendRealization({ amount: 1, ts: i })
    expect(ledger()).toHaveLength(LEDGER_CAP)
  })
})

describe('netRealized', () => {
  it('reports the number that decides whether the day was worth having', () => {
    appendRealization({ amount: 12, fee: 0.2 })
    appendRealization({ amount: -3, fee: 0.2 })
    appendRealization({ amount: 5, fee: 0.2 })

    // A hundred scalps at a two-tick edge and a one-tick fee is a loss that looks like a
    // win on gross — so net is the headline.
    expect(netRealized()).toEqual({
      gross: 14,
      fees: Number((0.6).toFixed(8)),
      net: Number((13.4).toFixed(8)),
      count: 3,
      wins: 2,
    })

    expect(netRealized([])).toMatchObject({ gross: 0, net: 0, count: 0 })
    expect(netRealized(null).count).toBe(0)
  })
})

describe('sessionKey', () => {
  it('cuts the day where the trader\'s day starts, not at UTC midnight', () => {
    const at = Date.UTC(2026, 7, 4, 2, 0, 0)

    expect(sessionKey(at, 0)).toBe('2026-08-04')
    // With a session starting at 08:00 UTC, 02:00 still belongs to the previous day —
    // rolling at midnight would cut an Asian session in half.
    expect(sessionKey(at, 8)).toBe('2026-08-03')

    expect(sessionKey(Date.UTC(2026, 7, 4, 12), 8)).toBe('2026-08-04')
    expect(sessionKey(NaN)).toBe('')
  })
})

describe('rolloverIfNewSession', () => {
  it('wipes the score exactly once when the day turns over', () => {
    const day1 = Date.UTC(2026, 7, 4, 10)
    const day2 = Date.UTC(2026, 7, 5, 10)

    // The first read is not a rollover: booting into a fresh session should not report
    // wiping a scoreboard that never existed.
    expect(rolloverIfNewSession(day1)).toEqual({ rolled: false, day: '2026-08-04' })
    appendRealization({ amount: 12 })

    expect(rolloverIfNewSession(day1).rolled).toBe(false)
    expect(ledger()).toHaveLength(1)

    expect(rolloverIfNewSession(day2)).toEqual({ rolled: true, day: '2026-08-05' })
    expect(ledger()).toEqual([])
    expect(currentSession()).toBe('2026-08-05')

    expect(rolloverIfNewSession(NaN).rolled).toBe(false)
  })
})

describe('ledger', () => {
  it('hands back a copy, so a caller cannot rewrite the day', () => {
    appendRealization({ amount: 1 })
    const copy = ledger()
    copy.push({ amount: 999 })

    expect(ledger()).toHaveLength(1)
  })
})

describe('flushLedger', () => {
  it('publishes the score and the most recent closes, newest first', () => {
    appendRealization({ instrument: 'BTC-USDT', amount: 12, fee: 0.2, ts: 1000 })
    appendRealization({ instrument: 'ETH-USDT', amount: -3, fee: 0.2, ts: 2000 })

    const score = flushLedger()
    tick()

    expect(score.net).toBe(Number((8.6).toFixed(8)))
    expect(appState.trade.dayPnl).toBe(score.net)
    expect(appState.trade.score).toMatchObject({ count: 2, wins: 1 })
    // Newest first: the last close is the one being looked at.
    expect(appState.trade.ledger[0].instrument).toBe('ETH-USDT')
  })
})

describe('resetLedger', () => {
  it('clears the day and the session it belonged to', () => {
    rolloverIfNewSession(Date.UTC(2026, 7, 4, 10))
    appendRealization({ amount: 1 })

    expect(resetLedger()).toBe(true)
    expect(ledger()).toEqual([])
    expect(currentSession()).toBe('')
  })
})

describe('currentSession', () => {
  it('names the session the ledger belongs to', () => {
    expect(currentSession()).toBe('')

    rolloverIfNewSession(Date.UTC(2026, 7, 4, 10))
    expect(currentSession()).toBe('2026-08-04')
  })
})
