import { createLogger } from '../../src/utils/log.js'

/**
 * The server's own market feed.
 *
 * Node 22 ships a global `WebSocket`, so this needs no dependency and no bridge through a
 * browser. It subscribes to the public channels — trades for the tape, books5 for the top
 * of book — which need no credentials at all: a feed that required keys would mean a
 * key problem could also be a data blackout, and those two failures should never be the
 * same failure.
 *
 * Public data is the shared global matching engine on both OKX platforms, so this always
 * uses the global host regardless of which platform the *keys* live on. Region only ever
 * mattered for signed calls.
 *
 * Reconnect is unconditional and forever. A venue blip at 3am must not need a human.
 */

const log = createLogger('trader-feed')

/** The public stream. Global host: public data is not region-split. */
export const PUBLIC_WS_URL = 'wss://ws.okx.com:8443/ws/v5/public'

/** Demo trading streams from a separate host entirely — the header trick is REST-only. */
export const DEMO_WS_URL = 'wss://wspap.okx.com:8443/ws/v5/public'

/** Reconnect backoff, capped so a long outage still retries briskly when it clears. */
export const BACKOFF_MS = Object.freeze([250, 500, 1000, 2000, 4000, 8000])

/**
 * Which socket to open.
 *
 * @param {boolean} demo - whether the desk is on OKX demo trading.
 * @returns {string} the URL.
 */
export function feedUrl(demo) {
  return demo === true ? DEMO_WS_URL : PUBLIC_WS_URL
}

/**
 * How long to wait before the next reconnect attempt.
 *
 * @param {number} attempt - how many have already failed.
 * @returns {number} milliseconds.
 */
export function backoffFor(attempt) {
  const index = Math.max(0, Math.min(BACKOFF_MS.length - 1, Math.floor(Number(attempt) || 0)))
  return BACKOFF_MS[index]
}

/**
 * The subscribe frame for a set of instruments.
 *
 * @param {string[]} symbols - instrument ids.
 * @returns {object|null} the frame, or null when there is nothing to ask for.
 */
export function subscribeFrame(symbols) {
  const args = []
  for (const instId of Array.isArray(symbols) ? symbols : []) {
    if (!instId) continue
    args.push({ channel: 'trades', instId })
    args.push({ channel: 'books5', instId })
  }

  return args.length > 0 ? { op: 'subscribe', args } : null
}

/**
 * Turn one raw frame into something the loop can act on.
 *
 * @param {string} raw - the frame text.
 * @returns {{kind: string, instrument?: string, trades?: object[], book?: object}} the event.
 */
export function parseFeedFrame(raw) {
  const text = String(raw ?? '')
  if (text === 'pong') return { kind: 'pong' }

  let frame
  try {
    frame = JSON.parse(text)
  } catch {
    // One malformed frame drops that frame, never the session.
    return { kind: 'unknown' }
  }

  if (frame?.event === 'error') return { kind: 'error', message: String(frame.msg ?? '') }
  if (frame?.event === 'subscribe') return { kind: 'subscribed' }

  const channel = String(frame?.arg?.channel ?? '')
  const instrument = String(frame?.arg?.instId ?? '')
  const rows = Array.isArray(frame?.data) ? frame.data : []
  if (!channel || rows.length === 0) return { kind: 'unknown' }

  if (channel === 'trades') {
    return {
      kind: 'trades',
      instrument,
      trades: rows.map((row) => ({
        instrument,
        px: Number(row?.px) || 0,
        sz: Number(row?.sz) || 0,
        side: String(row?.side ?? ''),
        ts: Number(row?.ts) || 0,
      })),
    }
  }

  if (channel === 'books5') {
    const top = rows[rows.length - 1]
    const bid = Number(top?.bids?.[0]?.[0]) || 0
    const ask = Number(top?.asks?.[0]?.[0]) || 0
    return {
      kind: 'book',
      instrument,
      book: {
        instrument,
        bid,
        ask,
        // The raw ladders are kept, not just the touch: `book-imbalance` reads levels off
        // the tick itself and would see a flat book if only the top were carried.
        bids: Array.isArray(top?.bids) ? top.bids : [],
        asks: Array.isArray(top?.asks) ? top.asks : [],
        bidSize: (top?.bids ?? []).reduce((sum, level) => sum + (Number(level?.[1]) || 0), 0),
        askSize: (top?.asks ?? []).reduce((sum, level) => sum + (Number(level?.[1]) || 0), 0),
        mid: bid > 0 && ask > 0 ? (bid + ask) / 2 : 0,
        ts: Number(top?.ts) || 0,
      },
    }
  }

  return { kind: 'unknown' }
}

/**
 * Open the feed and keep it open.
 *
 * @param {{symbols: string[], demo?: boolean, onEvent?: Function, factory?: Function,
 *   timer?: object}} options - what to watch and how to reach it.
 * @returns {{close: () => void, state: () => string, attempts: () => number}} the feed.
 */
export function startFeed(options = {}) {
  const symbols = Array.isArray(options.symbols) ? options.symbols : []
  const onEvent = options.onEvent ?? (() => {})
  const factory = options.factory ?? ((url) => new globalThis.WebSocket(url))
  const timer = options.timer ?? globalThis

  let socket = null
  let state = 'connecting'
  let attempts = 0
  let closed = false

  const connect = () => {
    if (closed) return null
    state = 'connecting'
    socket = factory(feedUrl(options.demo))

    socket.onopen = () => {
      attempts = 0
      state = 'live'
      const frame = subscribeFrame(symbols)
      if (frame) socket.send(JSON.stringify(frame))
      log.info(`feed live on ${symbols.join(', ')}`)
    }

    socket.onmessage = (event) => {
      const parsed = parseFeedFrame(event?.data)
      if (parsed.kind === 'error') log.warn(`feed error: ${parsed.message}`)
      onEvent(parsed)
    }

    socket.onclose = () => {
      if (closed) {
        state = 'dead'
        return
      }
      // Reconnect forever: an outage that outlives the backoff table still retries at the
      // cap, and the trader is worth more running late than not running.
      state = 'connecting'
      const wait = backoffFor(attempts)
      attempts += 1
      timer.setTimeout?.(connect, wait)
    }

    socket.onerror = () => log.warn('feed socket error')
    return socket
  }

  connect()

  return {
    close: () => {
      closed = true
      state = 'dead'
      socket?.close?.()
    },
    state: () => state,
    attempts: () => attempts,
  }
}
