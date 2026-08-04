import { setValue, appState, watch } from '../../app/engine.js'
import { PATHS } from '../../state/paths.js'
import { computeExpectancy, computeDrawdown, equityCurve } from '../../backtest/stats.js'
import { drawCompare } from '../../backtest/compare.js'
import { sizeCanvas } from '../../charts/canvas.js'

/**
 * Is the practice translating?
 *
 * The only question that matters about paper trading, and the one nobody can answer from
 * two separate screens. So both records are computed from the *same* journal, with the
 * same statistics functions the backtest report uses, and put side by side.
 *
 * Same functions on purpose. A paper win rate computed one way and a live win rate
 * computed another is a comparison of two different measurements, and the difference
 * between them would be an artefact of the code rather than of the trading.
 *
 * The honest reading is usually the *gap*: a strategy that prints on paper and bleeds live
 * is not a strategy with a bug, it is a strategy whose edge was smaller than the costs it
 * was not being charged. That is what the delta row is for.
 */

/**
 * Split a journal into the two books.
 *
 * @param {object[]} trades - the journal's trades.
 * @returns {{paper: object[], live: object[]}} the two records.
 */
export function splitByBook(trades) {
  const rows = Array.isArray(trades) ? trades : []

  return {
    paper: rows.filter((trade) => trade?.paper === true),
    // Anything not tagged is real. A trade that lost its flag must not quietly join the
    // practice pile, where a loss stops counting.
    live: rows.filter((trade) => trade?.paper !== true),
  }
}

/**
 * One book's statistics.
 *
 * @param {object[]} trades - that book's trades.
 * @returns {object} the statistics, plus a curve.
 */
export function bookStats(trades) {
  // Oldest first: the journal reads newest-first, and a curve drawn in that order runs
  // backwards.
  const rows = [...(Array.isArray(trades) ? trades : [])].reverse()
  const stats = computeExpectancy(rows)
  const worst = computeDrawdown(rows)

  return { ...stats, ...worst, curve: equityCurve(rows, 120) }
}

/**
 * The comparison, ready to render.
 *
 * @param {object[]} [trades] - the journal's trades.
 * @returns {object} what was published.
 */
export function refreshBookCompare(trades = appState?.analytics?.trades) {
  const { paper, live } = splitByBook(trades)
  const a = bookStats(paper)
  const b = bookStats(live)

  const rows = [
    { key: 'trades', label: 'trades', decimals: 0 },
    { key: 'net', label: 'net', decimals: 2 },
    { key: 'expectancy', label: 'expectancy', decimals: 4 },
    { key: 'winRate', label: 'win rate', decimals: 3 },
    { key: 'maxDrawdown', label: 'max DD', decimals: 2, lowerIsBetter: true },
  ].map((field) => {
    const paperValue = Number(a[field.key]) || 0
    const liveValue = Number(b[field.key]) || 0
    const delta = liveValue - paperValue

    return {
      key: field.key,
      label: field.label,
      paper: paperValue.toFixed(field.decimals),
      live: liveValue.toFixed(field.decimals),
      delta: `${delta > 0 ? '+' : ''}${delta.toFixed(field.decimals)}`,
      // Live *against* paper: the question is whether the real record kept the promise the
      // practice made, so the sign always reads "live minus paper".
      tone:
        delta === 0
          ? 'flat'
          : (field.lowerIsBetter ? delta < 0 : delta > 0)
            ? 'up'
            : 'down',
    }
  })

  const view = {
    rows,
    curves: [a.curve, b.curve],
    // Said plainly rather than left to be inferred from an empty table: "no live trades
    // yet" and "live made nothing" look identical in a row of zeros.
    hint: a.trades === 0 ? 'no practice trades yet' : b.trades === 0 ? 'no live trades yet' : '',
  }

  setValue(PATHS.trade.bookCompare, view)
  return view
}

/**
 * Mount the twin equity curves.
 *
 * @param {HTMLCanvasElement} canvas - the canvas.
 * @param {{curves?: () => object[][]}} [deps] - injectable plumbing.
 * @returns {() => void} a redraw function.
 */
export function mountBookChart(canvas, deps = {}) {
  if (!canvas?.getContext) return () => {}

  const read = deps.curves ?? (() => appState?.trade?.bookCompare?.curves ?? [])

  return () => {
    const size = sizeCanvas(canvas, { width: canvas.clientWidth, height: canvas.clientHeight })
    // The backtest's overlay renderer, reused. Two curves on one shared scale is the same
    // problem here, and a second implementation would eventually disagree about it.
    drawCompare(canvas.getContext('2d'), read(), size)
  }
}

/**
 * Keep the comparison in step with the journal.
 *
 * @param {{doc?: Document, raf?: Function, watch?: Function}} [deps] - injectable plumbing.
 * @returns {() => void} stop.
 */
export function startBookCompare(deps = {}) {
  const doc = deps.doc ?? globalThis.document
  const watcher = typeof deps.watch === 'function' ? deps.watch : watch
  const raf = deps.raf ?? globalThis.requestAnimationFrame?.bind(globalThis) ?? ((fn) => fn())
  const canvas = doc?.getElementById?.('book-canvas')
  const redraw = canvas ? mountBookChart(canvas, deps) : () => {}

  const stop = watcher([PATHS.analytics.trades], () => {
    refreshBookCompare()
    raf(redraw)
  })
  refreshBookCompare()
  redraw()

  return () => stop?.()
}
