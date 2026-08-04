/**
 * Windowed tape rendering.
 *
 * A 500-row tape is 500 DOM nodes that a print storm asks the browser to reconcile
 * several times a second. Virtualisation makes that a constant: the DOM holds only the
 * rows on screen plus a little overscan, and two spacer elements stand in for everything
 * above and below so the scrollbar still reflects the whole tape.
 *
 * The second half of the problem is arrival rate, not row count. A thousand prints a
 * second is a thousand state writes unless they are batched — so prints buffer and drain
 * once per frame, the same coalescing the pipeline and the charts already use.
 */

/** Rows rendered beyond the viewport, so a fast scroll never shows blank space. */
export const OVERSCAN = 6

/**
 * The slice of rows a viewport can see.
 *
 * @param {{scrollTop: number, rowHeight: number, viewport: number, total: number,
 *   overscan?: number}} metrics - the scroll state.
 * @returns {{start: number, end: number, topPad: number, bottomPad: number}} the window.
 */
export function visibleRange(metrics = {}) {
  const { scrollTop = 0, rowHeight = 18, viewport = 0, total = 0, overscan = OVERSCAN } = metrics

  const height = Math.max(1, Number(rowHeight) || 1)
  const count = Math.max(0, Math.floor(Number(total) || 0))
  const pad = Math.max(0, Math.floor(Number(overscan) || 0))

  const first = Math.max(0, Math.floor((Number(scrollTop) || 0) / height) - pad)
  const visible = Math.ceil((Number(viewport) || 0) / height) + pad * 2
  const end = Math.min(count, first + visible)
  const start = Math.min(first, end)

  return {
    start,
    end,
    // Spacers rather than absolute positioning: the scrollbar then reflects the real
    // tape length, and scrolling stays the browser's job.
    topPad: start * height,
    bottomPad: Math.max(0, (count - end) * height),
  }
}

/**
 * Buffer prints and drain them once per frame.
 *
 * @param {(prints: object[]) => unknown} onDrain - called with the batch.
 * @param {{raf?: Function}} [options] - injectable frame scheduler.
 * @returns {{push: Function, drain: Function, size: () => number}} the buffer.
 */
export function createPrintBuffer(onDrain, options = {}) {
  const { raf = globalThis.requestAnimationFrame } = options
  let buffer = []
  let armed = false

  const drain = () => {
    armed = false
    if (buffer.length === 0) return 0

    const batch = buffer
    buffer = []
    // One call with the whole batch, not one per print: the consumer writes state once
    // however many prints landed between frames.
    onDrain?.(batch)
    return batch.length
  }

  return {
    push(print) {
      if (!print) return buffer.length
      buffer.push(print)

      if (!armed && typeof raf === 'function') {
        armed = true
        raf(drain)
      }
      return buffer.length
    },
    drain,
    size: () => buffer.length,
  }
}

/**
 * Whether the tape should stay pinned to the newest print.
 *
 * @param {{hovering?: boolean, scrollTop?: number, threshold?: number}} state - the view state.
 * @returns {boolean} true when new prints should scroll into view.
 */
export function shouldAutoscroll(state = {}) {
  const { hovering = false, scrollTop = 0, threshold = 4 } = state
  // Hovering means inspecting: a tape that runs away under the cursor is a tape you
  // cannot read a print off. Scrolling away means the same thing more deliberately.
  if (hovering) return false

  return (Number(scrollTop) || 0) <= (Number(threshold) || 0)
}

/**
 * Wire a scroll container to a windowing callback.
 *
 * @param {HTMLElement} host - the scrolling element.
 * @param {(metrics: object) => unknown} onWindow - called with the scroll state.
 * @param {{rowHeight?: number, total?: () => number}} [options] - row metrics.
 * @returns {() => void} unsubscribe.
 */
export function trackScroll(host, onWindow, options = {}) {
  if (!host?.addEventListener || typeof onWindow !== 'function') return () => {}

  const { rowHeight = 18, total = () => 0 } = options
  let hovering = false

  const report = () =>
    onWindow({
      ...visibleRange({
        scrollTop: host.scrollTop,
        rowHeight,
        viewport: host.clientHeight,
        total: total(),
      }),
      autoscroll: shouldAutoscroll({ hovering, scrollTop: host.scrollTop }),
    })

  const enter = () => {
    hovering = true
    report()
  }
  const leave = () => {
    hovering = false
    // Catching up on leave rather than drifting: the tape jumps back to the newest
    // print, which is where it was before the cursor arrived.
    host.scrollTop = 0
    report()
  }

  // Passive: a scroll handler that could preventDefault forces the compositor to wait
  // for JS before it can move the page.
  host.addEventListener('scroll', report, { passive: true })
  host.addEventListener('pointerenter', enter)
  host.addEventListener('pointerleave', leave)
  report()

  return () => {
    host.removeEventListener?.('scroll', report)
    host.removeEventListener?.('pointerenter', enter)
    host.removeEventListener?.('pointerleave', leave)
  }
}
