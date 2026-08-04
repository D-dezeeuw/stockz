import { appState } from '../app/engine.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { openPositions, positionKey } from './store.js'
import { submit as execSubmit } from '../exec/engine.js'
import { capabilityFor } from '../exec/capabilities.js'
import { pushToast } from '../ui/toast.js'

/**
 * Flatten.
 *
 * The button a trader presses when they have stopped analysing and want out. Everything
 * about it is shaped by that: it is reduce-only so it can never overshoot into a new
 * position, it is a market order because a limit that does not fill is not an exit, and
 * it is never gated on the arm toggle — arming controls *entering* risk.
 */

/**
 * The order that closes a position.
 *
 * @param {object} position - the open position.
 * @returns {object|null} an order request, or null when there is nothing to close.
 */
export function closeIntent(position) {
  const qty = Number(position?.qty) || 0
  if (qty === 0 || !position?.instrument) return null

  const intent = {
    venue: position.venue,
    symbol: position.instrument,
    // Opposite side, absolute size, market: an exit that does not fill is not an exit.
    side: qty > 0 ? 'sell' : 'buy',
    size: Math.abs(qty),
    type: 'market',
  }

  // Reduce-only only where the venue honours it. Spot has no position to reduce and eToro
  // has no such flag, and an intent carrying it there is refused outright as unsupported —
  // which would make FLAT ALL, and a breaker trip's own flatten, silently do nothing on
  // exactly those venues. The size is already exactly what is held, so the overshoot the
  // flag guards against cannot happen without the flag either.
  if (capabilityFor(position.venue, position.instrument).reduceOnly) intent.reduceOnly = true

  return intent
}

/**
 * Close one position.
 *
 * @param {string} key - the position key.
 * @param {{submit?: Function}} [deps] - injectable submit.
 * @returns {Promise<{ok: boolean, reason: string}>} the outcome.
 */
export async function flattenOne(key, deps = {}) {
  const { submit = execSubmit } = deps
  const position = openPositions().find((row) => row.key === String(key ?? ''))
  if (!position) return { ok: false, reason: 'no position' }

  const intent = closeIntent(position)
  if (!intent) return { ok: false, reason: 'nothing to close' }

  const result = await submit(intent)
  return { ok: Boolean(result?.ok), reason: result?.reason ?? '' }
}

/**
 * Close everything.
 *
 * @param {{submit?: Function, now?: () => number}} [deps] - injectable plumbing.
 * @returns {Promise<{closed: number, failed: number}>} what happened.
 */
export async function flattenAll(deps = {}) {
  const { submit = execSubmit, now = () => Date.now() } = deps
  const rows = openPositions()
  if (rows.length === 0) return { closed: 0, failed: 0 }

  let closed = 0
  let failed = 0

  for (const position of rows) {
    const intent = closeIntent(position)
    // Serial rather than parallel: a venue that rate-limits mid-flatten would reject the
    // tail, and the tail is exactly the exposure the trader is trying to shed.
    const result = intent ? await submit(intent) : null
    if (result?.ok) closed += 1
    else failed += 1
  }

  pushToast(
    failed ? `flattened ${closed}, ${failed} failed` : `flattened ${closed}`,
    failed ? 'warn' : 'info',
    now(),
  )
  return { closed, failed }
}

/**
 * Register the flatten actions.
 *
 * @param {{submit?: Function, now?: () => number}} [deps] - injectable plumbing.
 * @returns {string[]} the registered action names.
 */
export function registerFlattenActions(deps = {}) {
  registerAction(ACTIONS.positions.flatten, (_state, payload) => {
    const key = String(payload?.key ?? positionKey(payload?.venue, payload?.instrument))
    // Fire and forget: the exit must return instantly, and each close lands on its row
    // as the venue confirms it.
    flattenOne(key, deps)
    return true
  })

  registerAction(ACTIONS.positions.flattenAll, () => {
    flattenAll(deps)
    return true
  })

  return [ACTIONS.positions.flatten, ACTIONS.positions.flattenAll]
}

/**
 * Whether the desk is carrying anything at all.
 *
 * @returns {boolean} true when at least one position is open.
 */
export function hasExposure() {
  return (Array.isArray(appState.trade?.positions) ? appState.trade.positions : []).length > 0
}
