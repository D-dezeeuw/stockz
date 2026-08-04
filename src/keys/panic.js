import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction, dispatchAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { playCue } from '../ticket/feedback.js'
import { pushToast } from '../ui/toast.js'

/**
 * The panic exit.
 *
 * One Escape closes whatever is open. Two, quickly, means *get me out*: every working
 * order cancelled and the desk goes cold in the same motion.
 *
 * The double-tap is deliberate. A single Escape is the most-pressed key on any interface
 * and binding a flatten to it directly would fire it by accident within a day. Two taps
 * inside 400ms is a gesture nobody makes without meaning it, and it is still faster than
 * finding a button.
 */

/** How close two Escapes must be to count as a panic. */
export const DOUBLE_TAP_MS = 400

/** How long after a panic the gesture is ignored. */
export const COOLDOWN_MS = 1000

/** The last Escape, and the last panic — held outside state for the same frame reasons. */
let lastTapAt = 0
let lastPanicAt = 0

/**
 * Whether this press completes a double tap.
 *
 * @param {number} now - the press time.
 * @param {number} previous - the previous press time.
 * @param {number} [windowMs] - how close counts.
 * @returns {boolean} true when the two presses are a gesture.
 */
export function isDoubleTap(now, previous, windowMs = DOUBLE_TAP_MS) {
  const at = Number(now)
  const before = Number(previous)
  if (!Number.isFinite(at) || !Number.isFinite(before) || before <= 0) return false

  const gap = at - before
  return gap >= 0 && gap <= (Number(windowMs) || DOUBLE_TAP_MS)
}

/**
 * Whether a panic is still locked out from the last one.
 *
 * @param {number} now - the moment being tested.
 * @param {number} lastAt - when the last panic fired.
 * @param {number} [cooldownMs] - the lockout.
 * @returns {boolean} true when a panic must be ignored.
 */
export function panicCooldown(now, lastAt, cooldownMs = COOLDOWN_MS) {
  const at = Number(now)
  const before = Number(lastAt)
  if (!Number.isFinite(at) || !Number.isFinite(before) || before <= 0) return false

  return at - before < (Number(cooldownMs) || COOLDOWN_MS)
}

/**
 * Record an Escape and report whether it panics.
 *
 * @param {number} now - the press time.
 * @returns {{panic: boolean, reason: string}} what the press means.
 */
export function tapEscape(now) {
  const at = Number(now) || 0

  if (panicCooldown(at, lastPanicAt)) return { panic: false, reason: 'cooldown' }
  if (!isDoubleTap(at, lastTapAt)) {
    lastTapAt = at
    return { panic: false, reason: 'single' }
  }

  lastPanicAt = at
  lastTapAt = 0
  return { panic: true, reason: 'double' }
}

/** Forget the tap history — a fresh session, or a test. */
export function resetPanic() {
  lastTapAt = 0
  lastPanicAt = 0
  return true
}

/**
 * Register the panic action.
 *
 * @param {{now?: () => number, cancel?: Function}} [deps] - injectable clock and cancel.
 * @returns {string} the registered action name.
 */
export function registerPanicAction(deps = {}) {
  const { now = () => Date.now(), cancel = null } = deps

  registerAction(ACTIONS.keys.panic, (_state, payload) => {
    const at = Number(payload?.now ?? now())
    const { panic } = payload?.force === true ? { panic: true } : tapEscape(at)

    if (!panic) {
      // A single Escape closes whatever is open, which is what it means everywhere else
      // on a computer. Only the second one within the window means anything more.
      setValue(PATHS.ui.modal, '')
      return false
    }

    const working = (Array.isArray(appState.trade?.orders) ? appState.trade.orders : []).filter(
      (order) => !['filled', 'cancelled', 'rejected'].includes(order?.state),
    ).length

    // Cold first, then cancel: the disarm is instant and local, while the cancels are
    // round trips. Doing it the other way round leaves a window where the desk is still
    // hot and a held key could add to what is being cancelled.
    setValue(PATHS.trade.armed, false)
    setValue(PATHS.ui.modal, '')

    if (cancel) cancel()
    else dispatchAction(ACTIONS.orders.cancelAll, {})

    pushToast(`PANIC — disarmed, cancelling ${working}`, 'error', at)
    playCue('reject')

    return true
  })

  return ACTIONS.keys.panic
}
