/**
 * Semantic status → colour.
 *
 * One place decides what a number's colour *means*, so every block agrees. The mapping
 * is deliberately blunt: positive is green, negative is orange, flat is neutral — the
 * same in both themes. A trader glancing at four blocks must not have to remember which
 * one uses a different convention.
 *
 * These return class names rather than colours: components never hold raw values, and
 * the theme owns the actual hue.
 */

/** Semantic states a value can be in. */
export const STATUS = Object.freeze({
  profit: 'profit',
  loss: 'loss',
  flat: 'flat',
  warn: 'warn',
  danger: 'danger',
})

/**
 * Which state a signed number is in.
 *
 * Zero is explicitly `flat`, not `profit`: colouring a flat position green would tell a
 * trader they are making money when they are not.
 *
 * @param {number} value - a PnL, delta or percentage.
 * @returns {string} a STATUS member.
 */
export function statusOfValue(value) {
  if (!Number.isFinite(value) || value === 0) return STATUS.flat
  return value > 0 ? STATUS.profit : STATUS.loss
}

/**
 * The class name for a semantic state.
 *
 * @param {string} status - a STATUS member.
 * @returns {string} e.g. 'is-profit'; 'is-flat' for anything unrecognised.
 */
export function statusClass(status) {
  const known = Object.values(STATUS).includes(status)
  return `is-${known ? status : STATUS.flat}`
}

/**
 * The class for a signed number, in one step — what bindings call.
 *
 * @param {number} value - a PnL, delta or percentage.
 * @returns {string} e.g. 'is-profit'.
 */
export function valueClass(value) {
  return statusClass(statusOfValue(value))
}

/**
 * The class for an order side.
 *
 * Buy is green and sell is orange, matching profit/loss, so side and outcome share one
 * colour language instead of competing.
 *
 * @param {string} side - 'buy' or 'sell' (case-insensitive).
 * @returns {string} 'is-buy', 'is-sell', or 'is-flat' when unknown.
 */
export function sideClass(side) {
  const normalized = String(side ?? '').toLowerCase()

  if (normalized === 'buy' || normalized === 'long') return 'is-buy'
  if (normalized === 'sell' || normalized === 'short') return 'is-sell'
  return 'is-flat'
}

/**
 * The class for a connection state — what the venue LEDs bind to.
 *
 * @param {string} state - 'live', 'connecting', 'stale' or 'dead'.
 * @returns {string} the LED modifier class.
 */
export function connectionClass(state) {
  const normalized = String(state ?? '').toLowerCase()

  if (normalized === 'live' || normalized === 'connected') return 'led led--live'
  if (normalized === 'connecting' || normalized === 'stale') return 'led led--warn'
  if (normalized === 'dead' || normalized === 'error') return 'led led--dead'
  return 'led'
}

/**
 * Which tick-pulse animation a price change deserves.
 *
 * @param {number} current - the new price.
 * @param {number} previous - the price before it.
 * @returns {string} 'tick-up', 'tick-down', or '' when it did not move.
 */
export function tickPulseClass(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return ''
  if (current > previous) return 'tick-up'
  if (current < previous) return 'tick-down'
  return ''
}
