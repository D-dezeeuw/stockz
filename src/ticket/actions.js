import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { MODES, SIDES, buildTicketState, resolvePrice, canSubmit } from './state.js'

/**
 * The ticket's controls.
 *
 * Size, side and mode — the three things a scalper changes between one trade and the
 * next, and the three that have to be one keystroke each. None of these submits
 * anything; `arm` is the only gate, and it is deliberately a toggle rather than a
 * per-order confirmation. One decision at the start of a session beats a dialog per
 * trade when the whole product is trades per hour.
 */

/** Size presets, as multiples of the desk's default clip. */
export const SIZE_STEPS = Object.freeze([0.25, 0.5, 1, 2, 5])

/**
 * Adjust a size by a preset multiple, floored at zero.
 *
 * @param {number} base - the desk's default clip.
 * @param {number} multiple - the preset.
 * @returns {number} the new size.
 */
export function sizeForPreset(base, multiple) {
  const clip = Number(base)
  const factor = Number(multiple)
  if (!Number.isFinite(clip) || clip <= 0 || !Number.isFinite(factor) || factor <= 0) return 0

  // Rounded to eight places: float multiples of 0.001 otherwise reach the venue as
  // 0.30000000000000004 and get rejected for precision.
  return Number((clip * factor).toFixed(8))
}

/**
 * Nudge a limit price by whole ticks.
 *
 * @param {number} price - the current limit.
 * @param {number} ticks - how many ticks to move, signed.
 * @param {number} tickSize - the instrument's increment.
 * @returns {number} the new limit, never negative.
 */
export function nudgePrice(price, ticks, tickSize) {
  const current = Number(price) || 0
  const step = Number(tickSize)
  const count = Number(ticks)
  if (!Number.isFinite(step) || step <= 0 || !Number.isFinite(count)) return current

  return Math.max(0, Number((current + step * count).toFixed(10)))
}

/**
 * Register every ticket action.
 *
 * @returns {string[]} the registered action names.
 */
export function registerTicketActions() {
  registerAction(ACTIONS.ticket.setSide, (_state, payload) => {
    const side = String(payload?.side ?? payload ?? '').toLowerCase()
    if (!SIDES.includes(side)) return false

    setValue(PATHS.trade.ticketSide, side)
    return true
  })

  registerAction(ACTIONS.ticket.setMode, (_state, payload) => {
    const mode = String(payload?.mode ?? payload ?? '').toLowerCase()
    if (!MODES.includes(mode)) return false

    setValue(PATHS.trade.ticketMode, mode)
    return true
  })

  registerAction(ACTIONS.ticket.setSize, (_state, payload) => {
    const explicit = Number(payload?.size)
    const size = Number.isFinite(explicit)
      ? explicit
      : sizeForPreset(appState.settings?.defaultSize, payload?.preset ?? payload)
    if (!Number.isFinite(size) || size < 0) return false

    setValue(PATHS.trade.ticketSize, size)
    return true
  })

  registerAction(ACTIONS.ticket.nudge, (_state, payload) => {
    const next = nudgePrice(
      appState.trade?.ticketLimit || appState.trade?.ticketPrice,
      payload?.ticks ?? payload,
      payload?.tickSize ?? appState.settings?.priceStep,
    )

    setValue(PATHS.trade.ticketLimit, next)
    // Nudging a price *is* choosing a limit — leaving the mode on market would show a
    // number the order would not use.
    setValue(PATHS.trade.ticketMode, 'limit')
    return true
  })

  registerAction(ACTIONS.ticket.reset, () => {
    for (const [path, value] of Object.entries(
      buildTicketState({ symbol: appState.market?.focus, size: appState.settings?.defaultSize }),
    )) {
      setValue(path, value)
    }
    return true
  })

  registerAction(ACTIONS.ticket.arm, (_state, payload) => {
    // One toggle for the session, not a dialog per order. The arm state is the entire
    // safety story on the fast path, and it is deliberately visible rather than modal.
    const armed = payload?.armed ?? !appState.trade?.armed
    setValue(PATHS.trade.armed, Boolean(armed))
    return Boolean(armed)
  })

  return Object.values(ACTIONS.ticket)
}

/**
 * The ticket as the submit path will see it.
 *
 * @param {{now?: number}} [context] - the clock, for quote staleness.
 * @returns {{ticket: object, resolved: object, verdict: object}} the full picture.
 */
export function readTicket(context = {}) {
  const ticket = {
    symbol: String(appState.trade?.ticketSymbol || appState.market?.focus || ''),
    side: appState.trade?.ticketSide ?? 'buy',
    size: Number(appState.trade?.ticketSize) || 0,
    mode: appState.trade?.ticketMode ?? 'market',
    limit: Number(appState.trade?.ticketLimit) || 0,
  }

  const resolved = resolvePrice(
    ticket,
    { bid: appState.market?.bid, ask: appState.market?.ask, ts: appState.market?.quoteTs },
    context,
  )

  return {
    ticket,
    resolved,
    verdict: canSubmit(ticket, resolved, {
      bookStatus: appState.market?.bookStatus,
      armed: appState.trade?.armed,
    }),
  }
}
