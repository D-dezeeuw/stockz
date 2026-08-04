// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  reportTile,
  reportTiles,
  refreshReport,
  mountReportChart,
  startReportChart,
  copyReportJson,
  registerBacktestReportActions,
} from './report.js'
import { summariseRun } from './stats.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { clearActions, actionNames } from '../actions/registry.js'

const RESULT = {
  strategyId: 'momentum-burst',
  instrument: 'BTC-USDT',
  signals: [{ side: 'buy' }, { side: 'sell' }],
  fills: [
    { side: 'buy', size: 1, price: 100, ts: 1000, fee: 0.1 },
    { side: 'sell', size: 1, price: 110, ts: 2000, fee: 0.1 },
  ],
}

/** A canvas double that records the draw calls it was asked for. */
function fakeCanvas() {
  const calls = []
  const ctx = new Proxy(
    { setTransform: () => {}, clearRect: () => calls.push('clear') },
    {
      get: (target, key) =>
        target[key] ??
        ((...args) => {
          calls.push(`${String(key)}(${args.length})`)
        }),
      set: () => true,
    },
  )

  return { calls, canvas: { clientWidth: 200, clientHeight: 80, style: {}, getContext: () => ctx } }
}

beforeEach(() => {
  resetState()
  clearActions()
})

describe('reportTile', () => {
  it('formats a number and colours it by what it means', () => {
    expect(reportTile('net', 4.567)).toEqual({ label: 'net', value: '4.57', tone: 'up' })
    expect(reportTile('net', -2)).toMatchObject({ value: '-2.00', tone: 'down' })
    expect(reportTile('trades', 12, { decimals: 0, tone: 'flat' })).toEqual({
      label: 'trades',
      value: '12',
      tone: 'flat',
    })
    expect(reportTile('win %', 62.5, { decimals: 1, suffix: '%' }).value).toBe('62.5%')

    // Infinity is a real answer — a run with no losing trade has no profit factor — and
    // rendering it as NaN would read as a bug rather than as the fact it is.
    expect(reportTile('profit factor', Infinity).value).toBe('∞')
    expect(reportTile('x', 'nonsense').value).toBe('∞')
    expect(reportTile(null, 0)).toMatchObject({ label: '', tone: 'flat' })
  })
})

describe('reportTiles', () => {
  it('lays the argument out in order: sample, money, per trade, feel, survivability', () => {
    const tiles = reportTiles(summariseRun(RESULT))

    expect(tiles.map((t) => t.label)).toEqual([
      'trades',
      'net',
      'expectancy',
      'win %',
      'max DD',
      'profit factor',
    ])
    expect(tiles[0]).toMatchObject({ value: '1', tone: 'flat' })
    expect(tiles[1]).toMatchObject({ value: '9.80', tone: 'up' })
    expect(tiles[3].value).toBe('100.0%')

    // Drawdown is always a cost, so it is always orange: a green "max DD 0.00" on a run
    // with no trades would read as a good result rather than as no result.
    expect(tiles[4].tone).toBe('down')
    expect(reportTiles(null)).toHaveLength(6)
  })
})

describe('refreshReport', () => {
  it('publishes the stats, the tiles and the curve, and clears them all together', () => {
    const stats = refreshReport(RESULT)
    tick()

    expect(stats).toMatchObject({ trades: 1, net: 9.8 })
    expect(appState.backtest.stats.net).toBe(9.8)
    expect(appState.backtest.tiles).toHaveLength(6)
    expect(appState.backtest.curve).toHaveLength(1)

    // Cleared as a whole. Leaving the last run's curve under this run's tiles is how
    // somebody reads a number that belongs to different params.
    expect(refreshReport(null)).toBeNull()
    tick()
    expect(appState.backtest.stats).toBeNull()
    expect(appState.backtest.tiles).toEqual([])
    expect(appState.backtest.curve).toEqual([])
  })
})

describe('mountReportChart', () => {
  it('re-rasterises and draws the curve on every call', () => {
    const { calls, canvas } = fakeCanvas()
    const redraw = mountReportChart(canvas, { series: () => [{ i: 0, equity: 1 }, { i: 1, equity: -2 }] })

    redraw()
    expect(calls).toContain('clear')
    // Segment-drawn: above water and below water are different states, so the curve is
    // stroked per segment rather than as one path.
    expect(calls.filter((c) => c.startsWith('stroke')).length).toBeGreaterThan(0)

    // An empty curve clears rather than leaving the previous run's shape on screen.
    const empty = mountReportChart(canvas, { series: () => [] })
    calls.length = 0
    empty()
    expect(calls).toContain('clear')

    expect(mountReportChart(null)()).toBeUndefined()
  })
})

describe('startReportChart', () => {
  it('finds the canvas and repaints when the curve moves', () => {
    const { calls, canvas } = fakeCanvas()
    const frames = []
    const redraw = startReportChart({
      doc: { getElementById: (id) => (id === 'backtest-canvas' ? canvas : null) },
      raf: (fn) => frames.push(fn),
      series: () => appState.backtest?.curve ?? [],
    })

    expect(typeof redraw).toBe('function')
    expect(calls).toContain('clear')

    // Repainted on a frame rather than inside the watch: the curve changes when a run
    // lands, which is already the busiest moment the block has.
    setValue(PATHS.backtest.curve, [{ i: 0, equity: 1 }])
    tick()
    expect(frames).toHaveLength(1)

    expect(startReportChart({ doc: { getElementById: () => null } })).toBeNull()
  })
})

describe('copyReportJson', () => {
  it('copies the trades with the summary, and says so when it cannot', async () => {
    const written = []
    const clipboard = { writeText: (text) => (written.push(text), Promise.resolve()) }

    // Nothing to copy is refused out loud rather than putting 'null' on the clipboard.
    expect(await copyReportJson(null, { clipboard })).toBe(false)

    refreshReport(RESULT)
    tick()
    expect(await copyReportJson(null, { clipboard })).toBe(true)
    // The trade list goes with it: a summary nobody can check is most of the reason for
    // sending one.
    // `trades` is the count and `tradeList` is the list — one key cannot honestly be both,
    // and the spread in `summariseRun` would silently make the count win.
    expect(JSON.parse(written[0]).tradeList).toHaveLength(1)
    expect(JSON.parse(written[0]).trades).toBe(1)
    expect(JSON.parse(written[0]).net).toBe(9.8)

    expect(await copyReportJson(null, { clipboard: {} })).toBe(false)
    expect(
      await copyReportJson(null, { clipboard: { writeText: () => Promise.reject(new Error('denied')) } }),
    ).toBe(false)
  })
})

describe('registerBacktestReportActions', () => {
  it('binds the copy action', () => {
    expect(registerBacktestReportActions()).toEqual(['backtest.copyReport'])
    expect(actionNames()).toEqual(['backtest.copyReport'])
  })
})
