import { describe, it, expect, beforeEach } from 'vitest'
import {
  severityRank,
  abbreviate,
  compactMetrics,
  orderMetrics,
  refreshCompact,
  toggleCompact,
  registerCompactActions,
  SEVERITY,
  ABBREVIATIONS,
} from './compact.js'
import { ACTIONS } from '../actions/names.js'
import { dispatchAction, clearActions } from '../actions/registry.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetState()
  clearActions()
})

describe('severityRank', () => {
  it('puts an alert above a tone, because one is happening now', () => {
    expect(severityRank({ alert: true, tone: 'good' })).toBeGreaterThan(SEVERITY.bad)

    expect(severityRank({ tone: 'bad' })).toBe(SEVERITY.bad)
    // A cold streak is a bad reading wearing a different word.
    expect(severityRank({ tone: 'cold' })).toBe(SEVERITY.bad)
    expect(severityRank({ tone: 'warn' })).toBe(SEVERITY.warn)
    expect(severityRank({ tone: 'over' })).toBe(SEVERITY.warn)
    expect(severityRank({ tone: 'good' })).toBe(SEVERITY.ok)
    expect(severityRank({ tone: 'hot' })).toBe(SEVERITY.ok)

    expect(severityRank({})).toBe(SEVERITY.idle)
    expect(severityRank(null)).toBe(SEVERITY.idle)
  })
})

describe('abbreviate', () => {
  it('fits nine metrics in a row without any of them becoming a guess', () => {
    expect(abbreviate('latency')).toBe('LAT')
    expect(abbreviate('winRate')).toBe('W%')
    expect(abbreviate('fees')).toBe(ABBREVIATIONS.fees)

    // An unknown id is truncated rather than dropped: a missing cell reads as a metric
    // that is fine, which is the one thing it must never do.
    expect(abbreviate('gamma')).toBe('GAM')
    expect(abbreviate('')).toBe('')
  })
})

describe('compactMetrics', () => {
  it('reads the row off what the HUD already published, never recomputing it', () => {
    const rows = compactMetrics({
      hud: { latencyLabel: '84ms', latencyGrade: 'good', winRateLabel: '60%' },
      session: { paceLabel: '18.0', paceState: 'on', streak: 2, streakKind: 'loss' },
      fees: { totalLabel: '12.0', tone: 'warn' },
      slippage: { avg: 3 },
      spreadAlert: true,
    })

    expect(rows).toHaveLength(9)
    expect(rows[0]).toMatchObject({ id: 'latency', value: '84ms', tone: 'good' })
    expect(rows[1]).toMatchObject({ id: 'spread', alert: true })
    expect(rows.find((r) => r.id === 'streak').value).toBe('2L')
    expect(rows.find((r) => r.id === 'fees').tone).toBe('warn')

    // A HUD that has published nothing yet still renders nine cells: a strip that grows
    // as data arrives would move every reading under the trader's eye.
    expect(compactMetrics({})).toHaveLength(9)
    expect(compactMetrics().map((r) => r.id)).toContain('turnover')
  })
})

describe('orderMetrics', () => {
  it('floats the bad reading to the front and leaves the quiet ones where they were', () => {
    const ordered = orderMetrics([
      { id: 'latency', tone: 'good' },
      { id: 'exposure', tone: '' },
      { id: 'fees', tone: 'warn' },
      { id: 'spread', alert: true },
    ])

    expect(ordered.map((r) => r.id)).toEqual(['spread', 'fees', 'latency', 'exposure'])
    expect(ordered[0].label).toBe('SPR')

    // Ties keep their original order, or a quiet row reshuffles every frame and the
    // trader re-finds every cell.
    const quiet = orderMetrics([{ id: 'a', tone: '' }, { id: 'b', tone: '' }])
    expect(quiet.map((r) => r.id)).toEqual(['a', 'b'])
    expect(orderMetrics(null)).toEqual([])
  })
})

describe('refreshCompact', () => {
  it('publishes the ordered strip', () => {
    setValue('ui.spreadAlert', true)
    tick()

    const rows = refreshCompact()
    tick()

    expect(rows[0].id).toBe('spread')
    expect(appState.ui.hudRow).toHaveLength(9)
    expect(appState.ui.hudRow[0].label).toBe('SPR')
  })
})

describe('toggleCompact', () => {
  it('flips the density both ways', () => {
    expect(toggleCompact()).toBe(true)
    tick()
    expect(appState.settings.compactHud).toBe(true)

    expect(toggleCompact()).toBe(false)
    tick()
    expect(appState.settings.compactHud).toBe(false)
  })
})

describe('registerCompactActions', () => {
  it('wires the toggle to the markup', () => {
    expect(registerCompactActions()).toBe(ACTIONS.ui.toggleCompactHud)

    dispatchAction(ACTIONS.ui.toggleCompactHud)
    tick()
    expect(appState.settings.compactHud).toBe(true)
  })
})
