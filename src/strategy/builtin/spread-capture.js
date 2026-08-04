import { defineStrategy } from '../contract.js'
import { FEE_SCHEDULE } from '../../hud/fee-schedule.js'

/**
 * Post-only spread capture.
 *
 * The only strategy here that earns rather than predicts. It quotes both sides passively
 * and collects the spread on paired fills, which means it has no opinion about direction
 * at all — its risks are entirely different from the other two, and so are its failure
 * modes.
 *
 * Three of them define this module:
 *
 * 1. **A spread that does not cover the round-trip fee is a losing quote.** Two maker fills
 *    at 2bp each need more than 4bp of spread before the trade is worth having, and a
 *    market maker who forgets that loses money at a perfectly steady rate.
 * 2. **Requoting on every book flicker is how a maker gets rate-limited**, and a cancelled
 *    quote is a quote that was not in the queue when the fill came.
 * 3. **Inventory is the real risk.** Passive fills accumulate on one side in a trend, and
 *    an unmanaged book turns a market maker into a directional trader who did not choose to
 *    be one. So the quotes lean against the position: long inventory quotes more
 *    aggressively on the offer and backs off the bid.
 */

/**
 * Where to post on both sides.
 *
 * @param {number} bestBid - the top bid.
 * @param {number} bestAsk - the top ask.
 * @param {number} offsetTicks - how far behind the touch to sit.
 * @param {number} tickSize - the instrument's tick.
 * @returns {{bid: number, ask: number}|null} the quote prices, or null.
 */
export function quotePrices(bestBid, bestAsk, offsetTicks, tickSize) {
  const bid = Number(bestBid)
  const ask = Number(bestAsk)
  const tick = Number(tickSize) > 0 ? Number(tickSize) : 0.01
  // A crossed or one-sided book has no spread to quote inside, and quoting off a stale
  // half-book is how a maker ends up alone on the wrong side.
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= bid) return null

  const offset = Math.max(0, Math.floor(Number(offsetTicks) || 0)) * tick
  const decimals = String(tick).split('.')[1]?.length ?? 0

  return {
    bid: Number((bid - offset).toFixed(decimals)),
    ask: Number((ask + offset).toFixed(decimals)),
  }
}

/**
 * Does the spread pay after fees?
 *
 * @param {number} spreadTicks - the spread, in ticks.
 * @param {number} minTicks - the trader's floor.
 * @param {number} makerFeeBps - the venue's maker fee.
 * @param {number} midPrice - the mid, to convert bps to ticks.
 * @param {number} tickSize - the instrument's tick.
 * @returns {boolean} true when quoting is worth it.
 */
export function minSpreadGate(spreadTicks, minTicks, makerFeeBps, midPrice, tickSize) {
  const spread = Number(spreadTicks)
  if (!Number.isFinite(spread) || spread <= 0) return false
  if (spread < (Number(minTicks) || 0)) return false

  const fee = Number(makerFeeBps)
  const mid = Number(midPrice)
  const tick = Number(tickSize)
  // With no fee or price context the trader's own floor is the whole gate — better than
  // silently assuming a fee of zero, which would pass every spread.
  if (!Number.isFinite(fee) || !Number.isFinite(mid) || !(tick > 0) || mid <= 0) return true

  // Two maker fills at `fee` bps each. A maker who forgets the round trip loses money at a
  // perfectly steady rate.
  const roundTripTicks = ((mid * (fee / 10000)) / tick) * 2

  return spread > roundTripTicks
}

/**
 * Has the book moved far enough to be worth requoting?
 *
 * @param {{bid?: number, ask?: number}} current - the live quotes.
 * @param {{bid?: number, ask?: number}} target - where they should be.
 * @param {number} toleranceTicks - how far they may drift.
 * @param {number} tickSize - the instrument's tick.
 * @returns {{bid: boolean, ask: boolean}} which side to requote.
 */
export function shouldRequote(current, target, toleranceTicks, tickSize) {
  const tick = Number(tickSize) > 0 ? Number(tickSize) : 0.01
  const tolerance = Math.max(0, Number(toleranceTicks) || 0) * tick

  const drift = (a, b) => {
    const from = Number(a)
    const to = Number(b)
    // No live quote is not drift — it is a side that needs posting.
    if (!Number.isFinite(from)) return Number.isFinite(to)
    if (!Number.isFinite(to)) return false

    // Strictly greater: a book that oscillates by exactly the tolerance would otherwise
    // requote forever, and a cancelled quote is a quote that was not in the queue when the
    // fill came.
    return Math.abs(to - from) > tolerance
  }

  return { bid: drift(current?.bid, target?.bid), ask: drift(current?.ask, target?.ask) }
}

