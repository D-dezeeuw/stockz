import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { alertEnabled } from './bus.js'
import { mayInterrupt } from './dnd.js'

/**
 * Native OS notifications.
 *
 * The output for the trader who has tabbed away. Toasts and sounds both assume the page is
 * in front of somebody; this is the only channel that reaches them when it is not.
 *
 * Two rules keep it from being the thing that makes people uninstall trading software:
 *
 * 1. **Permission is asked on an explicit click, never on load.** A page that fires the
 *    browser's permission prompt in its first second gets "block" from most people, and
 *    that answer is permanent and silent. The desk asks when the trader has said they want
 *    this, at which point they say yes.
 * 2. **Native only when the tab is hidden.** A native notification for something already
 *    on screen is a duplicate that steals focus, and the foreground belongs to the toast.
 *
 * Denied or unsupported is not a failure state: everything still arrives as a toast, which
 * is where it was going anyway.
 */

/** Severities that reach the OS by default. */
export const NATIVE_DEFAULTS = Object.freeze({ info: false, success: false, warn: true, error: true })

/**
 * The browser's current permission, mirrored into state.
 *
 * @param {object} [scope] - the global scope.
 * @returns {string} 'granted', 'denied', 'default' or 'unsupported'.
 */
export function permissionState(scope = globalThis) {
  const api = scope?.Notification
  // 'unsupported' is a distinct answer from 'denied': one means the trader said no, the
  // other means nobody asked, and the UI should offer the button in only one of them.
  const permission = typeof api === 'function' ? String(api.permission ?? 'default') : 'unsupported'

  setValue(PATHS.ui.notifyPermission, permission)
  return permission
}

/**
 * Ask for permission, on an explicit gesture.
 *
 * @param {object} [scope] - the global scope.
 * @returns {Promise<string>} the resulting permission.
 */
export async function requestPermission(scope = globalThis) {
  const api = scope?.Notification
  if (typeof api !== 'function' || typeof api.requestPermission !== 'function') {
    return permissionState(scope)
  }

  try {
    const result = String(await api.requestPermission())
    setValue(PATHS.ui.notifyPermission, result)
    return result
  } catch {
    // A browser that throws here is one that will not deliver either. Reading the state
    // back is more honest than guessing.
    return permissionState(scope)
  }
}

/**
 * Should this alert go to the OS rather than to a toast?
 *
 * @param {boolean} hidden - whether the document is hidden.
 * @param {string} severity - the alert's severity.
 * @param {object} [state] - the settings slice.
 * @returns {boolean} true for native.
 */
export function visibilityGate(hidden, severity, state = appState?.settings) {
  // A native notification for something already on screen is a duplicate that steals
  // focus. The foreground belongs to the toast.
  if (hidden !== true) return false

  const tier = String(severity ?? 'info')
  const configured = state?.alertToggles?.native?.[tier]
  if (typeof configured === 'boolean') return configured

  // Default: only the tiers worth pulling somebody back to the tab for. An info-level
  // native ping is how a trading app ends up permanently blocked.
  return NATIVE_DEFAULTS[tier] === true
}

/**
 * Send one native notification.
 *
 * @param {object} alert - the bus alert.
 * @param {{scope?: object, onClick?: Function}} [options] - plumbing.
 * @returns {object|null} the notification, or null when it could not be sent.
 */
export function sendNotification(alert, options = {}) {
  const scope = options.scope ?? globalThis
  const api = scope?.Notification
  const text = String(alert?.text ?? '').trim()
  if (typeof api !== 'function' || String(api.permission) !== 'granted' || !text) return null

  try {
    const notification = new api(String(alert?.instrument || 'STOCKZ'), {
      body: text,
      // Tagged per instrument: a second alert on the same symbol *replaces* the first
      // rather than stacking, so a trader who tabs back finds one current notification
      // instead of forty stale ones.
      tag: `stockz|${String(alert?.instrument ?? alert?.source ?? '')}`,
      silent: alertEnabled('sound', String(alert?.severity ?? 'info')) === false,
    })

    notification.onclick = () => {
      scope.focus?.()
      // Focusing the tab is most of it; jumping to the instrument is what makes the
      // notification a shortcut rather than an interruption.
      if (alert?.instrument) setValue(PATHS.market.focus, String(alert.instrument))
      options.onClick?.(alert)
      notification.close?.()
    }

    return notification
  } catch {
    // Some browsers throw on `new Notification` in a service-worker-only context. Falling
    // through to the toast is the right answer and needs no announcement.
    return null
  }
}

/**
 * Deliver an alert to the OS when it should go there.
 *
 * @param {object} alert - the bus alert.
 * @param {{scope?: object, hidden?: boolean}} [options] - plumbing.
 * @returns {string} 'native' when it went to the OS, '' when the toast owns it.
 */
export function routeNative(alert, options = {}) {
  const scope = options.scope ?? globalThis
  const hidden = options.hidden ?? scope?.document?.hidden === true
  if (!mayInterrupt(alert, Number(options.now) || Date.now())) return ''
  if (!visibilityGate(hidden, alert?.severity)) return ''

  // Denied or unsupported is not a failure: the alert is already going to a toast, which
  // is where it was going anyway.
  return sendNotification(alert, { scope }) ? 'native' : ''
}

/**
 * Register the permission action.
 *
 * @returns {string} the action's name.
 */
export function registerNotifyActions() {
  registerAction(ACTIONS.alerts.enableNative, () => requestPermission())
  return ACTIONS.alerts.enableNative
}

/**
 * Send every eligible bus alert to the OS.
 *
 * @param {(fn: Function) => Function} subscribe - the bus subscription.
 * @param {{scope?: object}} [options] - plumbing.
 * @returns {() => void} unsubscribe.
 */
export function wireNativeAlerts(subscribe, options = {}) {
  if (typeof subscribe !== 'function') return () => {}

  return subscribe((alert) => routeNative(alert, options))
}
