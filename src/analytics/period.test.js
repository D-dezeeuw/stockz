// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  PERIODS,
  periodRange,
  filterByPeriod,
  currentPeriod,
  scopeToPeriod,
  setPeriod,
  cyclePeriod,
  mountPeriod,
  registerPeriodActions,
} from './period.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { clearActions, actionNames } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'

// Wednesday 12 August 2026, 14:30 local. Mid-week and mid-month on purpose: a fixture on a
// Monday or the 1st would let a broken week/month start pass unnoticed.
const NOW = new Date(2026, 7, 12, 14, 30).getTime()
const at = (y, m, d, h = 12) => new Date(y, m, d, h).getTime()

beforeEach(() => {
  resetState()
  clearActions()
})

describe('periodRange', () => {
  it('starts weeks on Monday and months on the 1st, and leaves all time unbounded', () => {
    expect(periodRange('day', NOW).from).toBe(at(2026, 7, 12, 0))

    // Monday, because a week that reset on Sunday afternoon is a week nobody recognises.
    // The 12th is a Wednesday, so this week began on the 10th.
    expect(periodRange('week', NOW).from).toBe(at(2026, 7, 10, 0))
    expect(new Date(periodRange('week', NOW).from).getDay()).toBe(1)

    expect(periodRange('month', NOW).from).toBe(at(2026, 7, 1, 0))

    // Genuinely unbounded rather than a very large window: a ninety-day "all time" is a
    // number that silently becomes wrong once somebody's history outgrows it.
    expect(periodRange('all', NOW)).toEqual({ from: -Infinity, to: Infinity, label: 'all time' })
    expect(periodRange('nonsense', NOW).from).toBe(-Infinity)
    expect(PERIODS).toEqual(['day', 'week', 'month', 'all'])
  })
})

describe('filterByPeriod', () => {
  it('keeps the trades that closed inside the bounds', () => {
    const trades = [
      { id: 'a', closeTs: at(2026, 7, 12) },
      { id: 'b', closeTs: at(2026, 7, 9) },
      { id: 'c', closeTs: at(2026, 6, 20) },
    ]

    expect(filterByPeriod(trades, periodRange('day', NOW)).map((t) => t.id)).toEqual(['a'])
    expect(filterByPeriod(trades, periodRange('week', NOW)).map((t) => t.id)).toEqual(['a'])
    expect(filterByPeriod(trades, periodRange('month', NOW)).map((t) => t.id)).toEqual(['a', 'b'])

    // An unbounded range is a pass-through, not a filter that happens to match everything.
    expect(filterByPeriod(trades, periodRange('all', NOW))).toHaveLength(3)
    expect(filterByPeriod(trades, {})).toHaveLength(3)
    expect(filterByPeriod(null, periodRange('day', NOW))).toEqual([])
  })
})

describe('currentPeriod', () => {
  it('reads the period in force and refuses anything that is not one', () => {
    expect(currentPeriod({})).toBe('all')
    expect(currentPeriod({ period: 'week' })).toBe('week')

    // A value that is not a period must not narrow the dashboard to nothing.
    expect(currentPeriod({ period: 'fortnight' })).toBe('all')
    expect(currentPeriod(undefined)).toBe('all')
  })
})

describe('scopeToPeriod', () => {
  it('narrows a trade list to whatever period is in force', () => {
    const trades = [{ closeTs: at(2026, 7, 12) }, { closeTs: at(2026, 6, 20) }]

    setValue(PATHS.analytics.period, 'all')
    tick()
    expect(scopeToPeriod(trades, NOW)).toHaveLength(2)

    setValue(PATHS.analytics.period, 'day')
    tick()
    expect(scopeToPeriod(trades, NOW)).toHaveLength(1)
  })
})

describe('setPeriod', () => {
  it('writes a real period and falls back rather than blanking the dashboard', () => {
    expect(setPeriod('week')).toBe('week')
    tick()
    expect(appState.analytics.period).toBe('week')

    // 'all' rather than '' for an unknown value: an empty period would scope every chart to
    // nothing and read as a desk that had never traded.
    expect(setPeriod('fortnight')).toBe('all')
    tick()
    expect(appState.analytics.period).toBe('all')
  })
})

describe('cyclePeriod', () => {
  it('wraps in both directions, because four values want a loop not an end stop', () => {
    setPeriod('day')
    tick()

    expect(cyclePeriod(1)).toBe('week')
    tick()
    expect(cyclePeriod(1)).toBe('month')
    tick()
    expect(cyclePeriod(1)).toBe('all')
    tick()
    // Round the end rather than stopping there.
    expect(cyclePeriod(1)).toBe('day')
    tick()
    expect(cyclePeriod(-1)).toBe('all')
  })
})

describe('mountPeriod', () => {
  it('recomputes every analytics number when the period moves', () => {
    const watched = []
    let refreshed = 0

    mountPeriod({
      watch: (paths, fn) => (watched.push({ paths, fn }), () => {}),
      refresh: () => (refreshed += 1),
    })

    // Watched rather than called from setPeriod, so the control, the hotkey and a restored
    // value all land the same way.
    expect(watched[0].paths).toEqual([PATHS.analytics.period])
    watched[0].fn()
    expect(refreshed).toBe(1)
  })
})

describe('registerPeriodActions', () => {
  it('registers the control and the hotkey against one behaviour', () => {
    expect(registerPeriodActions()).toEqual([
      ACTIONS.analytics.setPeriod,
      ACTIONS.analytics.cyclePeriod,
    ])
    expect(actionNames()).toContain('analytics.setPeriod')
    expect(actionNames()).toContain('analytics.cyclePeriod')
  })
})
