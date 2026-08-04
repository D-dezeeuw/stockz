// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  MAX_COMBOS,
  SWEEP_SORTS,
  poolSize,
  expandParamGrid,
  defaultGrid,
  sweepRow,
  heatRatio,
  sweepView,
  publishSweep,
  runSweep,
  setSweepSort,
  applyComboParams,
  resetSweep,
  registerSweepActions,
} from './sweep.js'
import { findBacktestStrategy } from './strategies.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { clearActions, actionNames } from '../actions/registry.js'

/** A run double: net P&L is the lookback, so the best combo is knowable. */
function fakeRun(seen = []) {
  return async (config) => {
    seen.push(config.params)
    const net = Number(Object.values(config.params ?? {})[0]) || 0
    return {
      strategyId: config.strategyId,
      fills: [
        { side: 'buy', size: 1, price: 100, ts: 1, fee: 0 },
        { side: 'sell', size: 1, price: 100 + net, ts: 2, fee: 0 },
      ],
    }
  }
}

beforeEach(() => {
  resetState()
  resetSweep()
  clearActions()
})

describe('poolSize', () => {
  it('leaves the desk two cores, and never takes the whole machine', () => {
    expect(poolSize(8)).toBe(6)
    expect(poolSize(4)).toBe(2)

    // A sweep that takes every core turns a live ladder into a slideshow, and the ladder
    // is the product.
    expect(poolSize(64)).toBe(8)
    expect(poolSize(1)).toBe(1)
    expect(poolSize(0)).toBe(2)
    expect(poolSize(undefined)).toBeGreaterThan(0)
  })
})

describe('expandParamGrid', () => {
  it('takes the cartesian product and says what the cap dropped', () => {
    expect(expandParamGrid({ a: [1, 2], b: ['x', 'y'] })).toEqual({
      total: 4,
      dropped: 0,
      combos: [
        { a: 1, b: 'x' },
        { a: 1, b: 'y' },
        { a: 2, b: 'x' },
        { a: 2, b: 'y' },
      ],
    })

    // Truncated at the end rather than sampled: a capped sweep is a prefix somebody can
    // extend, not a random subset they would have to re-run to reproduce.
    const big = expandParamGrid({ a: [1, 2, 3], b: [1, 2, 3] }, 4)
    expect(big.combos).toHaveLength(4)
    expect(big.dropped).toBe(5)
    expect(big.total).toBe(9)

    // A scalar is a range of one, which is how a fixed parameter joins a sweep.
    expect(expandParamGrid({ a: 5, b: [1, 2] }).combos).toEqual([{ a: 5, b: 1 }, { a: 5, b: 2 }])

    expect(expandParamGrid({ a: [] })).toEqual({ combos: [], dropped: 0, total: 0 })
    expect(expandParamGrid(null)).toEqual({ combos: [], dropped: 0, total: 0 })
    expect(MAX_COMBOS).toBe(200)
  })
})

describe('defaultGrid', () => {
  it('derives a readable grid from the strategy schema, centred on its defaults', () => {
    const grid = defaultGrid(findBacktestStrategy('momentum-burst'))
    const keys = Object.keys(grid)

    // Two params, so the table stays something a human reads rather than a thousand runs
    // nobody looks at.
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.length).toBeLessThanOrEqual(2)
    // The tick budget is plumbing, not an idea: sweeping it would burn the grid on a
    // number that changes nothing about whether the strategy earns.
    expect(keys).not.toContain('budgetMs')
    for (const values of Object.values(grid)) expect(values.length).toBeGreaterThan(1)

    const wide = defaultGrid(
      { params: { x: { kind: 'number', min: 0, max: 100, default: 50, step: 1 } } },
      { values: 3, params: 1 },
    )
    expect(wide.x).toEqual([25, 50, 75])

    // A strategy with nothing numeric to sweep produces an empty grid rather than a
    // grid of one nonsense value.
    expect(defaultGrid({ params: { mode: { kind: 'select' } } })).toEqual({})
    expect(defaultGrid(null)).toEqual({})
  })
})

describe('sweepRow', () => {
  it('carries raw numbers to sort by and labels to render', () => {
    const row = sweepRow({ trades: 3, net: 12.345, expectancy: 4.1, winRate: 0.667, maxDrawdown: 2 }, { a: 1, b: 2 }, 7)

    expect(row).toMatchObject({
      id: 'combo-7',
      index: 7,
      label: 'a=1 b=2',
      trades: 3,
      net: 12.345,
      // Both, because the raw ones sort and the labels render — sorting a string column is
      // how "10" ends up above "9".
      netLabel: '12.35',
      winLabel: '67%',
      ddLabel: '2.00',
    })

    expect(sweepRow(null, null, 0)).toMatchObject({ id: 'combo-0', net: 0, label: '' })
  })
})

describe('heatRatio', () => {
  it('places a row between the worst and the best, and refuses a false gradient', () => {
    expect(heatRatio(5, 0, 10)).toBe(0.5)
    expect(heatRatio(0, 0, 10)).toBe(0)
    expect(heatRatio(10, 0, 10)).toBe(1)
    expect(heatRatio(50, 0, 10)).toBe(1)

    // A sweep where every combo scored the same is not a gradient — colouring it would
    // invent a winner out of rounding.
    expect(heatRatio(3, 3, 3)).toBe(0.5)
    expect(heatRatio(null, null, null)).toBe(0.5)
  })
})

