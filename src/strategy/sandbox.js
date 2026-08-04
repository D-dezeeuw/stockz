import { setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { createRing } from '../pipeline/ring.js'

/**
 * One bad strategy, contained.
 *
 * A strategy is somebody's idea, written fast, tested less. It will throw. The question is
 * only whether it takes the tick loop, its neighbours, and the desk's feed with it.
 *
 * So a throw becomes *data*: an `{ok, error}` result, a consecutive-error tally, and — at
 * three in a row — an automatic bench. Three rather than one, because a single throw on a
 * malformed frame is a bug worth surviving, while three in a row is a strategy that is
 * simply broken and will keep being broken every tick until somebody looks.
 *
 * Quarantine is visible and reversible. A strategy that vanished silently would be
 * indistinguishable from one that has nothing to say, which is exactly the confusion the
 * tally exists to prevent.
 */

/** Consecutive errors before a run is benched. */
export const QUARANTINE_AFTER = 3

/** How many recent failures stay inspectable. */
export const ERROR_LOG_SIZE = 64

const errorLog = createRing(ERROR_LOG_SIZE)

/** Benched runs, by run key. */
const benched = new Map()

/**
 * Call a hook without letting it escape.
 *
 * @param {Function} fn - the hook.
 * @param {string} runKey - the run it belongs to.
 * @param {...any} args - the hook's arguments.
 * @returns {{ok: boolean, value: any, error: string, runKey: string}} the result.
 */
export function safeInvoke(fn, runKey, ...args) {
  const key = String(runKey ?? '')
  if (typeof fn !== 'function') return { ok: false, value: undefined, error: 'not callable', runKey: key }

  try {
    return { ok: true, value: fn(...args), error: '', runKey: key }
  } catch (err) {
    // The message, not the Error: what lands in state must survive serialize() and a
    // journal export, and an Error object survives neither.
    return { ok: false, value: undefined, error: String(err?.message ?? err), runKey: key }
  }
}

/**
 * Count consecutive failures.
 *
 * @param {number} prev - the run's current tally.
 * @param {{ok?: boolean}} result - the latest result.
 * @returns {number} the new tally.
 */
export function errorTally(prev, result) {
  const count = Number(prev) || 0
  // Any success clears it. A strategy that throws once an hour is not the same problem as
  // one throwing every tick, and a cumulative counter would eventually bench both.
  return result?.ok === true ? 0 : count + 1
}

/**
 * Record a failure for later inspection.
 *
 * @param {{runKey?: string, error?: string}} result - the failed result.
 * @param {number} now - the timestamp.
 * @returns {object|null} the logged entry.
 */
export function logStrategyError(result, now) {
  if (result?.ok !== false) return null

  const entry = {
    runKey: String(result?.runKey ?? ''),
    error: String(result?.error ?? ''),
    ts: Number(now) || 0,
  }
  errorLog.push(entry)

  return entry
}

/**
 * The recent failures.
 *
 * @returns {object[]} newest last.
 */
export function strategyErrors() {
  return errorLog.toArray()
}

/**
 * Bench a run.
 *
 * @param {object} run - the run.
 * @param {string} error - the last error.
 * @param {(key: string) => boolean} [stop] - how to stop it.
 * @returns {object|null} the quarantine record.
 */
export function quarantine(run, error, stop) {
  if (!run?.key) return null

  const record = {
    key: run.key,
    strategyId: String(run.strategyId ?? ''),
    instrument: String(run.instrument ?? ''),
    error: String(error ?? ''),
    at: Number(run.ticks) || 0,
  }

  benched.set(run.key, record)
  // Stopped, not merely flagged: a benched run whose subscription survived would keep
  // throwing every tick behind a UI that says it is off.
  if (typeof stop === 'function') stop(run.key)
  publishQuarantined()

  return record
}

/**
 * Is a run benched?
 *
 * @param {string} runKey - the run key.
 * @returns {boolean} true when quarantined.
 */
export function isQuarantined(runKey) {
  return benched.has(String(runKey ?? ''))
}

/**
 * Let a fixed strategy back in.
 *
 * @param {string} runKey - the run key.
 * @returns {object|null} the record it was released from.
 */
export function release(runKey) {
  const key = String(runKey ?? '')
  const record = benched.get(key) ?? null
  if (!record) return null

  benched.delete(key)
  publishQuarantined()
  return record
}

/**
 * Publish who is benched and why.
 *
 * @returns {object[]} the records.
 */
export function publishQuarantined() {
  const rows = [...benched.values()]
  setValue(PATHS.strategy.quarantined, rows)
  return rows
}

/**
 * Forget every failure and every bench.
 *
 * @returns {boolean} true.
 */
export function resetSandbox() {
  benched.clear()
  errorLog.clear()
  return true
}

/**
 * Fold one hook result into a run's sandbox state.
 *
 * @param {object} run - the run.
 * @param {object} result - the hook result.
 * @param {{stop?: Function, now?: number}} [options] - how to bench it, and when.
 * @returns {{errors: number, quarantined: boolean}} the run's sandbox state.
 */
export function recordResult(run, result, options = {}) {
  const errors = errorTally(run?.errors, result)
  if (run) run.errors = errors
  if (result?.ok !== false) return { errors, quarantined: false }

  logStrategyError(result, options.now)
  // Three rather than one: a single throw on a malformed frame is a bug worth surviving,
  // three in a row is a strategy that will keep throwing every tick until somebody looks.
  if (errors < QUARANTINE_AFTER) return { errors, quarantined: false }

  quarantine(run, result.error, options.stop)
  return { errors, quarantined: true }
}
