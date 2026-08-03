import { onThemeRepaint } from '../state/systems.js'

/**
 * Canvas plumbing shared by every chart.
 *
 * Three things every renderer needs and none should reimplement:
 *
 * 1. **devicePixelRatio scaling.** A canvas sized in CSS pixels renders blurry on a
 *    retina screen, and a blurry price is a misread price.
 * 2. **A dirty-flag rAF loop.** The pipeline already coalesces state writes; the chart
 *    coalesces *draws*. A chart that redraws every frame regardless burns a core to paint
 *    an identical image, and on a scalping desk that budget belongs to the order path.
 * 3. **Theme repaint.** Canvas cannot inherit CSS custom properties, so a chart drawn in
 *    phosphor green stays green on a white background until something redraws it.
 */

/**
 * Size a canvas for its container and the display's pixel ratio.
 *
 * @param {HTMLCanvasElement} canvas - the canvas.
 * @param {{width: number, height: number}} size - CSS pixel size.
 * @param {number} [dpr] - device pixel ratio.
 * @returns {{width: number, height: number, dpr: number}} the applied size.
 */
export function sizeCanvas(canvas, size, dpr = globalThis.devicePixelRatio || 1) {
  const width = Math.max(1, Math.floor(Number(size?.width) || 0))
  const height = Math.max(1, Math.floor(Number(size?.height) || 0))
  const ratio = Math.max(1, Number(dpr) || 1)

  if (canvas) {
    canvas.width = Math.floor(width * ratio)
    canvas.height = Math.floor(height * ratio)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    // Scale the context so every draw call can speak in CSS pixels.
    const ctx = canvas.getContext?.('2d')
    ctx?.setTransform?.(ratio, 0, 0, ratio, 0, 0)
  }
  return { width, height, dpr: ratio }
}

/**
 * Read the theme's chart colours off the document.
 *
 * Pulled from CSS custom properties rather than duplicated as JS constants: one palette,
 * defined once, and a token change reaches the canvas without a second edit.
 *
 * @param {Element} [element] - element to resolve against.
 * @param {Window} [win] - window, for getComputedStyle.
 * @returns {Record<string, string>} the palette.
 */
export function chartPalette(element = globalThis.document?.documentElement, win = globalThis) {
  const styles = win?.getComputedStyle?.(element)
  const read = (name, fallback) => (styles?.getPropertyValue?.(name) || '').trim() || fallback

  return {
    up: read('--green', '#00e676'),
    down: read('--orange', '#ff9100'),
    ink: read('--ink', '#c8e6c9'),
    muted: read('--ink-muted', '#6f8a76'),
    grid: read('--line', '#1b3a24'),
    bg: read('--bg-block', '#0f1510'),
  }
}

/**
 * Create a render loop that draws only when something changed.
 *
 * @param {(ctx: object, size: object) => unknown} draw - the renderer.
 * @param {{canvas?: HTMLCanvasElement, raf?: Function, size?: () => object}} [options]
 * @returns {{markDirty: Function, frame: Function, start: Function, stop: Function,
 *   drawCount: () => number, running: () => boolean}} the loop.
 */
export function createRenderLoop(draw, options = {}) {
  const {
    canvas = null,
    raf = globalThis.requestAnimationFrame,
    size = () => ({ width: 0, height: 0 }),
  } = options

  let dirty = true
  let running = false
  let drawCount = 0

  const frame = () => {
    if (!running) return false
    if (!dirty) {
      // Nothing changed: skip the draw entirely rather than repainting an identical
      // image. This is the whole point of the dirty flag.
      schedule()
      return false
    }

    dirty = false
    const ctx = canvas?.getContext?.('2d') ?? null
    draw(ctx, size())
    drawCount += 1

    schedule()
    return true
  }

  const schedule = () => {
    if (running && typeof raf === 'function') raf(frame)
  }

  return {
    markDirty: () => {
      dirty = true
      return true
    },
    frame,
    start: () => {
      running = true
      schedule()
      return true
    },
    stop: () => {
      running = false
      return false
    },
    drawCount: () => drawCount,
    running: () => running,
  }
}

/**
 * Wire a chart to theme changes so it repaints when the palette flips.
 *
 * @param {{markDirty: Function}} loop - the render loop.
 * @returns {() => void} unsubscribe.
 */
export function repaintOnTheme(loop) {
  if (typeof loop?.markDirty !== 'function') return () => {}
  return onThemeRepaint(() => loop.markDirty())
}
