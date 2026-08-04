import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { createLogger } from '../utils/log.js'

/**
 * Which stream the desk is watching.
 *
 * One flag, read everywhere it matters. The dangerous failure here is not a chart drawing
 * the wrong data — it is a trader glancing at a replayed book, seeing a price they like,
 * and acting on a market that closed an hour ago. So the flag drives a badge that cannot
 * be missed, and the live feed is muted while it is set rather than left running underneath
 * where its ticks would interleave with the recorded ones.
 *
 * Orders are already refused during replay by `submit()`'s own gate. This is the layer
 * above that: making it obvious, rather than only making it safe.
 */

const log = createLogger('feed-source')

/** The streams a desk can be watching. */
export const SOURCES = Object.freeze(['live', 'playback'])

/** What the live feed handed over, so exiting can put it back exactly. */
let suspended = null

/**
 * Switch the desk between the live feed and a recording.
 *
 * @param {string} source - a SOURCES member.
 * @param {{feed?: object}} [deps] - the live feed, to mute and restore.
 * @returns {string} the source now in force.
 */
export function setFeedSource(source, deps = {}) {
  const wanted = SOURCES.includes(String(source)) ? String(source) : 'live'
  const current = String(appState.playback?.source ?? 'live')
  if (wanted === current) return current

  const feed = deps.feed ?? suspended?.feed ?? null

  if (wanted === 'playback') {
    // Muted rather than left running: live ticks arriving underneath a replay would
    // interleave with the recorded ones and quietly corrupt the thing being studied.
    feed?.stop?.()
    suspended = { feed }
  } else {
    // Restored on the way out, so leaving replay returns a working desk rather than a
    // silent one that needs a reload.
    suspended?.feed?.start?.()
    suspended = null
  }

  setValue(PATHS.playback.source, wanted)
  log.info(`feed source: ${wanted}`)

  return wanted
}

/** @returns {boolean} true while the desk is showing a recording. */
export function isPlayback(state = appState) {
  return String(state?.playback?.source ?? 'live') === 'playback'
}

/**
 * The clock time-based blocks should read.
 *
 * During playback that is the *recorded* moment, not the wall clock: a session clock
 * showing 14:05 over a book from yesterday morning is the single most confusing thing this
 * desk could display.
 *
 * @param {object} [state] - engine state.
 * @param {() => number} [wall] - the wall clock.
 * @returns {number} epoch ms.
 */
export function feedNow(state = appState, wall = () => Date.now()) {
  if (!isPlayback(state)) return wall()

  return Number(state?.playback?.at) || wall()
}

/** Forget the suspended feed (tests). */
export function resetSource() {
  suspended = null
  return true
}
