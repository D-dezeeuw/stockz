import { mountCandleChart } from './mount.js'
import { blockCanvas } from './canvas.js'
import { setBlockStatus } from '../blocks/registry.js'
import { BLOCK_STATUS } from '../blocks/registry.js'
import { appState, watch } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { splitSymbol } from '../lists/ops.js'
import { createLogger } from '../utils/log.js'

/**
 * The Micro Chart block, connected.
 *
 * Everything this needs already existed and none of it was wired: eight chart modules —
 * candles, axis, tick line, volume band, auto-range, crosshair, markers, a render loop —
 * each with its own unit test, and `mountCandleChart` had no callers anywhere. The block
 * was seeded `status: 'loading'` and nothing ever moved it off, so the desk's main price
 * chart showed a shimmer skeleton forever. Not a broken chart: an unbuilt wire.
 *
 * The same shape of gap `startStrategy` had before the autopilot, and worth naming for the
 * same reason — a feature that exists, tests green, and renders nowhere looks exactly like
 * a feature that failed to build.
 *
 * **The status is the contract.** The block body renders by `block.status`, so this module
 * owns moving it: `ready` once a chart is drawing, `empty` when nothing is focused,
 * `error` when the canvas is missing. Leaving it on `loading` is what caused this bug, and
 * a chart that silently stops must say so rather than keep painting the last frame.
 */

const log = createLogger('micro-chart')

/** The canvas the chart draws on. */
export const CANVAS_ID = 'micro-canvas'

/**
 * The instrument the chart should be showing.
 *
 * Bare symbol, not the qualified one: the candle store is keyed by instrument id, and a
 * `venue:SYMBOL` key would silently find no candles and draw an empty frame that looks
 * exactly like a market that stopped printing.
 *
 * @param {object} [state] - engine state.
 * @returns {string} the instrument id, or '' when nothing is focused.
 */
export function chartSymbol(state = appState) {
  const focus = String(state?.market?.focus ?? '')
  return splitSymbol(focus).symbol || focus
}

/**
 * Mount the chart, and re-mount it whenever the desk changes instrument.
 *
 * A remount rather than a reconfigure: `mountCandleChart` closes over its symbol, and the
 * per-symbol tick subscription is what stops a BTC chart repainting because ETH traded.
 *
 * A controller is returned even when the canvas is missing, and the block is marked
 * `error` instead. The grid re-renders — a canvas absent on the first pass can appear on
 * the next — so giving up permanently would turn a transient template state into a dead
 * chart for the life of the session.
 *
 * @param {{doc?: Document, raf?: Function, mount?: Function, watch?: Function}} [deps]
 *   injectable plumbing.
 * @returns {{stop: () => void, remount: Function}} the controller.
 */
export function startMicroChart(deps = {}) {
  const doc = deps.doc ?? globalThis.document
  const mount = deps.mount ?? mountCandleChart
  const watchImpl = deps.watch ?? watch

  let canvas = null
  let mounted = null

  const remount = () => {
    mounted?.dispose?.()
    mounted = null

    // Re-acquired every time, never captured once. The grid is a `data-each`, so a
    // re-render replaces the whole block subtree — and a chart holding the old element
    // goes on drawing beautifully onto a node that is no longer in the document, while
    // the canvas on screen stays blank at its default 300x150. That is precisely how this
    // looked after boot: a mount that reported ready, a probe that painted 2159 pixels on
    // the live canvas, and nothing visible.
    //
    // Scoped to the chart block, never a bare id: the grid clones the block template once
    // per block, so fifteen elements share this id and `getElementById` returns the
    // watchlist's hidden 0x0 copy. See `blockCanvas`.
    canvas = blockCanvas('chart', CANVAS_ID, doc)
    if (!canvas) {
      // Said out loud and marked on the block. A chart with nowhere to draw is a template
      // problem, and the one failure mode a trader cannot diagnose from the screen alone.
      log.warn(`no #${CANVAS_ID} in the document — chart not mounted`)
      setBlockStatus('chart', BLOCK_STATUS.error)
      return null
    }

    const symbol = chartSymbol()
    if (!symbol) {
      // 'empty', not 'loading'. Nothing is focused, nothing is coming, and a shimmer that
      // never resolves reads as a desk still starting up.
      setBlockStatus('chart', BLOCK_STATUS.empty)
      return null
    }

    mounted = mount(canvas, {
      symbol,
      // Read at draw time, not captured: the interval chips must change the chart on the
      // next frame rather than on the next instrument change.
      interval: () => String(appState.ui?.candleInterval ?? '1s'),
      tickSize: Number(appState.market?.tickSize) || 0.01,
      raf: deps.raf,
    })

    setBlockStatus('chart', BLOCK_STATUS.ready)
    return mounted
  }

  const unfocus = watchImpl([PATHS.market.focus], () => remount())
  // And whenever the grid re-renders *past* our canvas. Checked rather than assumed: the
  // block list is rewritten on every layout change and status flip, and remounting on each
  // of those would tear down a live chart for nothing.
  const ungrid = watchImpl([PATHS.ui.gridBlocks], () => {
    if (!canvas || doc?.contains?.(canvas) === false) remount()
  })
  remount()

  return {
    remount,
    stop: () => {
      unfocus?.()
      ungrid?.()
      mounted?.dispose?.()
      mounted = null
    },
  }
}
