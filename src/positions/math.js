/**
 * Position maths.
 *
 * Two things here are worth more care than they look.
 *
 * **Average entry.** Adding to a position at a new price changes the average, and the
 * naive version — overwriting the entry with the last fill's price — silently misstates
 * every P&L that follows it. There is no error, no rejection, just a number that has
 * been wrong since the second fill.
 *
 * **Flips.** A fill that trades through zero is two events wearing one coat: it closes
 * the old position (realising its P&L) and opens a new one in the other direction at a
 * fresh average. Treating it as one arithmetic operation produces a position with a
 * negative quantity or an average entry that never existed.
 */

/** The tolerance below which a quantity is treated as flat. */
export const DUST = 1e-9

/**
 * A fresh position record.
 *
 * @param {{venue?: string, instrument?: string, qty?: number, avgPx?: number,
 *   openedAt?: number}} [seed] - starting values.
 * @returns {object} the position.
 */
export function makePosition(seed = {}) {
  const qty = Number(seed.qty) || 0

  return {
    venue: String(seed.venue ?? ''),
    instrument: String(seed.instrument ?? ''),
    qty,
    // Side is derived from the sign rather than stored twice: two sources for one fact
    // is two chances to disagree.
    avgPx: Number(seed.avgPx) || 0,
    realized: Number(seed.realized) || 0,
    fees: Number(seed.fees) || 0,
    openedAt: Number(seed.openedAt) || 0,
    mark: Number(seed.mark) || 0,
    // Practice or real, on the position itself. The shared blocks badge from this rather
    // than from `trade.mode`, so a paper position left open across a switch to live does
    // not start reading as real.
    paper: seed.paper === true,
  }
}

/**
 * Which way a position points.
 *
 * @param {number} qty - signed quantity.
 * @returns {string} 'long', 'short' or 'flat'.
 */
export function sideOf(qty) {
  const value = Number(qty)
  if (!Number.isFinite(value) || Math.abs(value) < DUST) return 'flat'

  return value > 0 ? 'long' : 'short'
}

/**
 * The average entry after adding to a position.
 *
 * @param {number} qty - current signed quantity.
 * @param {number} avgPx - current average entry.
 * @param {number} fillQty - the fill's signed quantity.
 * @param {number} fillPx - the fill's price.
 * @returns {number} the new average entry.
 */
export function avgEntryAfterAdd(qty, avgPx, fillQty, fillPx) {
  const held = Number(qty) || 0
  const added = Number(fillQty) || 0
  const total = held + added
  if (Math.abs(total) < DUST) return 0

  // Weighted by absolute size: the sign is carried by the quantity, and letting it into
  // this arithmetic produces an average that drifts the wrong way on a short.
  const weighted = Math.abs(held) * (Number(avgPx) || 0) + Math.abs(added) * (Number(fillPx) || 0)
  return Number((weighted / (Math.abs(held) + Math.abs(added))).toFixed(10))
}

/**
 * Realised P&L from closing part of a position.
 *
 * @param {number} closedQty - absolute quantity closed.
 * @param {number} avgPx - the position's average entry.
 * @param {number} exitPx - the closing price.
 * @param {string} side - the side being closed.
 * @returns {number} realised P&L in quote currency.
 */
export function realizedFrom(closedQty, avgPx, exitPx, side) {
  const qty = Math.abs(Number(closedQty) || 0)
  const entry = Number(avgPx) || 0
  const exit = Number(exitPx) || 0
  if (qty === 0 || entry === 0) return 0

  // A short profits when it closes *below* its entry, which is the sign flip that gets
  // dropped and turns a winning short into a reported loss.
  const move = side === 'short' ? entry - exit : exit - entry
  return Number((move * qty).toFixed(10))
}

/**
 * Split a fill that trades through zero.
 *
 * @param {number} qty - current signed quantity.
 * @param {number} fillQty - the fill's signed quantity.
 * @returns {{closing: number, opening: number, flips: boolean}} the two halves.
 */
export function splitFlipFill(qty, fillQty) {
  const held = Number(qty) || 0
  const fill = Number(fillQty) || 0

  // Same direction, or already flat: nothing to split.
  if (held === 0 || Math.sign(held) === Math.sign(fill)) {
    return { closing: 0, opening: fill, flips: false }
  }

  const closing = Math.min(Math.abs(fill), Math.abs(held)) * Math.sign(fill)
  const opening = Number((fill - closing).toFixed(10))

  return { closing, opening, flips: Math.abs(opening) > DUST }
}

/**
 * Apply a fill to a position.
 *
 * @param {object} position - the position before.
 * @param {{qty: number, px: number, fee?: number, ts?: number}} fill - the fill, with a
 *   signed quantity.
 * @returns {{position: object, realized: number}} the position after, and what it booked.
 */
export function applyFill(position, fill) {
  const held = makePosition(position)
  const fillQty = Number(fill?.qty) || 0
  const fillPx = Number(fill?.px) || 0
  if (fillQty === 0 || fillPx <= 0) return { position: held, realized: 0 }

  const { closing, opening, flips } = splitFlipFill(held.qty, fillQty)
  const fees = held.fees + (Number(fill?.fee) || 0)

  // Pure add: average moves, nothing is booked.
  if (closing === 0) {
    return {
      position: {
        ...held,
        qty: Number((held.qty + opening).toFixed(10)),
        avgPx: avgEntryAfterAdd(held.qty, held.avgPx, opening, fillPx),
        fees,
        openedAt: held.openedAt || Number(fill?.ts) || 0,
        // Sticky once set. A position opened on paper stays paper even if a later fill
        // arrives without the flag — the alternative is a practice position that quietly
        // starts reading as real, which is the one mislabel that costs money.
        paper: held.paper === true || fill?.paper === true,
      },
      realized: 0,
    }
  }

  const booked = realizedFrom(closing, held.avgPx, fillPx, sideOf(held.qty))
  const remaining = Number((held.qty + closing).toFixed(10))

  return {
    position: {
      ...held,
      qty: flips ? opening : remaining,
      // A reduce leaves the entry alone — the position that remains was opened at the
      // same average — while a flip starts a new position at the price it flipped at.
      avgPx: flips ? fillPx : Math.abs(remaining) < DUST ? 0 : held.avgPx,
      realized: Number((held.realized + booked).toFixed(10)),
      fees,
      openedAt: flips ? Number(fill?.ts) || 0 : held.openedAt,
      // A flip is a new position, so it takes the incoming fill's mode; a reduce leaves
      // the one it already had.
      paper: flips ? fill?.paper === true : held.paper === true,
    },
    realized: booked,
  }
}

/**
 * Unrealised P&L at a mark.
 *
 * @param {object} position - the position.
 * @param {number} mark - the current price.
 * @returns {number} unrealised P&L in quote currency.
 */
export function unrealizedPnl(position, mark) {
  const qty = Number(position?.qty) || 0
  const price = Number(mark) || 0
  if (Math.abs(qty) < DUST || price <= 0) return 0

  return realizedFrom(qty, position?.avgPx, price, sideOf(qty))
}
