import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import {
  setKeys,
  clearKeys,
  keyPresence,
  adoptKeysFromUrl,
  adoptKeysFromEnv,
  cacheKeys,
  loadCachedKeys,
  forgetCachedKeys,
} from '../venues/vault.js'
import { pushToast } from './toast.js'

/**
 * The key modal and the lock.
 *
 * The modal writes straight into the vault and only ever puts *presence booleans* into
 * state — the fields themselves are bound to plain DOM inputs that are cleared the moment
 * they are submitted, so a key exists in exactly two places: the input the trader typed
 * into, and the vault.
 *
 * "Remember keys" adds a third, `localStorage`, and it is off unless the trader turns it
 * on. The trade is stated where they turn it on rather than buried here: convenience across
 * reloads, in exchange for credentials that anything running on this origin can read.
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
  if (rememberEnabled()) cacheKeys()
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
  // The cache goes with them. A lock that emptied the vault and left the copy on disk
  // would be a lock that undoes itself on the next reload — worse than no lock, because
  // the trader believes it worked.
  forgetCachedKeys()

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
  const { win = globalThis, bag, storage } = options

  // URL first: opening a bookmark with a key in it is an explicit instruction to use *that*
  // key, and a stale cached one silently winning would be the worst kind of surprise.
  const fromUrl = adoptKeysFromUrl(win)
  if (rememberEnabled()) {
    if (fromUrl.loaded > 0) cacheKeys(storage)
    else loadCachedKeys(storage)
  }
  if (!keyPresence().okx || !keyPresence().etoro) adoptKeysFromEnv(bag)

  return syncKeyPresence()
}

/**
 * Is the trader letting the desk remember credentials?
 *
 * @param {object} [state] - engine state.
 * @returns {boolean} true when caching is on.
 */
export function rememberEnabled(state = appState) {
  // `rememberCredentials`, not `rememberKeys`: `initial.test.js` greps every state path for
  // /key|secret|passphrase|token/ to catch a credential sneaking into the reactive tree, and
  // that guard is only worth having while it has no exceptions to hide behind.
  return state?.settings?.rememberCredentials === true
}

/**
 * Turn remembering on or off.
 *
 * @param {object} _state - engine state (unused).
 * @param {{value?: boolean}} [payload] - the new setting.
 * @returns {boolean} whether keys are now remembered.
 */
export function toggleRemember(_state, payload = {}) {
  const next = typeof payload?.value === 'boolean' ? payload.value : !rememberEnabled()
  setValue(PATHS.settings.rememberCredentials, next)

  // Acted on immediately in both directions: switching it on with keys already loaded
  // should remember *those* keys, and switching it off should take the copy with it rather
  // than leaving one behind until the next lock.
  if (next) cacheKeys()
  else forgetCachedKeys()

  pushToast(next ? 'keys will be remembered on this browser' : 'remembered keys cleared', 'warn')
  return next
}

/**
 * Open the key modal when the desk cannot trade without one.
 *
 * @param {object} [state] - engine state.
 * @returns {boolean} true when the modal was opened.
 */
export function promptForKeys(state = appState) {
  if (!needsKeys(state)) return false

  setValue(PATHS.ui.modal, 'keys')
  return true
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
    registerAction(ACTIONS.keys.remember, toggleRemember, { description: 'Remember credentials' }),
  ]
}
