import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { setKeys, clearKeys, keyPresence, adoptKeysFromUrl, adoptKeysFromEnv } from '../venues/vault.js'
import { pushToast } from './toast.js'

/**
 * The key modal and the lock.
 *
 * The modal writes straight into the vault and only ever puts *presence booleans* into
 * state — the fields themselves are bound to plain DOM inputs that are cleared the moment
 * they are submitted, so a key exists in exactly two places: the input the trader typed
 * into, and the vault.
 */

/**
 * Mirror vault presence into state, for the header LEDs and the key modal's own gating.
 *
 * @returns {{okx: boolean, etoro: boolean}} the presence now in state.
 */
export function syncKeyPresence() {
  const presence = keyPresence()
  setValue(PATHS.ui.keysPresent, presence)
  return presence
}

/**
 * Whether the desk should demand keys before it is usable.
 *
 * Paper mode deliberately does NOT require keys: a new user should be able to click
 * around a working desk before handing over credentials.
 *
 * @param {object} [state] - engine state.
 * @returns {boolean} true when the key modal should open on boot.
 */
export function needsKeys(state = appState) {
  const presence = state?.ui?.keysPresent ?? {}
  const mode = state?.trade?.mode ?? 'paper'

  if (mode === 'paper') return false
  return !presence.okx && !presence.etoro
}

/**
 * Take credentials from the modal into the vault.
 *
 * @param {object} _state - engine state (unused).
 * @param {{venue?: string, fields?: object}} [payload] - what the trader typed.
 * @returns {{okx: boolean, etoro: boolean}} presence after saving.
 */
export function submitKeys(_state, payload = {}) {
  const venue = String(payload.venue ?? 'okx')
  setKeys(venue, payload.fields ?? {})

  const presence = syncKeyPresence()
  pushToast(presence[venue] ? `${venue} keys accepted` : `${venue} keys incomplete`, presence[venue] ? 'success' : 'warn')
  return presence
}

/**
 * Forget every credential immediately — the panic lock.
 *
 * @param {object} _state - engine state (unused).
 * @returns {number} how many venues were cleared.
 */
export function lockKeys() {
  const cleared = clearKeys()

  syncKeyPresence()
  setValue(PATHS.ui.modal, cleared > 0 ? 'keys' : '')
  pushToast('keys cleared', 'warn')
  return cleared
}

/**
 * Load credentials at boot: URL first (open a bookmark and trade), then local dev env.
 *
 * @param {{win?: object, bag?: object}} [options] - injected environment.
 * @returns {{okx: boolean, etoro: boolean}} presence after loading.
 */
export function adoptKeys(options = {}) {
  const { win = globalThis, bag } = options

  adoptKeysFromUrl(win)
  if (!keyPresence().okx || !keyPresence().etoro) adoptKeysFromEnv(bag)

  return syncKeyPresence()
}

/**
 * Register the key actions.
 *
 * @returns {string[]} names registered by this call.
 */
export function registerKeyActions() {
  return [
    registerAction(ACTIONS.keys.submit, submitKeys, { description: 'Save venue credentials' }),
    registerAction(ACTIONS.keys.lock, lockKeys, { description: 'Clear all credentials' }),
  ]
}
