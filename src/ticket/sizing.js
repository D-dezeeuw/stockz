import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { decimalsOf } from '../charts/scale.js'

/**
 * Sizing.
 *
 * Size is the one ticket field a scalper changes on almost every trade and the one they
 * are most likely to fat-finger, so it gets three routes in: percentage chips off buying
 * power, absolute steps, and typing. All three land on the same clamp-and-round path,
 * because a size the venue rejects costs a whole round trip — and on a scalp the fill
 * that mattered is gone by the time the rejection comes back.
 */

/** Percentage presets, as fractions of buying power. */
export const QTY_PRESETS = Object.freeze([0.25, 0.5, 0.75, 1])

/**
 * Quantity from a percentage of buying power.
 *
 * @param {number} percent - fraction of buying power, 0–1.
 * @param {number} buyingPower - available quote-currency balance.
 * @param {number} price - the price the order would go out at.
 * @returns {number} the quantity in base units.
 */
export function applyPreset(percent, buyingPower, price) {
  const fraction = Number(percent)
  const power = Number(buyingPower)
  const px = Number(price)
  if (![fraction, power, px].every(Number.isFinite) || fraction <= 0 || power <= 0 || px <= 0) {
    return 0
  }

  // Quote currency into base: a "50%" chip means half the account's buying power *at
  // this price*, which is the only reading that survives the price moving.
  return Number(((power * Math.min(1, fraction)) / px).toFixed(8))
}

/**
 * Hold a quantity inside the desk's limits.
 *
 * @param {number} qty - the requested size.
 * @param {{min?: number, max?: number}} [limits] - instrument and risk limits.
 * @returns {number} the clamped size.
 */
export function clampQty(qty, limits = {}) {
  const value = Number(qty)
  if (!Number.isFinite(value) || value <= 0) return 0

  const min = Number(limits.min)
  const max = Number(limits.max)

  // Below the venue minimum is not a small order, it is a rejected one — clamping up
  // would silently trade more than asked, so it clamps to zero and the ticket says so.
  if (Number.isFinite(min) && min > 0 && value < min) return 0
  if (Number.isFinite(max) && max > 0 && value > max) return max

  return value
}

/**
 * Snap a quantity to the venue's lot size.
 *
 * @param {number} qty - the requested size.
 * @param {number} lotSize - the instrument's size increment.
 * @returns {number} a size the venue will accept.
 */
export function roundToLot(qty, lotSize) {
  const value = Number(qty)
  const lot = Number(lotSize)
  if (!Number.isFinite(value) || value <= 0) return 0
  if (!Number.isFinite(lot) || lot <= 0) return value

  // Down, never up: rounding a size up can exceed a risk limit that was just checked,
  // and the trader asked for "at most this".
  const lots = Math.floor(value / lot)
  return Number((lots * lot).toFixed(Math.min(10, decimalsOf(lot) + 2)))
}

/**
 * The full sizing path: preset or explicit, clamped, then lot-rounded.
 *
 * @param {{percent?: number, qty?: number}} request - what was asked for.
 * @param {{buyingPower?: number, price?: number, min?: number, max?: number,
 *   lotSize?: number}} context - the desk's limits.
 * @returns {number} the size to put on the ticket.
 */
export function resolveQty(request, context = {}) {
  const raw = Number.isFinite(Number(request?.qty))
    ? Number(request.qty)
    : applyPreset(request?.percent, context.buyingPower, context.price)

  return roundToLot(clampQty(raw, context), context.lotSize)
}

/**
 * Register the sizing actions.
 *
 * @returns {string[]} the registered action names.
 */
export function registerSizingActions() {
  registerAction(ACTIONS.ticket.applyPreset, (_state, payload) => {
    const size = resolveQty(
      { percent: payload?.percent ?? payload },
      {
        buyingPower: appState.trade?.buyingPower,
        price: appState.trade?.ticketPrice,
        max: appState.settings?.maxPosition,
        lotSize: payload?.lotSize,
      },
    )
    if (size <= 0) return false

    setValue(PATHS.trade.ticketSize, size)
    return true
  })

  registerAction(ACTIONS.ticket.stepQty, (_state, payload) => {
    const step = Number(payload?.step ?? appState.settings?.defaultSize) || 0
    const direction = Number(payload?.direction ?? 1)
    const next = resolveQty(
      { qty: (Number(appState.trade?.ticketSize) || 0) + step * direction },
      { max: appState.settings?.maxPosition, lotSize: payload?.lotSize },
    )

    setValue(PATHS.trade.ticketSize, next)
    return true
  })

  return [ACTIONS.ticket.applyPreset, ACTIONS.ticket.stepQty]
}
