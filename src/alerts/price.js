import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { setAlertToggle } from './signals.js'

/**
 * Price-cross alerts.
 *
 * The one thing a scalper cannot do is watch six instruments at once, and the one thing
 * they need is to know the moment one of them reaches a level. That is the whole feature.
 *
 * Two decisions carry it:
 *
 * 1. **A gap through the level is a cross.** Price does not visit every number on the way;
 *    on a fast tape it goes 100.0 → 100.7 and never prints 100.5. An alert that tested
 *    `price === level` — or even `price >= level` without the previous price — would either
 *    never fire or fire on every subsequent tick. The comparison is always *between two
 *    prices*, which is what makes a gap-through indistinguishable from a touch.
 * 2. **A fired alert is disarmed, not deleted.** A level that mattered once tends to matter
 *    again, and an alert that vanished on its first fire is one the trader has to re-enter
 *    at exactly the moment they are busy. One-shot is available and is not the default.
 *
 * Alerts live in `settings.alerts` because a level set yesterday should still be there
 * today — it is a preference about the market, not a fact about it.
 */

/** Directions an alert can watch. */
export const DIRECTIONS = Object.freeze(['above', 'below', 'either'])

/** How long a repeating alert stays quiet after firing. */
export const DEFAULT_COOLDOWN_MS = 60000

/**
 * Build an alert.
 *
 * @param {string} instrument - the qualified symbol.
 * @param {string} direction - 'above', 'below' or 'either'.
 * @param {number} price - the level.
 * @param {{oneShot?: boolean, cooldownMs?: number, note?: string, id?: string}} [options] - extras.
 * @returns {object|null} the alert, or null when it could not be built.
 */
export function createAlert(instrument, direction, price, options = {}) {
  const symbol = String(instrument ?? '').trim()
  const level = Number(price)
  const way = DIRECTIONS.includes(String(direction)) ? String(direction) : 'either'
  // A level of zero or NaN is an alert that fires immediately and forever.
  if (!symbol || !Number.isFinite(level) || level <= 0) return null

  return {
    // Derived from what the alert *is*, so setting the same alert twice replaces rather
    // than duplicates — a list with the same level three times is a list nobody prunes.
    id: String(options.id ?? `${symbol}|${way}|${level}`),
    instrument: symbol,
    direction: way,
    price: level,
    oneShot: options.oneShot === true,
    cooldownMs: Number(options.cooldownMs) >= 0 ? Number(options.cooldownMs) : DEFAULT_COOLDOWN_MS,
    note: String(options.note ?? ''),
    armed: true,
    firedAt: 0,
    fires: 0,
  }
}

/**
 * Did price cross the level between two prints?
 *
 * @param {object} alert - the alert.
 * @param {number} prevPrice - the previous print.
 * @param {number} lastPrice - the current print.
 * @returns {boolean} true when it crossed.
 */
export function evalPriceCross(alert, prevPrice, lastPrice) {
  const level = Number(alert?.price)
  const before = Number(prevPrice)
  const now = Number(lastPrice)
  if (alert?.armed === false) return false
  if (!Number.isFinite(level) || !Number.isFinite(now)) return false

  // No previous print is the first tick after arming. Firing here would go off on whatever
  // side of the level the market happened to already be.
  if (!Number.isFinite(before)) return false

  const up = before < level && now >= level
  const down = before > level && now <= level

  // Compared between two prices, which is what makes a gap-through indistinguishable from
  // a touch: on a fast tape price goes 100.0 → 100.7 and never prints 100.5.
  if (alert.direction === 'above') return up
  if (alert.direction === 'below') return down

  return up || down
}

/**
 * Fire an alert, or re-arm it when its cooldown has passed.
 *
 * @param {object} alert - the alert.
 * @param {number} now - the current time.
 * @returns {object} the alert, updated.
 */
export function rearmAlert(alert, now) {
  const at = Number(now) || 0
  const firedAt = Number(alert?.firedAt) || 0
  if (alert?.armed !== false) return alert

  // A one-shot never comes back on its own; that is the whole difference between the two.
  if (alert.oneShot === true) return alert

  const cooldown = Number(alert.cooldownMs)
  const wait = Number.isFinite(cooldown) && cooldown >= 0 ? cooldown : DEFAULT_COOLDOWN_MS

  return at - firedAt >= wait ? { ...alert, armed: true } : alert
}

/**
 * Mark an alert as having fired.
 *
 * @param {object} alert - the alert.
 * @param {number} now - the current time.
 * @returns {object} the alert, disarmed.
 */
export function markFired(alert, now) {
  return {
    ...alert,
    // Disarmed, not deleted: a level that mattered once tends to matter again, and an alert
    // that vanished on its first fire is one the trader re-enters exactly when busy.
    armed: false,
    firedAt: Number(now) || 0,
    fires: (Number(alert?.fires) || 0) + 1,
  }
}

