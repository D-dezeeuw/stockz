import { setValue, appState, watch } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { pushToast } from '../ui/toast.js'
import { sizeCanvas, chartPalette } from '../charts/canvas.js'
import { listRuns } from './archive.js'
import { blockCanvas } from '../charts/canvas.js'

/**
 * Two runs, side by side.
 *
 * The question a backtest raises is never "is this good" — it is "is this *better*", and
 * better than what. So two archived runs snap into slots, their stats sit in mirrored
 * columns with the differences already computed, and both equity curves go on **one axis
 * with a shared scale**.
 *
 * Shared scale matters more than it sounds. Two curves auto-scaled to their own ranges look
 * identical whatever they earned — the shape survives and the magnitude vanishes — which is
 * exactly backwards for the one question being asked.
 */

/** How many runs can be pinned at once. Two is the comparison; three is a table. */
export const SLOTS = 2

/** The stats the delta row reports, and which direction is good. */
export const DIFF_FIELDS = Object.freeze([
  { key: 'net', label: 'net', better: 'higher', decimals: 2 },
  { key: 'expectancy', label: 'expectancy', better: 'higher', decimals: 4 },
  { key: 'trades', label: 'trades', better: 'neither', decimals: 0 },
  { key: 'winRate', label: 'win %', better: 'higher', decimals: 3 },
  { key: 'maxDrawdown', label: 'max DD', better: 'lower', decimals: 2 },
  { key: 'fees', label: 'fees', better: 'lower', decimals: 2 },
])

/**
 * Pin a run into the next slot.
 *
 * @param {string[]} slots - the current slot ids.
 * @param {string} id - the run to pin.
 * @returns {string[]} the slots after pinning.
 */
export function pinSlot(slots, id) {
  const current = (Array.isArray(slots) ? slots : []).filter(Boolean).map(String)
  const runId = String(id ?? '')
  if (!runId) return current

  // Re-pinning an already-pinned run unpins it, so every row is its own off switch and no
  // slot needs a second control to clear.
  if (current.includes(runId)) return current.filter((slot) => slot !== runId)

  // The oldest pin gives way. Refusing the third pin would make the trader clear a slot
  // before comparing, which is a click that answers nothing.
  return [...current, runId].slice(-SLOTS)
}

/**
 * The signed differences between two runs.
 *
 * @param {object} a - slot A's record.
 * @param {object} b - slot B's record.
 * @returns {object[]} one row per stat.
 */
export function diffRunStats(a, b) {
  return DIFF_FIELDS.map((field) => {
    const left = Number(a?.[field.key]) || 0
    const right = Number(b?.[field.key]) || 0
    const delta = right - left

    // Tone is B's verdict against A, and it depends on the field: a bigger drawdown is
    // worse, a bigger net is better, and more trades is neither on its own.
    const better =
      field.better === 'neither' || delta === 0
        ? 'flat'
        : (field.better === 'higher') === delta > 0
          ? 'up'
          : 'down'

    return {
      key: field.key,
      label: field.label,
      a: left.toFixed(field.decimals),
      b: right.toFixed(field.decimals),
      // Signed, always: an unsigned delta beside two numbers is a subtraction the reader
      // has to redo to know which way it went.
      delta: `${delta > 0 ? '+' : ''}${delta.toFixed(field.decimals)}`,
      tone: better,
    }
  })
}

/**
 * Draw both curves on one axis.
 *
 * @param {CanvasRenderingContext2D} ctx - the 2D context.
 * @param {object[][]} series - one point array per run.
 * @param {{width: number, height: number}} size - the box.
 * @param {object} [palette] - the theme colours.
 * @returns {boolean} true when something was drawn.
 */
export function drawCompare(ctx, series, size, palette = chartPalette()) {
  const width = Number(size?.width) || 0
  const height = Number(size?.height) || 0
  if (!ctx || width <= 0 || height <= 0) return false

  ctx.clearRect(0, 0, width, height)
  const curves = (Array.isArray(series) ? series : []).filter((c) => Array.isArray(c) && c.length > 0)
  if (curves.length === 0) return false

  // One scale across both, computed before anything is drawn. Auto-scaling each curve to
  // its own range makes two runs look identical whatever they earned — the shape survives
  // and the magnitude vanishes, which is backwards for the question being asked.
  const values = curves.flatMap((curve) => curve.map((p) => Number(p?.equity) || 0))
  const lo = Math.min(0, ...values)
  const hi = Math.max(0, ...values)
  const span = hi - lo || 1
  const y = (value) => height - ((value - lo) / span) * height
  const longest = Math.max(...curves.map((curve) => curve.length))

  const zero = Math.round(y(0)) + 0.5
  ctx.strokeStyle = palette.muted ?? '#6f8a76'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, zero)
  ctx.lineTo(width, zero)
  ctx.stroke()

  // Distinct hues rather than green-above/orange-below: here the colour identifies *which
  // run*, and reusing the profit colours for identity would make a losing A and a winning
  // B the same colour at the crossover.
  const hues = [palette.up ?? '#00e676', palette.accent ?? palette.ink ?? '#c8e6c9']
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'

  for (const [n, curve] of curves.entries()) {
    ctx.strokeStyle = hues[n % hues.length]
    ctx.beginPath()
    for (const [i, point] of curve.entries()) {
      // Both curves span the full width regardless of trade count, so the axis is
      // "progress through the run" — comparing two runs by wall-clock would squeeze a
      // busy one into a corner.
      const px = longest === 1 ? width / 2 : (i / (curve.length - 1 || 1)) * width
      const py = y(Number(point?.equity) || 0)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()
  }

  return true
}