/**
 * Lean the quotes against open inventory.
 *
 * @param {{bid: number, ask: number}} quotes - the quote prices.
 * @param {number} position - the signed position.
 * @param {number} maxInventory - the position at which the skew is full.
 * @param {number} skewTicks - the full skew, in ticks.
 * @param {number} tickSize - the instrument's tick.
 * @returns {{bid: number, ask: number, skew: number}} the skewed quotes.
 */
export function inventorySkew(quotes, position, maxInventory, skewTicks, tickSize) {
  const bid = Number(quotes?.bid)
  const ask = Number(quotes?.ask)
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return { bid: 0, ask: 0, skew: 0 }

  const pos = Number(position) || 0
  const max = Number(maxInventory) > 0 ? Number(maxInventory) : 1
  const tick = Number(tickSize) > 0 ? Number(tickSize) : 0.01
  const full = Math.max(0, Number(skewTicks) || 0) * tick

  // Clamped: past the inventory limit the skew stops growing, because a quote pushed
  // arbitrarily far is a quote that never fills — and never filling is not the same as
  // getting flat.
  const ratio = Math.max(-1, Math.min(1, pos / max))
  const shift = ratio * full
  const decimals = String(tick).split('.')[1]?.length ?? 0

  // Long inventory shifts both quotes *down*: keener to sell, less keen to buy more.
  return {
    bid: Number((bid - shift).toFixed(decimals)),
    ask: Number((ask - shift).toFixed(decimals)),
    skew: Number(shift.toFixed(decimals)),
  }
}

/**
 * One book update.
 *
 * @param {object} ctx - the strategy context.
 * @param {object} tick - the print, carrying the book top.
 * @returns {object|null} the signal, or null.
 */
export function spreadTick(ctx, tick) {
  const state = ctx?.state
  if (!state) return null

  const bid = Number(tick?.bid)
  const ask = Number(tick?.ask)
  const tickSize = Number(ctx.params?.tickSize) || Number(tick?.tickSize) || 0.01

  const base = quotePrices(bid, ask, ctx.params?.offsetTicks, tickSize)
  if (!base) {
    state.quotes = null
    return null
  }

  const spreadTicks = (ask - bid) / tickSize
  const fee = FEE_SCHEDULE.okx.swap.maker
  if (!minSpreadGate(spreadTicks, ctx.params?.minTicks, fee, (bid + ask) / 2, tickSize)) {
    state.quotes = null
    return { action: 'flat', strength: 0, reason: `spread ${spreadTicks.toFixed(1)}t under fee` }
  }

  const skewed = inventorySkew(
    base,
    state.position,
    ctx.params?.maxInventory,
    ctx.params?.skewTicks,
    tickSize,
  )
  const move = shouldRequote(state.quotes, skewed, ctx.params?.toleranceTicks, tickSize)
  if (!move.bid && !move.ask) return null

  state.quotes = skewed
  state.requotes = (Number(state.requotes) || 0) + 1

  // A quoting strategy has no directional opinion, so it signals 'flat' with its quotes in
  // the reason. Making it emit buy/sell would put a market maker's inventory into a
  // directional pipeline that means something else entirely.
  return {
    action: 'flat',
    strength: 0,
    reason: `quote ${skewed.bid} / ${skewed.ask}${skewed.skew ? ` (skew ${skewed.skew})` : ''}`,
  }
}

/**
 * The strategy.
 */
export const spreadCaptureStrategy = defineStrategy({
  id: 'spread-capture',
  name: 'Spread capture',
  params: {
    offsetTicks: { kind: 'number', label: 'offset (ticks)', default: 0, min: 0, max: 20, step: 1 },
    minTicks: { kind: 'number', label: 'min spread (ticks)', default: 2, min: 1, max: 50, step: 1 },
    toleranceTicks: {
      kind: 'number',
      label: 'requote tolerance (ticks)',
      default: 1,
      min: 0,
      max: 20,
      step: 1,
    },
    maxInventory: { kind: 'number', label: 'max inventory', default: 1, min: 0.0001, max: 1000, step: 0.1 },
    skewTicks: { kind: 'number', label: 'inventory skew (ticks)', default: 2, min: 0, max: 50, step: 1 },
    tickSize: { kind: 'number', label: 'tick size', default: 0.01, min: 0.00000001, max: 100, step: 0.01 },
  },
  init: (ctx) => {
    ctx.state.quotes = null
    ctx.state.position = 0
    ctx.state.requotes = 0
    return ctx.state
  },
  onTick: spreadTick,
  onCandle: () => null,
})
