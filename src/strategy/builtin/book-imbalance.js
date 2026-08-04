import { defineStrategy } from '../contract.js'

/**
 * Order-book imbalance.
 *
 * The book says what people intend; the tape says what they did. This strategy trades the
 * intention — when resting depth is heavily loaded on one side and *stays* loaded, price
 * tends to move away from the heavy side, because the thin side is where it is cheap to
 * push.
 *
 * Two filters do all the work, and both exist because raw imbalance is a famously noisy
 * signal:
 *
 * 1. **Persistence.** A ratio that spikes for one book update is a large order being placed
 *    and pulled, or one level refreshing. Requiring it to hold for several consecutive
 *    updates is what separates real accumulation from a flickering quote.
 * 2. **Microprice agreement.** The size-weighted mid leads the last trade, so it is an
 *    independent read of the same pressure. Requiring the two to agree throws away the
 *    setups where depth is loaded but nothing is actually moving — which is exactly what a
 *    spoof looks like.
 */

/**
 * Which side of the book is loaded.
 *
 * @param {Array} bids - `[price, size]` levels, best first.
 * @param {Array} asks - `[price, size]` levels, best first.
 * @param {number} levels - how deep to look.
 * @returns {number} -1 (asks heavy) to 1 (bids heavy).
 */
export function depthImbalance(bids, asks, levels) {
  const depth = Math.max(1, Math.floor(Number(levels) || 5))
  const sum = (side) =>
    (Array.isArray(side) ? side : [])
      .slice(0, depth)
      .reduce((total, level) => total + Math.abs(Number(level?.[1]) || 0), 0)

  const bidVol = sum(bids)
  const askVol = sum(asks)
  const total = bidVol + askVol
  // An empty book is balanced, not loaded. Returning anything else would have the strategy
  // fire on a disconnect.
  if (total <= 0) return 0

  return Number(((bidVol - askVol) / total).toFixed(6))
}

/**
 * The size-weighted mid.
 *
 * @param {number} bestBid - the top bid price.
 * @param {number} bestAsk - the top ask price.
 * @param {number} bidSize - size at the bid.
 * @param {number} askSize - size at the ask.
 * @returns {number} the microprice, or 0.
 */
export function microPrice(bestBid, bestAsk, bidSize, askSize) {
  const bid = Number(bestBid)
  const ask = Number(bestAsk)
  const bidQty = Math.abs(Number(bidSize) || 0)
  const askQty = Math.abs(Number(askSize) || 0)
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) return 0

  const total = bidQty + askQty
  if (total <= 0) return Number(((bid + ask) / 2).toFixed(10))

  // Weighted by the *opposite* side's size: a big bid pulls the microprice toward the ask,
  // because that resting size is what a taker has to lift through.
  return Number(((bid * askQty + ask * bidQty) / total).toFixed(10))
}

/**
 * Has the imbalance held long enough to believe?
 *
 * @param {object} state - the run's scratchpad.
 * @param {number} ratio - the current imbalance.
 * @param {number} threshold - the level that counts as loaded.
 * @param {number} persistM - how many consecutive updates it must hold.
 * @returns {{ok: boolean, streak: number, side: string}} the verdict.
 */
export function imbalancePersist(state, ratio, threshold, persistM) {
  const value = Number(ratio) || 0
  const level = Number(threshold) > 0 ? Number(threshold) : 0.3
  const need = Math.max(1, Math.floor(Number(persistM) || 3))

  const side = value >= level ? 'buy' : value <= -level ? 'sell' : ''
  if (!side || !state) {
    if (state) {
      state.streak = 0
      state.streakSide = ''
    }
    return { ok: false, streak: 0, side: '' }
  }

  // A side flip restarts the count. A ratio that swung from loaded-bid to loaded-ask has
  // not been persistent, it has been volatile — the opposite of what this filter wants.
  state.streak = state.streakSide === side ? (Number(state.streak) || 0) + 1 : 1
  state.streakSide = side

  return { ok: state.streak >= need, streak: state.streak, side }
}

/**
 * The entry call.
 *
 * @param {{ok?: boolean, side?: string, streak?: number}} persist - the persistence verdict.
 * @param {number} ratio - the current imbalance.
 * @param {number} microDrift - the microprice change since the last update.
 * @returns {{action: string, strength: number, reason: string}|null} the signal, or null.
 */
