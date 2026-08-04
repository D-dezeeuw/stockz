import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { onTick } from '../pipeline/bus.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { pushToast } from '../ui/toast.js'
import { openRecordingDb, putRecord, SESSION_STORE, CHUNK_STORE } from './recordings.js'
import { createLogger } from '../utils/log.js'

/**
 * The tick recorder.
 *
 * Capture what actually happened so it can be replayed later. The market a scalper wants
 * to study is never the one in front of them — it is the fifteen minutes that already went
 * wrong, and without a recording those minutes are gone the moment the tape scrolls.
 *
 * Buffered and flushed in **batches**, never per tick. A write per tick would put an
 * IndexedDB transaction on the hot path of every message from every feed, which is the one
 * place on this desk that cannot afford one. Ticks accumulate in a plain array and go out
 * every 500 of them or every two seconds, whichever comes first — the count keeps a burst
 * from growing the buffer without bound, the timer keeps a quiet market from sitting
 * unwritten and losing everything to a closed tab.
 */

const log = createLogger('recorder')

/** Flush after this many ticks. */
export const CHUNK_TICKS = 500

/** Or after this long, whichever comes first. */
export const CHUNK_MS = 2000

/**
 * A session id that sorts chronologically and cannot collide within a millisecond.
 *
 * @param {number} at - epoch ms.
 * @param {() => number} [random] - injectable entropy.
 * @returns {string} the id.
 */
export function sessionId(at, random = Math.random) {
  const stamp = Number(at) || 0
  const salt = Math.floor(random() * 1e6).toString(36).padStart(4, '0')

  return `rec-${stamp.toString(36)}-${salt}`
}

/**
 * Describe a recording for the picker.
 *
 * @param {object} session - the in-progress session.
 * @param {number} endedAt - when it stopped.
 * @returns {object} the row written to the sessions store.
 */
export function finalizeSession(session, endedAt) {
  const started = Number(session?.startedAt) || 0
  const ended = Number(endedAt) || started

  return {
    id: String(session?.id ?? ''),
    venue: String(session?.venue ?? 'okx'),
    // Every instrument that actually appeared, not the one that was focused when REC was
    // pressed: a recording is judged later by what is in it.
    instruments: [...(session?.instruments ?? [])].sort(),
    startedAt: started,
    endedAt: ended,
    durationMs: Math.max(0, ended - started),
    ticks: Number(session?.ticks) || 0,
    chunks: Number(session?.seq) || 0,
  }
}

/** The recorder currently running, if any. */
let active = null

/**
 * Start recording every tick that crosses the desk.
 *
 * @param {{now?: () => number, timer?: object, subscribe?: Function, db?: object,
 *   chunkTicks?: number, chunkMs?: number}} [deps] - injectable plumbing.
 * @returns {Promise<object|null>} the running recorder, or null when it could not start.
 */
export async function startRecording(deps = {}) {
  if (active) return active

  const now = typeof deps.now === 'function' ? deps.now : () => Date.now()
  const timer = deps.timer ?? globalThis
  const subscribe = typeof deps.subscribe === 'function' ? deps.subscribe : onTick
  const perChunk = Number(deps.chunkTicks) > 0 ? Number(deps.chunkTicks) : CHUNK_TICKS
  const everyMs = Number(deps.chunkMs) > 0 ? Number(deps.chunkMs) : CHUNK_MS

  const db = deps.db !== undefined ? deps.db : await openRecordingDb()
  if (!db) {
    pushToast('recording unavailable in this browser', 'warn')
    return null
  }

  const startedAt = now()
  const session = {
    id: sessionId(startedAt),
    venue: 'okx',
    instruments: new Set(),
    startedAt,
    ticks: 0,
    seq: 0,
  }
  let buffer = []

  const flush = async () => {
    if (buffer.length === 0) return 0
    // Swapped before the await, not after: another tick arriving mid-write must land in the
    // next chunk rather than in the array being serialised.
    const batch = buffer
    buffer = []
    const seq = session.seq++

    await putRecord(db, CHUNK_STORE, { sessionId: session.id, seq, ticks: batch })
    return batch.length
  }

  const handle = timer.setInterval?.(() => flush().catch(() => 0), everyMs)
  const unsubscribe = subscribe((tick) => {
    if (!tick?.symbol) return
    session.instruments.add(String(tick.symbol))
    session.ticks += 1
    buffer.push(tick)

    if (buffer.length >= perChunk) flush().catch(() => 0)
  })

  setValue(PATHS.playback.recording, { id: session.id, startedAt, ticks: 0 })
  log.info(`recording ${session.id}`)

  active = {
    session,
    async stop() {
      timer.clearInterval?.(handle)
      unsubscribe?.()
      await flush()

      const row = finalizeSession(session, now())
      await putRecord(db, SESSION_STORE, row)
      setValue(PATHS.playback.recording, null)
      active = null

      pushToast(`recorded ${row.ticks} ticks`, 'success')
      return row
    },
  }

  return active
}

/**
 * Stop the running recording.
 *
 * @returns {Promise<object|null>} the finished session row, or null when none was running.
 */
export async function stopRecording() {
  if (!active) return null
  return active.stop()
}

/** @returns {boolean} true while a recording is running. */
export function isRecording(state = appState) {
  return Boolean(state?.playback?.recording?.id)
}

/**
 * Start or stop recording.
 *
 * @param {object} _state - engine state (unused).
 * @param {object} [payload] - injectable plumbing, for tests.
 * @returns {Promise<object|null>} what the toggle produced.
 */
export function toggleRecording(_state, payload = {}) {
  return active ? stopRecording() : startRecording(payload)
}

/** Forget the running recorder without writing anything (tests). */
export function resetRecorder() {
  active = null
  return true
}

/**
 * Register the recorder action.
 *
 * @returns {string[]} the registered names.
 */
export function registerRecorderActions() {
  registerAction(ACTIONS.playback.record, toggleRecording, {
    description: 'Start or stop recording ticks',
  })

  return [ACTIONS.playback.record]
}
