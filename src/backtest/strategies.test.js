import { describe, it, expect } from 'vitest'
import { BACKTEST_STRATEGIES, findBacktestStrategy, backtestStrategyOptions } from './strategies.js'

describe('findBacktestStrategy', () => {
  it('resolves a listed id and refuses anything else', () => {
    expect(findBacktestStrategy('momentum-burst')?.id).toBe('momentum-burst')
    expect(findBacktestStrategy('vol-squeeze')?.id).toBe('vol-squeeze')

    // Null rather than a fallback: a typo'd id scoring a different strategy under the
    // requested name is the one failure mode a backtest cannot survive.
    expect(findBacktestStrategy('momentum')).toBeNull()
    expect(findBacktestStrategy('')).toBeNull()
    expect(findBacktestStrategy(undefined)).toBeNull()

    // The composite blends live signals other runs are publishing, which do not exist in a
    // recording — it would score as flat forever, so it is not offered.
    expect(findBacktestStrategy('composite')).toBeNull()

    expect(findBacktestStrategy('x', null)).toBeNull()
    expect(BACKTEST_STRATEGIES.length).toBeGreaterThan(5)
  })
})

describe('backtestStrategyOptions', () => {
  it('describes the catalog as id/name rows the picker can render', () => {
    const rows = backtestStrategyOptions()

    expect(rows).toHaveLength(BACKTEST_STRATEGIES.length)
    expect(rows[0]).toEqual({ id: 'momentum-burst', name: expect.any(String) })
    // Every row nameable: an option with a blank label is a picker entry nobody can choose
    // deliberately.
    for (const row of rows) expect(row.name.length).toBeGreaterThan(0)

    expect(backtestStrategyOptions([{ id: 'x' }])).toEqual([{ id: 'x', name: 'x' }])
    expect(backtestStrategyOptions(null)).toEqual([])
  })
})
