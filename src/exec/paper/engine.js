import { setValue, appState } from '../../app/engine.js'
import { PATHS } from '../../state/paths.js'
import { onTick } from '../../pipeline/bus.js'
import { ingestFill } from '../../positions/store.js'
import { createLogger } from '../../utils/log.js'
import { bookPaperFill } from './account.js'
import { checkGap } from './guards.js'
import {
  queuePosition,
  insertResting,
  removeResting,
  amendResting,
  paperLimitMatch,
} from './book.js'

/**
 * The resting book, and the tape working it down.
 *
 * The list itself lives outside the reactive tree and is *mirrored* into state for the
 * blocks to render. `setValue` lands next tick, and this is driven by the tick bus — two
 * prints in one frame would both read the pre-flush list and the second would drop the
 * first's fill, which is the exact class of bug that makes a paper book quietly lose
 * orders.
 *
 * Fills go out through `ingestFill`, the same door live fills use. Downstream — positions,
 * P&L, the journal, the scoreboard — cannot tell a paper fill from a real one except by
 * the `paper` flag it carries, which is the whole point: practice has to exercise the code
 * that runs with money on it.
 */

const log = createLogger('paper-book')

/** The orders currently resting. Held outside the tree; mirrored into it. */
let resting = []

/**
 * Publish the resting book for the blocks.
 *
 * @returns {object[]} what was published.
 */
export function publishResting() {
  const rows = resting.map((order) => ({
    id: order.id,
    instrument: order.instrument,
    side: order.side,
    price: order.price,
    size: order.size,
    remaining: order.remaining,
    // Queue is the number that explains why an order at the touch has not filled, which is
    // otherwise the most confusing thing a paper book can show.
    queue: Number(order.queue) || 0,
  }))

  setValue(PATHS.trade.paperResting, rows)
  return rows
}

/**
 * Rest a limit order.
 *
 * @param {object} intent - the order intent.
 * @param {object} [book] - the depth snapshot.
 * @returns {object|null} the resting order, or null when it cannot rest.
 */
export function restOrder(intent, book = appState?.market?.book) {
  const id = String(intent?.clientId ?? intent?.id ?? '')
  const price = Number(intent?.price)
  const size = Math.abs(Number(intent?.size) || 0)
  if (!id || !(price > 0) || size <= 0) return null

  const order = {
    id,
    instrument: String(intent?.instrument ?? ''),
    side: intent?.side === 'sell' ? 'sell' : 'buy',
    price,
    size,
    remaining: size,
    // Measured at arrival, once. Recomputing it later would let an order jump the queue
    // every time the level thinned, which is the opposite of what a queue is.
    queue: queuePosition(price, book, intent?.side),
  }

  resting = insertResting(resting, order)
  publishResting()

  return order
}

/** The last price seen per instrument, so a gap can be told from a move. */
const lastPrice = new Map()

/**
 * Work one print against every resting order at its instrument.
 *
 * @param {object} print - a tape print.
 * @returns {object[]} the fills this print produced.
 */
export function workPrint(print) {
  const symbol = String(print?.symbol ?? '')
  if (!symbol) return []

  const px = Number(print?.px) || 0
  const previous = lastPrice.get(symbol)
  if (px > 0) lastPrice.set(symbol, px)

  if (resting.length === 0) return []

  // A limit order "filled" through a gap it was never in front of is the most flattering
  // bug a sim can have: the strategy books the whole move and never had to be right. So a
  // print that skipped is used to update the price and nothing else — refusing to fill
  // teaches nothing wrong, while filling teaches a strategy that only works on bad data.
  const gap = checkGap(px, previous)
  if (!gap.ok) {
    log.warn(`${symbol}: ${gap.reason} (${gap.bps}bp) — not filling against it`)
    return []
  }

  const fills = []
  const next = []

  for (const order of resting) {
    if (order.instrument !== symbol) {
      next.push(order)
      continue
    }

    const worked = paperLimitMatch(order, print)
    if (worked.fill) {
      fills.push(worked.fill)
      // A partly-filled order keeps working at whatever is left; only a complete one
      // leaves the book.
      if (!worked.fill.done) next.push(worked.order)
    } else {
      next.push(worked.order)
    }
  }

  // Reassigned once, after the whole pass. Mutating mid-loop would have a second print in
  // the same frame read a list this one had half-rewritten.
  resting = next
  if (fills.length > 0) {
    for (const fill of fills) {
      ingestFill({
        venue: 'paper',
        instrument: symbol,
        side: fill.side,
        qty: fill.size,
        px: fill.price,
        ts: fill.ts,
        paper: true,
      })
      // The practice balance moves on the same call that books the position, so the two
      // can never disagree about whether a fill happened.
      bookPaperFill({ ...fill, qty: fill.size, px: fill.price, paper: true })
    }
    log.info(`${fills.length} paper fill(s) on ${symbol}`)
    publishResting()
  }

  return fills
}

/**
 * Cancel a resting paper order.
 *
 * @param {string} id - the order id.
 * @returns {boolean} true when one was removed.
 */
export function cancelPaperOrder(id) {
  const before = resting.length
  resting = removeResting(resting, id)
  if (resting.length === before) return false

  publishResting()
  return true
}

/**
 * Move a resting paper order to a new price.
 *
 * @param {string} id - the order id.
 * @param {number} price - the new price.
 * @param {object} [book] - the depth snapshot.
 * @returns {object|null} the amended order, or null.
 */
export function amendPaperOrder(id, price, book = appState?.market?.book) {
  const before = resting.find((order) => String(order?.id) === String(id ?? ''))
  if (!before) return null

  resting = amendResting(resting, id, price, book)
  publishResting()

  return resting.find((order) => String(order?.id) === String(id ?? '')) ?? null
}

/** @returns {object[]} the resting book, for tests. */
export function restingOrders() {
  return resting
}

/** Empty the resting book (tests, and a mode switch). */
export function resetPaperBook() {
  resting = []
  lastPrice.clear()
  return true
}

/**
 * Subscribe the paper book to the tape.
 *
 * @param {{subscribe?: Function}} [deps] - injectable bus.
 * @returns {() => void} unsubscribe.
 */
export function startPaperBook(deps = {}) {
  const subscribe = typeof deps.subscribe === 'function' ? deps.subscribe : onTick
  return subscribe((tick) => workPrint(tick)) ?? (() => {})
}
