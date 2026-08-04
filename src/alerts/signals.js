import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { emitAlert, alertEnabled } from './bus.js'

/**
 * Strategy signals as alerts.
 *
 * A strategy that fires while the trader is looking at the order book has said nothing at
 * all. This is the bridge that makes a signal *arrive* rather than merely exist.
 *
 * The whole design problem here is noise. Eight strategies on four instruments is thirty-two
 * potential sources, several of which re-state their opinion every tick, and an alert stream
 * that shouts constantly is one the trader mutes on day two — at which point the feature is
 * worse than not having it, because they now believe they are being told.
 *
 * So: entries and exits alert, "no signal" never does, an identical call inside the debounce
 * window is one alert, and every strategy can be muted individually.
 */

/** How long an identical strategy call stays quiet. */
export const SIGNAL_DEBOUNCE_MS = 5000

/**
 * How loudly a signal should arrive.
 *
 * @param {object} signal - the normalised signal.
 * @returns {string} a severity.
 */
export function signalSeverity(signal) {
  const action = String(signal?.action ?? '')
  if (action === 'buy' || action === 'sell') {
    // A high-conviction entry is worth a louder tier than a hesitant one; conviction the
    // strategy itself reported is the only honest basis for that.
    return Number(signal?.strength) >= 0.8 ? 'warn' : 'info'
  }

  // An exit is a success in the plain sense that the position is off.
  return action === 'flat' ? 'success' : 'info'
}

/**
 * Turn a signal into an alert payload.
 *
 * @param {object} signal - the normalised signal.
 * @param {{name?: string, strategyId?: string}} [strategy] - who fired it.
 * @returns {object|null} the alert payload, or null when there is nothing to say.
 */
export function mapSignalToAlert(signal, strategy = {}) {
  const action = String(signal?.action ?? '')
  // 'none' is a strategy having no opinion. Alerting on it would mean alerting constantly
  // and saying nothing.
  if (!action || action === 'none') return null

  const id = String(strategy.strategyId ?? signal?.source ?? '')
  const name = String(strategy.name ?? id)
  const instrument = String(signal?.instrument ?? '')
  const verb = action === 'flat' ? 'exit' : action
  const reason = String(signal?.reason ?? '')

  return {
    // Keyed on strategy + instrument + direction, so a strategy repeating itself is one
    // alert while the same strategy flipping side is a new one.
    key: `signal|${id}|${instrument}|${action}`,
    source: 'signal',
    strategyId: id,
    kind: action,
    severity: signalSeverity(signal),
    // The reason travels with it: an alert that says "sell" and nothing else cannot be
    // judged, and the trader has about a second to judge it.
    text: `${name} ${verb.toUpperCase()} ${instrument}${reason ? ` — ${reason}` : ''}`,
    instrument,
    ts: Number(signal?.ts) || 0,
  }
}

/**
 * Emit a signal alert, respecting the per-strategy mute.
 *
 * @param {object} signal - the normalised signal.
 * @param {{name?: string, strategyId?: string}} [strategy] - who fired it.
 * @returns {object|null} the alert, or null when muted or suppressed.
 */
export function routeSignalAlert(signal, strategy = {}) {
  const payload = mapSignalToAlert(signal, strategy)
  if (!payload) return null
  if (!alertEnabled('signals', payload.strategyId)) return null

  return emitAlert(payload, { debounceMs: SIGNAL_DEBOUNCE_MS })
}

/**
 * Mute or unmute a source.
 *
 * @param {string} group - the toggle group.
 * @param {string} key - the source key.
 * @param {boolean} enabled - whether it should alert.
 * @returns {object} the toggle map now in force.
 */
export function setAlertToggle(group, key, enabled) {
  const bucket = String(group ?? '')
  const id = String(key ?? '')
  if (!bucket || !id) return appState.settings?.alertToggles ?? {}

  const current = appState.settings?.alertToggles ?? {}
  const next = {
    ...current,
    [bucket]: { ...(current[bucket] ?? {}), [id]: enabled !== false },
  }

  setValue(PATHS.settings.alertToggles, next)
  return next
}

/**
 * The toggle rows for the settings drawer.
 *
 * @param {string} group - the toggle group.
 * @param {Array<{id?: string, name?: string}>} sources - what can be muted.
 * @returns {object[]} the rows.
 */
export function toggleRows(group, sources) {
  const bucket = String(group ?? '')

  return (Array.isArray(sources) ? sources : []).map((source) => ({
    group: bucket,
    key: String(source?.id ?? ''),
    label: String(source?.name ?? source?.id ?? ''),
    enabled: alertEnabled(bucket, source?.id),
  }))
}

/**
 * Publish the toggle rows.
 *
 * @param {Array<{id?: string, name?: string}>} strategies - the registered strategies.
 * @returns {object[]} the rows.
 */
export function publishToggles(strategies) {
  const rows = toggleRows('signals', strategies)
  setValue(PATHS.ui.alertToggles, rows)
  return rows
}
