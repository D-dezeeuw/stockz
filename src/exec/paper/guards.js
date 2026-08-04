/**
 * The market states that make a simulator lie.
 *
 * A paper fill is a claim about what would have happened. Most of the time the claim is
 * easy, and then the feed does one of four things and the easy answer becomes a confident
 * fabrication:
 *
 * 1. **A crossed book** — bid above ask, which happens on a venue for a few milliseconds
 *    during a fast move and happens on *this* desk whenever two updates land out of order.
 *    Filling against it hands the trader free money in both directions.
 * 2. **A gap** — the next print is 8% away because the tape skipped, or because a feed
 *    reconnected and delivered a stale frame. A limit order "filled" through a gap it was
 *    never in front of is the single most flattering bug a sim can have.
 * 3. **A stalled feed** — the last tick was ninety seconds ago. The price on screen is not
 *    a price, it is a memory, and a fill against it is a fill at a price that no longer
 *    exists.
 * 4. **A zero or absurd size** — a malformed frame, which fills nothing but would book a
 *    position of NaN if let through.
 *
 * Refusing is always the right answer. A sim that declines to fill teaches nothing wrong;
 * a sim that fills against a broken book teaches a strategy that only works when the data
 * is broken.
 */

/** Past this the book is not a book. */
export const MAX_SPREAD_BPS = 1000

/** Past this a print is a gap, not a move. */
export const MAX_GAP_BPS = 500

/** Past this the feed has stalled and the price is a memory. */
export const STALE_MS = 15000

/**
 * Is this a book worth filling against?
 *
 * @param {{bid?: number, ask?: number}} market - the book's top.
 * @param {{maxSpreadBps?: number}} [limits] - overrides.
 * @returns {{ok: boolean, reason: string}} the verdict.
 */
export function checkBook(market, limits = {}) {
  const bid = Number(market?.bid)
  const ask = Number(market?.ask)
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) {
    return { ok: false, reason: 'no_book' }
  }

  // Crossed happens for milliseconds on a real venue and constantly on a desk whose two
  // updates landed out of order. Filling against it hands out free money in both
  // directions, which is the one error a practice account must never teach.
  if (ask < bid) return { ok: false, reason: 'crossed' }

  const mid = (bid + ask) / 2
  const spreadBps = ((ask - bid) / mid) * 10000
  const cap = Number(limits?.maxSpreadBps) > 0 ? Number(limits.maxSpreadBps) : MAX_SPREAD_BPS
  // A 10% spread is not a wide market, it is a half-populated book — usually one side of
  // a reconnect. Quoting a fill off it invents the missing half.
  if (spreadBps > cap) return { ok: false, reason: 'spread' }

  return { ok: true, reason: '' }
}

/**
 * Did the tape move, or did it skip?
 *
 * @param {number} price - the new print.
 * @param {number} previous - the print before it.
 * @param {{maxGapBps?: number}} [limits] - overrides.
 * @returns {{ok: boolean, reason: string, bps: number}} the verdict.
 */
export function checkGap(price, previous, limits = {}) {
  const now = Number(price)
  const before = Number(previous)
  if (!Number.isFinite(now) || now <= 0) return { ok: false, reason: 'no_price', bps: 0 }
  // Nothing to compare against is not a gap. The first print of a session has no
  // predecessor, and refusing it would make every session start dead.
  if (!Number.isFinite(before) || before <= 0) return { ok: true, reason: '', bps: 0 }

  const bps = Math.abs((now - before) / before) * 10000
  const cap = Number(limits?.maxGapBps) > 0 ? Number(limits.maxGapBps) : MAX_GAP_BPS

  // A limit order "filled" through a gap it was never in front of is the most flattering
  // bug a sim can have: the strategy books the whole move and never had to be right.
  return bps > cap ? { ok: false, reason: 'gap', bps: Number(bps.toFixed(2)) } : { ok: true, reason: '', bps: Number(bps.toFixed(2)) }
}

/**
 * Is the price still a price?
 *
 * @param {number} lastTs - when the last tick arrived.
 * @param {number} now - the current time.
 * @param {{staleMs?: number}} [limits] - overrides.
 * @returns {{ok: boolean, reason: string, ageMs: number}} the verdict.
 */
export function checkFresh(lastTs, now, limits = {}) {
  const at = Number(lastTs)
  const then = Number(now)
  // No timestamp is not evidence of staleness, it is absence of evidence — a caller that
  // does not stamp its book has told us nothing, and refusing every unstamped snapshot
  // would break the honest ones to punish the careless. `checkBook` already answers
  // whether the thing is a book at all; this only answers whether it is *old*.
  if (!Number.isFinite(at) || at <= 0 || !Number.isFinite(then)) {
    return { ok: true, reason: 'unknown', ageMs: 0 }
  }

  const ageMs = Math.max(0, then - at)
  const cap = Number(limits?.staleMs) > 0 ? Number(limits.staleMs) : STALE_MS

  // The price on screen after a stall is not a price, it is a memory — and a fill against
  // a memory is a fill at a price that no longer exists.
  return ageMs > cap ? { ok: false, reason: 'stale', ageMs } : { ok: true, reason: '', ageMs }
}

/**
 * Everything, in one call.
 *
 * @param {{market?: object, price?: number, previous?: number, lastTs?: number,
 *   now?: number, size?: number}} input - the state to judge.
 * @param {object} [limits] - overrides.
 * @returns {{ok: boolean, reason: string}} the verdict.
 */
export function guardPaperFill(input = {}, limits = {}) {
  const size = Math.abs(Number(input?.size ?? 1) || 0)
  // Checked first and cheapest: a malformed frame fills nothing but would book a position
  // of NaN if let through, and every check after this would be reasoning about it.
  if (!(size > 0)) return { ok: false, reason: 'no_size' }

  const book = checkBook(input.market, limits)
  if (!book.ok) return book

  const fresh = checkFresh(input.lastTs, input.now, limits)
  if (!fresh.ok) return fresh

  // Only when there is a print to judge. A gap is a property of *consecutive prints*, so
  // the submit path — which has a book and no tape — has nothing to check, and running it
  // there would refuse every market order for want of a price it was never given.
  if (input.price !== undefined) {
    const gap = checkGap(input.price, input.previous, limits)
    if (!gap.ok) return gap
  }

  return { ok: true, reason: '' }
}
