import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { pushToast } from '../ui/toast.js'
import { findBacktestStrategy } from './strategies.js'
import { runDetachedBacktest } from './runner.js'
import { summariseRun } from './stats.js'
import { createLogger } from '../utils/log.js'

/**
 * The parameter sweep: run the whole grid and see which combos print.
 *
 * One backtest answers "does this work". A sweep answers the question after it — "is this
 * setting the reason", which is the only version that tells you anything about tomorrow. A
 * strategy that earns at exactly one lookback and nowhere near it is not a strategy, it is
 * a coincidence with a parameter attached, and a table of neighbours makes that obvious in
 * a way a single green number never does.
 *
 * Combos are **capped**. A three-parameter grid with ten values each is a thousand
 * backtests, which is minutes of CPU nobody asked for and a table nobody reads. The cap is
 * enforced at expansion, and what was dropped is said out loud rather than silently
 * truncated — a sweep that quietly covered a tenth of the grid is worse than one that
 * refused.
 */

const log = createLogger('sweep')

/** Never expand past this many combos, however large the grid. */
export const MAX_COMBOS = 200

/** The columns the table can sort by. */
export const SWEEP_SORTS = Object.freeze(['net', 'expectancy', 'trades', 'winRate', 'maxDrawdown'])

/**
 * How many backtests to run at once.
 *
 * @param {number} [hint] - `navigator.hardwareConcurrency`.
 * @returns {number} the pool size.
 */
export function poolSize(hint = globalThis.navigator?.hardwareConcurrency) {
  const cores = Math.floor(Number(hint) || 0)
  // Two held back: one for the desk's own frame and one for the feed. A sweep that takes
  // the whole machine turns a live ladder into a slideshow, and the ladder is the product.
  if (cores <= 0) return 2

  return Math.max(1, Math.min(8, cores - 2))
}

/**
 * Expand a parameter grid into every combination to test.
 *
 * @param {Record<string, unknown[]>} grid - param key → the values to try.
 * @param {number} [cap] - the combo ceiling.
 * @returns {{combos: object[], dropped: number, total: number}} the combos and what was cut.
 */
export function expandParamGrid(grid, cap = MAX_COMBOS) {
  const entries = Object.entries(grid ?? {})
    .map(([key, values]) => [key, (Array.isArray(values) ? values : [values]).filter((v) => v !== undefined)])
    .filter(([, values]) => values.length > 0)

  if (entries.length === 0) return { combos: [], dropped: 0, total: 0 }

  const limit = Math.max(1, Math.floor(Number(cap) || MAX_COMBOS))
  let combos = [{}]
  for (const [key, values] of entries) {
    const next = []
    for (const base of combos) {
      for (const value of values) next.push({ ...base, [key]: value })
    }
    combos = next
  }

  // Truncated at the end rather than sampled: the grid is enumerated in a stable order, so
  // a truncated sweep is a *prefix* somebody can extend, not a random subset they would
  // have to re-run to reproduce.
  return { combos: combos.slice(0, limit), dropped: Math.max(0, combos.length - limit), total: combos.length }
}

/**
 * A grid worth sweeping, derived from the strategy's own params schema.
 *
 * Built rather than typed, because a grid editor is a form with a validation problem and
 * the schema already says every tunable's range and step. The two most interesting numeric
 * params get five values each: twenty-five combos is seconds of CPU and a table a human
 * can actually read, where three params at ten values each is a thousand runs nobody looks
 * at.
 *
 * @param {object} strategy - the strategy.
 * @param {{values?: number, params?: number}} [options] - how wide and how many.
 * @returns {Record<string, number[]>} the grid.
 */
export function defaultGrid(strategy, options = {}) {
  const steps = Math.max(2, Math.floor(Number(options.values) || 5))
  const maxParams = Math.max(1, Math.floor(Number(options.params) || 2))
  const grid = {}

  for (const [key, spec] of Object.entries(strategy?.params ?? {})) {
    // The tick budget is plumbing, not an idea being tested — sweeping it would burn the
    // grid on a number that changes nothing about whether the strategy earns.
    if (key === 'budgetMs' || spec?.kind !== 'number') continue

    const min = Number(spec?.min)
    const max = Number(spec?.max)
    const fallback = Number(spec?.default)
    if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) continue

    // Centred on the default rather than spanning the whole legal range: the range is what
    // the parameter *can* be, and half of it is usually nonsense the author allowed rather
    // than intended.
    const centre = Number.isFinite(fallback) ? fallback : (min + max) / 2
    const span = Math.min(centre - min, max - centre, (max - min) / 4) || (max - min) / 4
    const from = centre - span
    const width = (2 * span) / (steps - 1)

    const values = []
    for (let n = 0; n < steps; n += 1) {
      const raw = from + n * width
      // Snapped to the declared step, so a sweep never proposes a value the tuning form
      // would refuse to accept back.
      const step = Number(spec?.step) > 0 ? Number(spec.step) : 0
      values.push(Number((step > 0 ? Math.round(raw / step) * step : raw).toFixed(6)))
    }

    grid[key] = [...new Set(values)]
    if (Object.keys(grid).length >= maxParams) break
  }

  return grid
}

