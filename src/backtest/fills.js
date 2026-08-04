import { FEE_SCHEDULE } from '../hud/fee-schedule.js'

/**
 * Fills that behave like a venue, so backtest P&L is honest.
 *
 * A backtest that fills every order at the price on the tick that triggered it will show an
 * edge that does not exist. Four things stand between a signal and a fill, and each one of
 * them costs money:
 *
 * 1. **The spread.** A market buy pays the offer, not the last print. On a two-tick edge
 *    that alone is most of the trade.
 * 2. **Latency.** The order arrives forty milliseconds later, against whatever the tape is
 *    doing then — which, after a signal fired, is usually the wrong way.
 * 3. **Size.** A clip that eats three levels does not fill at the top one.
 * 4. **Fees.** Two sides at a taker rate, on every round trip, at scalping frequency.
 *
 * All four are *assumptions*, so all four are configurable, and the config travels with the
 * run. A result whose fill assumptions are not recorded is a number nobody can reproduce.
 *
 * Every function here is pure, and the module imports nothing that reaches the desk — the
 * whole model runs inside the backtest worker.
 */

/** What the sim assumes when nobody has said otherwise. */
export const DEFAULT_FILL_CONFIG = Object.freeze({
  // Only used when a tick carries no book. OKX majors quote inside this most of the day.
  spreadBps: 2,
  // Browser to OKX and back, in the good case. Deliberately not zero: a zero-latency
  // backtest is a time machine, and every strategy looks profitable in one.
  latencyMs: 40,
  // Paid on top of the touch by a taker, before size is considered.
  slippageBps: 1,
  // Extra bps by clip size, interpolated between the points and flat past the last.
  sizeCurve: Object.freeze([
    Object.freeze({ size: 1, bps: 0 }),
    Object.freeze({ size: 10, bps: 2 }),
    Object.freeze({ size: 100, bps: 8 }),
  ]),
  venue: 'okx',
  instrument: '',
  // What the sim sends. Market is the bot's own default; limit exists so a passive idea
  // can be scored against the honest "did the tape actually come to you" test.
  orderType: 'market',
  limitOffsetBps: 1,
  size: 1,
})

/**
 * Merge a partial config onto the defaults.
 *
 * @param {object} [overrides] - the trader's assumptions.
 * @returns {object} the resolved config.
 */
export function resolveFillConfig(overrides = {}) {
  const num = (value, fallback) => {
    const parsed = Number(value)
    // Negative latency or a negative spread would model a venue that pays you to trade.
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
  }

  const curve = Array.isArray(overrides?.sizeCurve) ? overrides.sizeCurve : DEFAULT_FILL_CONFIG.sizeCurve

  return {
    spreadBps: num(overrides?.spreadBps, DEFAULT_FILL_CONFIG.spreadBps),
    latencyMs: num(overrides?.latencyMs, DEFAULT_FILL_CONFIG.latencyMs),
    slippageBps: num(overrides?.slippageBps, DEFAULT_FILL_CONFIG.slippageBps),
    // Sorted, because the interpolation below walks the points in order and an unsorted
    // curve read from a saved config would interpolate between the wrong pair.
    sizeCurve: [...curve]
      .map((point) => ({ size: Number(point?.size) || 0, bps: Number(point?.bps) || 0 }))
      .sort((a, b) => a.size - b.size),
    venue: String(overrides?.venue ?? DEFAULT_FILL_CONFIG.venue),
    instrument: String(overrides?.instrument ?? DEFAULT_FILL_CONFIG.instrument),
    orderType: overrides?.orderType === 'limit' ? 'limit' : 'market',
    limitOffsetBps: num(overrides?.limitOffsetBps, DEFAULT_FILL_CONFIG.limitOffsetBps),
    size: Number(overrides?.size) > 0 ? Number(overrides.size) : DEFAULT_FILL_CONFIG.size,
  }
}

/**
 * Turn one strategy signal into the order the sim would have sent.
 *
 * @param {{side?: string, price?: number, ts?: number}} signal - a collected signal.
 * @param {object} [config] - the fill assumptions.
 * @returns {object|null} the order, or null when the signal is not tradeable.
 */
