import { defineStrategy } from '../contract.js'

/**
 * Session-open drive.
 *
 * The minutes after a session opens are the only part of the day where a scalper is
 * reliably paid for being fast. Volume arrives, the overnight range gets tested, and the
 * first genuine break of the opening box tends to run — because everyone who was waiting
 * for the open is doing the same arithmetic at the same moment.
 *
 * Crypto has no open, which is the point of making the sessions configurable: the OKX book
 * still moves on the London and New York equity opens because the people trading it are
 * awake then.
 *
 * The discipline is built in rather than left to the trader. **One entry per session open**
 * — the second attempt at a failed drive is the trade that turns a small loss into the
 * day, and it is precisely the one a trader takes when they are annoyed. And the exit is a
 * **trailing** stop rather than a target, because the whole premise is that the move runs
 * further than a target would have caught.
 */

/** Session opens, in UTC minutes from midnight. */
export const SESSIONS = Object.freeze([
  Object.freeze({ id: 'london', openMin: 7 * 60 }),
  Object.freeze({ id: 'newyork', openMin: 13 * 60 + 30 }),
  Object.freeze({ id: 'asia', openMin: 0 }),
])

/**
 * Which session is opening, and how long until the next one.
 *
 * @param {number} nowUtc - epoch milliseconds.
 * @param {number} windowMs - how long after the bell counts as "the open".
 * @param {object[]} [sessions] - the session definitions.
 * @returns {{active: string, sinceOpenMs: number, secondsToOpen: number, next: string}} the clock.
 */
export function sessionClock(nowUtc, windowMs, sessions = SESSIONS) {
  const at = Number(nowUtc)
  const window = Math.max(1000, Number(windowMs) || 900000)
  const rows = Array.isArray(sessions) ? sessions : []
  if (!Number.isFinite(at)) return { active: '', sinceOpenMs: -1, secondsToOpen: -1, next: '' }

  const dayMs = 86400000
  const intoDay = ((at % dayMs) + dayMs) % dayMs

  let active = ''
  let sinceOpenMs = -1
  let soonest = Infinity
  let next = ''

  for (const session of rows) {
    const openMs = (Number(session?.openMin) || 0) * 60000
    const since = intoDay - openMs
    if (since >= 0 && since < window) {
      active = String(session?.id ?? '')
      sinceOpenMs = since
    }

    // Wrapped into tomorrow when the bell has already gone, so the countdown never reads
    // negative — a "-4h to open" label is worse than useless.
    const until = since >= 0 ? dayMs - since : -since
    if (until < soonest) {
      soonest = until
      next = String(session?.id ?? '')
    }
  }

  return { active, sinceOpenMs, secondsToOpen: Math.round(soonest / 1000), next }
}

/**
 * The opening box.
 *
 * @param {{high?: number, low?: number, closed?: boolean}} range - the range so far.
 * @param {number} px - the print.
 * @param {number} sinceOpenMs - time since the bell.
 * @param {number} rangeMs - how long the box is built for.
 * @returns {{high: number, low: number, closed: boolean}} the range.
 */
export function openingRange(range, px, sinceOpenMs, rangeMs) {
  const price = Number(px)
  const since = Number(sinceOpenMs)
  const span = Math.max(1000, Number(rangeMs) || 300000)

  const high = Number(range?.high)
  const low = Number(range?.low)
  const built = { high: Number.isFinite(high) ? high : -Infinity, low: Number.isFinite(low) ? low : Infinity }
  if (!Number.isFinite(price) || !Number.isFinite(since) || since < 0) {
    return { high: built.high, low: built.low, closed: range?.closed === true }
  }

  // The box stops growing when the build window ends. A range that kept extending would
  // never break, which is a strategy that never trades.
  if (since >= span) {
    return { high: built.high, low: built.low, closed: Number.isFinite(built.high) }
  }

  return { high: Math.max(built.high, price), low: Math.min(built.low, price), closed: false }
}

/**
 * The breakout call.
 *
 * @param {number} px - the print.
 * @param {{high?: number, low?: number, closed?: boolean}} range - the opening box.
 * @param {number} bufferTicks - how far past the edge counts.
 * @param {number} tickSize - the instrument's tick.
 * @param {boolean} windowActive - whether the trading window is still open.
 * @returns {{action: string, strength: number, reason: string}|null} the signal, or null.
 */
export function driveSignal(px, range, bufferTicks, tickSize, windowActive) {
  const price = Number(px)
  const high = Number(range?.high)
  const low = Number(range?.low)
  // An unclosed box is a range still being built; breaking it means nothing yet.
  if (windowActive !== true || range?.closed !== true) return null
  if (!Number.isFinite(price) || !Number.isFinite(high) || !Number.isFinite(low)) return null

  const tick = Number(tickSize) > 0 ? Number(tickSize) : 0.01
  const buffer = Math.max(0, Number(bufferTicks) || 0) * tick
  const height = high - low

  if (price > high + buffer) {
    return {
      action: 'buy',
      // A tight box that breaks is a cleaner signal than a wide one: less room for the
      // move to be noise inside the range everyone already saw.
      strength: Math.min(1, 0.6 + (height > 0 ? Math.min(0.4, (buffer + 0.0001) / height) : 0)),
      reason: `open drive above ${high}`,
    }
  }

  if (price < low - buffer) {
    return {
      action: 'sell',
      strength: Math.min(1, 0.6 + (height > 0 ? Math.min(0.4, (buffer + 0.0001) / height) : 0)),
      reason: `open drive below ${low}`,
    }
  }

  return null
}