/**
 * One row of the results table.
 *
 * @param {object} stats - a `summariseRun` result.
 * @param {object} combo - the params that produced it.
 * @param {number} index - the combo's position in the grid.
 * @returns {object} the row.
 */
export function sweepRow(stats, combo, index) {
  const params = combo ?? {}

  return {
    id: `combo-${index}`,
    index,
    params,
    // Pre-rendered, because the table binds it directly and a template that formatted an
    // arbitrary object would need a loop per cell.
    label: Object.entries(params)
      .map(([key, value]) => `${key}=${value}`)
      .join(' '),
    trades: Number(stats?.trades) || 0,
    net: Number(stats?.net) || 0,
    expectancy: Number(stats?.expectancy) || 0,
    winRate: Number(stats?.winRate) || 0,
    maxDrawdown: Number(stats?.maxDrawdown) || 0,
    // Formatted alongside the raw numbers: the raw ones sort, the labels render, and
    // sorting a string column is how "10" ends up above "9".
    netLabel: (Number(stats?.net) || 0).toFixed(2),
    expectancyLabel: (Number(stats?.expectancy) || 0).toFixed(4),
    winLabel: `${((Number(stats?.winRate) || 0) * 100).toFixed(0)}%`,
    ddLabel: (Number(stats?.maxDrawdown) || 0).toFixed(2),
  }
}

/**
 * Where a row's P&L sits between the worst and the best, 0..1.
 *
 * @param {number} value - the row's net.
 * @param {number} min - the sweep's worst.
 * @param {number} max - the sweep's best.
 * @returns {number} 0..1.
 */
export function heatRatio(value, min, max) {
  const v = Number(value) || 0
  const lo = Number(min) || 0
  const hi = Number(max) || 0
  // A sweep where every combo scored the same is not a gradient — colouring it would
  // invent a winner out of rounding.
  if (!(hi > lo)) return 0.5

  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)))
}

/**
 * Sort the rows and colour them, ready to render.
 *
 * @param {object[]} rows - the finished combos.
 * @param {{key?: string, dir?: string}} [sort] - the column and direction.
 * @returns {object[]} the view rows.
 */
export function sweepView(rows, sort = {}) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : []
  if (list.length === 0) return []

  const key = SWEEP_SORTS.includes(String(sort?.key)) ? String(sort.key) : 'net'
  const dir = String(sort?.dir) === 'asc' ? 1 : -1

  const nets = list.map((row) => Number(row?.net) || 0)
  const min = Math.min(...nets)
  const max = Math.max(...nets)

  return [...list]
    .sort((a, b) => ((Number(a?.[key]) || 0) - (Number(b?.[key]) || 0)) * dir)
    .map((row) => {
      const ratio = heatRatio(row.net, min, max)
      return {
        ...row,
        heat: Number(ratio.toFixed(3)),
        // A percentage the template can drop straight into a colour-mix, so the gradient
        // lives in CSS where the theme already is.
        heatPct: Math.round(ratio * 100),
        best: row.net === max,
      }
    })
}

/** The sweep currently running, if any. */
let running = null

/**
 * The table's sort, held outside the reactive tree.
 *
 * `setValue` lands next tick, so two clicks in one turn — or a sort applied while rows are
 * still streaming in — would both read the pre-flush value and the second would silently
 * undo the first.
 */
let sortState = { key: 'net', dir: 'desc' }

/**
 * Publish the sweep's progress.
 *
 * @param {object} [patch] - the fields that changed.
 * @returns {object} the progress now published.
 */
export function publishSweep(patch = {}) {
  // Merged onto the module's own copy for the same reason the runner's progress is:
  // `setValue` lands next tick, and two publishes in one turn would drop the first.
  running = running ? { ...running, ...patch } : { done: 0, total: 0, active: false, ...patch }
  setValue(PATHS.backtest.sweep, { done: running.done, total: running.total, active: running.active })

  return running
}

/**
 * Run every combo in a grid and stream the rows in as they land.
 *
 * @param {{sessionId?: string, strategyId?: string, instrument?: string, grid?: object,
 *   cap?: number}} config - the sweep.
 * @param {{run?: Function, pool?: number}} [deps] - injectable plumbing.
 * @returns {Promise<object[]>} the finished rows.
 */
