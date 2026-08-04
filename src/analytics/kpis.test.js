import { describe, it, expect, beforeEach } from 'vitest'
import {
  splitOutcomes,
  winRate,
  avgWin,
  avgLoss,
  expectancy,
  profitFactor,
  kpiLabel,
  kpiTiles,
  toneOf,
  refreshKpis,
} from './kpis.js'
import { appState, tick, resetState } from '../app/engine.js'

const TRADES = [
  { id: 'a', net: 10 },
  { id: 'b', net: 20 },
  { id: 'c', net: -5 },
  { id: 'd', net: 0 },
]

beforeEach(() => {
  resetState()
})

describe('splitOutcomes', () => {
  it('leaves scratches out of both buckets', () => {
    const split = splitOutcomes(TRADES)

    expect(split.wins.map((trade) => trade.id)).toEqual(['a', 'b'])
    expect(split.losses.map((trade) => trade.id)).toEqual(['c'])
    // A desk that scratched half its trades would otherwise report fifty percent while
    // making nothing at all.
    expect(split.decided).toBe(3)

    expect(splitOutcomes(null).decided).toBe(0)
  })
})

describe('winRate', () => {
  it('is null with nothing decided, because zero would be a quiet lie', () => {
    expect(winRate(TRADES)).toBeCloseTo(0.6667, 4)

    // A desk that has not traded has no win rate, and a red 0% for somebody who simply has
    // not started is a readout nobody should trust.
    expect(winRate([])).toBeNull()
    expect(winRate([{ net: 0 }])).toBeNull()
  })
})

describe('avgWin', () => {
  it('averages only the winners', () => {
    expect(avgWin(TRADES)).toBe(15)
    expect(avgWin([{ net: -1 }])).toBeNull()
  })
})

describe('avgLoss', () => {
  it('stays negative, so expectancy is not a sum of two positives', () => {
    expect(avgLoss(TRADES)).toBe(-5)
    expect(avgLoss([{ net: 1 }])).toBeNull()
  })
})

describe('expectancy', () => {
  it('answers whether the process pays over enough repetitions', () => {
    // Two thirds of +15 and one third of -5.
    expect(expectancy(TRADES)).toBeCloseTo(8.3333, 3)

    // All winners so far: the loss term contributes nothing rather than breaking.
    expect(expectancy([{ net: 4 }])).toBe(4)
    expect(expectancy([])).toBeNull()
  })
})

describe('profitFactor', () => {
  it('says infinite rather than inventing a number for a desk with no losers', () => {
    expect(profitFactor(TRADES)).toBe(6)

    // Four winners and no losers has not proven anything, and ∞ reads as "not enough data"
    // to anybody sensible.
    expect(profitFactor([{ net: 3 }])).toBe(Infinity)
    expect(profitFactor([])).toBeNull()
  })
})

describe('kpiLabel', () => {
  it('prints the honest blank rather than a zero', () => {
    expect(kpiLabel(null)).toBe('—')
    expect(kpiLabel(Infinity, 'x')).toBe('∞')
    expect(kpiLabel(0.6667, 'pct')).toBe('67%')
    expect(kpiLabel(1.5, 'x')).toBe('1.50×')
    expect(kpiLabel(-3.2)).toBe('-3.20')
    expect(kpiLabel(3.2)).toBe('+3.20')
    expect(kpiLabel(NaN)).toBe('—')
  })
})

describe('toneOf', () => {
  it('calls break-even flat, not good news dressed in green', () => {
    expect(toneOf(1)).toBe('up')
    expect(toneOf(-1)).toBe('down')
    expect(toneOf(0)).toBe('flat')
    expect(toneOf(null)).toBe('flat')
  })
})

describe('kpiTiles', () => {
  it('never reds the win rate on the rate alone', () => {
    const tiles = kpiTiles(TRADES)

    expect(tiles.map((tile) => tile.id)).toEqual([
      'winRate',
      'expectancy',
      'profitFactor',
      'payoff',
    ])
    expect(tiles[0].value).toBe('67%')
    expect(tiles[0].note).toBe('2W / 1L')
    // A 40% win rate with a 3:1 payoff is a fine strategy, so the rate alone never goes red.
    expect(tiles[0].tone).toBe('info')
    expect(tiles[2].value).toBe('6.00×')
    expect(tiles[2].tone).toBe('up')

    expect(kpiTiles([])[0].value).toBe('—')
    expect(kpiTiles([])[2].tone).toBe('flat')
  })
})

describe('refreshKpis', () => {
  it('publishes what the tiles bind to', () => {
    expect(refreshKpis(TRADES)).toHaveLength(4)
    tick()

    expect(appState.analytics.kpis[1]).toMatchObject({ id: 'expectancy', tone: 'up' })
  })
})
