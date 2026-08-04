import { appState } from '../app/engine.js'
import { currentPeriod, periodRange } from './period.js'
import { downloadFile } from '../journal/export.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { pushToast } from '../ui/toast.js'
import { createLogger } from '../utils/log.js'

/**
 * The performance report.
 *
 * Everything the analytics section knows, frozen into one object that can leave the app —
 * as JSON for a machine, as markdown for a person, as PNGs for the charts. A dashboard
 * that can only be read on the screen it renders on is a dashboard nobody reviews away
 * from the desk, and reviewing away from the desk is the only time a trader is calm.
 *
 * The snapshot carries its **period** and the bounds that period resolved to. A report
 * headed "week" with no dates is a file that becomes unreadable the moment there are two
 * of them in a folder.
 */

const log = createLogger('report')

/** What the JSON snapshot declares itself to be, so an old file can be recognised later. */
export const REPORT_VERSION = 1

/**
 * Freeze the current analytics into one object.
 *
 * @param {object} [state] - engine state.
 * @param {number} [now] - the current time.
 * @returns {object} the snapshot.
 */
export function buildReport(state = appState, now = 0) {
  const analytics = state?.analytics ?? {}
  const period = currentPeriod(analytics)
  const range = periodRange(period, now)

  return {
    version: REPORT_VERSION,
    generatedAt: Number(now) || 0,
    period,
    // Serialised as null rather than Infinity: JSON has no infinity and `JSON.stringify`
    // turns it into null anyway, so saying so here keeps the shape honest.
    from: Number.isFinite(range.from) ? range.from : null,
    to: Number.isFinite(range.to) ? range.to : null,
    trades: Array.isArray(analytics.trades) ? analytics.trades.length : 0,
    kpis: Array.isArray(analytics.kpis) ? analytics.kpis : [],
    ranking: Array.isArray(analytics.ranking) ? analytics.ranking : [],
    fees: analytics.fees ?? null,
    streaks: analytics.streaks ?? null,
    worstRun: analytics.worstRun ?? null,
    hourExtremes: analytics.hourExtremes ?? null,
  }
}

/**
 * Render a report as markdown.
 *
 * @param {object} report - a buildReport snapshot.
 * @returns {string} markdown.
 */
export function reportMarkdown(report) {
  const data = report ?? {}
  const kpis = Array.isArray(data.kpis) ? data.kpis : []
  const ranking = Array.isArray(data.ranking) ? data.ranking : []

  const lines = [`# STOCKZ — ${String(data.period ?? 'all')}`, '']
  lines.push(`${data.trades ?? 0} closed trades.`, '')

  if (kpis.length > 0) {
    lines.push('| metric | value |', '| --- | --- |')
    for (const kpi of kpis) lines.push(`| ${kpi?.label ?? ''} | ${kpi?.value ?? '—'} |`)
    lines.push('')
  }

  if (ranking.length > 0) {
    lines.push('## Instruments', '')
    lines.push('| instrument | net | trades |', '| --- | --- | --- |')
    // Best and worst rather than the whole table: a report nobody scrolls is a report
    // nobody reads, and the tail of a ranking is the part that never changes a decision.
    for (const row of [...ranking.slice(0, 3), ...ranking.slice(-3)].filter(
      (row, index, all) => all.indexOf(row) === index,
    )) {
      lines.push(`| ${row?.instrument ?? ''} | ${row?.netLabel ?? row?.net ?? ''} | ${row?.trades ?? 0} |`)
    }
    lines.push('')
  }

  if (data.worstRun?.depthLabel) {
    lines.push(`Worst drawdown: **${data.worstRun.depthLabel}** over ${data.worstRun.durationLabel ?? '—'}.`, '')
  }

  return lines.join('\n')
}

/**
 * The filename a report artifact gets.
 *
 * @param {string} kind - 'json', 'md' or a chart name.
 * @param {string} period - the period key.
 * @param {number} at - epoch ms.
 * @returns {string} the filename.
 */
