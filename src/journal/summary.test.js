import { describe, it, expect, beforeEach } from 'vitest'
import {
  dayKey,
  groupByDay,
  daySummary,
  dailyRows,
  refreshDays,
  toggleDay,
  registerSummaryActions,
} from './summary.js'
import { ACTIONS } from '../actions/names.js'
import { clearActions } from '../actions/registry.js'
import { appState, tick, resetState } from '../app/engine.js'

const DAY_ONE = Date.UTC(2026, 7, 3, 14)
const DAY_TWO = Date.UTC(2026, 7, 4, 9)

const TRADES = [
  { id: 'a', closeTs: DAY_ONE, net: 10, pnl: 12, fees: 2, hold: 2000 },
  { id: 'b', closeTs: DAY_ONE + 60000, net: -4, pnl: -3, fees: 1, hold: 6000 },
  { id: 'c', closeTs: DAY_ONE + 90000, net: 0, pnl: 1, fees: 1, hold: 1000 },
  { id: 'd', closeTs: DAY_TWO, net: 6, pnl: 7, fees: 1, hold: 4000 },
]

beforeEach(() => {
  resetState()
  clearActions()
})

describe('dayKey', () => {
  it('keys on UTC, matching the session rollover the rest of the desk uses', () => {
    expect(dayKey({ closeTs: DAY_ONE })).toBe('2026-08-03')

    // A local key would split one session across two rows for anyone trading through their
    // own midnight, and each half would look like a quiet day.
    expect(dayKey({ closeTs: Date.UTC(2026, 7, 3, 23, 59) })).toBe('2026-08-03')

    expect(dayKey({ closeTs: 0 })).toBe('')
    expect(dayKey(null)).toBe('')
  })
})

describe('groupByDay', () => {
  it('buckets by close and drops what never closed', () => {
    const days = groupByDay(TRADES)

    expect([...days.keys()]).toEqual(['2026-08-03', '2026-08-04'])
    expect(days.get('2026-08-03')).toHaveLength(3)

    expect(groupByDay([{ net: 1 }]).size).toBe(0)
    expect(groupByDay(null).size).toBe(0)
  })
})

describe('daySummary', () => {
  it('counts a scratch as neither, or the win rate flatters a desk making nothing', () => {
    const day = daySummary(TRADES.slice(0, 3))

    expect(day.trades).toBe(3)
    expect(day.wins).toBe(1)
    expect(day.losses).toBe(1)
    // One win, one loss, one scratch: fifty percent, not thirty-three.
    expect(day.winRate).toBe(0.5)
    // Formatted here, because the desk's percentage formatter signs its output and a win
    // rate reading "+0.50%" is a number nobody trusts.
    expect(day.winRateLabel).toBe('50%')

    expect(day.gross).toBe(10)
    expect(day.fees).toBe(4)
    expect(day.net).toBe(6)
    // The gap between gross and net is usually the whole story, so it is a field rather
    // than something the reader subtracts.
    expect(day.feeShare).toBe(0.4)
    expect(day.avgHold).toBe(3000)
    expect(day.maxWin).toBe(10)
    expect(day.maxLoss).toBe(-4)

    expect(daySummary([]).winRate).toBe(0)
    expect(daySummary([]).winRateLabel).toBe('—')
  })
})

describe('dailyRows', () => {
  it('puts the newest day first and marks today', () => {
    const rows = dailyRows(TRADES, DAY_TWO)

    expect(rows.map((row) => row.day)).toEqual(['2026-08-04', '2026-08-03'])
    expect(rows[0].today).toBe(true)
    expect(rows[1].today).toBe(false)
    expect(rows[1].rows).toHaveLength(3)

    expect(dailyRows(TRADES)[0].today).toBe(false)
  })
})

describe('refreshDays', () => {
  it('publishes the summary without shipping every trade twice', () => {
    const rows = refreshDays(TRADES, DAY_TWO)
    tick()

    expect(rows).toHaveLength(2)
    // The sublist renders from the filtered list the block already holds; shipping both
    // would double the largest array in state.
    expect(appState.journal.days[0].rows).toBeUndefined()
    expect(appState.journal.days[0]).toMatchObject({ day: '2026-08-04', net: 6, today: true })
  })
})

describe('toggleDay', () => {
  it('keeps one day open, because every day expanded is the list summaries replaced', () => {
    expect(toggleDay('2026-08-03')).toBe('2026-08-03')
    tick()
    expect(appState.journal.openDay).toBe('2026-08-03')

    expect(toggleDay('2026-08-04')).toBe('2026-08-04')
    tick()
    // Clicking the open one closes it.
    expect(toggleDay('2026-08-04')).toBe('')
  })
})

describe('registerSummaryActions', () => {
  it('binds the day toggle', () => {
    expect(registerSummaryActions()).toBe(ACTIONS.journal.toggleDay)
  })
})