/**
 * One entry per open, enforced.
 *
 * @param {object} state - the run's scratchpad.
 * @param {string} sessionId - the session opening now.
 * @param {number} maxEntries - the cap.
 * @returns {boolean} true when another entry is allowed.
 */
export function oneShotGuard(state, sessionId, maxEntries) {
  const id = String(sessionId ?? '')
  const cap = Math.max(1, Math.floor(Number(maxEntries) || 1))
  if (!state || !id) return false

  if (state.guardSession !== id) {
    state.guardSession = id
    state.entries = 0
  }

  // The second attempt at a failed drive is the trade that turns a small loss into the day,
  // and it is exactly the one a trader takes when they are annoyed.
  return (Number(state.entries) || 0) < cap
}

/**
 * A ratcheting stop.
 *
 * @param {{side?: string, stop?: number}} position - the open trade.
 * @param {number} px - the current price.
 * @param {number} trailTicks - how far behind the stop rides.
 * @param {number} tickSize - the instrument's tick.
 * @returns {{stop: number, hit: boolean}} the stop and whether it was hit.
 */
export function trailStop(position, px, trailTicks, tickSize) {
  const price = Number(px)
  const current = Number(position?.stop)
  const tick = Number(tickSize) > 0 ? Number(tickSize) : 0.01
  const trail = Math.max(1, Number(trailTicks) || 1) * tick
  if (!position?.side || !Number.isFinite(price)) return { stop: current || 0, hit: false }

  if (position.side === 'buy') {
    // Ratcheting: the stop only ever moves up on a long. A stop that could fall would give
    // back the whole point of trailing.
    const next = Number.isFinite(current) ? Math.max(current, price - trail) : price - trail
    return { stop: Number(next.toFixed(10)), hit: price <= current }
  }

  const next = Number.isFinite(current) ? Math.min(current, price + trail) : price + trail
  return { stop: Number(next.toFixed(10)), hit: Number.isFinite(current) && price >= current }
}

/**
 * One print.
 *
 * @param {object} ctx - the strategy context.
 * @param {object} tick - the print.
 * @returns {object|null} the signal, or null.
 */
export function driveTick(ctx, tick) {
  const state = ctx?.state
  const px = Number(tick?.px)
  if (!state || !Number.isFinite(px)) return null

  const now = Number(tick?.ts) || Number(ctx.now) || 0
  const clock = sessionClock(now, ctx.params?.windowMs)
  state.countdown = clock.secondsToOpen
  state.session = clock.active || clock.next

  if (state.entry) {
    const trail = trailStop(state.entry, px, ctx.params?.trailTicks, ctx.params?.tickSize)
    state.entry.stop = trail.stop
    if (!trail.hit) return null

    state.entry = null
    return { action: 'flat', strength: 1, reason: 'trailing stop' }
  }

  if (!clock.active) {
    // Between sessions the box is discarded rather than carried: yesterday's opening range
    // is not a level, it is a memory.
    state.range = null
    return null
  }

  state.range = openingRange(state.range, px, clock.sinceOpenMs, ctx.params?.rangeMs)
  if (!oneShotGuard(state, clock.active, ctx.params?.maxEntries)) return null

  const signal = driveSignal(px, state.range, ctx.params?.bufferTicks, ctx.params?.tickSize, true)
  if (!signal) return null

  state.entries = (Number(state.entries) || 0) + 1
  state.entry = { side: signal.action, stop: signal.action === 'buy' ? -Infinity : Infinity }
  // Seeded from this print so the first trail call has something to ratchet from.
  state.entry.stop = trailStop(state.entry, px, ctx.params?.trailTicks, ctx.params?.tickSize).stop

  return signal
}

/**
 * The strategy.
 */
export const openDriveStrategy = defineStrategy({
  id: 'open-drive',
  name: 'Session-open drive',
  params: {
    rangeMs: { kind: 'number', label: 'opening range (ms)', default: 300000, min: 30000, max: 3600000, step: 30000 },
    windowMs: { kind: 'number', label: 'trade window (ms)', default: 900000, min: 60000, max: 7200000, step: 60000 },
    bufferTicks: { kind: 'number', label: 'break buffer (ticks)', default: 2, min: 0, max: 50, step: 1 },
    trailTicks: { kind: 'number', label: 'trail (ticks)', default: 10, min: 1, max: 200, step: 1 },
    maxEntries: { kind: 'number', label: 'entries per open', default: 1, min: 1, max: 5, step: 1 },
    tickSize: { kind: 'number', label: 'tick size', default: 0.01, min: 0.00000001, max: 100, step: 0.01 },
  },
  init: (ctx) => {
    ctx.state.range = null
    ctx.state.entry = null
    ctx.state.entries = 0
    ctx.state.guardSession = ''
    ctx.state.countdown = -1
    return ctx.state
  },
  onTick: driveTick,
  onCandle: () => null,
})
