import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

/**
 * Book integrity — knowing, at all times, whether the ladder can be traded off.
 *
 * A depth feed does not fail loudly. The socket stays open, the frames stop, and the
 * ladder shows the last book it had — confidently, indefinitely. That is the dangerous
 * state, because it looks exactly like a quiet market.
 *
 * So the book carries an explicit status, and everything that acts on depth checks it
 * first. Live means trade off it. Resyncing means a replacement is in flight. Stale
 * means what is on screen is history.
 */

/** The statuses a book can be in. */
export const BOOK_STATUS = Object.freeze({
  live: 'live',
  resyncing: 'resyncing',
  stale: 'stale',
})

/** No frame for this long and the book is history, not a quiet market. */
export const STALE_AFTER_MS = 5000

/** Resubscribes never exceed this gap, however long an outage runs. */
export const MAX_BACKOFF_MS = 10000

/**
 * The status a book moves to on an event.
 *
 * @param {string} status - the current status.
 * @param {string} event - 'update', 'mismatch', 'timeout' or 'snapshot'.
 * @returns {string} the next status.
 */
export function nextBookStatus(status, event) {
  const current = Object.values(BOOK_STATUS).includes(status) ? status : BOOK_STATUS.stale

  switch (event) {
    case 'snapshot':
      // A snapshot is a whole new book; whatever was wrong before is gone with it.
      return BOOK_STATUS.live
    case 'update':
      // Updates do not clear a resync: the deltas arriving during one belong to a book
      // that has already been declared untrustworthy.
      return current === BOOK_STATUS.resyncing ? BOOK_STATUS.resyncing : BOOK_STATUS.live
    case 'mismatch':
      return BOOK_STATUS.resyncing
    case 'timeout':
      return BOOK_STATUS.stale
    default:
      return current
  }
}

/**
 * The delay before the next resubscribe attempt.
 *
 * @param {number} attempt - how many attempts have already failed.
 * @param {{base?: number, max?: number, jitter?: () => number}} [options] - backoff shape.
 * @returns {number} milliseconds to wait.
 */
export function backoffDelay(attempt, options = {}) {
  const { base = 250, max = MAX_BACKOFF_MS, jitter = () => 0.5 } = options
  const n = Math.max(0, Math.floor(Number(attempt) || 0))

  const uncapped = base * 2 ** n
  const capped = Math.min(Number(max) || MAX_BACKOFF_MS, uncapped)
  // Jitter matters more here than the curve: without it every client that dropped in the
  // same outage resubscribes on the same millisecond and re-creates the outage.
  const spread = capped * 0.3 * (Number(jitter()) || 0)

  return Math.round(capped - capped * 0.15 + spread)
}

/**
 * Whether a book has gone quiet for too long.
 *
 * @param {object} book - the book.
 * @param {number} now - current time in milliseconds.
 * @param {number} [limitMs] - the staleness threshold.
 * @returns {boolean} true when the book is history.
 */
export function isBookStale(book, now, limitMs = STALE_AFTER_MS) {
  const ts = Number(book?.ts)
  const clock = Number(now)
  // A book that never received a frame is not stale — it is empty, which the ladder
  // already renders as such.
  if (!Number.isFinite(ts) || ts <= 0 || !Number.isFinite(clock)) return false

  return clock - ts > (Number(limitMs) || STALE_AFTER_MS)
}

/**
 * Whether depth can be acted on right now.
 *
 * @param {string} status - the book status.
 * @returns {boolean} true only when the book is live.
 */
export function canTradeBook(status) {
  return status === BOOK_STATUS.live
}

/**
 * Publish a book status transition.
 *
 * @param {string} event - the event that occurred.
 * @returns {string} the status now in state.
 */
export function setBookStatus(event) {
  const next = nextBookStatus(appState.market?.bookStatus, event)
  setValue(PATHS.market.bookStatus, next)

  return next
}

/**
 * Drive the resync loop: schedule a resubscribe with backoff.
 *
 * @param {() => unknown} resubscribe - the resubscribe call.
 * @param {{attempt?: number, timer?: Function, jitter?: () => number}} [options] - plumbing.
 * @returns {{delay: number, cancel: () => void}} the scheduled attempt.
 */
export function scheduleResync(resubscribe, options = {}) {
  const { attempt = 0, timer = globalThis.setTimeout, jitter } = options
  const delay = backoffDelay(attempt, { jitter })

  setBookStatus('mismatch')
  const handle = typeof timer === 'function' ? timer(() => resubscribe?.(), delay) : null

  return {
    delay,
    cancel: () => {
      if (handle !== null) globalThis.clearTimeout?.(handle)
    },
  }
}
