import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { createAlert, DIRECTIONS } from './price.js'
import { emitAlert } from './bus.js'

/**
 * Alert durability.
 *
 * The definitions already survive a reload — they live under `settings.*`, which is the one
 * persisted namespace — so this module is not about *storing* them. It is about the three
 * things that go wrong around stored data, all of which are silent:
 *
 * 1. **A stale fired flag.** An alert saved while disarmed comes back disarmed, and stays
 *    that way until its cooldown passes against a `firedAt` from yesterday. Loading strips
 *    the transient state, because "armed" is the only honest state for an alert nobody has
 *    watched fire.
 * 2. **A shape from an older build.** A field that changed name leaves alerts that look
 *    valid and never fire. Migration is stepwise and versioned so the failure is a repaired
 *    alert rather than a dead one.
 * 3. **A full localStorage.** The browser throws on write, the desk swallows it, and the
 *    trader's alerts quietly stop saving. The guard raises it as an error alert while there
 *    is still room to act.
 *
 * There is one thing this deliberately does *not* need to solve: a restored alert firing on
 * the first tick after boot. `evalPriceCross` compares two prices and refuses without a
 * previous one, so an alert cannot fire until the market has actually moved past it while
 * the desk was watching.
 */

/** The stored alert schema version. */
export const ALERTS_VERSION = 1

/** Roughly where localStorage starts refusing writes. */
export const QUOTA_BYTES = 5000000

/**
 * Repair a stored alert, or drop it.
 *
 * @param {object} raw - the stored entry.
 * @returns {object|null} a valid alert, or null.
 */
export function sanitizeAlert(raw) {
  const rebuilt = createAlert(raw?.instrument, raw?.direction, raw?.price, {
    id: raw?.id,
    oneShot: raw?.oneShot === true,
    cooldownMs: raw?.cooldownMs,
    note: raw?.note,
  })
  if (!rebuilt) return null

  return {
    ...rebuilt,
    // Armed, always. An alert saved while disarmed would otherwise come back disarmed and
    // sit out its cooldown against a `firedAt` from yesterday — silent, and indistinguishable
    // from one that simply has not triggered.
    armed: true,
    firedAt: 0,
    fires: Number(raw?.fires) || 0,
  }
}

/**
 * Clean a whole stored list.
 *
 * @param {object[]} defs - the stored definitions.
 * @returns {object[]} the alerts worth keeping.
 */
export function sanitizeOnLoad(defs) {
  const seen = new Set()

  return (Array.isArray(defs) ? defs : [])
    .map(sanitizeAlert)
    .filter((alert) => {
      if (!alert || seen.has(alert.id)) return false
      seen.add(alert.id)
      return true
    })
}

/**
 * Bring a stored payload up to the current shape.
 *
 * @param {object} stored - the stored payload.
 * @param {number} [fromVersion] - the version it was written at.
 * @returns {{version: number, alerts: object[], toggles: object}} the upgraded payload.
 */
export function migrateAlerts(stored, fromVersion) {
  const version = Number(fromVersion ?? stored?.version) || 0
  const alerts = Array.isArray(stored?.alerts) ? stored.alerts : []

  // Version 0 is the pre-schema shape: `{above: true}` rather than a direction string. A
  // field that changed name leaves alerts that look valid and never fire, which is the
  // worst kind of broken.
  const upgraded =
    version < 1
      ? alerts.map((alert) => ({
          ...alert,
          direction: DIRECTIONS.includes(String(alert?.direction))
            ? alert.direction
            : alert?.above === true
              ? 'above'
              : alert?.above === false
                ? 'below'
                : 'either',
        }))
      : alerts

  return {
    version: ALERTS_VERSION,
    alerts: sanitizeOnLoad(upgraded),
    toggles: stored?.toggles && typeof stored.toggles === 'object' ? stored.toggles : {},
  }
}

