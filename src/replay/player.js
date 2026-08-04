import { setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { publishTick } from '../pipeline/bus.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { pushToast } from '../ui/toast.js'
import { openRecordingDb, readChunks, listSessions } from './recordings.js'
import { createLogger } from '../utils/log.js'

/**
 * The replay transport.
 *
 * A video editor for markets: load a recorded session, play it at 1x to 50x, pause it,
 * step one tick at a time, and jump anywhere in it. The point is not to watch — it is to
 * stop on the tick where the decision went wrong and look at the book as it was.
 *
 * Ticks are republished onto the **same bus** the live feed uses, so the ladder, the tape,
 * the chart and the strategies all replay without knowing they are not live. That is the
 * whole reason replay is worth having: a strategy tested against a separate playback path
 * is a strategy tested against something other than the desk.
 *
 * Orders are already blocked during replay — `submit()` refuses when `liveOnly()` is
 * false — so nothing here has to guard the order path a second time.
 *
 * **Distinct from the journal's trade replay.** Phase 25 already time-travels through
 * *trades* and owns `replay.active`, `replay.cursor` and the `replay.step`/`speed`/`exit`
 * actions. This is market *tick* replay — a different thing that happens to share a word —
 * so it keeps its own `replay.player` object and its own action names rather than fighting
 * the other one for the same paths.
 */

const log = createLogger('replay')

/** The speeds the transport snaps between. */
export const SPEEDS = Object.freeze([1, 2, 5, 10, 25, 50])

/**
 * No gap is ever replayed longer than this, whatever the recording holds.
 *
 * A session with a four-minute quiet stretch would otherwise replay four minutes of
 * nothing at 1x, and the trader would conclude the player had hung.
 */
export const MAX_GAP_MS = 2000

/**
 * How long to wait before the next tick.
 *
 * @param {object} current - the tick about to play.
 * @param {object} next - the one after it.
 * @param {number} speed - the speed factor.
 * @returns {number} milliseconds to wait.
 */
export function nextTickDelay(current, next, speed = 1) {
  const from = Number(current?.ts)
  const to = Number(next?.ts)
  const factor = Math.max(1, Number(speed) || 1)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0

  // Clamped before scaling, so a quiet stretch is skipped rather than merely shortened.
  const gap = Math.min(MAX_GAP_MS, Math.max(0, to - from))
  // Floored at zero rather than at 1ms: at 50x a burst should replay as a burst, and
  // forcing a millisecond between ticks would stretch it back out.
  return Math.max(0, Math.round(gap / factor))
}

/** The transport's shape in state; one object rather than five paths beside phase 25's. */
export const PLAYER_STATE = Object.freeze({
  active: false,
  playing: false,
  cursor: 0,
  total: 0,
  speed: 1,
  label: '',
})

/**
 * The transport's own copy, held outside the reactive tree.
 *
 * Merged onto this rather than onto `appState`, because `setValue` lands *next tick*: two
 * publishes inside one action — `playing: true` then `cursor: 1`, which is exactly what
 * starting playback does — would both read the pre-flush state and the second would
 * silently drop the first.
 */
let transport = { ...PLAYER_STATE }

/**
 * Publish a change to the transport.
 *
 * One object write rather than a path each: the fields always move together, and five
 * separate writes would repaint the block up to five times for one action.
 *
 * @param {object} patch - the fields that changed.
 * @returns {object} the transport state now published.
 */
export function publishPlayer(patch = {}) {
  transport = { ...transport, ...patch }
  setValue(PATHS.replay.player, { ...transport })

  return transport
}

/** The player currently loaded, if any. */
let player = null

/**
 * Load a recording into the transport.
 *
 * @param {string} sessionId - which recording.
 * @param {{db?: object}} [deps] - injectable database.
 * @returns {Promise<object|null>} the loaded player, or null.
 */
export async function loadReplay(sessionId, deps = {}) {
  const id = String(sessionId ?? '')
  if (!id) return null

  const db = deps.db !== undefined ? deps.db : await openRecordingDb()
  if (!db) return null

  const chunks = await readChunks(db, id)
  // Flattened once, up front. Streaming chunk by chunk would put an IndexedDB read between
  // two ticks that were milliseconds apart when recorded, which is exactly the timing
  // replay exists to preserve.
  const ticks = chunks.flatMap((chunk) => (Array.isArray(chunk?.ticks) ? chunk.ticks : []))
  if (ticks.length === 0) return null

  const session = (await listSessions(db)).find((row) => String(row?.id) === id)
  player = { id, ticks, cursor: 0, playing: false, handle: null }

  publishPlayer({ active: true, total: ticks.length, cursor: 0, playing: false, label: String(session?.label ?? id) })
  log.info(`loaded ${id}: ${ticks.length} ticks`)

  return player
}

/**
 * Publish the tick under the cursor and advance.
 *
 * @param {object} [deps] - injectable bus.
 * @returns {object|null} the tick played, or null at the end.
 */
export function stepTick(deps = {}) {
  const emit = typeof deps.publish === 'function' ? deps.publish : publishTick
  if (!player || player.cursor >= player.ticks.length) return null

  const tick = player.ticks[player.cursor]
  player.cursor += 1

  // Onto the live bus, so the ladder, tape, chart and strategies all replay without
  // knowing they are not live.
  emit(tick)
  publishPlayer({ cursor: player.cursor })

  return tick
}

/**
 * Start playing.
 *
 * @param {{timer?: object, publish?: Function}} [deps] - injectable plumbing.
 * @returns {boolean} true when playing.
 */
export function playReplay(deps = {}) {
  const timer = deps.timer ?? globalThis
  if (!player || player.playing) return Boolean(player?.playing)

  player.playing = true
  publishPlayer({ playing: true })

  const pump = () => {
    if (!player?.playing) return
    const tick = stepTick(deps)
    if (!tick) return pauseReplay(deps)

    const next = player.ticks[player.cursor]
    if (!next) return pauseReplay(deps)

    const delay = nextTickDelay(tick, next, transport.speed)
    player.handle = timer.setTimeout?.(pump, delay)
  }
  pump()

  return true
}

/**
 * Stop playing, keeping the cursor where it is.
 *
 * @param {{timer?: object}} [deps] - injectable timer.
 * @returns {boolean} true when paused.
 */
export function pauseReplay(deps = {}) {
  const timer = deps.timer ?? globalThis
  if (!player) return false

  player.playing = false
  timer.clearTimeout?.(player.handle)
  player.handle = null
  publishPlayer({ playing: false })

  return true
}

/**
 * Jump to a position in the session.
 *
 * @param {number} index - the tick index.
 * @returns {number} the cursor now.
 */
export function seekToTick(index) {
  if (!player) return 0

  // Clamped rather than refused: a click at the very end of the timeline is a seek to the
  // end, not a mistake.
  const wanted = Math.max(0, Math.min(player.ticks.length, Math.floor(Number(index) || 0)))
  player.cursor = wanted
  publishPlayer({ cursor: wanted })

  return wanted
}

/**
 * Set the playback speed.
 *
 * @param {object} _state - engine state (unused).
 * @param {{speed?: number, value?: number}} [payload] - the new speed.
 * @returns {number} the speed now in force.
 */
export function setReplaySpeed(_state, payload = {}) {
  const wanted = Number(payload?.speed ?? payload?.value)
  // Snapped to a listed speed rather than accepting any number: the transport has six
  // buttons, and a speed the buttons cannot show is a state nothing on screen explains.
  const speed = SPEEDS.includes(wanted) ? wanted : 1
  publishPlayer({ speed })

  return speed
}

/**
 * Leave replay and return to the live desk.
 *
 * @param {object} _state - engine state (unused).
 * @param {object} [payload] - injectable timer.
 * @returns {boolean} true when the desk is live again.
 */
export function exitReplay(_state, payload = {}) {
  pauseReplay(payload)
  player = null

  publishPlayer({ active: false, cursor: 0, total: 0, playing: false, label: '' })
  pushToast('back to live', 'success')

  return true
}

/** @returns {object|null} the loaded player, for tests. */
export function currentPlayer() {
  return player
}

/** Drop the player without touching state (tests). */
export function resetPlayer() {
  player = null
  transport = { ...PLAYER_STATE }
  return true
}

/**
 * Register the transport actions.
 *
 * @returns {string[]} the registered names.
 */
export function registerPlayerActions() {
  registerAction(ACTIONS.replay.play, (_state, payload) => playReplay(payload), {
    description: 'Play the loaded recording',
  })
  registerAction(ACTIONS.replay.pause, (_state, payload) => pauseReplay(payload), {
    description: 'Pause playback',
  })
  registerAction(ACTIONS.replay.load, (_state, payload) => loadReplay(payload?.id, payload), {
    description: 'Load a recording into the transport',
  })
  registerAction(ACTIONS.replay.stepTick, (_state, payload) => stepTick(payload), {
    description: 'Advance the recording one tick',
  })
  registerAction(ACTIONS.replay.tickSpeed, setReplaySpeed, {
    description: 'Set tick playback speed',
  })
  registerAction(ACTIONS.replay.unload, exitReplay, {
    description: 'Leave tick replay and return to live',
  })

  return [
    ACTIONS.replay.play,
    ACTIONS.replay.pause,
    ACTIONS.replay.load,
    ACTIONS.replay.stepTick,
    ACTIONS.replay.tickSpeed,
    ACTIONS.replay.unload,
  ]
}
