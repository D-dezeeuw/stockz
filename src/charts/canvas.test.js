// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { sizeCanvas, chartPalette, createRenderLoop, repaintOnTheme } from './canvas.js'
import { onThemeChange } from '../state/systems.js'

/** A canvas double recording the context calls the loop makes. */
function fakeCanvas() {
  const transforms = []
  return {
    style: {},
    width: 0,
    height: 0,
    transforms,
    getContext: () => ({
      setTransform: (...args) => transforms.push(args),
      fillRect: () => {},
    }),
  }
}

describe('sizeCanvas', () => {
  it('scales the backing store by dPR so a price is never blurry', () => {
    const canvas = fakeCanvas()
    const applied = sizeCanvas(canvas, { width: 300, height: 150 }, 2)

    expect(applied).toEqual({ width: 300, height: 150, dpr: 2 })
    expect(canvas.width).toBe(600)
    expect(canvas.height).toBe(300)
    expect(canvas.style.width).toBe('300px')

    // The context is scaled so every draw call can speak CSS pixels.
    expect(canvas.transforms[0]).toEqual([2, 0, 0, 2, 0, 0])

    // Degenerate sizes still produce a usable canvas rather than a zero-area one.
    expect(sizeCanvas(canvas, { width: 0, height: 0 }, 1)).toEqual({ width: 1, height: 1, dpr: 1 })
    expect(sizeCanvas(null, { width: 10, height: 10 }, 0).dpr).toBe(1)
  })
})

describe('chartPalette', () => {
  it('reads colours from CSS tokens so one palette serves DOM and canvas', () => {
    const palette = chartPalette(document.documentElement, {
      getComputedStyle: () => ({
        getPropertyValue: (name) => (name === '--green' ? ' #00ff00 ' : ''),
      }),
    })

    expect(palette.up).toBe('#00ff00')
    // Anything the theme does not define falls back rather than rendering transparent.
    expect(palette.down).toBe('#ff9100')

    expect(chartPalette(null, {}).ink).toBe('#c8e6c9')
  })
})

describe('createRenderLoop', () => {
  it('draws only when marked dirty, so an idle chart costs nothing', () => {
    const canvas = fakeCanvas()
    const frames = []
    const draws = []

    const loop = createRenderLoop(
      (ctx, size) => draws.push(size),
      { canvas, raf: (fn) => frames.push(fn), size: () => ({ width: 100, height: 50 }) },
    )

    loop.start()
    expect(loop.running()).toBe(true)

    // First frame draws: the chart starts dirty.
    frames.shift()()
    expect(draws).toHaveLength(1)
    expect(draws[0]).toEqual({ width: 100, height: 50 })

    // Nothing changed — the next frames skip the draw rather than repainting the same
    // image, which is the whole point of the flag.
    frames.shift()()
    frames.shift()()
    expect(draws).toHaveLength(1)
    expect(loop.drawCount()).toBe(1)

    loop.markDirty()
    frames.shift()()
    expect(draws).toHaveLength(2)

    loop.stop()
    expect(loop.frame()).toBe(false)
    expect(loop.running()).toBe(false)

    // No rAF available: start does not throw, it simply never schedules.
    const bare = createRenderLoop(() => {}, { raf: null })
    expect(bare.start()).toBe(true)
  })
})

describe('repaintOnTheme', () => {
  it('marks the chart dirty on a palette flip, since canvas cannot inherit tokens', () => {
    let dirty = 0
    const stop = repaintOnTheme({ markDirty: () => (dirty += 1) })

    onThemeChange({ ui: { theme: 'day' } })
    expect(dirty).toBe(1)

    stop()
    onThemeChange({ ui: { theme: 'night' } })
    expect(dirty).toBe(1)

    expect(() => repaintOnTheme(null)()).not.toThrow()
  })
})
