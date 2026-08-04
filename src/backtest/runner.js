import { setValue, appState, computed } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { pushToast } from '../ui/toast.js'
import { setBlockStatus, BLOCK_STATUS } from '../blocks/registry.js'
import { findBacktestStrategy, backtestStrategyOptions } from './strategies.js'
import { runRequest } from './worker.js'
import { resolveFillConfig } from './fills.js'
import { refreshReport } from './report.js'
import { createLogger } from '../utils/log.js'

/**
 * The backtest orchestrator — the desk's half of the conversation.
 *
 * One call turns a recording plus a strategy plus a set of params into a result. Everything
 * heavy happens in a Worker; this module starts it, forwards its progress into state, and
 * resolves with what came back.
 *
 * It falls back to running the same harness **in process** when `Worker` is unavailable —
 * jsdom under Vitest, an ancient browser, a file:// page. The fallback is the identical code
 * path (`runRequest`), so a result computed either way is the same result; the only
 * difference is which thread pays for it.
 */

const log = createLogger('backtest')

/** The runner's shape in state. One object: its fields always move together. */
export const BACKTEST_STATE = Object.freeze({
  running: false,
  runId: '',
  played: 0,
  total: 0,
  pct: 0,
  signals: 0,
})

/**
 * The runner's own copy, held outside the reactive tree.
 *
 * `setValue` lands next tick, so two publishes inside one action — `running: true` then the
 * first progress update, which is exactly what starting a run does — would both read the
 * pre-flush state and the second would silently drop the first.
 */
let progress = { ...BACKTEST_STATE }

/** The worker currently crunching, if any. */
let active = null

/**
 * Percent complete, floored and clamped.
 *
 * @param {number} played - ticks driven so far.
 * @param {number} total - ticks in the run.
 * @returns {number} 0..100.
 */
export function progressPercent(played, total) {
  const done = Number(played) || 0
  const all = Number(total) || 0
  // A run with no ticks is 100% done, not 0%: a bar stuck at zero on an empty recording
  // looks exactly like a hung worker.
  if (all <= 0) return 100

  return Math.max(0, Math.min(100, Math.floor((done / all) * 100)))
}

/**
 * The always-shaped readout of a finished run.
 *
 * A template cannot read through a null `backtest.result`, and a block that renders
 * nothing until the first run looks broken rather than idle. So the summary exists whether
 * or not a run has happened, and says which.
 *
 * @param {object|null} result - what the worker returned.
 * @returns {object} the readout.
 */
export function backtestSummary(result) {
  const signals = Array.isArray(result?.signals) ? result.signals : []
  const fills = Array.isArray(result?.fills) ? result.fills : []
  const fees = fills.reduce((sum, fill) => sum + (Number(fill?.fee) || 0), 0)

  return {
    ran: Boolean(result),
    strategyId: String(result?.strategyId ?? ''),
    instrument: String(result?.instrument ?? '') || 'all',
    signals: signals.length,
    // Split by side, because a strategy that only ever emitted buys is a broken strategy
    // and the total alone hides it completely.
    buys: signals.filter((s) => s?.side === 'buy').length,
    sells: signals.filter((s) => s?.side === 'sell').length,
    // Fills, separately from signals. The gap between the two is the whole point of the
    // fill model: a strategy that signalled ninety times and filled four is not a strategy
    // that traded ninety times, and a report showing only signals would say it was.
    fills: fills.length,
    unfilled: Number(result?.unfilled) || 0,
    fees: Number(fees.toFixed(6)),
    played: Number(result?.played) || 0,
    errors: Number(result?.errors) || 0,
    elapsed: result ? `${Number(result.elapsedMs) || 0}ms` : '—',
    // The assumptions, on the same readout as the numbers they produced.
    assumptions: result
      ? `${Number(result.fillConfig?.latencyMs) || 0}ms · ${Number(result.fillConfig?.slippageBps) || 0}bp · ${String(result.fillConfig?.orderType ?? 'market')}`
      : '—',
  }
}

/**
 * The recording picker's rows, with the "nothing chosen" one in front.
 *
 * The placeholder is a *row* rather than a static `<option>` beside the repeated ones,
 * because `data-each` binds the container and repeats its first child — a select cannot
 * hold both a literal option and a bound list. Putting the placeholder in the data is the
 * only way to have both, and it keeps "pick a recording" meaning `sessionId: ''` rather
 * than meaning whichever recording happens to sort first.
 *
 * @param {object[]} library - the recording library rows.
 * @returns {{id: string, name: string}[]} the picker's rows.
 */
