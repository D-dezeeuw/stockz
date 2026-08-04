import { setValue, appState, watch } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { pushToast } from '../ui/toast.js'
import { drawEquity } from '../analytics/equity.js'
import { sizeCanvas } from '../charts/canvas.js'
import { summariseRun } from './stats.js'

/**
 * The backtest report: does this strategy earn?
 *
 * Five numbers answer it, in a fixed order, because the order is the argument. Trades says
 * whether there is a sample at all. Net says whether it made money. Expectancy says whether
 * it makes money *per trade*, which is the only version that survives being run more often.
 * Win rate says how it feels, which is not the same thing. Max drawdown says whether the
 * trader would still have been there at the end.
 *
 * The equity curve reuses the analytics renderer rather than growing a second one. Two
 * canvas paths drawing "the same" curve is two chances to disagree about what above-water
 * looks like, and the answer to "why does the backtest curve look different" should never
 * be "different code drew it".
 */

/**
 * A stat tile, formatted for the block.
 *
 * @param {string} label - what it is.
 * @param {number} value - the number.
 * @param {{decimals?: number, suffix?: string, tone?: string}} [options] - presentation.
 * @returns {{label: string, value: string, tone: string}} the tile.
 */
export function reportTile(label, value, options = {}) {
  const num = Number(value)
  const decimals = Number.isFinite(Number(options.decimals)) ? Number(options.decimals) : 2
  // Infinity is a real answer here — a run with no losing trade has no profit factor — and
  // rendering it as 'Infinity' or NaN would read as a bug rather than as the fact it is.
  const text = !Number.isFinite(num) ? '∞' : num.toFixed(decimals)

  return {
    label: String(label ?? ''),
    value: `${text}${String(options.suffix ?? '')}`,
    // Tone is the trader's read at a glance: green earns, orange costs, neutral is context
    // that is neither.
    tone: options.tone ?? (num > 0 ? 'up' : num < 0 ? 'down' : 'flat'),
  }
}

/**
 * The headline row, in the order the argument runs.
 *
 * @param {object} stats - a `summariseRun` result.
 * @returns {object[]} the tiles.
 */
export function reportTiles(stats) {
  const s = stats ?? {}

  return [
    reportTile('trades', s.trades ?? 0, { decimals: 0, tone: 'flat' }),
    reportTile('net', s.net ?? 0),
    reportTile('expectancy', s.expectancy ?? 0, { decimals: 4 }),
    reportTile('win %', (Number(s.winRate) || 0) * 100, { decimals: 1, suffix: '%', tone: 'flat' }),
    // Drawdown is always a cost, so it is always orange — a green "max DD 0.00" on a run
    // with no trades would read as a good result rather than as no result.
    reportTile('max DD', s.maxDrawdown ?? 0, { tone: 'down' }),
    reportTile('profit factor', s.profitFactor ?? 0, { decimals: 2 }),
  ]
}

/**
 * Compute and publish the report for a finished run.
 *
 * @param {object|null} result - what the worker returned.
 * @returns {object|null} the statistics published, or null when there is no run.
 */
export function refreshReport(result) {
  if (!result) {
    setValue(PATHS.backtest.stats, null)
    setValue(PATHS.backtest.tiles, [])
    setValue(PATHS.backtest.curve, [])
    return null
  }

  const stats = summariseRun(result)
  // The curve goes out separately from the stats so the canvas can watch one path: a
  // renderer woken by every field of the report would repaint six times per run.
  setValue(PATHS.backtest.stats, stats)
  setValue(PATHS.backtest.tiles, reportTiles(stats))
  setValue(PATHS.backtest.curve, stats.curve)

  return stats
}

/**
 * Mount the equity curve onto a canvas.
 *
 * @param {HTMLCanvasElement} canvas - the canvas.
 * @param {{series?: () => object[]}} [deps] - injectable plumbing.
 * @returns {() => void} a redraw function.
 */
export function mountReportChart(canvas, deps = {}) {
  if (!canvas?.getContext) return () => {}

  const read = deps.series ?? (() => appState.backtest?.curve ?? [])

  return () => {
    // Re-rasterised every draw: a block that changed size between frames would otherwise
    // render the previous size's bitmap stretched.
    const size = sizeCanvas(canvas, { width: canvas.clientWidth, height: canvas.clientHeight })
    drawEquity(canvas.getContext('2d'), read(), size)
  }
}

/**
 * Find the canvas and keep it in step with the curve.
 *
 * @param {{doc?: Document, raf?: Function}} [deps] - injectable plumbing.
 * @returns {Function|null} the redraw, or null when there is no canvas.
 */
export function startReportChart(deps = {}) {
  const doc = deps.doc ?? globalThis.document
  const canvas = doc?.getElementById?.('backtest-canvas')
  if (!canvas) return null

  const redraw = mountReportChart(canvas, deps)
  const raf = deps.raf ?? globalThis.requestAnimationFrame?.bind(globalThis) ?? ((fn) => fn())

  watch([PATHS.backtest.curve], () => raf(redraw))
  redraw()

  return redraw
}

/**
 * Put the whole result on the clipboard.
 *
 * @param {object} _state - engine state (unused).
 * @param {{clipboard?: object, stats?: object}} [payload] - injectable clipboard.
 * @returns {Promise<boolean>} true when it was copied.
 */
export async function copyReportJson(_state, payload = {}) {
  const stats = payload?.stats ?? appState?.backtest?.stats
  if (!stats) {
    pushToast('no backtest to copy', 'warn')
    return false
  }

  const clipboard = payload.clipboard ?? globalThis.navigator?.clipboard
  if (typeof clipboard?.writeText !== 'function') {
    pushToast('clipboard unavailable in this browser', 'warn')
    return false
  }

  // The trade list goes with it. A summary without the trades that produced it cannot be
  // checked by whoever it is sent to, which is most of the reason for sending it.
  const text = JSON.stringify(stats, null, 2)
  try {
    await clipboard.writeText(text)
    pushToast(`copied ${stats.trades ?? 0} trades`, 'success')
    return true
  } catch (err) {
    pushToast(`copy failed: ${err?.message ?? err}`, 'warn')
    return false
  }
}

/**
 * Register the report action.
 *
 * @returns {string[]} the registered names.
 */
export function registerBacktestReportActions() {
  registerAction(ACTIONS.backtest.copyReport, copyReportJson, {
    description: 'Copy the backtest result as JSON',
  })

  return [ACTIONS.backtest.copyReport]
}
