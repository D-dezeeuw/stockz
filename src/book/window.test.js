// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  visibleRange,
  createPrintBuffer,
  shouldAutoscroll,
  trackScroll,
  OVERSCAN,
} from './window.js'

describe('visibleRange', () => {
  it('renders the viewport plus overscan, with spacers standing in for the rest', () => {
    const window = visibleRange({ scrollTop: 180, rowHeight: 18, viewport: 360, total: 500 })

    // Row 10 is at the top of the viewport; overscan starts the slice six rows earlier.
    expect(window.start).toBe(4)
    expect(window.end).toBe(36)
    // Spacers keep the scrollbar honest about the full 500 rows.
    expect(window.topPad).toBe(72)
    expect(window.bottomPad).toBe((500 - 36) * 18)
    expect(OVERSCAN).toBe(6)

    // At the top there is nothing above to pad for.
    expect(visibleRange({ scrollTop: 0, rowHeight: 18, viewport: 180, total: 500 })).toMatchObject({
      start: 0,
      topPad: 0,
    })

    // A short tape never asks for rows it does not have.
    expect(visibleRange({ scrollTop: 0, rowHeight: 18, viewport: 360, total: 3 })).toMatchObject({
      start: 0,
      end: 3,
      bottomPad: 0,
    })

    // Scrolled past the end clamps rather than producing a negative slice.
    const past = visibleRange({ scrollTop: 9999, rowHeight: 18, viewport: 180, total: 10 })
    expect(past.start).toBe(10)
    expect(past.end).toBe(10)

    expect(visibleRange()).toMatchObject({ start: 0, end: 0 })
  })
})

describe('createPrintBuffer', () => {
  it('drains a whole batch in one call, however many prints landed between frames', () => {
    const frames = []
    const batches = []
    const buffer = createPrintBuffer((batch) => batches.push(batch), {
      raf: (fn) => frames.push(fn),
    })

    buffer.push({ px: 1 })
    buffer.push({ px: 2 })
    buffer.push({ px: 3 })

    // Three prints armed exactly one frame — that is the coalescing.
    expect(frames).toHaveLength(1)
    expect(buffer.size()).toBe(3)

    frames.shift()()
    expect(batches).toHaveLength(1)
    expect(batches[0].map((p) => p.px)).toEqual([1, 2, 3])
    expect(buffer.size()).toBe(0)

    // A quiet frame drains nothing rather than calling back with an empty array.
    expect(buffer.drain()).toBe(0)
    expect(batches).toHaveLength(1)

    // The next print arms a fresh frame.
    buffer.push({ px: 4 })
    expect(frames).toHaveLength(1)

    expect(buffer.push(null)).toBe(1)

    // No rAF available: prints still buffer, and a manual drain still works.
    const bare = createPrintBuffer(null, { raf: null })
    bare.push({ px: 9 })
    expect(bare.drain()).toBe(1)
  })
})

describe('shouldAutoscroll', () => {
  it('stops following the tape the moment someone is reading it', () => {
    expect(shouldAutoscroll({ scrollTop: 0 })).toBe(true)
    expect(shouldAutoscroll({ scrollTop: 2, threshold: 4 })).toBe(true)

    // A tape that runs away under the cursor is one you cannot read a print off.
    expect(shouldAutoscroll({ hovering: true, scrollTop: 0 })).toBe(false)
    // Scrolling away says the same thing more deliberately.
    expect(shouldAutoscroll({ scrollTop: 200 })).toBe(false)

    expect(shouldAutoscroll()).toBe(true)
  })
})

describe('trackScroll', () => {
  it('reports a window on every scroll and stops autoscrolling under the cursor', () => {
    const host = document.createElement('div')
    Object.defineProperty(host, 'clientHeight', { value: 180, configurable: true })

    const seen = []
    const stop = trackScroll(host, (w) => seen.push(w), { rowHeight: 18, total: () => 100 })

    // It reports once on mount, so the first paint is already windowed.
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ start: 0, autoscroll: true })

    host.scrollTop = 360
    host.dispatchEvent(new window.Event('scroll'))
    expect(seen[1].start).toBe(14)
    // Scrolled away from the top: new prints must not yank the view.
    expect(seen[1].autoscroll).toBe(false)

    host.dispatchEvent(new window.PointerEvent('pointerenter'))
    expect(seen[2].autoscroll).toBe(false)

    // Leaving catches the tape up rather than letting it drift behind.
    host.dispatchEvent(new window.PointerEvent('pointerleave'))
    expect(host.scrollTop).toBe(0)
    expect(seen[3].autoscroll).toBe(true)

    stop()
    host.dispatchEvent(new window.Event('scroll'))
    expect(seen).toHaveLength(4)

    expect(() => trackScroll(null, () => {})()).not.toThrow()
    expect(() => trackScroll(host, null)()).not.toThrow()
  })
})