/**
 * Every alert the desk holds.
 *
 * @param {object} [state] - the settings slice.
 * @returns {object[]} the alerts.
 */
export function alerts(state = appState?.settings) {
  return Array.isArray(state?.alerts) ? state.alerts : []
}

/**
 * Save an alert, replacing any with the same id.
 *
 * @param {object} alert - the alert.
 * @returns {object[]} the alert list.
 */
export function saveAlert(alert) {
  if (!alert?.id) return alerts()

  const next = [...alerts().filter((row) => row.id !== alert.id), alert]
  setValue(PATHS.settings.alerts, next)
  return next
}

/**
 * Patch an alert.
 *
 * @param {string} id - the alert id.
 * @param {object} patch - the fields to change.
 * @returns {object|null} the updated alert.
 */
export function updateAlert(id, patch) {
  const key = String(id ?? '')
  const current = alerts().find((row) => row.id === key)
  if (!current) return null

  // Re-armed on any edit: a trader who just moved the level means the new one to be live,
  // not to inherit the old one's cooldown.
  const updated = { ...current, ...(patch ?? {}), id: key, armed: true }
  saveAlert(updated)

  return updated
}

/**
 * Delete an alert.
 *
 * @param {string} id - the alert id.
 * @returns {boolean} true when one was removed.
 */
export function removeAlert(id) {
  const key = String(id ?? '')
  const next = alerts().filter((row) => row.id !== key)
  if (next.length === alerts().length) return false

  setValue(PATHS.settings.alerts, next)
  return true
}

/**
 * Run every alert for one instrument against a price move.
 *
 * @param {string} instrument - the qualified symbol.
 * @param {number} prevPrice - the previous print.
 * @param {number} lastPrice - the current print.
 * @param {number} now - the current time.
 * @returns {object[]} the alerts that fired.
 */
export function evaluateAlerts(instrument, prevPrice, lastPrice, now) {
  const symbol = String(instrument ?? '')
  const rows = alerts()
  if (!symbol || rows.length === 0) return []

  const fired = []
  const next = rows.map((alert) => {
    if (alert.instrument !== symbol) return alert

    const armed = rearmAlert(alert, now)
    if (!evalPriceCross(armed, prevPrice, lastPrice)) return armed

    const done = markFired(armed, now)
    fired.push(done)
    return done
  })

  // One write for the whole list. `setValue` lands next tick, so a write per alert would
  // have each one read a list missing the previous fire.
  if (fired.length > 0 || next.some((row, i) => row !== rows[i])) {
    setValue(PATHS.settings.alerts, next)
  }

  return fired
}

/**
 * The chips shown against a watchlist row.
 *
 * @param {string} instrument - the qualified symbol.
 * @returns {object[]} the chips.
 */
export function alertChips(instrument) {
  const symbol = String(instrument ?? '')

  return alerts()
    .filter((alert) => alert.instrument === symbol)
    .map((alert) => ({
      id: alert.id,
      label: `${alert.direction === 'below' ? '↓' : alert.direction === 'above' ? '↑' : '↕'} ${alert.price}`,
      // A disarmed alert stays visible and says so, rather than looking identical to an
      // armed one that simply has not fired.
      tone: alert.armed === false ? 'spent' : 'armed',
      note: alert.note,
    }))
}

/**
 * Publish the chips for the focused instrument.
 *
 * @param {string} instrument - the qualified symbol.
 * @returns {object[]} the chips.
 */
export function publishAlertChips(instrument) {
  const chips = alertChips(instrument ?? appState.market?.focus)
  setValue(PATHS.ui.alertChips, chips)
  return chips
}

/**
 * Register the alert actions.
 *
 * @returns {string} the create action's name.
 */
export function registerAlertActions() {
  registerAction(ACTIONS.alerts.create, (_state, payload) => {
    // Read from the draft fields as well as the payload: the form binds them with
    // `data-model`, and an action that only trusted the payload would depend on exactly how
    // the engine assembles one from a submit.
    const alert = createAlert(
      payload?.instrument ?? appState.market?.focus,
      payload?.direction ?? appState.ui?.alertDirection,
      payload?.price ?? payload?.value ?? appState.ui?.alertDraft,
      { oneShot: payload?.oneShot === true || payload?.oneShot === 'true' },
    )
    if (!alert) return null

    saveAlert(alert)
    return alert
  })

  registerAction(ACTIONS.alerts.remove, (_state, payload) => removeAlert(payload?.id ?? payload))
  registerAction(ACTIONS.alerts.update, (_state, payload) =>
    updateAlert(payload?.id, { price: Number(payload?.value ?? payload?.price) }),
  )
  registerAction(ACTIONS.alerts.toggle, (_state, payload) =>
    setAlertToggle(payload?.group, payload?.key, payload?.checked ?? payload?.value !== 'false'),
  )

  return ACTIONS.alerts.create
}