/**
 * One alert stripped of everything local to this machine.
 *
 * @param {object} alert - the stored alert.
 * @returns {object} the portable definition.
 */
export function portableAlert(alert) {
  if (!alert || typeof alert !== 'object') return {}

  // Picked rather than stripped: a field added to the alert record later should have to be
  // *decided* about here, not exported by default because nobody updated an omit list.
  return {
    id: alert.id,
    instrument: alert.instrument,
    direction: alert.direction,
    price: alert.price,
    oneShot: alert.oneShot,
    cooldownMs: alert.cooldownMs,
    note: alert.note,
  }
}

/**
 * The alert set as a portable payload.
 *
 * @returns {object} the payload.
 */
export function exportAlerts() {
  return {
    version: ALERTS_VERSION,
    // Exported without the transient state: a set shared between machines describes what to
    // watch, not what happened to fire on one of them.
    alerts: (Array.isArray(appState.settings?.alerts) ? appState.settings.alerts : []).map(
      portableAlert,
    ),
    toggles: appState.settings?.alertToggles ?? {},
  }
}

/**
 * Load an exported payload.
 *
 * @param {object|string} payload - the payload, or its JSON.
 * @returns {{alerts: object[], toggles: object}|null} what was imported.
 */
export function importAlerts(payload) {
  let parsed = payload
  if (typeof payload === 'string') {
    try {
      parsed = JSON.parse(payload)
    } catch {
      // A file the trader picked that is not an alert set is a mistake to report, not a
      // crash to propagate.
      return null
    }
  }
  if (!parsed || typeof parsed !== 'object') return null

  const migrated = migrateAlerts(parsed)
  setValue(PATHS.settings.alerts, migrated.alerts)
  setValue(PATHS.settings.alertToggles, migrated.toggles)

  return { alerts: migrated.alerts, toggles: migrated.toggles }
}

/**
 * Is the stored payload close to the storage limit?
 *
 * @param {string|object} serialized - the payload or its JSON.
 * @param {number} [maxBytes] - the cap.
 * @returns {{bytes: number, near: boolean, over: boolean}} the verdict.
 */
export function quotaGuard(serialized, maxBytes = QUOTA_BYTES) {
  const text = typeof serialized === 'string' ? serialized : JSON.stringify(serialized ?? {})
  const cap = Number(maxBytes) > 0 ? Number(maxBytes) : QUOTA_BYTES
  // Two bytes a character: localStorage stores UTF-16, and measuring in characters
  // understates a payload with any non-ASCII in it by half.
  const bytes = text.length * 2

  return { bytes, near: bytes > cap * 0.8, over: bytes > cap }
}

/**
 * Restore alerts at boot.
 *
 * @param {object[]} [defs] - the stored definitions.
 * @param {number} [now] - the current time.
 * @returns {object[]} the alerts now armed.
 */
export function rehydrateAlerts(defs = appState.settings?.alerts, now = 0) {
  const alerts = sanitizeOnLoad(defs)
  setValue(PATHS.settings.alerts, alerts)

  const check = quotaGuard(exportAlerts())
  if (check.near) {
    emitAlert(
      {
        key: 'alerts|quota',
        source: 'desk',
        severity: 'warn',
        text: `alert storage ${Math.round((check.bytes / QUOTA_BYTES) * 100)}% full`,
        ts: Number(now) || 0,
      },
      { debounceMs: 0 },
    )
  }

  return alerts
}

/**
 * Register the import/export actions.
 *
 * @returns {string} the export action's name.
 */
export function registerPersistActions() {
  registerAction(ACTIONS.alerts.export, () => exportAlerts())
  // The value arrives as the input's own `value`, or as `json` when a caller passes one
  // explicitly — the same tolerance every other action on this desk has.
  registerAction(ACTIONS.alerts.import, (_state, payload) =>
    importAlerts(payload?.json ?? payload?.value ?? payload),
  )

  return ACTIONS.alerts.export
}
