import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { EXPORT_SCHEMA } from './export.js'
import { pinLive, returnToLive } from './checkpoints.js'
import { createLogger } from '../utils/log.js'

/**
 * Loading a day back in, and walking through it.
 *
 * The single rule this feature lives or dies by: **a replayed session must never be able to
 * send an order.** Every other consideration is downstream of that. A trader scrubbing
 * through yesterday afternoon is looking at prices that are not real and positions that are
 * not held, and one working buy button in that context is not a bug — it is a market order
 * at a price that stopped existing hours ago.
 *
 * So `replay.active` is a hard gate, set before the payload is loaded and cleared only by
 * leaving, and the live head is pinned first so leaving is always possible. The transport
 * exists because a session is not a video: the interesting question is never "what happened"
 * but "what did I see at the moment I clicked", and that is a *step*, not a timestamp.
 */

const log = createLogger('journal-import')

/** What the transport can be doing. */
export const SPEEDS = Object.freeze([0.5, 1, 2, 4, 10])

/** The loaded session, or null when live. */
let session = null

/** Where in it we are standing. */
let cursor = 0

/**
 * Is this file a session this build can read?
 *
 * @param {object|string} payload - the parsed file, or its text.
 * @returns {{ok: boolean, reason: string, session: object|null}} the verdict.
 */
export function validateSession(payload) {
  let parsed = payload
  if (typeof payload === 'string') {
    try {
      parsed = JSON.parse(payload)
    } catch {
      return { ok: false, reason: 'not JSON', session: null }
    }
  }

  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'not a session', session: null }
  if (parsed.app !== 'stockz') return { ok: false, reason: 'not a STOCKZ export', session: null }

  const version = Number(parsed.schemaVersion)
  // Newer files are refused by name rather than half-read: a session loaded by a build that
  // does not understand half its keys would replay a day that never happened.
  if (!Number.isFinite(version) || version > EXPORT_SCHEMA) {
    return { ok: false, reason: `schema ${parsed.schemaVersion} is newer than this build`, session: null }
  }
  if (!Array.isArray(parsed.trades)) return { ok: false, reason: 'no trades in file', session: null }

  return { ok: true, reason: '', session: parsed }
}

/**
 * Stand in an imported session.
 *
 * @param {object|string} payload - the file.
 * @param {{snapshot?: Function}} [deps] - injectable plumbing.
 * @returns {{ok: boolean, reason: string}} what happened.
 */
export function loadSession(payload, deps = {}) {
  const { ok, reason, session: loaded } = validateSession(payload)
  if (!ok) {
    setValue(PATHS.replay.error, reason)
    return { ok: false, reason }
  }

  // Pinned before anything else changes, so leaving is always possible. A trader who
  // imported a file and could not get back to their live desk has lost the desk.
  pinLive(deps)

  session = loaded
  cursor = 0
  // The gate goes up before the payload lands, not after: one frame of a live buy button
  // over replayed prices is one frame too many.
  setValue(PATHS.replay.active, true)
  setValue(PATHS.replay.error, '')
  setValue(PATHS.replay.cursor, 0)
  setValue(PATHS.replay.total, loaded.trades.length)
  setValue(PATHS.replay.label, `${loaded.exportedAt ?? ''} · ${loaded.trades.length} trades`)
  publishStep()

  return { ok: true, reason: '' }
}

/**
 * Where the transport is standing.
 *
 * @returns {{cursor: number, total: number, trade: object|null}} the position.
 */
export function replayState() {
  const trades = session?.trades ?? []

  return { cursor, total: trades.length, trade: trades[cursor] ?? null }
}

/**
 * Move the transport.
 *
 * @param {number} delta - steps, positive or negative.
 * @returns {number} the cursor after.
 */
export function stepReplay(delta) {
  const trades = session?.trades ?? []
  if (trades.length === 0) return 0

  const wanted = cursor + (Number(delta) || 0)
  // Clamped rather than wrapped: a scrubber that jumped from the last trade of the day back
  // to the first would read as a bug every single time.
  cursor = Math.min(trades.length - 1, Math.max(0, wanted))
  publishStep()

  return cursor
}