export async function runSweep(config = {}, deps = {}) {
  const run = typeof deps.run === 'function' ? deps.run : runDetachedBacktest
  const strategy = findBacktestStrategy(config.strategyId)
  if (!strategy) {
    pushToast(`no such strategy: ${config.strategyId || '—'}`, 'warn')
    return []
  }

  const { combos, dropped, total } = expandParamGrid(config.grid ?? defaultGrid(strategy), config.cap)
  if (combos.length === 0) {
    pushToast('nothing to sweep — set at least one parameter range', 'warn')
    return []
  }
  // Said out loud. A sweep that quietly covered a tenth of the grid and reported a winner
  // is worse than one that refused to start.
  if (dropped > 0) {
    pushToast(`sweeping the first ${combos.length} of ${total} combos`, 'warn')
    log.warn(`grid capped: ${dropped} combos dropped`)
  }

  setValue(PATHS.backtest.sweepRows, [])
  publishSweep({ done: 0, total: combos.length, active: true })

  const rows = []
  const width = Math.max(1, Math.floor(Number(deps.pool) || poolSize()))
  let next = 0

  // A worker each, refilled as they finish. A fixed batch would leave the pool idle while
  // the slowest combo in each batch ran alone, and combos differ by an order of magnitude
  // when a param decides how often the strategy fires.
  const lane = async () => {
    while (next < combos.length) {
      const index = next++
      const result = await run({
        sessionId: config.sessionId,
        strategyId: config.strategyId,
        instrument: config.instrument,
        params: combos[index],
      })

      const row = sweepRow(result ? summariseRun(result, 2) : null, combos[index], index)
      rows.push(row)
      // Published per completion rather than at the end: the first rows are readable while
      // the rest still grind, which is the difference between a sweep and a spinner.
      setValue(PATHS.backtest.sweepRows, [...rows])
      setValue(PATHS.backtest.sweepView, sweepView(rows, sortState))
      publishSweep({ done: rows.length })
    }
  }

  await Promise.all(Array.from({ length: Math.min(width, combos.length) }, lane))
  publishSweep({ active: false })
  pushToast(`sweep done: ${rows.length} combos`, 'success')

  return rows
}

/**
 * Re-sort the table.
 *
 * @param {object} _state - engine state (unused).
 * @param {{key?: string, value?: string}} [payload] - the column.
 * @returns {object} the sort now in force.
 */
export function setSweepSort(_state, payload = {}) {
  const wanted = String(payload?.key ?? payload?.value ?? '')
  const key = SWEEP_SORTS.includes(wanted) ? wanted : sortState.key

  // Clicking the active column flips it; a new column starts descending, because the
  // interesting end of every column here is the top.
  const dir = key === sortState.key && sortState.dir === 'desc' ? 'asc' : 'desc'
  sortState = { key, dir }

  setValue(PATHS.backtest.sweepSort, { ...sortState })
  setValue(PATHS.backtest.sweepView, sweepView(appState?.backtest?.sweepRows, sortState))

  return sortState
}

/**
 * Put a combo's parameters into the live strategy.
 *
 * @param {object} _state - engine state (unused).
 * @param {{id?: string, index?: number|string}} [payload] - which row.
 * @returns {object|null} the params applied, or null.
 */
export function applyComboParams(_state, payload = {}) {
  const rows = appState?.backtest?.sweepRows ?? []
  const wanted = String(payload?.id ?? `combo-${payload?.index}`)
  const row = rows.find((r) => String(r?.id) === wanted)
  if (!row) {
    pushToast('no such combo', 'warn')
    return null
  }

  const strategyId = String(appState?.backtest?.config?.strategyId ?? '')
  const params = appState?.settings?.strategyParams ?? {}
  setValue(PATHS.settings.strategyParams, {
    ...params,
    // Merged onto whatever the strategy already had rather than replacing it: the sweep
    // varied two parameters, and the other six the trader tuned by hand are not the
    // sweep's to discard.
    [strategyId]: { ...(params[strategyId] ?? {}), ...row.params },
  })
  pushToast(`applied ${row.label} to ${strategyId}`, 'success')

  return row.params
}

/** Forget the running sweep (tests). */
export function resetSweep() {
  running = null
  sortState = { key: 'net', dir: 'desc' }
  return true
}

/**
 * Register the sweep actions.
 *
 * @returns {string[]} the registered names.
 */
export function registerSweepActions() {
  registerAction(ACTIONS.backtest.sweep, (state, payload) => runSweep({ ...(state?.backtest?.config ?? {}), ...payload }, payload), {
    description: 'Run a parameter sweep over a recording',
  })
  registerAction(ACTIONS.backtest.sortSweep, setSweepSort, {
    description: 'Sort the sweep results table',
  })
  registerAction(ACTIONS.backtest.applyCombo, applyComboParams, {
    description: 'Apply a swept parameter combo to the live strategy',
  })

  return [ACTIONS.backtest.sweep, ACTIONS.backtest.sortSweep, ACTIONS.backtest.applyCombo]
}
