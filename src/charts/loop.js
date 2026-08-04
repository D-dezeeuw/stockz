/**
 * The shared frame scheduler.
 *
 * Every chart layer on the desk — tick line, candles, crosshair, markers, levels,
 * dozens of watchlist sparklines — runs on this one heartbeat rather than each holding
 * its own `requestAnimationFrame`. Two things follow from that, and both matter more on
 * a scalping desk than on a normal dashboard:
 *
 * **It stops.** When nothing is dirty the loop cancels its frame outright instead of
 * spinning at 60fps drawing identical pixels. A quiet market should cost zero CPU; the
 * laptop staying cool between bursts is what keeps the fan off the microphone and the
 * battery alive through a session.
 *
 * **It prioritises.** Inside one frame the main chart draws before the sparklines, and
 * when the budget runs out the low-priority layers wait for the next frame. A tick storm
 * must never make the price line stutter because forty mini-charts wanted the same 16ms.
 */

/** Draw priorities, highest first. */
export const PRIORITIES = Object.freeze(['high', 'normal', 'low'])

/** Milliseconds of a frame a low-priority layer may not push past. */
export const FRAME_BUDGET_MS = 8

/**
 * Whether the loop should cancel its frame.
 *
 * @param {Set<string>|Array<string>} dirty - ids marked dirty.
 * @returns {boolean} true when there is nothing to draw.
 */
export function shouldStop(dirty) {
  if (!dirty) return true
  const size = typeof dirty.size === 'number' ? dirty.size : dirty.length

  return !size
}

/**
 * Fold repeated marks into the set drained by the next frame.
 *
 * @param {Set<string>} marks - the pending set.
 * @param {string|string[]} ids - id or ids to mark.
 * @returns {Set<string>} the same set, for chaining.
 */
export function coalesceMarks(marks, ids) {
  const set = marks instanceof Set ? marks : new Set()

  // A tick storm calls markDirty forty times for one surface between frames; the set
  // makes that exactly one draw, which is the whole reason marks are not draws.
  for (const id of Array.isArray(ids) ? ids : [ids]) {
    if (id !== undefined && id !== null && id !== '') set.add(String(id))
  }
  return set
}

/**
 * Whether a frame has spent its budget.
 *
 * @param {number} startedAt - frame start, from a monotonic clock.
 * @param {number} now - the current reading of that clock.
 * @param {number} [budgetMs] - the allowance.
 * @returns {boolean} true when low-priority work should defer to the next frame.
 */
export function overBudget(startedAt, now, budgetMs = FRAME_BUDGET_MS) {
  const elapsed = Number(now) - Number(startedAt)
  if (!Number.isFinite(elapsed)) return false

  return elapsed >= (Number(budgetMs) || FRAME_BUDGET_MS)
}

/**
 * Create the shared scheduler.
 *
 * @param {{raf?: Function, cancel?: Function, clock?: () => number,
 *   budgetMs?: number}} [options] - injectable frame plumbing.
 * @returns {object} the scheduler.
 */
