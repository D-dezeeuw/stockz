/**
 * Fixed-size ring buffers.
 *
 * A scalping session runs for hours against a feed that can produce hundreds of prints a
 * second. An unbounded array of ticks is a memory leak with a clock on it: the tab slows,
 * then GC pauses start dropping frames, and the desk gets *worse* exactly as the market
 * gets busier — the moment it needs to be fastest.
 *
 * So every buffer here has a hard capacity and O(1) writes. Old data does not get
 * "cleaned up later"; it is overwritten in place and never allocated again.
 */

/**
 * Create a ring buffer.
 *
 * @param {number} capacity - maximum entries retained.
 * @returns {{push: Function, toArray: Function, last: Function, size: Function,
 *   clear: Function, capacity: number, dropped: Function}} the buffer.
 */
export function createRing(capacity = 512) {
  const max = Math.max(1, Math.floor(Number(capacity) || 1))
  const items = new Array(max)
  let head = 0
  let count = 0
  let dropped = 0

  return {
    capacity: max,

    /**
     * Append an entry, overwriting the oldest when full.
     *
     * @param {unknown} item - entry to store.
     * @returns {number} entries currently held.
     */
    push(item) {
      if (count === max) dropped += 1
      items[head] = item
      head = (head + 1) % max
      if (count < max) count += 1
      return count
    },

    /**
     * The buffer's contents, oldest first.
     *
     * @param {number} [limit] - return at most this many, newest-biased.
     * @returns {unknown[]} a plain array copy.
     */
    toArray(limit) {
      const wanted = Math.min(Number.isFinite(limit) ? Math.max(0, limit) : count, count)
      const out = new Array(wanted)

      for (let i = 0; i < wanted; i += 1) {
        // Walk back from the newest so a limited read returns the most recent entries.
        out[wanted - 1 - i] = items[(head - 1 - i + max * 2) % max]
      }
      return out
    },

    /** @returns {unknown} the newest entry, or undefined when empty. */
    last() {
      return count === 0 ? undefined : items[(head - 1 + max) % max]
    },

    /**
     * Overwrite the newest entry.
     *
     * The candle aggregator needs this: a print inside the current bucket updates the
     * open candle rather than appending a second one, and appending would leave the chart
     * drawing hundreds of one-print bars per second.
     *
     * @param {unknown} item - replacement entry.
     * @returns {boolean} true when something was replaced.
     */
    replaceLast(item) {
      if (count === 0) return false
      items[(head - 1 + max) % max] = item
      return true
    },

    /** @returns {number} entries currently held. */
    size() {
      return count
    },

    /** @returns {number} how many entries have been overwritten since creation. */
    dropped() {
      return dropped
    },

    /** Forget everything. */
    clear() {
      head = 0
      count = 0
      dropped = 0
    },
  }
}

/**
 * Rate of arrival — the desk's measure of how hot the tape is.
 *
 * @param {Array<{ts?: number}>} entries - recent entries, oldest first.
 * @param {number} now - epoch ms.
 * @param {number} [windowMs] - measurement window.
 * @returns {number} entries per second across the window.
 */
export function arrivalRate(entries, now, windowMs = 1000) {
  const list = Array.isArray(entries) ? entries : []
  if (list.length === 0 || !Number.isFinite(now) || windowMs <= 0) return 0

  const cutoff = now - windowMs
  let recent = 0
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (Number(list[i]?.ts) <= cutoff) break
    recent += 1
  }
  return (recent * 1000) / windowMs
}