export function imbalanceSignal(persist, ratio, microDrift) {
  if (persist?.ok !== true || !persist.side) return null

  const drift = Number(microDrift) || 0
  const wanted = persist.side === 'buy' ? 1 : -1
  // Loaded depth with a microprice going the other way is depth nobody is trading against
  // — which is what a spoof looks like from here.
  if (drift !== 0 && Math.sign(drift) !== wanted) return null

  const strength = Math.min(1, Math.abs(Number(ratio) || 0))

  return {
    action: persist.side,
    strength,
    reason: `book ${(Number(ratio) * 100).toFixed(0)}% ${persist.side === 'buy' ? 'bid' : 'ask'}-heavy ×${persist.streak}`,
  }
}

/**
 * Should the position be closed?
 *
 * @param {{side?: string, px?: number}} entry - the open trade.
 * @param {number} ratio - the current imbalance.
 * @param {number} px - the current price.
 * @param {number} targetTicks - the profit target, in ticks.
 * @param {number} tickSize - the instrument's tick.
 * @returns {string} '' to hold, or the reason to exit.
 */
export function flipExit(entry, ratio, px, targetTicks, tickSize) {
  if (!entry?.side) return ''

  const value = Number(ratio) || 0
  // The book turning against the trade is the exit, and it usually comes before price
  // does — which is the whole reason to trade the book rather than the tape.
  const flipped = entry.side === 'buy' ? value < 0 : value > 0
  if (flipped) return 'book flipped'

  const price = Number(px)
  const from = Number(entry.px)
  const tick = Number(tickSize) > 0 ? Number(tickSize) : 0.01
  const target = Number(targetTicks) > 0 ? Number(targetTicks) : 3
  if (!Number.isFinite(price) || !Number.isFinite(from)) return ''

  // Rounded before comparing: `(100.3 - 100) / 0.1` is 2.9999999999999822 in binary
  // floating point, so an exact-target trade would silently never close.
  const moved = Number((((price - from) / tick) * (entry.side === 'buy' ? 1 : -1)).toFixed(6))

  return moved >= target ? 'target hit' : ''
}

/**
 * One book update.
 *
 * @param {object} ctx - the strategy context.
 * @param {object} tick - the update, carrying the book.
 * @returns {object|null} the signal, or null.
 */
export function imbalanceTick(ctx, tick) {
  const state = ctx?.state
  if (!state) return null

  const bids = tick?.bids
  const asks = tick?.asks
  const ratio = depthImbalance(bids, asks, ctx.params?.levels)
  const micro = microPrice(bids?.[0]?.[0], asks?.[0]?.[0], bids?.[0]?.[1], asks?.[0]?.[1])
  const drift = state.micro ? micro - state.micro : 0
  state.micro = micro

  if (state.entry) {
    const exit = flipExit(state.entry, ratio, micro, ctx.params?.targetTicks, ctx.params?.tickSize)
    if (!exit) return null

    state.entry = null
    return { action: 'flat', strength: 1, reason: exit }
  }

  const persist = imbalancePersist(state, ratio, ctx.params?.threshold, ctx.params?.persistM)
  const signal = imbalanceSignal(persist, ratio, drift)
  if (!signal) return null

  state.entry = { side: signal.action, px: micro }
  state.streak = 0

  return signal
}

/**
 * The strategy.
 */
export const bookImbalanceStrategy = defineStrategy({
  id: 'book-imbalance',
  name: 'Book imbalance',
  params: {
    levels: { kind: 'number', label: 'depth levels', default: 5, min: 1, max: 50, step: 1 },
    threshold: { kind: 'number', label: 'imbalance threshold', default: 0.3, min: 0.05, max: 0.95, step: 0.05 },
    persistM: { kind: 'number', label: 'must hold (updates)', default: 3, min: 1, max: 20, step: 1 },
    targetTicks: { kind: 'number', label: 'target (ticks)', default: 3, min: 1, max: 50, step: 1 },
    tickSize: { kind: 'number', label: 'tick size', default: 0.01, min: 0.00000001, max: 100, step: 0.01 },
  },
  init: (ctx) => {
    ctx.state.streak = 0
    ctx.state.streakSide = ''
    ctx.state.micro = 0
    ctx.state.entry = null
    return ctx.state
  },
  onTick: imbalanceTick,
  onCandle: () => null,
})
