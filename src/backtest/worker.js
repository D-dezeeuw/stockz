import { openRecordingDb, readChunks, listSessions } from '../playback/recordings.js'
import { findBacktestStrategy } from './strategies.js'
import { driveBacktest } from './harness.js'

/**
 * The backtest worker.
 *
 * Everything expensive happens here so nothing expensive happens on the desk. A run over a
 * fifteen-minute recording is tens of thousands of `onTick` calls; on the main thread that
 * is a visibly frozen ladder, and a frozen ladder during a live session is not a trade-off
 * worth any amount of analysis.
 *
 * **No bare specifiers, anywhere in this module's graph.** A module worker does not see the
 * document's importmap, so `import 'spektrum'` — which `app/engine.js` does, and which the
 * strategy barrel reaches through `sandbox.js` — would fail the worker at load with a
 * resolution error and no other symptom. That is why the catalog, the harness and the
 * sandbox exist as separate, flatter modules rather than reusing the desk's front doors.
 *
 * Cancellation is a **terminate** from the main thread, not a message. This loop is
 * synchronous by design — yielding between ticks would cost more than the ticks — so a
 * `cancel` posted mid-run sits in the queue until the run it was meant to stop has already
 * finished. The flag below therefore only catches a cancel that arrives between runs;
 * `cancelBacktest()` posts it for that case and terminates for the other.
 */

/** Set by a `cancel` message; read by a run that has not started crunching yet. */
let cancelled = false

/**
 * Load a recording's ticks, in order.
 *
 * @param {string} sessionId - which recording.
 * @param {{db?: object}} [deps] - injectable database.
 * @returns {Promise<{ticks: object[], session: object|null}>} the ticks and their row.
 */
export async function loadRecordingTicks(sessionId, deps = {}) {
  const id = String(sessionId ?? '')
  if (!id) return { ticks: [], session: null }

  const db = deps.db !== undefined ? deps.db : await openRecordingDb()
  if (!db) return { ticks: [], session: null }

  const chunks = await readChunks(db, id)
  const session = (await listSessions(db)).find((row) => String(row?.id) === id) ?? null

  // Flattened in seq order. Driving chunk by chunk would mean a fresh strategy scratchpad
  // per chunk, and a momentum strategy that forgets its ring buffer every five hundred
  // ticks is not the strategy anybody is trying to score.
  return {
    ticks: chunks.flatMap((chunk) => (Array.isArray(chunk?.ticks) ? chunk.ticks : [])),
    session,
  }
}

/**
 * Execute one run request end to end.
 *
 * @param {object} request - `{runId, sessionId, strategyId, params, instrument}`.
 * @param {(message: object) => unknown} post - where messages go.
 * @param {{db?: object, now?: () => number}} [deps] - injectable plumbing.
 * @returns {Promise<object>} the message that was posted last.
 */
export async function runRequest(request, post, deps = {}) {
  const send = typeof post === 'function' ? post : () => {}
  const runId = String(request?.runId ?? '')
  const strategy = findBacktestStrategy(request?.strategyId)

  // Failed loudly rather than scored as a flat run: an unknown strategy id that reported
  // "0 trades" would read as a strategy that never fires.
  if (!strategy) {
    const message = { type: 'error', runId, error: `unknown strategy: ${request?.strategyId}` }
    send(message)
    return message
  }

  const { ticks, session } = await loadRecordingTicks(request?.sessionId, deps)
  if (ticks.length === 0) {
    const message = { type: 'error', runId, error: 'recording has no ticks' }
    send(message)
    return message
  }

  const result = driveBacktest({
    ticks,
    strategy,
    params: request?.params,
    instrument: request?.instrument,
    // The assumptions travel with the request. A result whose fill assumptions were not
    // recorded is a number nobody can reproduce.
    fillConfig: request?.fillConfig,
    now: deps.now,
    cancelled: () => cancelled,
    onProgress: (update) => send({ type: 'progress', runId, ...update }),
  })

  const message = {
    type: 'done',
    runId,
    result: {
      ...result,
      sessionId: String(request?.sessionId ?? ''),
      strategyId: String(strategy.id),
      params: request?.params ?? {},
      label: String(session?.label ?? session?.id ?? request?.sessionId ?? ''),
    },
  }
  send(message)

  return message
}

/**
 * Route one inbound message.
 *
 * @param {object} data - the message body.
 * @param {(message: object) => unknown} post - where replies go.
 * @param {object} [deps] - injectable plumbing.
 * @returns {Promise<object|null>} what was posted, or null for a message with no reply.
 */
export async function handleWorkerMessage(data, post, deps = {}) {
  const type = String(data?.type ?? '')

  if (type === 'cancel') {
    cancelled = true
    return null
  }

  if (type === 'run') {
    // Reset per run: a cancel from a previous request must not kill the next one before
    // it plays a single tick.
    cancelled = false
    return runRequest(data, post, deps)
  }

  return null
}

/** Forget a pending cancel (tests). */
export function resetWorkerCancel() {
  cancelled = false
  return true
}

// Wired only when this module is actually loaded as a worker. Importing it from a test or
// from the main thread must not install a listener on whatever `self` happens to be.
if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && !self.document) {
  self.onmessage = (event) => {
    handleWorkerMessage(event?.data, (message) => self.postMessage(message)).catch((err) => {
      self.postMessage({ type: 'error', runId: String(event?.data?.runId ?? ''), error: String(err?.message ?? err) })
    })
  }
}
