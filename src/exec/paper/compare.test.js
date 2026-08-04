// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  splitByBook,
  bookStats,
  refreshBookCompare,
  mountBookChart,
  startBookCompare,
} from './compare.js'
import { appState, setValue, tick, resetState } from '../../app/engine.js'
import { PATHS } from '../../state/paths.js'

const TRADES = [
  { net: 5, closeTs: 300, paper: true },
  { net: -2, closeTs: 200, paper: true },
  { net: 1, closeTs: 100 },
]

/** A canvas double that records the draw calls it was asked for. */
function fakeCanvas() {
  const calls = []
  const ctx = new Proxy(
    { setTransform: () => {}, clearRect: () => calls.push('clear') },
    { get: (t, k) => t[k] ?? ((...a) => calls.push(`${String(k)}(${a.length})`)), set: () => true },
  )
  return { calls, canvas: { clientWidth: 200, clientHeight: 60, style: {}, getContext: () => ctx } }
}

beforeEach(() => {
  resetState()
  setValue(PATHS.analytics.trades, [])
  tick()
})

describe('splitByBook', () => {
  it('sorts trades into practice and real, defaulting to real', () => {
    expect(splitByBook(TRADES)).toEqual({
      paper: [TRADES[0], TRADES[1]],
      live: [TRADES[2]],
    })

    // Anything untagged is real: a trade that lost its flag must not quietly join the
    // practice pile, where a loss stops counting.
    expect(splitByBook([{ net: 1 }]).live).toHaveLength(1)
    expect(splitByBook([{ net: 1, paper: false }]).live).toHaveLength(1)
    expect(splitByBook(null)).toEqual({ paper: [], live: [] })
  })
})

describe('bookStats', () => {
  it('scores one book with the same functions the backtest report uses', () => {
    const stats = bookStats([
      { net: 5, closeTs: 300 },
      { net: -2, closeTs: 200 },
    ])

    expect(stats).toMatchObject({ trades: 2, wins: 1, losses: 1, net: 3, expectancy: 1.5 })
    expect(stats.curve).toHaveLength(2)
    // Oldest first: the journal reads newest-first, and a curve drawn in that order runs
    // backwards.
    expect(stats.curve[0].equity).toBe(-2)

    expect(bookStats([])).toMatchObject({ trades: 0, net: 0 })
    expect(bookStats(null).curve).toEqual([])
  })
})

describe('refreshBookCompare', () => {
  it('reads live against paper, and says which book is empty', () => {
    const view = refreshBookCompare(TRADES)
    tick()

    const by = Object.fromEntries(view.rows.map((r) => [r.key, r]))
    expect(by.trades).toMatchObject({ paper: '2', live: '1', delta: '-1' })
    expect(by.net).toMatchObject({ paper: '3.00', live: '1.00', delta: '-2.00', tone: 'down' })

    // Lower is better for drawdown, so the sign and the tone disagree on purpose.
    expect(by.maxDrawdown.tone).toBe('up')
    expect(view.curves).toHaveLength(2)
    expect(appState.trade.bookCompare.rows).toHaveLength(5)

    // Said plainly: "no live trades yet" and "live made nothing" look identical in a row
    // of zeros.
    expect(refreshBookCompare([{ net: 1, paper: true }]).hint).toBe('no live trades yet')
    expect(refreshBookCompare([{ net: 1 }]).hint).toBe('no practice trades yet')
    expect(refreshBookCompare(null).hint).toBe('no practice trades yet')
  })
})

describe('mountBookChart', () => {
  it('reuses the overlay renderer rather than growing a second one', () => {
    const { calls, canvas } = fakeCanvas()
    const redraw = mountBookChart(canvas, {
      curves: () => [[{ i: 0, equity: 1 }, { i: 1, equity: 3 }], [{ i: 0, equity: -1 }]],
    })

    redraw()
    expect(calls).toContain('clear')
    // Two curves plus the zero line: neither book was skipped.
    expect(calls.filter((c) => c.startsWith('stroke')).length).toBe(3)

    expect(mountBookChart(null)()).toBeUndefined()
  })
})

describe('startBookCompare', () => {
  it('recomputes when the journal moves, and stops when told', () => {
    const { calls, canvas } = fakeCanvas()
    const frames = []
    let fire = null
    const stop = startBookCompare({
      doc: { getElementById: (id) => (id === 'book-canvas' ? canvas : null) },
      raf: (fn) => frames.push(fn),
      watch: (paths, fn) => {
        fire = fn
        expect(paths).toContain(PATHS.analytics.trades)
        return () => (fire = null)
      },
    })
    tick()

    expect(calls).toContain('clear')
    setValue(PATHS.analytics.trades, TRADES)
    tick()
    fire()
    tick()
    expect(appState.trade.bookCompare.rows).toHaveLength(5)

    stop()
    expect(fire).toBeNull()
    expect(typeof startBookCompare({ doc: { getElementById: () => null }, watch: () => () => {} })).toBe(
      'function',
    )
  })
})