/**
 * Publish the comparison for whatever is pinned.
 *
 * @param {string[]} [slots] - the pinned ids.
 * @param {object[]} [runs] - the archived runs.
 * @returns {object} what was published.
 */
export function refreshCompare(slots = appState?.backtest?.slots, runs = appState?.backtest?.runs) {
  const ids = (Array.isArray(slots) ? slots : []).map(String)
  const list = Array.isArray(runs) ? runs : []
  const picked = ids.map((id) => list.find((run) => String(run?.id) === id) ?? null)

  const view = {
    a: picked[0] ?? null,
    b: picked[1] ?? null,
    // Deltas only once both slots are full: a "difference" against an empty slot is the
    // run's own numbers with a plus sign, which reads as a comparison and is not one.
    diffs: picked[0] && picked[1] ? diffRunStats(picked[0], picked[1]) : [],
    curves: picked.filter(Boolean).map((run) => run.curve ?? []),
    hint: picked.filter(Boolean).length < SLOTS ? 'pin two runs to compare' : '',
  }

  setValue(PATHS.backtest.compare, view)
  return view
}

/**
 * Load the archive into state.
 *
 * @param {object} [deps] - injectable database.
 * @returns {Promise<object[]>} the archived runs.
 */
export async function refreshRuns(deps = {}) {
  const runs = await listRuns(deps)
  setValue(PATHS.backtest.runs, runs)
  refreshCompare(appState?.backtest?.slots, runs)

  return runs
}

/**
 * Pin or unpin a run.
 *
 * @param {object} _state - engine state (unused).
 * @param {{id?: string}} [payload] - the run.
 * @returns {string[]} the slots now pinned.
 */
export function pinRun(_state, payload = {}) {
  const slots = pinSlot(appState?.backtest?.slots, payload?.id)

  setValue(PATHS.backtest.slots, slots)
  refreshCompare(slots, appState?.backtest?.runs)

  return slots
}

/**
 * Empty both slots.
 *
 * @returns {string[]} the empty slots.
 */
export function clearSlots() {
  setValue(PATHS.backtest.slots, [])
  refreshCompare([], appState?.backtest?.runs)
  pushToast('comparison cleared', 'success')

  return []
}

/**
 * Mount the overlay chart onto a canvas.
 *
 * @param {HTMLCanvasElement} canvas - the canvas.
 * @param {{curves?: () => object[][]}} [deps] - injectable plumbing.
 * @returns {() => void} a redraw function.
 */
export function mountCompareChart(canvas, deps = {}) {
  if (!canvas?.getContext) return () => {}

  const read = deps.curves ?? (() => appState?.backtest?.compare?.curves ?? [])

  return () => {
    const size = sizeCanvas(canvas, { width: canvas.clientWidth, height: canvas.clientHeight })
    drawCompare(canvas.getContext('2d'), read(), size)
  }
}

/**
 * Find the canvas and keep it in step with the pinned pair.
 *
 * @param {{doc?: Document, raf?: Function}} [deps] - injectable plumbing.
 * @returns {Function|null} the redraw, or null when there is no canvas.
 */
export function startCompareChart(deps = {}) {
  const doc = deps.doc ?? globalThis.document
  const canvas = blockCanvas('backtest', 'compare-canvas', doc)
  if (!canvas) return null

  const redraw = mountCompareChart(canvas, deps)
  const raf = deps.raf ?? globalThis.requestAnimationFrame?.bind(globalThis) ?? ((fn) => fn())

  watch([PATHS.backtest.compare], () => raf(redraw))
  redraw()

  return redraw
}

/**
 * Register the comparison actions.
 *
 * @returns {string[]} the registered names.
 */
export function registerCompareActions() {
  registerAction(ACTIONS.backtest.pin, pinRun, { description: 'Pin a backtest run to compare' })
  registerAction(ACTIONS.backtest.clearSlots, () => clearSlots(), {
    description: 'Empty the comparison slots',
  })

  return [ACTIONS.backtest.pin, ACTIONS.backtest.clearSlots]
}
