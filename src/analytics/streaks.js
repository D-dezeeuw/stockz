import { setValue, appState, watch } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { sizeCanvas, chartPalette } from '../charts/canvas.js'

/**
 * Runs, and the one that is happening now.
 *
 * Streaks are where a trading day stops being arithmetic and starts being psychology. Four
 * losses in a row is not four independent events to the person who just had them — it is the
 * moment size starts creeping up, the stop starts moving, and the day turns into a story
 * about getting it back.
 *
 * So this view has one job the numbers alone do not do: **make the run visible while it is
 * still happening.** A trader who can see the fifth orange tick appearing does not need to be
 * told anything. One who finds out at the end of the day has already had the day.
 *
 * The tilt hint is a hint. No dialog, no lock-out, no "are you sure" — phase 24 owns the
 * mechanism that actually stops a desk, and duplicating that here as a nag would give the
 * trader something to click through and learn to ignore.
 *
 * Scratches **break** a run rather than extending or ending it in either direction. A
 * break-even trade is not a win and it is not a loss, and folding it into either produces a
 * "record streak" that never happened.
 */

/** Where a losing run stops being noise. */
export const TILT_AT = 5

/**
 * A trade's outcome, in one word.
 *
 * @param {object} trade - the enriched trade.
 * @returns {string} 'win', 'loss' or 'scratch'.
 */
export function outcomeOf(trade) {
  const net = Number(trade?.net) || 0
  if (net > 0) return 'win'

  return net < 0 ? 'loss' : 'scratch'
}

/**
 * The runs, current and record.
 *
 * @param {object[]} trades - the trades in close order, oldest first.
 * @returns {object} the streak summary.
 */
export function streaks(trades) {
  const rows = Array.isArray(trades) ? trades : []
  let current = { outcome: 'none', length: 0 }
  let maxWin = 0
  let maxLoss = 0

  for (const trade of rows) {
    const outcome = outcomeOf(trade)
    // A scratch breaks the run rather than extending it. Folding one into either side
    // produces a record streak that never happened.
    if (outcome === 'scratch') {
      current = { outcome: 'none', length: 0 }
      continue
    }

    current = outcome === current.outcome ? { outcome, length: current.length + 1 } : { outcome, length: 1 }
    if (outcome === 'win' && current.length > maxWin) maxWin = current.length
    if (outcome === 'loss' && current.length > maxLoss) maxLoss = current.length
  }

  return {
    current: current.length,
    outcome: current.outcome,
    maxWin,
    maxLoss,
    // The hint fires on the run in progress, never on the record: a trader who once had six
    // losers in March does not need warning about it every session since.
    tilt: current.outcome === 'loss' && current.length >= TILT_AT,
  }
}

/**
 * The session as consecutive runs.
 *
 * @param {object[]} trades - the trades in close order.
 * @returns {object[]} the segments.
 */
export function streakSegments(trades) {
  const rows = Array.isArray(trades) ? trades : []
  const segments = []

  for (const trade of rows) {
    const outcome = outcomeOf(trade)
    const last = segments[segments.length - 1]
    if (last && last.outcome === outcome) {
      last.length += 1
      last.net = Number((last.net + (Number(trade?.net) || 0)).toFixed(4))
      continue
    }

    segments.push({
      outcome,
      length: 1,
      net: Number(trade?.net) || 0,
      startTradeId: String(trade?.id ?? ''),
    })
  }

  return segments
}

/**
 * Draw the day as a barcode.
 *
 * @param {CanvasRenderingContext2D} ctx - the 2D context.
 * @param {object[]} trades - the trades in close order.
 * @param {{width: number, height: number}} size - the box.
 * @param {object} [palette] - the theme colours.
 * @returns {number} how many ticks were drawn.
 */
export function drawStreakStrip(ctx, trades, size, palette = chartPalette()) {
  const width = Number(size?.width) || 0
  const height = Number(size?.height) || 0
  const rows = Array.isArray(trades) ? trades : []
  if (!ctx || width <= 0 || height <= 0 || rows.length === 0) return 0

  ctx.clearRect(0, 0, width, height)

  // One tick per trade, never aggregated: the rhythm is the content, and a strip that
  // averaged ten trades into a bar would smooth away the exact clustering it exists to show.
  const tickW = Math.max(1, width / rows.length)
  const active = streaks(rows)

  rows.forEach((trade, index) => {
    const outcome = outcomeOf(trade)
    ctx.fillStyle =
      outcome === 'win'
        ? (palette.up ?? '#00e676')
        : outcome === 'loss'
          ? (palette.down ?? '#ff9100')
          : (palette.grid ?? '#1b3a24')

    // The run in progress is drawn full height and the rest slightly inset, so the live
    // streak reads as the thing still happening rather than as more history.
    const inRun = index >= rows.length - active.current && active.outcome !== 'none'
    const inset = inRun ? 0 : Math.round(height * 0.2)
    ctx.fillRect(index * tickW, inset, Math.max(1, tickW - 0.5), height - inset * 2)
  })

  return rows.length
}

/**
 * Publish the streaks.
 *
 * @param {object[]} [trades] - the enriched trades, newest first.
 * @returns {object} the summary.
 */
export function refreshStreaks(trades = appState.analytics?.trades) {
  // Reversed into close order: the journal publishes newest-first for reading, and a run
  // computed backwards would report the *first* streak of the day as the current one.
  const ordered = [...(Array.isArray(trades) ? trades : [])].reverse()
  const summary = streaks(ordered)

  setValue(PATHS.analytics.streaks, summary)
  setValue(PATHS.analytics.segments, streakSegments(ordered).slice(-100))

  return summary
}

/**
 * Mount and keep the strip drawn.
 *
 * @param {{doc?: Document, raf?: Function, trades?: () => object[]}} [deps] - injectable
 *   plumbing.
 * @returns {Function|null} the redraw, or null when there is no canvas.
 */
export function startStreakStrip(deps = {}) {
  const doc = deps.doc ?? globalThis.document
  const canvas = doc?.getElementById?.('streak-canvas')
  if (!canvas) return null

  const read = deps.trades ?? (() => [...(appState.analytics?.trades ?? [])].reverse())
  const redraw = () => {
    const size = sizeCanvas(canvas, { width: canvas.clientWidth, height: canvas.clientHeight })
    drawStreakStrip(canvas.getContext('2d'), read(), size)
  }

  const raf = deps.raf ?? globalThis.requestAnimationFrame?.bind(globalThis) ?? ((fn) => fn())
  watch([PATHS.analytics.streaks], () => raf(redraw))
  redraw()

  return redraw
}