/**
 * Jump the transport somewhere.
 *
 * @param {number} position - the step.
 * @returns {number} the cursor after.
 */
export function seekReplay(position) {
  const trades = session?.trades ?? []
  if (trades.length === 0) return 0

  cursor = Math.min(trades.length - 1, Math.max(0, Math.floor(Number(position) || 0)))
  publishStep()

  return cursor
}

/**
 * Publish where the transport is.
 *
 * @returns {object|null} the trade being stood in.
 */
export function publishStep() {
  const at = replayState()
  setValue(PATHS.replay.cursor, at.cursor)
  setValue(PATHS.replay.trade, at.trade)

  return at.trade
}

/**
 * How fast play advances.
 *
 * @param {number} speed - the multiplier.
 * @returns {number} the speed in force.
 */
export function setSpeed(speed) {
  const wanted = Number(speed)
  // Snapped to the offered set: an arbitrary multiplier typed into a box is a control with
  // no correct value, and every value between the presets behaves like one of them anyway.
  // A tie goes to the slower option — being asked to keep up is the failure mode here.
  const closest = SPEEDS.reduce((best, option) =>
    Math.abs(option - wanted) < Math.abs(best - wanted) ? option : best,
  )
  const value = Number.isFinite(wanted) ? closest : 1
  setValue(PATHS.replay.speed, value)

  return value
}

/**
 * Is this order allowed to exist?
 *
 * @returns {boolean} true when the desk is live.
 */
export function liveOnly() {
  // The whole feature's safety in one predicate. A replayed session shows prices that are
  // not real and positions that are not held; an order placed from inside one is a market
  // order at a price that stopped existing hours ago.
  return appState.replay?.active !== true
}

/**
 * Put the live desk back.
 *
 * @param {{jump?: Function}} [deps] - injectable replay.
 * @returns {boolean} true when the desk is live again.
 */
export function exitReplay(deps = {}) {
  session = null
  cursor = 0

  setValue(PATHS.replay.active, false)
  setValue(PATHS.replay.cursor, 0)
  setValue(PATHS.replay.total, 0)
  setValue(PATHS.replay.trade, null)
  setValue(PATHS.replay.label, '')

  return returnToLive(deps)
}

/**
 * Read a dropped or picked file.
 *
 * @param {File} file - the file.
 * @returns {Promise<{ok: boolean, reason: string}>} what happened.
 */
export async function importFile(file) {
  if (!file?.text) return { ok: false, reason: 'no file' }

  try {
    return loadSession(await file.text())
  } catch (err) {
    log.warn(`unreadable session file: ${err?.message ?? err}`)
    setValue(PATHS.replay.error, 'unreadable file')

    return { ok: false, reason: 'unreadable file' }
  }
}

/**
 * Register the replay actions.
 *
 * @returns {string[]} the registered names.
 */
export function registerImportActions() {
  registerAction(ACTIONS.replay.step, (_state, payload) => stepReplay(Number(payload?.delta) || 0))
  registerAction(ACTIONS.replay.seek, (_state, payload) =>
    seekReplay(payload?.value ?? payload?.cursor),
  )
  registerAction(ACTIONS.replay.speed, (_state, payload) => setSpeed(payload?.value ?? payload?.speed))
  registerAction(ACTIONS.replay.exit, () => exitReplay())
  registerAction(ACTIONS.replay.import, (_state, payload) => importFile(payload?.file ?? payload))

  return [
    ACTIONS.replay.step,
    ACTIONS.replay.seek,
    ACTIONS.replay.speed,
    ACTIONS.replay.exit,
    ACTIONS.replay.import,
  ]
}

/**
 * Forget any loaded session.
 *
 * @returns {boolean} true.
 */
export function resetReplay() {
  session = null
  cursor = 0
  setValue(PATHS.replay.active, false)
  setValue(PATHS.replay.cursor, 0)
  setValue(PATHS.replay.total, 0)
  setValue(PATHS.replay.error, '')

  return true
}