export function createScheduler(options = {}) {
  const {
    raf = globalThis.requestAnimationFrame,
    cancel = globalThis.cancelAnimationFrame,
    clock = () => globalThis.performance?.now?.() ?? 0,
    budgetMs = FRAME_BUDGET_MS,
  } = options

  const surfaces = new Map()
  let marks = new Set()
  let handle = null
  let frames = 0
  let draws = 0
  let deferred = 0

  const schedule = () => {
    if (handle !== null || typeof raf !== 'function') return false
    handle = raf(frame)
    return true
  }

  const frame = () => {
    handle = null
    frames += 1
    if (shouldStop(marks)) return 0

    const startedAt = clock()
    const pending = marks
    marks = new Set()
    let drawn = 0

    for (const priority of PRIORITIES) {
      for (const [id, surface] of surfaces) {
        if (!pending.has(id) || surface.priority !== priority) continue

        // Low-priority layers yield when the frame is spent; their mark carries over so
        // they draw next frame rather than being dropped.
        if (priority === 'low' && overBudget(startedAt, clock(), budgetMs)) {
          marks.add(id)
          deferred += 1
          continue
        }
        surface.draw()
        drawn += 1
        draws += 1
      }
    }

    // Only re-arm if something is still waiting: a quiet market costs zero frames.
    if (!shouldStop(marks)) schedule()
    return drawn
  }

  return {
    /**
     * Register a surface.
     *
     * @param {string} id - unique surface id.
     * @param {Function} draw - the draw call.
     * @param {{priority?: string}} [meta] - draw priority.
     * @returns {() => void} unregister.
     */
    register(id, draw, meta = {}) {
      const key = String(id)
      const priority = PRIORITIES.includes(meta.priority) ? meta.priority : 'normal'
      surfaces.set(key, { draw: typeof draw === 'function' ? draw : () => {}, priority })

      return () => {
        surfaces.delete(key)
        marks.delete(key)
      }
    },

    /**
     * Mark surfaces dirty and arm the next frame.
     *
     * @param {string|string[]} ids - surface ids.
     * @returns {number} pending marks.
     */
    markDirty(ids) {
      marks = coalesceMarks(marks, ids)
      if (!shouldStop(marks)) schedule()
      return marks.size
    },

    /** Draw everything registered, e.g. after a tab regains visibility. */
    markAll() {
      marks = coalesceMarks(marks, [...surfaces.keys()])
      if (!shouldStop(marks)) schedule()
      return marks.size
    },

    frame,

    /** Cancel the pending frame without dropping the marks. */
    stop() {
      if (handle !== null && typeof cancel === 'function') cancel(handle)
      handle = null
      return true
    },

    /** @returns {object} counters for the debug overlay. */
    stats: () => ({
      surfaces: surfaces.size,
      pending: marks.size,
      frames,
      draws,
      deferred,
      running: handle !== null,
    }),
  }
}

/**
 * Pause the scheduler while the tab is hidden, redrawing everything on return.
 *
 * @param {object} scheduler - the scheduler.
 * @param {Document} [doc] - the document.
 * @returns {() => void} unsubscribe.
 */
export function pauseWhenHidden(scheduler, doc = globalThis.document) {
  if (!scheduler || !doc?.addEventListener) return () => {}

  const onChange = () => {
    // A backgrounded terminal costs nothing; coming back redraws everything at once,
    // because whatever the market did meanwhile happened without any frames to show it.
    if (doc.hidden) scheduler.stop()
    else scheduler.markAll()
  }

  doc.addEventListener('visibilitychange', onChange)
  return () => doc.removeEventListener?.('visibilitychange', onChange)
}

/**
 * Draw the debug readout: fps, surface count and deferred draws.
 *
 * Behind the `debugCharts` setting rather than always on — but worth having, because
 * "the chart feels sluggish" is unfalsifiable and "12fps, 38 surfaces, 21 deferred" is
 * a bug report.
 *
 * @param {CanvasRenderingContext2D} ctx - the 2D context.
 * @param {{stats: object, fps: number, palette?: object}} options - what to report.
 * @returns {string} the line that was drawn.
 */
export function drawDebugHud(ctx, options = {}) {
  const { stats = {}, fps = 0, palette = {} } = options
  const line = `${fps}fps ${stats.surfaces ?? 0}sfc ${stats.pending ?? 0}dirty ${
    stats.deferred ?? 0
  }def`
  if (!ctx) return line

  ctx.save?.()
  ctx.font = '9px ui-monospace, monospace'
  ctx.fillStyle = palette.muted ?? '#6f8a76'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText?.(line, 4, 4)
  ctx.restore?.()

  return line
}

/**
 * The frames-per-second reading for the debug overlay.
 *
 * @param {number[]} frameTimes - recent frame timestamps, oldest first.
 * @returns {number} fps, rounded, or 0 without enough samples.
 */
export function framesPerSecond(frameTimes) {
  const list = (Array.isArray(frameTimes) ? frameTimes : []).filter(Number.isFinite)
  if (list.length < 2) return 0

  const span = list[list.length - 1] - list[0]
  if (span <= 0) return 0

  return Math.round(((list.length - 1) / span) * 1000)
}
