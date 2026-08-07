// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { startMicroChart, chartSymbol, CANVAS_ID } from './micro.js'
import { blockCanvas } from './canvas.js'
import { seedBlocks } from '../blocks/seed.js'
import { currentBlocks } from '../blocks/registry.js'
import { setValue, tick, resetState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

/** A document shaped like the rendered grid: the block template cloned once per block. */
function gridDoc(blockIds = ['watchlist', 'chart', 'analytics']) {
  document.body.innerHTML = blockIds
    .map((id) => `<section class="block" data-block-id="${id}">
      <div class="block__body"><canvas id="${CANVAS_ID}"></canvas></div>
    </section>`)
    .join('')
  return document
}

beforeEach(() => {
  resetState()
  document.body.innerHTML = ''
})

describe('chartSymbol', () => {
  it('strips the venue, because the candle store is keyed by instrument', () => {
    expect(chartSymbol({ market: { focus: 'okx:BTC-USDT' } })).toBe('BTC-USDT')
    // A qualified key would find no candles and draw an empty frame, which looks exactly
    // like a market that stopped printing.
    expect(chartSymbol({ market: { focus: 'BTC-USDT' } })).toBe('BTC-USDT')
    expect(chartSymbol({ market: { focus: '' } })).toBe('')
    expect(chartSymbol({})).toBe('')
  })
})

describe('startMicroChart', () => {
  it('mounts on its own block’s canvas, not the first id in the document', () => {
    const doc = gridDoc()
    setValue(PATHS.market.focus, 'okx:BTC-USDT')
    tick()

    const mount = vi.fn(() => ({ dispose: vi.fn() }))
    const chart = startMicroChart({ doc, mount, watch: () => () => {} })

    expect(mount).toHaveBeenCalledTimes(1)
    // The grid clones the block template once per block, so every id inside exists N times
    // and getElementById returns the FIRST — the watchlist's hidden copy at 0x0. Every
    // canvas chart on this desk was mounted on that invisible element.
    const used = mount.mock.calls[0][0]
    expect(used.closest('.block').dataset.blockId).toBe('chart')
    expect(used).not.toBe(doc.getElementById(CANVAS_ID))

    // Bare symbol, and the interval read at draw time so the chips take effect next frame.
    const options = mount.mock.calls[0][1]
    expect(options.symbol).toBe('BTC-USDT')
    setValue(PATHS.ui.candleInterval, '5s')
    tick()
    expect(options.interval()).toBe('5s')

    chart.stop()
  })

  it('re-acquires the canvas rather than holding one the grid replaced', () => {
    const doc = gridDoc()
    setValue(PATHS.market.focus, 'okx:BTC-USDT')
    tick()

    const mount = vi.fn(() => ({ dispose: vi.fn() }))
    const chart = startMicroChart({ doc, mount, watch: () => () => {} })
    const first = mount.mock.calls[0][0]

    // Spektrum re-renders `ui.gridBlocks` and replaces the whole block subtree. A chart
    // holding the old element keeps drawing onto a node no longer in the document, while
    // the canvas on screen stays blank at its default 300x150 — which is exactly how this
    // looked after boot: status "ready", and nothing visible.
    gridDoc()
    chart.remount()
    const second = mount.mock.calls[1][0]

    expect(second).not.toBe(first)
    expect(doc.contains(second)).toBe(true)
    expect(doc.contains(first)).toBe(false)
    chart.stop()
  })

  it('moves the block off "loading" — ready, empty or error, never a shimmer forever', () => {
    seedBlocks()
    tick()
    const statusOf = (id) => currentBlocks().find((b) => b.id === id)?.status

    // The bug this module exists for: seeded 'loading', nothing ever moved it, so the
    // desk's main price chart showed a skeleton for the life of the session.
    expect(statusOf('chart')).toBe('loading')

    const doc = gridDoc()
    setValue(PATHS.market.focus, 'okx:BTC-USDT')
    tick()
    const chart = startMicroChart({ doc, mount: () => ({ dispose: vi.fn() }), watch: () => () => {} })
    tick()
    expect(statusOf('chart')).toBe('ready')

    // Nothing focused is 'empty', not 'loading': a shimmer that never resolves reads as a
    // desk still starting up.
    setValue(PATHS.market.focus, '')
    tick()
    chart.remount()
    tick()
    expect(statusOf('chart')).toBe('empty')
    chart.stop()

    // No canvas at all is a template problem, and the block must say so — but the chart
    // still hands back a live controller. The grid re-renders, so a canvas missing on one
    // pass can appear on the next, and giving up permanently would turn a transient
    // template state into a chart that stays dead for the session.
    document.body.innerHTML = ''
    const orphan = startMicroChart({ doc: document, watch: () => () => {} })
    tick()
    expect(statusOf('chart')).toBe('error')
    expect(typeof orphan.remount).toBe('function')

    // ...and it recovers the moment the canvas exists.
    gridDoc()
    setValue(PATHS.market.focus, 'okx:BTC-USDT')
    tick()
    orphan.remount()
    tick()
    expect(statusOf('chart')).toBe('ready')
    orphan.stop()
  })
})

describe('blockCanvas', () => {
  it('picks the canvas inside the named block, falling back to a bare id for tests', () => {
    const doc = gridDoc(['watchlist', 'chart'])

    const scoped = blockCanvas('chart', CANVAS_ID, doc)
    expect(scoped.closest('.block').dataset.blockId).toBe('chart')
    expect(blockCanvas('watchlist', CANVAS_ID, doc).closest('.block').dataset.blockId).toBe('watchlist')

    // A block that is not rendered has no canvas — and must not silently borrow another's.
    document.body.innerHTML = `<canvas id="${CANVAS_ID}"></canvas>`
    expect(blockCanvas('chart', CANVAS_ID, document)).toBe(document.getElementById(CANVAS_ID))

    expect(blockCanvas('chart', CANVAS_ID, null)).toBeNull()
  })
})