export function backtestRecordingOptions(library) {
  const rows = (Array.isArray(library) ? library : []).map((rec) => ({
    id: String(rec?.id ?? ''),
    name: String(rec?.label ?? rec?.id ?? ''),
  }))

  return [{ id: '', name: rows.length > 0 ? 'pick a recording…' : 'no recordings yet' }, ...rows]
}

/**
 * The fill assumptions the drawer currently describes.
 *
 * Read from settings rather than kept beside them, so the numbers a run used and the
 * numbers on screen can never disagree — and because settings is the only persisted
 * branch, the assumptions survive a reload without a second storage path.
 *
 * @param {object} [state] - engine state.
 * @returns {object} the resolved fill config.
 */
export function fillConfigFromSettings(state = appState) {
  const s = state?.settings ?? {}

  return resolveFillConfig({
    spreadBps: s.btSpreadBps,
    latencyMs: s.btLatencyMs,
    slippageBps: s.btSlippageBps,
    size: s.btSize,
    orderType: s.btOrderType,
    venue: s.btVenue,
  })
}

/**
 * Publish a change to the runner's progress.
 *
 * @param {object} [patch] - the fields that changed.
 * @returns {object} the progress state now published.
 */
export function publishBacktest(patch = {}) {
  progress = { ...progress, ...patch }
  progress.pct = progressPercent(progress.played, progress.total)
  setValue(PATHS.backtest.progress, { ...progress })

  return progress
}

/**
 * A run id that sorts chronologically and reads in a log.
 *
 * @param {number} at - epoch ms.
 * @param {string} strategyId - the strategy being scored.
 * @returns {string} the id.
 */
export function backtestRunId(at, strategyId) {
  return `bt-${(Number(at) || 0).toString(36)}-${String(strategyId ?? 'run')}`
}

/**
 * Start the backtest worker, or admit there isn't one.
 *
 * @param {{Worker?: Function, url?: string}} [deps] - injectable constructor.
 * @returns {object|null} the worker, or null when this environment has none.
 */
export function spawnBacktestWorker(deps = {}) {
  const Ctor = 'Worker' in deps ? deps.Worker : globalThis.Worker
  if (typeof Ctor !== 'function') return null

  try {
    // Resolved against this module rather than the page, so the worker loads the same on
    // the dev server, on GitHub Pages under a repo sub-path, and from a local file.
    const url = deps.url ?? new URL('./worker.js', import.meta.url)
    return new Ctor(url, { type: 'module' })
  } catch (err) {
    // A worker that cannot start is a slower backtest, never a broken desk.
    log.warn(`worker unavailable, running in process: ${err?.message ?? err}`)
    return null
  }
}

/**
 * Score a strategy against a recording.
 *
 * @param {{sessionId?: string, strategyId?: string, params?: object,
 *   instrument?: string}} config - the run.
 * @param {{Worker?: Function, url?: string, now?: () => number, db?: object}} [deps] - plumbing.
 * @returns {Promise<object|null>} the result, or null when the run failed or was cancelled.
 */
export function runBacktest(config = {}, deps = {}) {
  // One run at a time from this module. A second start would leave the first worker
  // crunching with nothing reading its messages, and the progress bar would jitter
  // between two runs.
  if (active) cancelBacktest()

  const now = typeof deps.now === 'function' ? deps.now : () => Date.now()
  const strategyId = String(config.strategyId ?? '')
  const strategy = findBacktestStrategy(strategyId)
  if (!strategy) {
    pushToast(`no such strategy: ${strategyId || '—'}`, 'warn')
    return Promise.resolve(null)
  }

  const runId = backtestRunId(now(), strategyId)
  const request = {
    type: 'run',
    runId,
    sessionId: String(config.sessionId ?? ''),
    strategyId,
    instrument: String(config.instrument ?? ''),
    params: config.params ?? {},
    // Snapshotted at launch rather than read inside the worker: a run is scored against
    // the assumptions that were on screen when it started, even if the drawer moves while
    // it crunches.
    fillConfig: config.fillConfig ?? fillConfigFromSettings(),
  }
  setValue(PATHS.backtest.fillConfig, request.fillConfig)

  setValue(PATHS.backtest.error, '')
  setValue(PATHS.backtest.result, null)
  // Cleared as the run starts. Leaving the last run's report on screen while a new one
  // crunches is how somebody reads a number that belongs to different params.
  refreshReport(null)
  setBlockStatus('backtest', BLOCK_STATUS.loading)
  publishBacktest({ ...BACKTEST_STATE, running: true, runId })

  const finish = (result, error) => {
    active = null
    publishBacktest({ running: false })
    setBlockStatus('backtest', BLOCK_STATUS.ready)

    if (error) {
      setValue(PATHS.backtest.error, String(error))
      pushToast(`backtest failed: ${error}`, 'warn')
      return null
    }

    setValue(PATHS.backtest.result, result)
    setValue(PATHS.backtest.summary, backtestSummary(result))
    // The statistics land with the result, not on a later frame: a report that appeared a
    // tick after the numbers it describes would show the previous run's stats beside this
    // run's headline for one paint.
    refreshReport(result)
    log.info(`${runId}: ${result?.played ?? 0} ticks, ${result?.signals?.length ?? 0} signals`)
    pushToast(`backtest: ${result?.signals?.length ?? 0} signals in ${result?.elapsedMs ?? 0}ms`, 'success')
    return result
  }

  const receive = (resolve) => (message) => {
    if (String(message?.runId ?? '') !== runId) return
    if (message.type === 'progress') {
      publishBacktest({ played: message.played, total: message.total, signals: message.signals })
      return
    }
    if (message.type === 'error') return resolve(finish(null, message.error))
    if (message.type === 'done') return resolve(finish(message.result, ''))
  }

  const worker = spawnBacktestWorker(deps)

  return new Promise((resolve) => {
    const handle = receive(resolve)

    if (worker) {
      active = { runId, worker, resolve }
      worker.onmessage = (event) => handle(event?.data)
      worker.onerror = (event) => resolve(finish(null, String(event?.message ?? 'worker error')))
      worker.postMessage(request)
      return
    }

    // In process. Still awaited rather than run inline, so the caller sees one shape of
    // return whichever thread did the work.
    active = { runId, worker: null, resolve }
    runRequest(request, handle, deps).catch((err) => resolve(finish(null, String(err?.message ?? err))))
  })
}

