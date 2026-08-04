import { describe, it, expect, beforeEach } from 'vitest'
import {
  holdTime,
  formatHold,
  slippage,
  sumFees,
  maeMfe,
  netPnl,
  rMultiple,
  enrichTrade,
  refreshJournalRows,
} from './metrics.js'
import { recordTick, resetTicks } from './ticks.js'
import { appState, tick, resetState } from '../app/engine.js'

const TRADE = {
  instrument: 'BTC-USDT',
  side: 'long',
  qty: 2,
  entryPx: 100,
  exitPx: 110,
  openTs: 1000,
  closeTs: 4000,
  pnl: 20,
  entryFills: [{ qty: 2, px: 100, intentPx: 99.5, fee: 1 }],
  exitFills: [{ qty: -2, px: 110, intentPx: 110.5, fee: 1 }],
}

beforeEach(() => {
  resetTicks()
  resetState()
})

describe('holdTime', () => {
  it('never reports a negative duration, whatever the clocks did', () => {
    expect(holdTime(TRADE)).toBe(3000)

    // A negative duration sorts to the top of every "longest held" view and means nothing.
    expect(holdTime({ openTs: 4000, closeTs: 1000 })).toBe(0)
    expect(holdTime(null)).toBe(0)
  })
})

describe('formatHold', () => {
  it('changes unit with the scale, because a scalp is not measured in hours', () => {
    expect(formatHold(420)).toBe('420ms')
    expect(formatHold(3500)).toBe('3.5s')
    expect(formatHold(95000)).toBe('1m35s')
    expect(formatHold(3 * 3600000 + 7 * 60000)).toBe('3h07m')

    expect(formatHold(-5)).toBe('0ms')
  })
})

describe('slippage', () => {
  it('costs the chase on both legs and ignores a fill with no intent', () => {
    // Paid 0.5 above the intent on 2 units in, received 0.5 below it on the way out.
    expect(slippage(TRADE)).toBe(2)

    // A fill with no captured intent contributes nothing rather than zero-as-perfect —
    // counting unknowns as perfect flatters the number exactly where it should not.
    expect(slippage({ entryFills: [{ qty: 2, px: 100 }], exitFills: [] })).toBe(0)
    expect(slippage(null)).toBe(0)
  })
})

describe('sumFees', () => {
  it('adds both legs as a cost, whichever sign the venue reported', () => {
    expect(sumFees(TRADE)).toBe(2)
    expect(sumFees({ entryFills: [{ fee: -3 }], exitFills: [{ fee: 1 }] })).toBe(4)
    expect(sumFees(null)).toBe(0)
  })
})

describe('maeMfe', () => {
  it('separates "never in trouble" from "gave it all back"', () => {
    const trail = [{ ts: 1500, px: 96 }, { ts: 2500, px: 115 }, { ts: 3500, px: 104 }]

    // 4 against and 15 in favour, on 2 units.
    expect(maeMfe(TRADE, trail)).toEqual({ mae: -8, mfe: 30, marks: 3 })

    // A short is measured the other way round, or every winning short reads as a disaster.
    expect(maeMfe({ ...TRADE, side: 'short' }, trail).mfe).toBe(8)

    // No trail is no claim: a trade older than the ring reports no excursion rather than a
    // reconstructed one.
    expect(maeMfe(TRADE, [])).toEqual({ mae: 0, mfe: 0, marks: 0 })

    recordTick('BTC-USDT', 96, 1500)
    expect(maeMfe(TRADE).marks).toBe(1)
  })
})

describe('netPnl', () => {
  it('is the only number that pays for anything', () => {
    expect(netPnl(TRADE)).toBe(18)
    expect(netPnl({ pnl: 5 })).toBe(5)
    expect(netPnl(null)).toBe(0)
  })
})

describe('rMultiple', () => {
  it('refuses to invent a risk that was never tagged', () => {
    // 18 net against 2 units risked 1 wide.
    expect(rMultiple(TRADE, 1)).toBe(9)
    expect(rMultiple({ ...TRADE, stopDist: 2 })).toBe(4.5)

    // An assumed risk would be comparable across trades that never shared an assumption.
    expect(rMultiple(TRADE)).toBe(0)
    expect(rMultiple(TRADE, 0)).toBe(0)
  })
})

describe('enrichTrade', () => {
  it('carries every metric on the row so nothing is recomputed downstream', () => {
    const row = enrichTrade(TRADE, [{ ts: 2000, px: 90 }])

    expect(row).toMatchObject({
      hold: 3000,
      holdLabel: '3.0s',
      slippage: 2,
      fees: 2,
      net: 18,
      mae: -20,
      mfe: 0,
      r: 0,
    })
    expect(row.instrument).toBe('BTC-USDT')
  })
})

describe('refreshJournalRows', () => {
  it('publishes newest first and re-derives rather than freezing at close', () => {
    recordTick('BTC-USDT', 90, 2000)

    const rows = refreshJournalRows([{ ...TRADE, id: 'a' }, { ...TRADE, id: 'b' }])
    tick()

    expect(rows.map((row) => row.id)).toEqual(['b', 'a'])
    // The excursion of a trade closed a second ago is still filling in; a number frozen at
    // close would be wrong in the one direction nobody checks.
    expect(appState.journal.rows[0].mae).toBe(-20)
  })
})
