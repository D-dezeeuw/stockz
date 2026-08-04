import { createOkxSocket, parseFrame } from './socket.js'
import { mapTrade, mapBook, mapTicker } from './map.js'
import { ingest, setVenueState } from '../../pipeline/feed.js'
import { applyBookFrame, bookFor, flushBook, onResync } from '../../book/state.js'
import { flushTape } from '../../book/tape.js'
import { updateImbalance, resetImbalance } from '../../book/imbalance.js'
import { setBookStatus, scheduleResync } from '../../book/integrity.js'
import { splitSymbol } from '../../lists/ops.js'
import { markPosition, flushPositions, positionKey } from '../../positions/store.js'
import { refreshDayPnl, expirePulse } from '../../positions/header.js'
import { sample as sampleEquity } from '../../positions/equity.js'
import { refreshHud, spreadBps } from '../../hud/state.js'
import { flushQuality } from '../../hud/quality.js'
import { refreshSession } from '../../hud/session.js'
import { flushFees } from '../../hud/fees.js'
import { refreshCompact } from '../../hud/compact.js'
import { tickStrategies } from '../../strategy/registry.js'
import { evaluateAlerts, publishAlertChips } from '../../alerts/price.js'
import { flushAlerts } from '../../alerts/bus.js'
import { checkHealth, venueTransition } from '../../alerts/health.js'
import { evictStale } from '../../exec/latency.js'
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
      // Stamped so the ticket can refuse to price off a quote that stopped moving.
      setValue(PATHS.market.quoteTs, ticker.ts)
    }
    return 'ticker'
  }

  return frame.channel
}

/** The previous mid, so an alert always compares two prices rather than one. */
let lastMid = NaN

/** The learned spread baseline and spike streak. Outside the reactive tree like every
 *  other hot store on this path. */
const health = { spreadBase: 0, spreadStreak: 0 }

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

  // Marked from the book's own mid rather than the last trade: a position's P&L should
  // move with what it could be closed at, not with whatever last printed.
  const book = bookFor(instId)
  const bid = Number(book?.bids?.[0]?.[0]) || 0
  const ask = Number(book?.asks?.[0]?.[0]) || 0
  if (bid > 0 && ask > 0) markPosition(positionKey('okx', instId), (bid + ask) / 2)
  const at = Number(book?.ts) || 0
  if (flushPositions()) refreshDayPnl({ now: at })
  expirePulse(at)
  // Sampled on the same frame but paced by its own clock: the curve is a shape, not a
  // recording of every tick.
  sampleEquity(Number(appState.trade?.dayTotal) || 0, at)
  refreshHud({ now: at })
  refreshSession({ now: at })
  flushFees({ now: at })
  // The strip re-reads what the tiles above published, which lands next tick — so it
  // trails them by one frame. Sixteen milliseconds on a readout nobody trades off, and
  // the alternative is a second copy of every metric's derivation.
  if (appState.settings?.compactHud === true) refreshCompact()
  // Signals age out on the same pump. A ttl that only expired when the next tick of that
  // instrument arrived would never fire on the instrument that went quiet — which is
  // exactly the one whose signal has gone stale.
  tickStrategies(at)
  // Alerts run off the book's own mid rather than the last print: a level is about where
  // the market *is*, and a single stale trade should not trip one.
  if (bid > 0 && ask > 0) {
    const mid = (bid + ask) / 2
    evaluateAlerts(instId, lastMid, mid, at)
    lastMid = mid
  }
  publishAlertChips(focus)
  // Health is a *condition*, not an event, which is exactly why nothing else reports it:
  // a spread that quietly tripled costs money long before anyone notices it.
  if (bid > 0 && ask > 0) {
    const tick = Number(appState.market?.tickSize) || 0.01
    checkHealth(health, { spread: (ask - bid) / tick, now: at })
  }
  // Published once per frame like everything else: an alert stack that re-rendered on every
  // emission would be the one part of the desk that ignores the rAF budget.
  flushAlerts()
  flushQuality(spreadBps())
  // Swept on the same frame: an order whose ack never came would otherwise sit in the
  // latency map for the life of the session.
  evictStale(at)
  // Read from the store, not from state: the flush above is queued for this frame, so
  // `appState` still holds the previous book and the gauge would lag by one frame.
  if (wrote) updateImbalance(bookFor(instId), options)

  return wrote
}

/**
 * Route one raw socket message into the pipeline.
 *
 * @param {string} raw - the socket's message data.
 * @param {() => string} focus - the desk's current focus.
 * @returns {string} what the frame was routed as.
 */
export function onFeedFrame(raw, focus) {
  return routeFrame(parseFrame(raw), { focus: focus?.() ?? '' })
}

/**
 * Record the socket's connection state where the header LEDs can see it.
 *
 * @param {string} state - the socket state.
 * @returns {object} the venue map now in state.
 */
export function onFeedState(state) {
  // Announced before it is recorded, so the alert has the previous state to compare
  // against — a transition is the only thing here worth saying out loud.
  venueTransition('okx', state, Date.now())
  return setVenueState('okx', state)
}

/**
 * The socket callbacks, bound to a focus source.
 *
 * @param {() => string} focus - the desk's current focus.
 * @returns {{onFrame: Function, onState: Function}} the handlers.
 */
export function feedHandlers(focus) {
  return {
    onFrame: (raw) => onFeedFrame(raw, focus),
    onState: onFeedState,
  }
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

  // The socket callbacks are named rather than inline: an inline arrow is invisible to
  // the coverage gate, and these two are the entire path from the wire to the desk.
  const socket = config.socket ?? createOkxSocket(feedHandlers(focus))

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
