import { setValue } from '../app/engine.js'

/**
 * A slower clock for the things nobody scalps off.
 *
 * The desk has two kinds of state and they deserve different cadences. The bid, the ask,
 * the ladder and the tape are what a trader reads to make a decision — those stay on the
 * frame clock, because the whole product is that they are fast. But the alert panel, the
 * session sparkline, the fee tile: those are *ambient*. Nobody has ever made a decision on
 * the fifty-seventh update of an alert panel in a second, and each one was costing a full
 * re-render of every binding on the path.
 *
 * So ambient paths coalesce to five frames a second. Two properties make that safe rather
 * than merely cheaper:
 *
 * 1. **The first write in a quiet period lands immediately.** A leading-edge throttle
 *    means a single alert appears at once rather than up to 200ms late, so the slow clock
 *    is invisible exactly when there is nothing to be slow about.
 * 2. **The last value always lands.** A trailing flush is what stops a burst ending with a
 *    panel frozen one update short of the truth — which is the failure mode that makes
 *    people distrust a throttle and rip it out.
 */

/** Five frames a second. Fast enough to read, slow enough to cost nothing. */
export const AMBIENT_MS = 200

/**
 * The tape's own clock — faster than ambient, slower than the frame.
 *
 * The tape sat on the frame clock because it is a decision surface, and that was the right
 * instinct with the wrong conclusion. Profiling under a live-rate feed put **58% of the
 * desk's CPU** in one binding: the tape is the only list that grows at the *front*, so every
 * publish shifts every row's index by one, and Spektrum's keyed reconciler re-binds a row
 * whose index moved — a hundred re-binds a frame, each one deep-copying the state tree.
 *
 * 80ms rather than the ambient 200ms because the tape *is* read: it stays inside the desk's
 * <100ms latency budget, so a print is on screen within a frame or two of arriving. What it
 * gives up is the fifty-ninth redraw of a list that is already a blur — and nobody has ever
 * scalped off that.
 *
 * The ladder, the bid and the ask are untouched and stay on the frame clock. Those are read
 * per-tick, and a slow clock on them would be the change that makes this desk feel wrong.
 */
export const TAPE_MS = 80

/** path → { at, timer, value, pending } */
const lanes = new Map()

/**
 * Publish on the ambient clock.
 *
 * @param {string} path - a dotted state path.
 * @param {any} value - the value to write.
 * @param {{everyMs?: number, now?: () => number, timer?: object}} [deps] - injectable clock.
 * @returns {boolean} true when the value was written now rather than deferred.
 */
export function publishAmbient(path, value, deps = {}) {
  const key = String(path ?? '')
  if (!key) return false

  const everyMs = Number(deps.everyMs) > 0 ? Number(deps.everyMs) : AMBIENT_MS
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now()
  const timer = deps.timer ?? globalThis
  const lane = lanes.get(key) ?? { at: -Infinity, timer: null, value: undefined, pending: false }
  const at = now()

  if (at - lane.at >= everyMs) {
    lane.at = at
    lane.pending = false
    lanes.set(key, lane)
    setValue(key, value)
    return true
  }

  // Inside the window: keep only the newest value and make sure one flush is armed. The
  // newest, not the first — a coalesced burst should end on the truth, not on whatever
  // happened to arrive when the window opened.
  lane.value = value
  lanes.set(key, lane)
  if (lane.pending) return false

  lane.pending = true
  lane.timer = timer.setTimeout?.(() => {
    lane.pending = false
    lane.at = now()
    setValue(key, lane.value)
  }, Math.max(0, everyMs - (at - lane.at)))

  return false
}

/**
 * Write every deferred value now.
 *
 * @param {{timer?: object}} [deps] - injectable timer.
 * @returns {number} how many lanes were flushed.
 */
export function flushAmbient(deps = {}) {
  const timer = deps.timer ?? globalThis
  let flushed = 0

  for (const [key, lane] of lanes) {
    if (!lane.pending) continue
    timer.clearTimeout?.(lane.timer)
    lane.pending = false
    setValue(key, lane.value)
    flushed += 1
  }

  return flushed
}

/**
 * Forget every lane (teardown, and tests).
 *
 * @param {{timer?: object}} [deps] - injectable timer.
 * @returns {boolean} true.
 */
export function resetAmbient(deps = {}) {
  const timer = deps.timer ?? globalThis
  for (const lane of lanes.values()) timer.clearTimeout?.(lane.timer)
  lanes.clear()

  return true
}