describe('sweepView', () => {
  it('sorts by the asked column and marks the winner', () => {
    const rows = [sweepRow({ net: 1, trades: 9 }, { a: 1 }, 0), sweepRow({ net: 5, trades: 2 }, { a: 2 }, 1)]

    const byNet = sweepView(rows)
    expect(byNet.map((r) => r.net)).toEqual([5, 1])
    expect(byNet[0].best).toBe(true)
    expect(byNet[0].heatPct).toBe(100)
    expect(byNet[1].heatPct).toBe(0)

    expect(sweepView(rows, { key: 'trades', dir: 'desc' }).map((r) => r.trades)).toEqual([9, 2])
    expect(sweepView(rows, { key: 'net', dir: 'asc' }).map((r) => r.net)).toEqual([1, 5])

    // An unknown column falls back to net rather than to an arbitrary order.
    expect(sweepView(rows, { key: 'nonsense' }).map((r) => r.net)).toEqual([5, 1])
    expect(sweepView(null)).toEqual([])
    expect(SWEEP_SORTS).toContain('expectancy')
  })
})

describe('publishSweep', () => {
  it('merges onto its own copy so two writes in one turn both land', () => {
    publishSweep({ total: 10, active: true })
    // `setValue` lands next tick, so a version that merged onto appState would drop the
    // first of these.
    publishSweep({ done: 3 })
    tick()

    expect(appState.backtest.sweep).toEqual({ done: 3, total: 10, active: true })
  })
})

describe('runSweep', () => {
  it('runs every combo, streams rows in as they land, and caps the grid out loud', async () => {
    const seen = []
    const rows = await runSweep(
      { strategyId: 'momentum-burst', sessionId: 'rec-1', grid: { lookback: [1, 2, 3] } },
      { run: fakeRun(seen), pool: 2 },
    )
    tick()

    expect(seen).toEqual([{ lookback: 1 }, { lookback: 2 }, { lookback: 3 }])
    expect(rows).toHaveLength(3)
    expect(appState.backtest.sweepRows).toHaveLength(3)
    // Sorted best-first in the view, so the winner is the top row without a click.
    expect(appState.backtest.sweepView[0].net).toBe(3)
    expect(appState.backtest.sweep).toMatchObject({ done: 3, total: 3, active: false })

    // The cap actually limits the work rather than only the table: a sweep that quietly
    // ran a third of the grid and reported a winner is worse than one that refused.
    const capped = []
    const cappedRows = await runSweep(
      { strategyId: 'momentum-burst', grid: { lookback: [1, 2, 3] }, cap: 1 },
      { run: fakeRun(capped), pool: 1 },
    )
    tick()
    expect(capped).toEqual([{ lookback: 1 }])
    expect(cappedRows).toHaveLength(1)

    // An unknown strategy and an empty grid both refuse rather than run nothing quietly.
    expect(await runSweep({ strategyId: 'nope' }, { run: fakeRun() })).toEqual([])
    expect(await runSweep({ strategyId: 'noop', grid: {} }, { run: fakeRun() })).toEqual([])
  })
})

describe('setSweepSort', () => {
  it('flips the active column and starts a new one descending', () => {
    setValue(PATHS.backtest.sweepRows, [sweepRow({ net: 1 }, { a: 1 }, 0), sweepRow({ net: 5 }, { a: 2 }, 1)])
    tick()

    // Clicking the active column flips it.
    expect(setSweepSort(null, { key: 'net' })).toEqual({ key: 'net', dir: 'asc' })
    tick()
    expect(appState.backtest.sweepView.map((r) => r.net)).toEqual([1, 5])

    // A new column starts descending: the interesting end of every column here is the top.
    expect(setSweepSort(null, { key: 'trades' })).toEqual({ key: 'trades', dir: 'desc' })
    expect(setSweepSort(null, { key: 'nonsense' }).key).toBe('trades')
  })
})

describe('applyComboParams', () => {
  it('merges the winning params into the strategy without discarding the rest', () => {
    setValue(PATHS.backtest.config, { strategyId: 'momentum-burst' })
    setValue(PATHS.backtest.sweepRows, [sweepRow({ net: 5 }, { lookback: 20 }, 0)])
    setValue(PATHS.settings.strategyParams, { 'momentum-burst': { budgetMs: 4, threshold: 9 } })
    tick()

    expect(applyComboParams(null, { id: 'combo-0' })).toEqual({ lookback: 20 })
    tick()
    // Merged, not replaced: the sweep varied one parameter, and the others the trader
    // tuned by hand are not the sweep's to discard.
    expect(appState.settings.strategyParams['momentum-burst']).toEqual({
      budgetMs: 4,
      threshold: 9,
      lookback: 20,
    })

    expect(applyComboParams(null, { index: 0 })).toEqual({ lookback: 20 })
    expect(applyComboParams(null, { id: 'combo-9' })).toBeNull()
  })
})

describe('resetSweep', () => {
  it('forgets the running sweep', () => {
    publishSweep({ done: 4, total: 4, active: true })
    expect(resetSweep()).toBe(true)

    publishSweep({})
    tick()
    expect(appState.backtest.sweep).toEqual({ done: 0, total: 0, active: false })
  })
})

describe('registerSweepActions', () => {
  it('binds the run, the sort and the apply', () => {
    expect(registerSweepActions()).toEqual(['backtest.sweep', 'backtest.sortSweep', 'backtest.applyCombo'])
    expect(actionNames().sort()).toEqual(['backtest.applyCombo', 'backtest.sortSweep', 'backtest.sweep'])
  })
})
