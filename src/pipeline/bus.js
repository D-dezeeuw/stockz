import { setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { createRing } from './ring.js'

/**
 * The tick bus.
 *
 * Feeds publish here; the UI never hears from a socket directly. That separation is what
 * lets the pipeline do the one thing that matters for a fast tape: **coalesce**. Writing
 * state once per tick would re-render the desk hundreds of times a second to show frames
 * a human cannot see. Instead ticks land in ring buffers and a single rAF flush writes
 * one value per path per frame.
 *
 * The rule: nothing between a socket and this module may call `setValue`.
 */

/** Per-symbol trade buffers. */
const trades = new Map()

/** Latest tick per symbol, replaced not appended — only the newest matters for a quote. */
const latest = new Map()

/** Subscribers, called with each tick as it arrives (strategies, recorders). */
const listeners = new Set()

let pending = false
let flushes = 0
let received = 0

/**
 * Buffer capacity per symbol. 2048 prints is a few minutes of a hot instrument, which is
 * all a scalper's chart and tape ever look back over.
 */
export const TRADE_BUFFER = 2048

/**
 * Publish a tick.
 *
 * O(1), allocation-free beyond the tick itself: this runs on every message from every
 * feed, so anything expensive here is felt as latency on the order path too.
 *
 * @param {object} tick - internal tick or trade.
 * @returns {boolean} true when the tick was accepted.
 */
export function publishTick(tick) {
  const symbol = String(tick?.symbol ?? '')
  if (!symbol) return false

  received += 1
  latest.set(symbol, tick)

  if (Number.isFinite(tick.px)) {
    if (!trades.has(symbol)) trades.set(symbol, createRing(TRADE_BUFFER))
    trades.get(symbol).push(tick)
  }

  for (const listener of listeners) listener(tick)
  return true
}

/**
 * Subscribe to raw ticks — strategies and the recorder, not the UI.
 *
 * @param {(tick: object) => unknown} listener - called per tick.
 * @returns {() => void} unsubscribe.
 */
export function onTick(listener) {
  if (typeof listener !== 'function') return () => {}

  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * The newest tick for a symbol.
 *
 * @param {string} symbol - instrument.
 * @returns {object|null} the tick, or null when nothing has arrived.
 */
export function latestTick(symbol) {
  return latest.get(String(symbol ?? '')) ?? null
}

/**
 * Recent trades for a symbol, oldest first.
 *
 * @param {string} symbol - instrument.
 * @param {number} [limit] - how many, newest-biased.
 * @returns {object[]} the trades.
 */
export function recentTrades(symbol, limit) {
  return trades.get(String(symbol ?? ''))?.toArray(limit) ?? []
}

/**
 * Write the current snapshot into state. Called once per frame, never per tick.
 *
 * @param {string} focus - the instrument the desk is focused on.
 * @returns {boolean} true when something was written.
 */
export function flushToState(focus) {
  const tick = latestTick(focus)
  flushes += 1

  setValue(PATHS.market.ticks, received)
  if (!tick) return false

  // One write per path per frame — the whole point of the buffer.
  setValue(PATHS.market.bid, Number(tick.bid ?? 0))
  setValue(PATHS.market.ask, Number(tick.ask ?? 0))
  return true
}

/**
 * Schedule a flush on the next animation frame, collapsing a burst into one write.
 *
 * @param {string} focus - focused instrument.
 * @param {{raf?: Function}} [options] - injected scheduler.
 * @returns {boolean} true when this call scheduled the flush (false if one was pending).
 */
export function scheduleFlush(focus, options = {}) {
  const { raf = globalThis.requestAnimationFrame } = options
  if (pending || typeof raf !== 'function') return false

  pending = true
  raf(() => {
    pending = false
    flushToState(focus)
  })
  return true
}

/**
 * Pipeline counters, for the HUD.
 *
 * @returns {{received: number, flushes: number, symbols: number, dropped: number}} stats.
 */
export function busStats() {
  let dropped = 0
  for (const ring of trades.values()) dropped += ring.dropped()

  return { received, flushes, symbols: latest.size, dropped }
}

/** Reset everything (tests, venue reconnect, session end). */
export function resetBus() {
  trades.clear()
  latest.clear()
  listeners.clear()
  pending = false
  flushes = 0
  received = 0
}