export function reportFilename(kind, period, at) {
  const date = new Date(Number(at) || 0)
  // Sortable date first in the name's tail, so a folder of reports orders chronologically
  // in any file browser without anybody choosing a sort.
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('')
  const ext = String(kind ?? 'json')

  return `stockz-report-${String(period ?? 'all')}-${stamp}.${ext}`
}

/**
 * Capture a chart canvas as a PNG blob.
 *
 * @param {HTMLCanvasElement} canvas - the chart.
 * @returns {Promise<Blob|null>} the image, or null when there is nothing to capture.
 */
export function chartToPng(canvas) {
  // At the canvas's own backing resolution, which the renderers already scale by DPR — a
  // capture at CSS size would be the blurry version of a chart that looks sharp on screen.
  if (typeof canvas?.toBlob !== 'function') return Promise.resolve(null)

  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob ?? null), 'image/png')
    } catch (err) {
      log.warn(`chart capture failed: ${err?.message ?? err}`)
      resolve(null)
    }
  })
}

/**
 * Download the JSON snapshot.
 *
 * @param {object} _state - engine state (unused).
 * @param {{now?: number}} [payload] - injected clock.
 * @returns {string} the filename written, or '' on failure.
 */
export function exportReportJson(_state, payload = {}) {
  const at = Number(payload?.now) || Date.now()
  const report = buildReport(appState, at)
  const name = reportFilename('json', report.period, at)

  const ok = downloadFile({ name, type: 'application/json', text: JSON.stringify(report, null, 2) }, payload)
  pushToast(ok ? `report saved — ${name}` : 'could not save the report', ok ? 'success' : 'warn')

  return ok ? name : ''
}

/**
 * Copy the markdown summary to the clipboard.
 *
 * @param {object} _state - engine state (unused).
 * @param {{now?: number, clipboard?: object}} [payload] - injected plumbing.
 * @returns {string} the markdown copied, or '' when there was nothing to copy.
 */
export function copyReportMarkdown(_state, payload = {}) {
  const at = Number(payload?.now) || Date.now()
  const text = reportMarkdown(buildReport(appState, at))

  const clipboard = payload.clipboard ?? globalThis.navigator?.clipboard
  clipboard?.writeText?.(text)?.catch?.(() => {})
  pushToast('summary copied', 'success')

  return text
}

/**
 * Save every chart on screen as a PNG.
 *
 * @param {object} _state - engine state (unused).
 * @param {{doc?: Document, now?: number}} [payload] - injected plumbing.
 * @returns {Promise<string[]>} the filenames written.
 */
export async function exportChartPngs(_state, payload = {}) {
  const doc = payload.doc ?? globalThis.document
  const at = Number(payload?.now) || Date.now()
  const period = currentPeriod()
  const written = []

  for (const canvas of doc?.querySelectorAll?.('canvas[id]') ?? []) {
    const blob = await chartToPng(canvas)
    if (!blob) continue

    const name = reportFilename('png', `${period}-${canvas.id}`, at)
    // Through the same anchor path as every other download, so a browser that blocks one
    // blocks all of them visibly rather than silently dropping the images.
    if (downloadFile({ name, type: 'image/png', text: blob }, payload)) written.push(name)
  }

  pushToast(written.length ? `${written.length} charts saved` : 'no charts to save', written.length ? 'success' : 'warn')
  return written
}

/**
 * Register the export actions.
 *
 * @returns {string[]} the registered names.
 */
export function registerReportActions() {
  registerAction(ACTIONS.analytics.exportJson, exportReportJson, {
    description: 'Download the analytics snapshot as JSON',
  })
  registerAction(ACTIONS.analytics.copySummary, copyReportMarkdown, {
    description: 'Copy the analytics summary as markdown',
  })
  registerAction(ACTIONS.analytics.exportCharts, exportChartPngs, {
    description: 'Save every analytics chart as a PNG',
  })

  return [ACTIONS.analytics.exportJson, ACTIONS.analytics.copySummary, ACTIONS.analytics.exportCharts]
}