export function orderFromSignal(signal, config = DEFAULT_FILL_CONFIG) {
  const side = signal?.side === 'sell' ? 'sell' : signal?.side === 'buy' ? 'buy' : ''
  // 'flat' closes a position rather than opening one, and is handled by the caller that
  // knows what is open. Anything else is silence.
  if (!side) return null

  const type = config?.orderType === 'limit' ? 'limit' : 'market'
  const reference = Number(signal?.price) || 0
  const offset = reference * (Math.max(0, Number(config?.limitOffsetBps) || 0) / 10000)

  return {
    side,
    type,
    size: Number(config?.size) > 0 ? Number(config.size) : 1,
    // A passive order posts *behind* the touch — a buy below the print, a sell above it.
    // Posting through it would be a market order wearing a limit's name.
    price: type === 'limit' ? Number((side === 'buy' ? reference - offset : reference + offset).toFixed(8)) : 0,
    ts: Number(signal?.ts) || 0,
    reason: String(signal?.reason ?? ''),
  }
}

/**
 * What a clip of this size costs in extra bps.
 *
 * @param {number} size - the order size.
 * @param {{size: number, bps: number}[]} [curve] - the piecewise curve, size ascending.
 * @returns {number} extra basis points.
 */
export function slippageForSize(size, curve = DEFAULT_FILL_CONFIG.sizeCurve) {
  const points = (Array.isArray(curve) ? curve : []).filter((p) => Number.isFinite(Number(p?.size)))
  const clip = Math.abs(Number(size) || 0)
  if (points.length === 0) return 0

  // Below the first point costs the first point's bps rather than nothing: the curve
  // describes a book, and there is no size so small that it trades outside one.
  if (clip <= points[0].size) return Number(points[0].bps) || 0

  for (let i = 1; i < points.length; i += 1) {
    const lo = points[i - 1]
    const hi = points[i]
    if (clip > hi.size) continue

    const span = hi.size - lo.size
    // Linear between the points. A step function would make a size one unit over a
    // breakpoint cost dramatically more than one unit under it, which no book does.
    const ratio = span > 0 ? (clip - lo.size) / span : 1
    return Number((Number(lo.bps) + (Number(hi.bps) - Number(lo.bps)) * ratio).toFixed(4))
  }

  // Past the last point the curve flattens rather than extrapolating: nobody knows what a
  // clip ten times the deepest measured size does, and a straight line would guess.
  return Number(points.at(-1).bps) || 0
}

/**
 * The two-sided quote a tick implies.
 *
 * @param {object} tick - a recorded tick.
 * @param {number} spreadBps - the synthetic spread when the tick has no book.
 * @returns {{bid: number, ask: number, mid: number}|null} the quote, or null.
 */
export function quoteFromTick(tick, spreadBps = DEFAULT_FILL_CONFIG.spreadBps) {
  const bid = Number(tick?.bid)
  const ask = Number(tick?.ask)
  // A real book beats a synthetic one every time: when the recording caught the quote,
  // that is the spread that existed, not an assumption about it.
  if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > bid) {
    return { bid, ask, mid: (bid + ask) / 2 }
  }

  const px = Number(tick?.px)
  if (!Number.isFinite(px) || px <= 0) return null

  const half = (px * (Math.max(0, Number(spreadBps) || 0) / 10000)) / 2
  return { bid: px - half, ask: px + half, mid: px }
}

/**
 * Stamp an order with when it will actually reach the venue.
 *
 * @param {object} order - the order intent, carrying `ts`.
 * @param {object} [config] - the fill assumptions.
 * @returns {object} the order with `sentAt` and `arrivesAt`.
 */
export function applyLatency(order, config = DEFAULT_FILL_CONFIG) {
  const sentAt = Number(order?.ts) || 0
  const latency = Math.max(0, Number(config?.latencyMs) || 0)

  return {
    ...order,
    sentAt,
    // The order fills against the tick current at *arrival*, not the one that triggered
    // it. That gap is where a signal's edge goes, and a sim without it is a time machine.
    arrivesAt: sentAt + latency,
  }
}

