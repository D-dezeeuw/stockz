import { xToTime, yToPrice, timeToX, priceToY, formatPrice } from './scale.js'

/**
 * The crosshair overlay.
 *
 * Two rules make this useful rather than decorative.
 *
 * **It snaps to real prints.** The cursor lands between ticks constantly; interpolating
 * would show a price that never traded, and a scalper reading a level off the chart is
 * reading it to decide where to put an order. Binary search to the nearest tick by time,
 * then report that tick's actual price.
 *
 * **It lives on its own canvas.** Moving the cursor must not repaint the chart beneath
 * it — the pointer fires far more often than the market prints, and redrawing thousands
 * of ticks to move two hairlines is how a chart starts feeling heavy.
 */

/**
 * Map a pointer event to chart coordinates.
 *
 * @param {{clientX: number, clientY: number}} event - the pointer event.
 * @param {{left: number, top: number, width: number, height: number}} rect - the canvas
 *   bounding rectangle.
 * @returns {{x: number, y: number, inside: boolean}} the chart-space position.
 */
export function pointerToChart(event, rect) {
  const x = Number(event?.clientX) - Number(rect?.left ?? 0)
  const y = Number(event?.clientY) - Number(rect?.top ?? 0)
  const width = Number(rect?.width ?? 0)
  const height = Number(rect?.height ?? 0)

  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0, inside: false }

  return { x, y, inside: x >= 0 && y >= 0 && x <= width && y <= height }
}

/**
 * The tick nearest a timestamp.
 *
 * @param {Array<{ts: number}>} ticks - the series, oldest first.
 * @param {number} ts - the timestamp to snap to.
 * @returns {object|null} the nearest tick, or null when the series is empty.
 */
export function snapToTick(ticks, ts) {
  const list = Array.isArray(ticks) ? ticks : []
  if (list.length === 0) return null

  const target = Number(ts)
  if (!Number.isFinite(target)) return list[list.length - 1]

  // Binary search: a hot pair holds thousands of prints and this runs on every
  // pointermove, so a linear scan here is felt as a laggy cursor.
  let low = 0
  let high = list.length - 1

  while (low < high) {
    const mid = (low + high) >> 1
    if (Number(list[mid]?.ts) < target) low = mid + 1
    else high = mid
  }

  const candidate = list[low]
  const previous = list[low - 1]
  if (!previous) return candidate

  const nearer =
    Math.abs(Number(candidate?.ts) - target) < Math.abs(target - Number(previous?.ts))
  return nearer ? candidate : previous
}

/**
 * The readout for a cursor position.
 *
 * @param {{x: number, y: number}} position - chart-space cursor position.
 * @param {{ticks?: Array<object>, window: object, range: object, width: number,
 *   height: number, tickSize?: number}} context - the plot's geometry.
 * @returns {{price: number, ts: number, x: number, y: number, priceLabel: string,
 *   timeLabel: string, snapped: boolean}} the readout.
 */
export function crosshairReadout(position, context = {}) {
  const { ticks = [], window, range, width = 0, height = 0, tickSize = 0.01 } = context

  const rawTs = xToTime(Number(position?.x) || 0, window, width)
  const tick = snapToTick(ticks, rawTs)

  const ts = tick ? Number(tick.ts) : rawTs
  // Only the x axis snaps: the y readout follows the cursor, because a trader hovers a
  // level they are *considering*, which by definition has not traded yet.
  const price = tick ? Number(tick.px) : yToPrice(Number(position?.y) || 0, range, height)

  return {
    price,
    ts,
    x: timeToX(ts, window, width),
    y: priceToY(price, range, height),
    priceLabel: formatPrice(price, tickSize),
    timeLabel: formatClock(ts),
    snapped: Boolean(tick),
  }
}

/**
 * Format a timestamp as hh:mm:ss.mmm.
 *
 * @param {number} ts - epoch milliseconds.
 * @returns {string} the clock label.
 */
export function formatClock(ts) {
  const time = Number(ts)
  if (!Number.isFinite(time)) return '--:--:--.---'

  const date = new Date(time)
  const pad = (n, width = 2) => String(n).padStart(width, '0')

  // Milliseconds are not a nicety here: two prints in the same second are routine, and
  // the whole point of the readout is telling them apart.
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(
    date.getUTCSeconds(),
  )}.${pad(date.getUTCMilliseconds(), 3)}`
}

/**
 * Track the pointer over a chart host and report chart-space positions.
 *
 * @param {HTMLElement} host - the element the pointer moves over.
 * @param {(position: {x: number, y: number, inside: boolean}|null) => unknown} onMove -
 *   called with a position, or null when the pointer leaves.
 * @returns {() => void} unsubscribe.
 */
export function trackPointer(host, onMove) {
  if (!host?.addEventListener || typeof onMove !== 'function') return () => {}

  const move = (event) => {
    const rect = host.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 0, height: 0 }
    const position = pointerToChart(event, rect)
    onMove(position.inside ? position : null)
  }
  const leave = () => onMove(null)

  // Pointer events cover mouse, trackpad and touch in one listener; touch-action none
  // stops a drag over the chart from scrolling the page out from under it.
  host.addEventListener('pointermove', move)
  host.addEventListener('pointerleave', leave)
  host.addEventListener('pointercancel', leave)
  if (host.style) host.style.touchAction = 'none'

  return () => {
    host.removeEventListener?.('pointermove', move)
    host.removeEventListener?.('pointerleave', leave)
    host.removeEventListener?.('pointercancel', leave)
  }
}

/**
 * Draw the crosshair and its axis pills.
 *
 * @param {CanvasRenderingContext2D} ctx - the overlay's 2D context.
 * @param {{readout: object, width: number, height: number, palette: object,
 *   visible?: boolean}} options - what to draw.
 * @returns {boolean} true when the crosshair was drawn.
 */
export function drawCrosshair(ctx, options = {}) {
  const { readout, width = 0, height = 0, palette = {}, visible = true } = options
  if (!ctx) return false

  // One wipe per frame: the overlay owns its whole surface, so clearing is cheap and
  // leaves the chart underneath untouched.
  ctx.clearRect?.(0, 0, width, height)
  if (!visible || !readout) return false

  const x = Math.round(readout.x) + 0.5
  const y = Math.round(readout.y) + 0.5

  ctx.save?.()
  ctx.strokeStyle = palette.muted ?? '#6f8a76'
  ctx.lineWidth = 1
  ctx.setLineDash?.([3, 3])

  ctx.beginPath?.()
  ctx.moveTo?.(0, y)
  ctx.lineTo?.(width, y)
  ctx.moveTo?.(x, 0)
  ctx.lineTo?.(x, height)
  ctx.stroke?.()

  ctx.setLineDash?.([])
  ctx.fillStyle = palette.bg ?? '#0f1510'
  ctx.strokeStyle = palette.ink ?? '#c8e6c9'
  ctx.font = '10px ui-monospace, monospace'
  ctx.textBaseline = 'middle'

  // Price pill on the right axis, time pill on the bottom edge — the two places a
  // trader's eye already goes.
  ctx.fillRect?.(width - 52, y - 8, 52, 16)
  ctx.fillRect?.(x - 40, height - 16, 80, 16)
  ctx.fillStyle = palette.ink ?? '#c8e6c9'
  ctx.textAlign = 'right'
  ctx.fillText?.(readout.priceLabel, width - 4, y)
  ctx.textAlign = 'center'
  ctx.fillText?.(readout.timeLabel, x, height - 8)

  ctx.restore?.()
  return true
}
