import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { formatCompact } from './metrics.js'

/**
 * The one-row HUD.
 *
 * Nine vitals in a block the size of one row. The point is not to save space for its own
 * sake — it is that the HUD stops competing with the book and the ticket for the screen,
 * so the metrics stay visible while the trader is actually working.
 *
 * The row is **ordered by severity, not by a fixed layout**. A tile that has gone bad
 * moves to the front, because in a strip this dense a fixed order means the one reading
 * that matters is wherever it always was — off to the right, behind seven that are fine.
 */

/** Severity scores. Higher sorts first. */
export const SEVERITY = Object.freeze({ bad: 3, warn: 2, ok: 1, idle: 0 })

/** Two- and three-character labels. Any longer and nine will not fit a row. */
export const ABBREVIATIONS = Object.freeze({
  latency: 'LAT',
  spread: 'SPR',
  slippage: 'SLP',
  pace: 'P/H',
  streak: 'STK',
  winRate: 'W%',
  exposure: 'EXP',
  turnover: 'VOL',
  fees: 'FEE',
})

/**
 * How loudly a metric is asking to be read.
 *
 * @param {{tone?: string, alert?: boolean}} metric - the metric descriptor.
 * @returns {number} a sortable rank.
 */
export function severityRank(metric) {
  // An explicit alert outranks any tone: a breached spread is a thing happening now, and
  // a tone is a thing that has been true for a while.
  if (metric?.alert === true) return SEVERITY.bad + 1

  const tone = String(metric?.tone ?? '')
  if (tone === 'bad' || tone === 'cold') return SEVERITY.bad
  if (tone === 'warn' || tone === 'over' || tone === 'under') return SEVERITY.warn
  if (tone === 'good' || tone === 'ok' || tone === 'hot') return SEVERITY.ok

  return SEVERITY.idle
}

/**
 * The short label for a metric.
 *
 * @param {string} id - the metric id.
 * @returns {string} a 2-3 character label.
 */
export function abbreviate(id) {
  const key = String(id ?? '')
  // Unknown ids are truncated rather than dropped: a missing cell reads as a metric that
  // is fine, which is the one thing it must never do.
  return ABBREVIATIONS[key] ?? key.slice(0, 3).toUpperCase()
}

/**
 * Build the row from what the HUD already published.
 *
 * @param {object} [state] - the ui slice.
 * @returns {object[]} the metric descriptors.
 */
export function compactMetrics(state = appState?.ui) {
  const hud = state?.hud ?? {}
  const session = state?.session ?? {}
  const fees = state?.fees ?? {}
  const slippage = state?.slippage ?? {}

  return [
    { id: 'latency', value: hud.latencyLabel ?? '—', tone: hud.latencyGrade ?? '' },
    { id: 'spread', value: hud.spreadLabel ?? '—', tone: '', alert: state?.spreadAlert === true },
    { id: 'slippage', value: `${formatCompact(slippage.avg ?? 0)}bp`, tone: '' },
    { id: 'pace', value: session.paceLabel ?? '—', tone: session.paceState ?? '' },
    {
      id: 'streak',
      value: `${session.streak ?? 0}${session.streakKind === 'win' ? 'W' : session.streakKind === 'loss' ? 'L' : ''}`,
      tone: session.streakTone ?? '',
    },
    { id: 'winRate', value: hud.winRateLabel ?? '—', tone: '' },
    { id: 'exposure', value: hud.exposureLabel ?? '—', tone: '' },
    { id: 'turnover', value: session.turnoverLabel ?? '—', tone: '' },
    { id: 'fees', value: fees.totalLabel ?? '—', tone: fees.tone ?? '' },
  ]
}

/**
 * Order the row, worst first.
 *
 * @param {object[]} metrics - the descriptors.
 * @returns {object[]} the row, ready to render.
 */
export function orderMetrics(metrics) {
  const rows = (Array.isArray(metrics) ? metrics : []).map((metric, index) => ({
    ...metric,
    label: abbreviate(metric?.id),
    rank: severityRank(metric),
    index,
  }))

  // Ties keep their original order, so a quiet row does not shuffle itself every frame
  // and make the trader re-find every cell.
  return rows.sort((a, b) => b.rank - a.rank || a.index - b.index)
}

/**
 * Publish the compact row.
 *
 * @returns {object[]} the row.
 */
export function refreshCompact() {
  const rows = orderMetrics(compactMetrics())
  setValue(PATHS.ui.hudRow, rows)
  return rows
}

/**
 * Flip the HUD density.
 *
 * @returns {boolean} the new compact flag.
 */
export function toggleCompact() {
  const next = appState?.settings?.compactHud !== true
  setValue(PATHS.settings.compactHud, next)
  return next
}

/**
 * Register the density toggle.
 *
 * @returns {string} the registered action name.
 */
export function registerCompactActions() {
  registerAction(ACTIONS.ui.toggleCompactHud, () => toggleCompact())
  return ACTIONS.ui.toggleCompactHud
}
