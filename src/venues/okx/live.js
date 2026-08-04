import { createOkxSocket, parseFrame } from './socket.js'
import { mapTrade, mapBook, mapTicker } from './map.js'
import { ingest, setVenueState } from '../../pipeline/feed.js'
import { applyBookFrame, bookFor, flushBook, onResync } from '../../book/state.js'
import { flushTape } from '../../book/tape.js'
import { updateImbalance, resetImbalance } from '../../book/imbalance.js'
import { setBookStatus, scheduleResync } from '../../book/integrity.js'
import { splitSymbol } from '../../lists/ops.js'
import { setValue, appState } from '../../app/engine.js'
import { PATHS } from '../../state/paths.js'

/**
 * The live OKX feed — where the socket meets the desk.
 *
 * Everything downstream of here has existed for several phases: the socket reconnects,
 * the pipeline coalesces, the book validates itself, the ladder and tape derive. What was
 * missing was the twenty lines that connect them, which is why the desk has been running
 * on seeded state.
 *
 * This module is deliberately the *only* place that knows both a WebSocket frame and a
 * state path. It reads frames, routes them, and flushes once per animation frame — never
 * per message. On a hot pair the difference is a hundred state writes a second versus
 * sixty, and the sixty are the only ones anyone can see.
 */

/** Channels a focused instrument subscribes to. */
export function channelsFor(symbol) {
  const instId = splitSymbol(symbol).symbol || String(symbol ?? '')
  if (!instId) return []

  // `books5` rather than the full book: five levels is the actionable ladder, it arrives
  // pre-throttled at 100ms, and it needs no checksum bookkeeping to stay correct.
  return [
    { channel: 'trades', instId },
    { channel: 'books5', instId },
    { channel: 'tickers', instId },
  ]
}

/**
 * Route one parsed frame into the pipeline.
 *
 * @param {object} frame - a parsed OKX frame.
 * @param {{focus?: string, now?: number}} [context] - the desk's focus.
 * @returns {string} what the frame was routed as.
 */
export function routeFrame(frame, context = {}) {
  if (frame?.kind !== 'data') return frame?.kind ?? 'unknown'

  const focus = String(context.focus ?? appState.market?.focus ?? '')
  const instId = frame.instId

  if (frame.channel === 'trades') {
    for (const raw of frame.data) {
      const trade = mapTrade({ ...raw, instId: raw?.instId ?? instId })
      if (trade) ingest(trade, { now: context.now, focus })
    }
    return 'trades'
  }

  if (frame.channel === 'books5' || frame.channel === 'books') {
    for (const raw of frame.data) {
      const book = mapBook(raw, instId)
      applyBookFrame(instId, {
        ...book,
        // `books5` is a snapshot channel: every frame replaces the book outright, so
        // there are no deltas to lose and no sequence to keep.
        action: frame.channel === 'books5' ? 'snapshot' : frame.action,
        seqId: Number(raw?.seqId) || Number(book.ts) || 0,
        prevSeqId: Number(raw?.prevSeqId),
      })
      setBookStatus(frame.action === 'snapshot' || frame.channel === 'books5' ? 'snapshot' : 'update')
    }
    return 'book'
  }

  if (frame.channel === 'tickers') {
    for (const raw of frame.data) {
      const ticker = mapTicker({ ...raw, instId: raw?.instId ?? instId })
      if (!ticker) continue
      setValue(PATHS.market.bid, ticker.bid)
      setValue(PATHS.market.ask, ticker.ask)
    }
    return 'ticker'
  }

  return frame.channel
}

/**
 * Publish everything the frame produced. Called once per animation frame.
 *
 * @param {string} focus - the focused instrument.
 * @param {{minSize?: number, multiplier?: number, depth?: number}} [options] - view options.
 * @returns {boolean} true when anything was written.
 */
export function flushFeed(focus, options = {}) {
  const { symbol } = splitSymbol(focus)
  const instId = symbol || String(focus ?? '')
  if (!instId) return false

  const wrote = flushBook(instId)
  flushTape(instId, options)
  // Read from the store, not from state: the flush above is queued for this frame, so
  // `appState` still holds the previous book and the gauge would lag by one frame.
  if (wrote) updateImbalance(bookFor(instId), options)

  return wrote
}

/**
 * Start the OKX feed and keep it pointed at the focused instrument.
 *
 * @param {{socket?: object, raf?: Function, focus?: () => string,
 *   options?: object}} [config] - injectable plumbing.
 * @returns {{socket: object, pump: Function, focusOn: Function, stop: () => void}} the feed.
 */
export function startOkxFeed(config = {}) {
  const {
    raf = globalThis.requestAnimationFrame,
    focus = () => String(appState.market?.focus ?? ''),
    options = {},
  } = config

  const socket =
    config.socket ??
    createOkxSocket({
      onFrame: (raw) => routeFrame(parseFrame(raw), { focus: focus() }),
      onState: (state) => setVenueState('okx', state),
    })

  let running = true
  let attempts = 0
  let subscribed = ''

  const pump = () => {
    if (!running) return false
    flushFeed(focus(), options)
    if (typeof raf === 'function') raf(pump)
    return true
  }

  const focusOn = (symbol) => {
    const next = String(symbol ?? '')
    if (!next || next === subscribed) return subscribed

    subscribed = next
    // The smoothed imbalance belongs to the instrument it was measured on; carrying it
    // across a symbol change would show pressure that was never in this book.
    resetImbalance()
    socket.subscribe(channelsFor(next))
    return subscribed
  }

  const stopResync = onResync(() => {
    attempts += 1
    scheduleResync(() => socket.subscribe(channelsFor(subscribed)), { attempt: attempts })
  })

  socket.connect()
  focusOn(focus())
  if (typeof raf === 'function') raf(pump)

  return {
    socket,
    pump,
    focusOn,
    stop: () => {
      running = false
      stopResync()
      socket.close()
    },
  }
}
