import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { pushToast } from '../ui/toast.js'

/**
 * The burst queue.
 *
 * A scalper hitting BUY four times in 300ms means four orders, not one order and three
 * dropped clicks — and they mean four orders *at the prices those clicks saw*. So each
 * click freezes its own payload the instant it fires, and the queue drains them in
 * order. Nothing is re-priced on the way out: an order that quietly repriced itself
 * while queued is the worst possible outcome, worse than a rejection.
 *
 * The cap exists for the case where the clicking is not deliberate — a stuck key, a
 * trackpad double-fire — and it refuses loudly rather than flooding the venue.
 */

/** Sequence stamp, so FIFO survives an out-of-order resolve. */
let sequence = 0

/**
 * The queue itself, held outside the reactive tree.
 *
 * `setValue` is applied on the next tick, so a queue read back from state is one frame
 * stale — and a burst arrives well inside one frame. Reading state here would drain the
 * same click twice. State gets a mirror for the depth badge; this array is the truth.
 */
let pending = []

/** Orders allowed to queue before clicks start being refused. */
export const MAX_BURST = 8

/**
 * The next monotonic sequence number.
 *
 * @returns {number} the stamp.
 */
export function nextSeq() {
  sequence += 1
  return sequence
}

/**
 * Freeze a payload onto the queue.
 *
 * @param {object[]} queue - the current queue.
 * @param {object} payload - the venue payload, already priced.
 * @param {{max?: number, now?: number}} [options] - the cap and the clock.
 * @returns {{queue: object[], accepted: boolean, reason: string}} the outcome.
 */
export function enqueueOrder(queue, payload, options = {}) {
  const list = Array.isArray(queue) ? queue : []
  const { max = MAX_BURST } = options
  if (!payload?.clOrdId) return { queue: list, accepted: false, reason: 'empty payload' }

  if (list.length >= Math.max(1, Number(max) || MAX_BURST)) {
    // A backlog this deep is a stuck key or a double-firing trackpad, not intent.
    return { queue: list, accepted: false, reason: 'burst limit' }
  }

  return {
    // A frozen copy: the payload must reach the venue at the price its click saw, and a
    // reference could be mutated by the next prime before it drains.
    queue: [...list, { ...payload, seq: nextSeq(), queuedAt: Number(options.now) || 0 }],
    accepted: true,
    reason: '',
  }
}

/**
 * Drain the queue through a send call, one at a time, in order.
 *
 * @param {object[]} queue - the queue to drain.
 * @param {(payload: object) => Promise<unknown>} send - the venue call.
 * @param {{retries?: number}} [options] - one head-of-queue retry by default.
 * @returns {Promise<{sent: number, failed: number, remaining: object[]}>} the result.
 */
export async function drainQueue(queue, send, options = {}) {
  const list = [...(Array.isArray(queue) ? queue : [])].sort((a, b) => a.seq - b.seq)
  const { retries = 1 } = options
  let sent = 0
  let failed = 0

  while (list.length > 0) {
    const next = list.shift()
    let ok = false

    for (let attempt = 0; attempt <= retries && !ok; attempt += 1) {
      // Serial, deliberately: two orders in flight can be acknowledged out of order, and
      // the trader's intent was a sequence.
      const result = await send?.(next).catch(() => null)
      ok = result !== null && result !== false
    }

    if (ok) sent += 1
    else failed += 1
  }

  return { sent, failed, remaining: list }
}

/**
 * Push a click onto the desk's queue, reporting a refusal.
 *
 * @param {object} payload - the frozen payload.
 * @param {{now?: number, max?: number}} [options] - the clock and cap.
 * @returns {boolean} true when the click was accepted.
 */
export function queueOrder(payload, options = {}) {
  const { queue, accepted, reason } = enqueueOrder(pending, payload, {
    ...options,
    max: options.max ?? appState.settings?.maxBurst,
  })

  if (!accepted) {
    if (reason === 'burst limit') pushToast('burst limit — click refused', 'warn', options.now ?? 0)
    return false
  }

  pending = queue
  setValue(PATHS.trade.queue, queue)
  return true
}

/**
 * Take everything queued, leaving the queue empty.
 *
 * @returns {object[]} the drained payloads, in click order.
 */
export function takeQueue() {
  const taken = pending
  pending = []
  setValue(PATHS.trade.queue, [])

  return taken
}

/** Reset the queue and its sequence — a fresh session, or a test. */
export function resetQueue() {
  sequence = 0
  pending = []
  setValue(PATHS.trade.queue, [])
  return true
}
