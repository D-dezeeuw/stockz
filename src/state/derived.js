import { computed } from '../app/engine.js'
import { PATHS } from './paths.js'
import { bpsDiff, roundToTick } from '../utils/math.js'
import { formatPrice, formatSigned } from '../utils/format.js'
import { ladderView } from '../book/ladder.js'

/**
 * Derived state — values the desk shows but never writes by hand.
 *
 * Each is registered with Spektrum's `computed`, so it recalculates exactly when one of
 * its dependencies moves. That matters on a scalping desk: a stale spread or exposure
 * number is worse than no number, and manual recalculation is the classic way one screen
 * ends up disagreeing with another.
 *
 * The pure functions below hold the arithmetic and carry the unit tests; the `computed`
 * registrations are the thin wiring on top.
 */

/**
 * Distance between ask and bid, in price terms.
 *
 * @param {number} bid - best bid.
 * @param {number} ask - best ask.
 * @returns {number} ask - bid, or 0 when either side is missing or crossed.
 */
export function spreadOf(bid, ask) {
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) return 0
  const spread = ask - bid
  return spread > 0 ? spread : 0
}

/**
 * Mid price — the reference every PnL mark and deviation band is measured against.
 *
 * @param {number} bid - best bid.
 * @param {number} ask - best ask.
 * @returns {number} the midpoint, falling back to whichever side exists.
 */
export function midOf(bid, ask) {
  const hasBid = Number.isFinite(bid) && bid > 0
  const hasAsk = Number.isFinite(ask) && ask > 0

  if (hasBid && hasAsk) return (bid + ask) / 2
  if (hasBid) return bid
  if (hasAsk) return ask
  return 0
}

/**
 * Net exposure across open positions, signed by side.
 *
 * Notional, not quantity: two positions of one lot each in a $60k and a $3k instrument
 * are not the same risk, and the trader needs the number that can hurt them.
 *
 * @param {Array<{side?: string, sz?: number, avgPx?: number}>} positions - open positions.
 * @returns {number} signed notional; longs positive, shorts negative.
 */
export function exposureOf(positions) {
  if (!Array.isArray(positions)) return 0

  let total = 0
  for (const p of positions) {
    const size = Number(p?.sz)
    const price = Number(p?.avgPx)
    if (!Number.isFinite(size) || !Number.isFinite(price)) continue

    const notional = Math.abs(size) * Math.abs(price)
    total += p?.side === 'short' ? -notional : notional
  }
  return roundToTick(total, 0.01)
}

/**
 * How many orders are still working at the venue.
 *
 * @param {Array<{state?: string}>} orders - known orders.
 * @returns {number} count of orders that are pending or live.
 */
export function openOrderCount(orders) {
  if (!Array.isArray(orders)) return 0
  return orders.filter((o) => o?.state === 'pending' || o?.state === 'live').length
}

/**
 * The header status line: one glance answers "am I armed, where is the market, what am I
 * carrying, what is it doing to me".
 *
 * @param {{status?: string, armed?: boolean, mode?: string, mid?: number, spread?: number,
 *   exposure?: number, dayPnl?: number}} facts - current desk facts.
 * @returns {string} e.g. 'ARMED · PAPER · 27384.50 (0.50) · exp 1200.00 · +42.10'.
 */
export function statusLineOf(facts = {}) {
  const armed = facts.armed ? 'ARMED' : 'SAFE'
  const mode = String(facts.mode ?? 'paper').toUpperCase()
  const market = `${formatPrice(facts.mid ?? 0)} (${formatPrice(facts.spread ?? 0)})`

  return [
    armed,
    mode,
    market,
    `exp ${formatPrice(facts.exposure ?? 0)}`,
    formatSigned(facts.dayPnl ?? 0),
    String(facts.status ?? 'ready'),
  ].join(' · ')
}

/**
 * Register every derived value with the engine.
 *
 * Called once during bootstrap. Registration is deliberately separate from the maths so
 * the arithmetic stays unit-testable without an engine.
 *
 * @returns {string[]} the paths now maintained by the engine.
 */
export function registerDerived() {
  computed(PATHS.market.spread, [PATHS.market.bid, PATHS.market.ask], (state) =>
    spreadOf(state.market?.bid, state.market?.ask),
  )

  computed(PATHS.market.mid, [PATHS.market.bid, PATHS.market.ask], (state) =>
    midOf(state.market?.bid, state.market?.ask),
  )

  computed(PATHS.market.spreadBps, [PATHS.market.bid, PATHS.market.ask], (state) =>
    bpsDiff(state.market?.ask ?? 0, state.market?.bid ?? 0),
  )

  // One computed for the whole ladder, not three: bids, asks and the spread row must
  // always come from the same book snapshot, or the ladder shows a spread that never was.
  computed(
    PATHS.market.ladder,
    [PATHS.market.book, PATHS.market.focus, PATHS.settings.priceGroups],
    (state) =>
      ladderView(state.market?.book, {
        group: Number(state.settings?.priceGroups?.[state.market?.focus ?? '']) || 0,
      }),
  )

  computed(PATHS.trade.exposure, [PATHS.trade.positions], (state) =>
    exposureOf(state.trade?.positions),
  )

  computed(PATHS.trade.openOrders, [PATHS.trade.orders], (state) =>
    openOrderCount(state.trade?.orders),
  )

  computed(
    PATHS.ui.statusLine,
    [
      PATHS.ui.status,
      PATHS.trade.armed,
      PATHS.trade.mode,
      PATHS.market.mid,
      PATHS.market.spread,
      PATHS.trade.exposure,
      PATHS.trade.dayPnl,
    ],
    (state) =>
      statusLineOf({
        status: state.ui?.status,
        armed: state.trade?.armed,
        mode: state.trade?.mode,
        mid: state.market?.mid,
        spread: state.market?.spread,
        exposure: state.trade?.exposure,
        dayPnl: state.trade?.dayPnl,
      }),
  )

  return [
    PATHS.market.spread,
    PATHS.market.mid,
    PATHS.market.spreadBps,
    PATHS.market.ladder,
    PATHS.trade.exposure,
    PATHS.trade.openOrders,
    PATHS.ui.statusLine,
  ]
}
