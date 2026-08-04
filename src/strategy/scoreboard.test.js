import { describe, it, expect, beforeEach } from 'vitest'
import {
  emptyStats,
  recordFire,
  recordOutcome,
  statsRollup,
  scoreboard,
  flushScoreboard,
  attributeClose,
  resetScoreboard,
  restoreScoreboard,
  saveScoreboard,
} from './scoreboard.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetScoreboard()
  resetState()
})

describe('emptyStats', () => {
  it('starts every column at zero, so a strategy with no trades reads as no trades', () => {
    expect(emptyStats('momentum-burst')).toEqual({
      strategyId: 'momentum-burst',
      fires: 0,
      closes: 0,
      wins: 0,
      net: 0,
      holdMs: 0,
      firstTs: 0,
      lastTs: 0,
    })
  })
})

describe('recordFire', () => {
  it('does not count a strategy closing as a strategy firing', () => {
    expect(recordFire({ strategyId: 'a', instrument: 'okx:BTC-USDT', action: 'buy', ts: 1000 })).toMatchObject({
      fires: 1,
      firstTs: 1000,
    })

    // Counting 'flat' would double the fire count of every strategy that exits by signal.
    expect(recordFire({ strategyId: 'a', action: 'flat', ts: 2000 })).toBeNull()
    expect(recordFire({ strategyId: 'a', action: 'none', ts: 2000 })).toBeNull()
    expect(recordFire({ action: 'buy' })).toBeNull()
  })
})

describe('recordOutcome', () => {
  it('counts the money even where it cannot match the fire, but not a fake hold time', () => {
    recordFire({ strategyId: 'a', instrument: 'okx:BTC-USDT', action: 'buy', ts: 1000 })

    const row = recordOutcome({ strategyId: 'a', instrument: 'okx:BTC-USDT', amount: 5, ts: 4000 })
    expect(row).toMatchObject({ closes: 1, wins: 1, net: 5, holdMs: 3000 })

    // A close with no matching fire still counts toward P&L — the money moved either way —
    // but averaging in a zero hold would report round trips that never happened.
    const orphan = recordOutcome({ strategyId: 'a', instrument: 'okx:ETH-USDT', amount: -2, ts: 5000 })
    expect(orphan).toMatchObject({ closes: 2, wins: 1, net: 3, holdMs: 3000 })

    expect(recordOutcome({ strategyId: 'a', amount: NaN })).toBeNull()
    expect(recordOutcome({ amount: 5 })).toBeNull()
  })
})

describe('statsRollup', () => {
  it('reports net per trade, which win rate on its own can hide entirely', () => {
    const row = {
      strategyId: 'a',
      fires: 10,
      closes: 5,
      wins: 4,
      net: -10,
      holdMs: 10000,
      firstTs: 0,
      lastTs: 3600000,
    }

    // Four wins in five and still losing money: the 80% is the number that misleads.
    expect(statsRollup(row)).toEqual({
      strategyId: 'a',
      fires: 10,
      closes: 5,
      net: -10,
      winRate: 0.8,
      perTrade: -2,
      avgHoldMs: 2000,
      firesPerHour: 10,
    })

    // A fire in the first second would otherwise extrapolate to 3600 an hour.
    expect(statsRollup({ ...row, lastTs: 500 }).firesPerHour).toBe(0)
    expect(statsRollup({ strategyId: 'a' }).perTrade).toBe(0)
  })
})

describe('scoreboard', () => {
  it('puts the earner first, because the question is which one to turn off', () => {
    recordFire({ strategyId: 'a', instrument: 'x', action: 'buy', ts: 0 })
    recordOutcome({ strategyId: 'a', instrument: 'x', amount: -5, ts: 1000 })
    recordFire({ strategyId: 'b', instrument: 'x', action: 'buy', ts: 0 })
    recordOutcome({ strategyId: 'b', instrument: 'x', amount: 12, ts: 1000 })

    expect(scoreboard().map((r) => r.strategyId)).toEqual(['b', 'a'])
    expect(scoreboard()[0].net).toBe(12)
  })
})

describe('flushScoreboard', () => {
  it('publishes labels the row can render without arithmetic', () => {
    recordFire({ strategyId: 'a', instrument: 'x', action: 'buy', ts: 0 })
    recordOutcome({ strategyId: 'a', instrument: 'x', amount: 12.5, ts: 2500 })

    const rows = flushScoreboard()
    tick()

    expect(rows[0]).toMatchObject({ netLabel: '12.5', winRateLabel: '100%', holdLabel: '2.5s', tone: 'up' })
    expect(appState.strategy.scoreboard).toHaveLength(1)
  })
})

describe('attributeClose', () => {
  it('matches on the open fire, so the order path never has to carry a strategy id', () => {
    recordFire({ strategyId: 'a', instrument: 'okx:BTC-USDT', action: 'buy', ts: 1000 })

    const row = attributeClose({ instrument: 'okx:BTC-USDT', amount: 4, ts: 3000 })
    expect(row).toMatchObject({ strategyId: 'a', net: 4, holdMs: 2000 })

    // Nothing open on that instrument is nobody's trade, not everybody's.
    expect(attributeClose({ instrument: 'okx:ETH-USDT', amount: 4 })).toBeNull()
  })
})

describe('resetScoreboard', () => {
  it('clears the day, including fires still waiting for an outcome', () => {
    recordFire({ strategyId: 'a', instrument: 'x', action: 'buy', ts: 0 })

    expect(resetScoreboard()).toBe(true)
    expect(scoreboard()).toEqual([])
    expect(attributeClose({ instrument: 'x', amount: 5 })).toBeNull()
  })
})

describe('restoreScoreboard', () => {
  it('brings the day back after a reload, ignoring rows with no strategy', () => {
    setValue('settings.strategyStats', [
      { strategyId: 'a', fires: 3, closes: 2, wins: 1, net: 7 },
      { fires: 99 },
    ])
    tick()

    expect(restoreScoreboard()).toBe(1)
    expect(scoreboard()[0]).toMatchObject({ strategyId: 'a', net: 7, closes: 2 })
    expect(restoreScoreboard(null)).toBe(0)
  })
})

describe('saveScoreboard', () => {
  it('writes the accumulators, not the derived labels, so a restore is exact', () => {
    recordFire({ strategyId: 'a', instrument: 'x', action: 'buy', ts: 1000 })
    recordOutcome({ strategyId: 'a', instrument: 'x', amount: 5, ts: 3000 })

    const saved = saveScoreboard()
    tick()

    expect(saved[0]).toMatchObject({ strategyId: 'a', net: 5, holdMs: 2000, closes: 1 })
    expect(appState.settings.strategyStats).toHaveLength(1)
  })
})
