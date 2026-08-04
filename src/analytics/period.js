import { setValue, appState, watch } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { refreshFiltered } from '../journal/filters.js'

/**
 * One switch that scopes every number on the dashboard.
 *
 * Short-term form and long-term edge are different questions with the same shape, and a
 * trader needs to be able to ask both without the answers ever being mixed up. So there is
 * exactly one period value and every analytics computed reads it — a dashboard where the
 * KPI tiles said "today" and the heatmap said "everything" would be worse than one that only
 * ever showed all-time.
 *
 * Weeks start **Monday**, months are calendar months, and both are computed in local time.
 * The journal's day rows use UTC because they are about sessions; this is about the trader's
 * own week, and a "this week" that reset on Sunday afternoon in their timezone would be a
 * period nobody recognises.
 *
 * `all` is genuinely unbounded rather than a very large window. A ninety-day "all time" is a
 * number that silently becomes wrong the day somebody's history gets longer than it.
 */

/** The periods, in the order the control shows them. */
export const PERIODS = Object.freeze(['day', 'week', 'month', 'all'])

/**
 * The bounds of a period.
 *
 * @param {string} period - one of PERIODS.
 * @param {number} now - the current time.
 * @returns {{from: number, to: number, label: string}} the range.
 */
export function periodRange(period, now) {
  const at = Number(now) || 0
  const key = PERIODS.includes(String(period)) ? String(period) : 'all'
  // Unbounded rather than a very large window: a ninety-day "all time" silently becomes
  // wrong the day somebody's history gets longer than it.
  if (key === 'all') return { from: -Infinity, to: Infinity, label: 'all time' }

  const date = new Date(at)
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (key === 'week') {
    // Monday, because a week that reset on Sunday afternoon is a week nobody recognises.
    const weekday = (start.getDay() + 6) % 7
    start.setDate(start.getDate() - weekday)
  }
  if (key === 'month') start.setDate(1)

  return { from: start.getTime(), to: Infinity, label: key }
}

/**
 * The trades inside a range.
 *
 * @param {object[]} trades - the enriched trades.
 * @param {{from: number, to: number}} range - the bounds.
 * @returns {object[]} what falls inside.
 */
export function filterByPeriod(trades, range) {
  const from = Number(range?.from)
  const to = Number(range?.to)
  const rows = Array.isArray(trades) ? trades : []
  if (!Number.isFinite(from) && !Number.isFinite(to)) return rows

  return rows.filter((trade) => {
    const at = Number(trade?.closeTs) || 0
    return at >= (Number.isFinite(from) ? from : -Infinity) && at <= (Number.isFinite(to) ? to : Infinity)
  })
}

/**
 * The period in force.
 *
 * @param {object} [state] - the analytics slice.
 * @returns {string} the period key.
 */
export function currentPeriod(state = appState?.analytics) {
  const held = String(state?.period ?? '')

  return PERIODS.includes(held) ? held : 'all'
}

/**
 * Scope a trade list to the chosen period.
 *
 * @param {object[]} trades - the enriched trades.
 * @param {number} [now] - the current time.
 * @returns {object[]} the in-period trades.
 */
export function scopeToPeriod(trades, now = 0) {
  return filterByPeriod(trades, periodRange(currentPeriod(), now))
}

/**
 * Change the period.
 *
 * @param {string} period - the new period.
 * @returns {string} the period now in force.
 */
export function setPeriod(period) {
  const wanted = PERIODS.includes(String(period)) ? String(period) : 'all'
  setValue(PATHS.analytics.period, wanted)

  return wanted
}

/**
 * The next period along.
 *
 * @param {number} [step] - direction.
 * @returns {string} the period now in force.
 */
export function cyclePeriod(step = 1) {
  const index = PERIODS.indexOf(currentPeriod())
  const delta = Number(step) || 1
  // Wraps, unlike the replay transport: there are four of these and a trader flipping
  // through them wants a loop, not an end stop they have to reverse out of.
  const next = (index + delta + PERIODS.length * 2) % PERIODS.length

  return setPeriod(PERIODS[next])
}

/**
 * Recompute every analytics number when the period moves.
 *
 * Watched rather than called from `setPeriod`, so the hotkey, the segmented control and a
 * restored setting all land the same way. `refreshFiltered` is the single fan-out — it
 * re-scopes and re-runs all eight analytics refreshers — and the canvas blocks redraw off
 * their own watches on the paths it writes, so nothing here has to know they exist.
 *
 * @param {{watch?: Function, refresh?: Function}} [deps] - injectable plumbing.
 * @returns {() => void} unsubscribe.
 */
export function mountPeriod(deps = {}) {
  const { watch: watcher = watch, refresh = refreshFiltered } = deps
  return watcher([PATHS.analytics.period], () => refresh())
}

/**
 * Register the period actions.
 *
 * @returns {string[]} the registered names.
 */
export function registerPeriodActions() {
  registerAction(ACTIONS.analytics.setPeriod, (_state, payload) => setPeriod(payload?.period))
  registerAction(ACTIONS.analytics.cyclePeriod, (_state, payload) =>
    cyclePeriod(Number(payload?.step) || 1),
  )

  return [ACTIONS.analytics.setPeriod, ACTIONS.analytics.cyclePeriod]
}