/**
 * Fill a market order against the book at arrival.
 *
 * @param {{side?: string, size?: number}} order - the order.
 * @param {object} tick - the tick current at arrival.
 * @param {object} [config] - the fill assumptions.
 * @returns {object} the fill, or `{filled: false}` when there is no price to fill at.
 */
export function simMarketFill(order, tick, config = DEFAULT_FILL_CONFIG) {
  const quote = quoteFromTick(tick, config?.spreadBps)
  const size = Math.abs(Number(order?.size) || 0)
  if (!quote || size <= 0) return { filled: false, reason: 'no price' }

  const buying = order?.side !== 'sell'
  // The opposing side of the book: a market buy pays the offer. Filling at the mid — or
  // worse, at the last print — is the single most flattering lie a backtest can tell.
  const touch = buying ? quote.ask : quote.bid
  const bps = (Number(config?.slippageBps) || 0) + slippageForSize(size, config?.sizeCurve)
  // Always adverse. Slippage that could go either way would average out to nothing over a
  // long run, which is exactly the wrong model of a cost.
  const price = buying ? touch * (1 + bps / 10000) : touch * (1 - bps / 10000)

  return {
    filled: true,
    side: buying ? 'buy' : 'sell',
    size,
    price: Number(price.toFixed(8)),
    ts: Number(tick?.ts) || 0,
    liquidity: 'taker',
    slippageBps: Number(bps.toFixed(4)),
  }
}

/**
 * Fill a limit order only if the tape actually traded through it.
 *
 * @param {{side?: string, size?: number, price?: number}} order - the order.
 * @param {object} tick - a print.
 * @param {object} [config] - the fill assumptions.
 * @returns {object} the fill, or `{filled: false}` when the price never came.
 */
export function simLimitFill(order, tick, config = DEFAULT_FILL_CONFIG) {
  const limit = Number(order?.price)
  const size = Math.abs(Number(order?.size) || 0)
  const px = Number(tick?.px)
  if (!Number.isFinite(limit) || limit <= 0 || size <= 0) return { filled: false, reason: 'no limit' }
  if (!Number.isFinite(px) || px <= 0) return { filled: false, reason: 'no print' }

  const buying = order?.side !== 'sell'
  // Crossed, not merely touched. A print *at* the limit says the price traded there, not
  // that this particular order was at the front of the queue when it did — and assuming
  // queue priority is how a passive strategy backtests into a fortune it cannot collect.
  const crossed = buying ? px < limit : px > limit
  if (!crossed) return { filled: false, reason: 'not crossed' }

  return {
    filled: true,
    side: buying ? 'buy' : 'sell',
    size,
    // At the limit, never better. A passive order gets the price it asked for; giving it
    // the improvement would credit it with the aggressor's edge.
    price: Number(limit.toFixed(8)),
    ts: Number(tick?.ts) || 0,
    liquidity: 'maker',
    slippageBps: 0,
    // Carried so the fee model does not have to guess which side of the book this was.
    venue: String(config?.venue ?? 'okx'),
  }
}

/**
 * What the venue would charge for a fill.
 *
 * @param {{price?: number, size?: number, liquidity?: string}} fill - the fill.
 * @param {object} [config] - the fill assumptions, naming venue and instrument.
 * @returns {{amount: number, bps: number}} the fee, always positive.
 */
export function simFees(fill, config = DEFAULT_FILL_CONFIG) {
  const notional = Math.abs(Number(fill?.price) || 0) * Math.abs(Number(fill?.size) || 0)
  if (notional <= 0) return { amount: 0, bps: 0 }

  const card = FEE_SCHEDULE[String(config?.venue ?? '').toLowerCase()] ?? FEE_SCHEDULE.okx
  // A perpetual is a third of the cost of spot on OKX. One rate for both would misprice
  // every scalp by enough to matter at this trade count.
  const rates = /-(SWAP|PERP)$/i.test(String(config?.instrument ?? '')) ? card.swap : card.spot
  const bps = fill?.liquidity === 'maker' ? rates.maker : rates.taker

  return { amount: Number(((notional * bps) / 10000).toFixed(8)), bps }
}
