import { describe, it, expect, beforeEach } from 'vitest'
import {
  TOP_N,
  groupByInstrument,
  rankInstruments,
  collapseTail,
  rankingScale,
  barWidth,
  refreshRanking,
  registerRankingActions,
} from './instruments.js'
import { ACTIONS } from '../actions/names.js'
import { clearActions, dispatchAction } from '../actions/registry.js'
import { appState, tick, resetState } from '../app/engine.js'

const TRADES = [
  { instrument: 'BTC-USDT', net: 10, fees: 1 },
  { instrument: 'BTC-USDT', net: -4, fees: 1 },
  { instrument: 'ETH-USDT', net: -20, fees: 2 },
  { instrument: 'SOL-USDT', net: 3, fees: 0.5 },
]

beforeEach(() => {
  resetState()
  clearActions()
})

describe('groupByInstrument', () => {
  it('totals each symbol and keeps the fees visible beside the net', () => {
    const groups = groupByInstrument(TRADES)

    expect(groups).toHaveLength(3)
    expect(groups.find((row) => row.instrument === 'BTC-USDT')).toMatchObject({
      net: 6,
      fees: 2,
      count: 2,
      wins: 1,
      losses: 1,
    })

    // A trade with no instrument belongs to no row rather than to a blank one.
    expect(groupByInstrument([{ net: 1 }])).toEqual([])
    expect(groupByInstrument(null)).toEqual([])
  })
})

describe('rankInstruments', () => {
  it('sorts by net and carries the count that qualifies it', () => {
    const ranked = rankInstruments(groupByInstrument(TRADES))

    expect(ranked.map((row) => row.instrument)).toEqual(['BTC-USDT', 'SOL-USDT', 'ETH-USDT'])
    // The count sits on every row precisely so a top line reading "1 trade" can be
    // discounted — a ranking that recommended an instrument on one sample is worse than none.
    expect(ranked[1]).toMatchObject({ count: 1, avg: 3, winRate: '100%', tone: 'up' })
    expect(ranked[2].tone).toBe('down')

    // Only scratches decides nothing.
    expect(rankInstruments([{ instrument: 'X', net: 0, count: 1, wins: 0, losses: 0 }])[0].winRate).toBe('—')
    expect(rankInstruments(null)).toEqual([])
  })
})

describe('collapseTail', () => {
  it('aggregates the tail rather than truncating it', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({
      instrument: `I${i}`,
      net: -1,
      fees: 0,
      count: 1,
    }))

    const rows = collapseTail(rankInstruments(many), 10)
    expect(rows).toHaveLength(11)
    // A list that simply stopped at ten would hide the twenty small bleeders that together
    // outweigh the instrument at the top.
    expect(rows[10]).toMatchObject({ instrument: '+4 more', net: -4, count: 4, other: true })

    expect(collapseTail(rankInstruments(many).slice(0, 3), 10)).toHaveLength(3)
    expect(TOP_N).toBe(10)
  })
})

describe('rankingScale', () => {
  it('scales on the widest bar in either direction', () => {
    expect(rankingScale(rankInstruments(groupByInstrument(TRADES)))).toBe(20)
    expect(rankingScale([])).toBe(0)
  })
})

describe('barWidth', () => {
  it('gives a tiny number a visible sliver rather than nothing', () => {
    expect(barWidth({ net: 20 }, 20)).toBe(1)
    expect(barWidth({ net: -10 }, 20)).toBe(0.5)

    // A bar of zero width reads as "no data", which is a different claim from "barely made
    // anything".
    expect(barWidth({ net: 0.0001 }, 20)).toBe(0.02)
    expect(barWidth({ net: 5 }, 0)).toBe(0)
  })
})

describe('refreshRanking', () => {
  it('publishes the collapsed list with its bars', () => {
    const rows = refreshRanking(TRADES)
    tick()

    expect(rows).toHaveLength(3)
    expect(appState.analytics.ranking[0]).toMatchObject({ instrument: 'BTC-USDT', bar: 0.3 })
    expect(appState.analytics.rankingTotal).toBe(3)
  })
})

describe('registerRankingActions', () => {
  it('jumps from a ranked bar straight into that instrument’s trades', () => {
    expect(registerRankingActions()).toEqual([
      ACTIONS.analytics.pickInstrument,
      ACTIONS.analytics.expandRanking,
    ])

    // The ranking's whole value is "which of these should I look at", and a chart that could
    // only be looked at would stop one step short.
    expect(dispatchAction(ACTIONS.analytics.pickInstrument, { instrument: 'BTC-USDT' })).toBe(
      'BTC-USDT',
    )
    tick()
    expect(appState.journal.filters.instrument).toBe('BTC-USDT')

    // The aggregated row is not an instrument and filters on nothing.
    expect(dispatchAction(ACTIONS.analytics.pickInstrument, { instrument: '+4 more', other: true })).toBe('')

    expect(dispatchAction(ACTIONS.analytics.expandRanking)).toBe(true)
    tick()
    expect(appState.analytics.rankingExpanded).toBe(true)
  })
})
