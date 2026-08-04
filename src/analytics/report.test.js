// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  REPORT_VERSION,
  buildReport,
  reportMarkdown,
  reportFilename,
  chartToPng,
  exportReportJson,
  copyReportMarkdown,
  exportChartPngs,
  registerReportActions,
} from './report.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { clearActions, actionNames } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'

const AT = new Date(2026, 7, 12, 14, 30).getTime()

/** Analytics state as the refreshers leave it. */
function seedAnalytics() {
  setValue(PATHS.analytics.period, 'week')
  setValue(PATHS.analytics.trades, [{ closeTs: AT }, { closeTs: AT - 1000 }])
  setValue(PATHS.analytics.kpis, [
    { label: 'win rate', value: '58%' },
    { label: 'expectancy', value: '+1.20' },
  ])
  setValue(PATHS.analytics.ranking, [
    { instrument: 'BTC-USDT', netLabel: '+120.00', trades: 12 },
    { instrument: 'ETH-USDT', netLabel: '-30.00', trades: 5 },
  ])
  setValue(PATHS.analytics.worstRun, { depthLabel: '-80.00', durationLabel: '2h 10m' })
  tick()
}

beforeEach(() => {
  resetState()
  clearActions()
})

describe('buildReport', () => {
  it('freezes the analytics with the period it was taken over', () => {
    seedAnalytics()
    const report = buildReport(appState, AT)

    expect(report).toMatchObject({ version: REPORT_VERSION, period: 'week', trades: 2 })
    expect(report.kpis).toHaveLength(2)
    // A report headed "week" with no bounds becomes unreadable the moment there are two of
    // them in a folder.
    expect(report.from).toBe(new Date(2026, 7, 10).getTime())
    // JSON has no infinity - `JSON.stringify` would turn it into null anyway, so the shape
    // says null rather than pretending otherwise.
    expect(report.to).toBeNull()
    expect(JSON.parse(JSON.stringify(report)).period).toBe('week')

    const empty = buildReport({}, AT)
    expect(empty).toMatchObject({ period: 'all', trades: 0, from: null, to: null })
    expect(empty.kpis).toEqual([])
  })
})

describe('reportMarkdown', () => {
  it('renders a summary somebody can paste into a chat, and stays valid when empty', () => {
    seedAnalytics()
    const md = reportMarkdown(buildReport(appState, AT))

    expect(md).toContain('# STOCKZ — week')
    expect(md).toContain('2 closed trades.')
    expect(md).toContain('| win rate | 58% |')
    expect(md).toContain('| BTC-USDT | +120.00 | 12 |')
    expect(md).toContain('Worst drawdown: **-80.00** over 2h 10m.')

    // A desk that has not traded still produces a readable file rather than a broken table.
    const bare = reportMarkdown(buildReport({}, AT))
    expect(bare).toContain('# STOCKZ — all')
    expect(bare).toContain('0 closed trades.')
    expect(bare).not.toContain('| --- |')
    expect(reportMarkdown(null)).toContain('# STOCKZ')
  })
})

describe('reportFilename', () => {
  it('puts a sortable date in the name so a folder of reports orders itself', () => {
    expect(reportFilename('json', 'week', AT)).toBe('stockz-report-week-20260812.json')
    expect(reportFilename('md', 'all', AT)).toBe('stockz-report-all-20260812.md')
    // Zero-padded, or 2026-08-09 would sort after 2026-08-10 as text.
    expect(reportFilename('json', 'day', new Date(2026, 0, 9).getTime())).toContain('20260109')
    expect(reportFilename()).toMatch(/^stockz-report-all-\d{8}\.json$/)
  })
})

describe('chartToPng', () => {
  it('captures a canvas and resolves null rather than throwing when it cannot', async () => {
    const canvas = { toBlob: (fn) => fn(new Blob(['x'], { type: 'image/png' })) }
    expect(await chartToPng(canvas)).toBeInstanceOf(Blob)

    // jsdom has no canvas backend and a real browser can refuse a tainted canvas; neither
    // is worth an exception on a path the trader triggered by clicking Export.
    expect(await chartToPng({ toBlob: (fn) => fn(null) })).toBeNull()
    expect(await chartToPng({
      toBlob: () => {
        throw new Error('tainted')
      },
    })).toBeNull()
    expect(await chartToPng(null)).toBeNull()
  })
})

describe('exportReportJson', () => {
  it('writes a named snapshot and says so', () => {
    seedAnalytics()
    const written = []
    const name = exportReportJson({}, {
      now: AT,
      doc: { createElement: () => ({ click: () => {}, set href(v) { written.push(v) } }) },
      url: { createObjectURL: (blob) => (written.push(blob), 'blob:x'), revokeObjectURL: () => {} },
    })
    tick()

    expect(name).toBe('stockz-report-week-20260812.json')
    expect(appState.ui.toasts[0].message).toContain('stockz-report-week')

    // A browser that cannot download says so rather than looking like a click that did
    // nothing. `{}` rather than `null`, because downloadFile reads `deps.doc ?? document`
    // and null falls straight through to the real one.
    expect(exportReportJson({}, { now: AT, doc: {}, url: {} })).toBe('')
  })
})

describe('copyReportMarkdown', () => {
  it('copies the summary and confirms it', () => {
    seedAnalytics()
    const copied = []
    const text = copyReportMarkdown({}, { now: AT, clipboard: { writeText: async (t) => copied.push(t) } })
    tick()

    expect(text).toContain('# STOCKZ — week')
    expect(copied).toEqual([text])
    expect(appState.ui.toasts[0].message).toContain('copied')

    // A browser that refuses clipboard access must not throw on the click path.
    expect(() => copyReportMarkdown({}, { now: AT, clipboard: null })).not.toThrow()
  })
})

describe('exportChartPngs', () => {
  it('saves every named canvas and reports how many, including none', async () => {
    seedAnalytics()
    document.body.innerHTML = '<canvas id="equity-canvas"></canvas><canvas id="heat-canvas"></canvas>'
    for (const canvas of document.querySelectorAll('canvas')) {
      canvas.toBlob = (fn) => fn(new Blob(['x'], { type: 'image/png' }))
    }

    const names = await exportChartPngs({}, {
      now: AT,
      doc: document,
      url: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
    })
    tick()

    expect(names).toEqual([
      'stockz-report-week-equity-canvas-20260812.png',
      'stockz-report-week-heat-canvas-20260812.png',
    ])
    expect(appState.ui.toasts[0].message).toContain('2 charts saved')

    document.body.innerHTML = ''
    expect(await exportChartPngs({}, { now: AT, doc: document })).toEqual([])
    tick()
    expect(appState.ui.toasts[0].message).toContain('no charts')
  })
})

describe('registerReportActions', () => {
  it('registers all three export forms', () => {
    expect(registerReportActions()).toEqual([
      ACTIONS.analytics.exportJson,
      ACTIONS.analytics.copySummary,
      ACTIONS.analytics.exportCharts,
    ])
    expect(actionNames()).toContain('analytics.exportCharts')
  })
})