/**
 * Abort the running backtest.
 *
 * @returns {boolean} true when there was something to abort.
 */
export function cancelBacktest() {
  if (!active) return false

  // Posted *and* terminated. The message is for a worker sitting idle between runs; the
  // terminate is for the far commoner case of one mid-loop, where the message would not be
  // read until the run it was meant to stop had already finished.
  active.worker?.postMessage?.({ type: 'cancel', runId: active.runId })
  active.worker?.terminate?.()
  active.resolve?.(null)
  active = null

  publishBacktest({ running: false })
  setBlockStatus('backtest', BLOCK_STATUS.ready)
  pushToast('backtest cancelled', 'warn')

  return true
}

/**
 * Remember what the launcher is pointed at.
 *
 * @param {object} _state - engine state (unused).
 * @param {{field?: string, value?: any}} [payload] - one launcher field.
 * @returns {object} the config now in state.
 */
export function setBacktestConfig(_state, payload = {}) {
  const field = String(payload?.field ?? '')
  const current = appState?.backtest?.config ?? {}
  if (!['sessionId', 'strategyId', 'instrument'].includes(field)) return current

  const next = { ...current, [field]: String(payload?.value ?? '') }
  setValue(PATHS.backtest.config, next)

  return next
}

/**
 * Run whatever the launcher is pointed at.
 *
 * @param {object} state - engine state.
 * @param {object} [payload] - injectable plumbing, for tests.
 * @returns {Promise<object|null>} the result.
 */
export function startBacktest(state, payload = {}) {
  const config = state?.backtest?.config ?? appState?.backtest?.config ?? {}

  return runBacktest({ ...config, ...payload }, payload)
}

/** @returns {object|null} the active run, for tests. */
export function activeBacktest() {
  return active
}

/** Drop the runner's state without touching the desk (tests). */
export function resetBacktestRunner() {
  active = null
  progress = { ...BACKTEST_STATE }
  return true
}

/**
 * Register the backtest actions.
 *
 * @returns {string[]} the registered names.
 */
export function registerBacktestActions() {
  registerAction(ACTIONS.backtest.start, startBacktest, {
    description: 'Score a strategy against a recording',
  })
  registerAction(ACTIONS.backtest.cancel, () => cancelBacktest(), {
    description: 'Abort the running backtest',
  })
  registerAction(ACTIONS.backtest.configure, setBacktestConfig, {
    description: 'Point the backtest launcher at a recording or strategy',
  })

  // The strategy catalog is static, so it is written once rather than recomputed per
  // render. The recording list is not: it grows every time somebody hits REC, so it is
  // derived from the library rather than snapshotted here and left stale.
  setValue(PATHS.backtest.strategies, backtestStrategyOptions())
  computed(PATHS.backtest.recordings, [PATHS.playback.library], (state) =>
    backtestRecordingOptions(state.playback?.library),
  )

  return [ACTIONS.backtest.start, ACTIONS.backtest.cancel, ACTIONS.backtest.configure]
}
