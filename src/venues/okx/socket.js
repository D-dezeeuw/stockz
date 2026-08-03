import { retryDelay } from '../../state/async.js'
import { createLogger } from '../../utils/log.js'

/**
 * OKX WebSocket client.
 *
 * The connection is the desk's lifeline, so the rules here are about surviving a bad
 * network rather than a happy path:
 *
 * - **Reconnect with backoff, forever.** A venue blip at the open must not need a reload.
 * - **Resubscribe on recovery.** A socket that reconnects but forgets its channels shows
 *   a frozen book that looks like a quiet market — the most dangerous failure mode there
 *   is, because it reads as information rather than absence.
 * - **Never throw at the caller.** A parse error on one frame drops that frame, not the
 *   session.
 *
 * The socket factory is injected so tests drive the whole lifecycle without a network.
 */

const log = createLogger('okx-ws')

export const OKX_PUBLIC_URL = 'wss://ws.okx.com:8443/ws/v5/public'
export const OKX_PRIVATE_URL = 'wss://ws.okx.com:8443/ws/v5/private'

/** Connection states the header LEDs bind to. */
export const WS_STATE = Object.freeze({
  dead: 'dead',
  connecting: 'connecting',
  live: 'live',
  stale: 'stale',
})

/**
 * Build a subscribe frame for a set of channels.
 *
 * @param {Array<{channel: string, instId?: string}>} channels - what to subscribe to.
 * @returns {object|null} the frame, or null when there is nothing to send.
 */
export function subscribeFrame(channels) {
  const args = (Array.isArray(channels) ? channels : []).filter((c) => c?.channel)
  if (args.length === 0) return null

  return { op: 'subscribe', args }
}

/**
 * Parse an inbound frame.
 *
 * OKX sends a bare `pong` string, subscription acks, error objects and data pushes down
 * the same socket, so the shape has to be sorted out before anything else looks at it.
 *
 * @param {string} raw - frame text.
 * @returns {{kind: string, channel?: string, data?: unknown, code?: string, msg?: string}}
 */
export function parseFrame(raw) {
  const text = String(raw ?? '')
  if (text === 'pong') return { kind: 'pong' }

  let frame
  try {
    frame = JSON.parse(text)
  } catch {
    // One malformed frame drops that frame, never the session.
    return { kind: 'unknown' }
  }

  if (frame?.event === 'error') {
    return { kind: 'error', code: String(frame.code ?? ''), msg: String(frame.msg ?? '') }
  }
  if (frame?.event === 'login') return { kind: 'login' }
  if (frame?.event === 'subscribe') return { kind: 'subscribed', channel: frame?.arg?.channel }
  if (frame?.arg?.channel) {
    return {
      kind: 'data',
      channel: String(frame.arg.channel),
      instId: String(frame.arg.instId ?? ''),
      action: String(frame.action ?? 'update'),
      data: Array.isArray(frame.data) ? frame.data : [],
    }
  }
  return { kind: 'unknown' }
}

/**
 * Whether a feed has gone quiet for long enough to be considered stale.
 *
 * A silent socket that is still *open* is the failure that matters: the prices simply
 * stop moving, and nothing about the screen says so.
 *
 * @param {number} lastMessageAt - epoch ms of the last frame.
 * @param {number} now - current epoch ms.
 * @param {number} [limitMs] - silence tolerated before the feed is stale.
 * @returns {boolean} true when the feed should be marked stale.
 */
export function isStale(lastMessageAt, now, limitMs = 10000) {
  if (!Number.isFinite(lastMessageAt) || lastMessageAt <= 0) return false
  return now - lastMessageAt > limitMs
}

/**
 * Create a reconnecting OKX socket.
 *
 * @param {{url?: string, factory?: Function, onFrame?: Function, onState?: Function,
 *   timer?: object}} [options] - injected environment and callbacks.
 * @returns {{connect: Function, send: Function, subscribe: Function, close: Function,
 *   state: () => string, attempts: () => number}} the client.
 */
export function createOkxSocket(options = {}) {
  const {
    url = OKX_PUBLIC_URL,
    factory = (target) => new globalThis.WebSocket(target),
    onFrame = () => {},
    onState = () => {},
    timer = globalThis,
  } = options

  let socket = null
  let state = WS_STATE.dead
  let attempts = 0
  let closedByUs = false
  const channels = []

  const setState = (next) => {
    if (state === next) return
    state = next
    onState(next)
  }

  const connect = () => {
    closedByUs = false
    setState(WS_STATE.connecting)
    socket = factory(url)

    socket.onopen = () => {
      attempts = 0
      setState(WS_STATE.live)
      // Resubscribe immediately: a reconnected socket with no channels shows a frozen
      // book, which reads as a quiet market rather than as missing data.
      const frame = subscribeFrame(channels)
      if (frame) socket.send(JSON.stringify(frame))
    }

    socket.onmessage = (event) => onFrame(parseFrame(event?.data))

    socket.onclose = () => {
      if (closedByUs) return setState(WS_STATE.dead)

      setState(WS_STATE.connecting)
      const delay = retryDelay(attempts)
      attempts += 1
      timer.setTimeout?.(connect, delay)
    }

    socket.onerror = () => log.warn('socket error')
    return socket
  }

  return {
    connect,
    send: (frame) => {
      if (state !== WS_STATE.live || !socket) return false
      socket.send(typeof frame === 'string' ? frame : JSON.stringify(frame))
      return true
    },
    subscribe: (next) => {
      for (const channel of Array.isArray(next) ? next : []) {
        if (channel?.channel && !channels.some((c) => c.channel === channel.channel && c.instId === channel.instId)) {
          channels.push(channel)
        }
      }
      const frame = subscribeFrame(channels)
      if (frame && state === WS_STATE.live && socket) socket.send(JSON.stringify(frame))
      return channels.slice()
    },
    close: () => {
      closedByUs = true
      socket?.close?.()
      setState(WS_STATE.dead)
    },
    state: () => state,
    attempts: () => attempts,
  }
}
