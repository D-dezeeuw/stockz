import { addSystem, removeSystem, setValue, watch, appState } from '../app/engine.js'
import { PATHS } from './paths.js'
import { createLogger } from '../utils/log.js'
import { expireToasts } from '../ui/toast.js'

/**
 * Repeating work, registered once and centrally.
 *
 * Clocks, heartbeats and threshold watches all want the same thing: run on a cadence,
 * write to state, stay cheap. Registering them here (instead of each feature owning a
 * `setInterval`) means one place decides how often the desk does background work — which
 * matters when the main thread is also painting a moving tape.
 *
 * Every registration is tracked so `stopSystems()` can undo it. Without that, a hot
 * reload stacks a second clock on the first and the desk quietly does double work.
 */

const log = createLogger('systems')

/** Teardown callbacks for everything registered by this module. */
const teardowns = []

/** Interval handles, so timers stop too. */
const timers = []

/**
 * Format a UTC clock string — the desk's canonical time, since venues stamp in UTC and a
 * scalper comparing local time to a venue timestamp is how minutes get misread.
 *
 * @param {number} ms - epoch milliseconds.
 * @returns {string} 'HH:MM:SS' in UTC, or '--:--:--' for a bad input.
 */
export function utcClock(ms) {
  if (!Number.isFinite(ms)) return '--:--:--'
  return new Date(ms).toISOString().slice(11, 19)
}

/**
 * Seconds the desk has been up.
 *
 * @param {number} now - current epoch ms.
 * @param {number} bootedAt - boot epoch ms.
 * @returns {number} whole seconds, never negative.
 */
export function uptimeSeconds(now, bootedAt) {
  if (!Number.isFinite(now) || !Number.isFinite(bootedAt) || bootedAt <= 0) return 0
  return Math.max(0, Math.floor((now - bootedAt) / 1000))
}

/**
 * Whether a spread is wide enough to be worth warning about.
 *
 * Scalping a wide book is how edge evaporates, so the desk says so rather than letting
 * the trader discover it in the fills.
 *
 * @param {number} spreadBps - current spread in basis points.
 * @param {number} [limitBps] - warn at or above this.
 * @returns {boolean} true when the book is too wide to scalp comfortably.
 */
export function isSpreadAnomalous(spreadBps, limitBps = 25) {
  if (!Number.isFinite(spreadBps) || !Number.isFinite(limitBps)) return false
  return Math.abs(spreadBps) >= limitBps
}

/**
 * Start the desk's background systems.
 *
 * @param {{now?: () => number, intervalMs?: number, timer?: object}} [options] - injected
 *   clock and scheduler, so tests drive time instead of waiting for it.
 * @returns {{names: string[], stop: () => void}} what was started and how to stop it.
 */
export function registerSystems(options = {}) {
  const { now = () => Date.now(), intervalMs = 1000, timer = globalThis } = options

  // Clock + uptime: one timer, both values, written on a cadence rather than per frame.
  const handle = timer.setInterval?.(() => tickClock(now()), intervalMs)
  if (handle !== undefined) timers.push(handle)

  // Heartbeat: proof the engine's tick pump is alive. A frozen heartbeat with a moving
  // market is the signal that rendering has stalled.
  const heartbeat = (state) => {
    setValue(PATHS.app.heartbeat, (state.app?.heartbeat ?? 0) + 1)
  }
  addSystem([PATHS.market.ticks], heartbeat)
  teardowns.push(() => removeSystem(heartbeat))

  // Theme changes repaint canvas layers (phase 13); the seam is explicit from day one.
  watch([PATHS.ui.theme], onThemeChange)
  teardowns.push(() => removeSystem(onThemeChange))

  const spreadWatch = makeSpreadWatcher()
  watch([PATHS.market.spreadBps], spreadWatch)
  teardowns.push(() => removeSystem(spreadWatch))

  return { names: ['clock', 'heartbeat', 'themeWatch', 'spreadWatch'], stop: stopSystems }
}

/**
 * React to a theme change — canvas layers re-palette here from phase 13 on.
 *
 * @param {object} state - engine state.
 * @returns {string} the theme now in force.
 */
export function onThemeChange(state) {
  const theme = state?.ui?.theme ?? 'unknown'

  // Canvas layers cannot inherit CSS custom properties: a chart drawn in phosphor green
  // stays phosphor green on a white background until it is redrawn. Every canvas
  // renderer registers here (phase 13) and repaints on this signal.
  for (const repaint of themeSubscribers) repaint(theme)

  log.debug(`theme -> ${theme} (${themeSubscribers.size} repaints)`)
  return theme
}

/** Canvas renderers that must repaint when the palette flips. */
const themeSubscribers = new Set()

/**
 * Register a canvas repaint for theme changes.
 *
 * @param {(theme: string) => unknown} repaint - called with the new theme.
 * @returns {() => void} unsubscribe.
 */
export function onThemeRepaint(repaint) {
  if (typeof repaint !== 'function') return () => {}

  themeSubscribers.add(repaint)
  return () => themeSubscribers.delete(repaint)
}

/**
 * Build the spread-anomaly watcher.
 *
 * A factory because the watcher latches: it warns on the *crossing*, not on every tick
 * while the book stays wide. Warning per tick on a fast feed would bury every other
 * message in the log.
 *
 * @param {{warn: (msg: string) => unknown}} [logger] - where warnings go.
 * @returns {(state: object) => boolean} the watcher; returns the current anomaly state.
 */
export function makeSpreadWatcher(logger = log) {
  let wasAnomalous = false

  return (state) => {
    const anomalous = isSpreadAnomalous(state?.market?.spreadBps)

    if (anomalous !== wasAnomalous) {
      wasAnomalous = anomalous
      if (anomalous) logger.warn(`spread wide: ${Math.round(state?.market?.spreadBps ?? 0)}bps`)
    }
    return anomalous
  }
}

/**
 * Write one clock tick into state.
 *
 * @param {number} ms - current epoch ms.
 * @returns {{clock: string, uptime: number, expired: number}} what was written and how
 *   many toasts aged out on this pass.
 */
export function tickClock(ms) {
  const clock = utcClock(ms)
  const uptime = uptimeSeconds(ms, appState?.app?.bootedAt ?? 0)

  setValue(PATHS.app.clock, clock)
  setValue(PATHS.app.uptime, uptime)
  // One expiry pass per clock tick beats N pending timeouts, and stays correct after the
  // tab has been backgrounded.
  const expired = expireToasts(ms)
  return { clock, uptime, expired }
}

/**
 * Stop and forget every system this module started.
 *
 * Idempotent by design: a hot reload that re-registers without tearing down first would
 * stack a second clock on the first, and the desk would quietly do double work.
 *
 * @param {{timer?: object}} [options] - injected scheduler, matching registerSystems.
 * @returns {number} how many registrations were undone.
 */
export function stopSystems(options = {}) {
  const { timer = globalThis } = options
  let undone = 0

  for (const handle of timers.splice(0)) {
    timer.clearInterval?.(handle)
    undone += 1
  }
  for (const teardown of teardowns.splice(0)) {
    teardown()
    undone += 1
  }
  return undone
}
