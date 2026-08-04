import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import {
  VENUE_FIELDS,
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
 * state — the fields are plain DOM inputs, never `data-model`, because a credential bound
 * to state would land in history and every journal export.
 *
 * The inputs are cleared once the vault has them. Left alone they keep the secret sitting
 * in the DOM for the rest of the session, readable by anything that can query it, which
 * quietly undoes the reason for not binding them in the first place.
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
export function submitKeys(_state, payload = {}, deps = {}) {
  const venue = String(payload.venue ?? 'okx')
  setKeys(venue, readFields(venue, payload))
  clearVenueForm(venue, deps.doc)

  const presence = syncKeyPresence()
  if (rememberEnabled()) cacheKeys()
  pushToast(presence[venue] ? `${venue} keys accepted` : `${venue} keys incomplete`, presence[venue] ? 'success' : 'warn')
  return presence
}

/**
 * Pull a venue's fields out of whatever shape the submit arrived in.
 *
 * A form submit delivers its named inputs **flat** on the payload. This used to read only
 * `payload.fields`, so every key typed into the modal was dropped on the floor — and the
 * test passed because it hand-built the nested shape the code expected rather than the one
 * the DOM actually sends. Both shapes are accepted now, and the flat one is the real path.
 *
 * @param {string} venue - 'okx' or 'etoro'.
 * @param {object} payload - the action payload.
 * @returns {object} the field values found.
 */
export function readFields(venue, payload = {}) {
  const nested = payload?.fields ?? {}
  const fields = {}

  for (const field of VENUE_FIELDS[venue] ?? []) {
    const value = nested[field] ?? payload?.[field]
    if (typeof value === 'string' && value.trim()) fields[field] = value
  }

  return fields
}

/**
 * Empty a venue's inputs once the vault has them.
 *
 * @param {string} venue - 'okx' or 'etoro'.
 * @param {Document} [doc] - injectable document.
 * @returns {boolean} true when a form was cleared.
 */
export function clearVenueForm(venue, doc = globalThis.document) {
  const form = doc?.querySelector?.(`form[data-venue="${String(venue ?? '')}"]`)
  if (!form) return false

  // Each input emptied explicitly rather than `form.reset()`. Reset restores inputs to their
  // *default* value, so the day somebody adds a `value` attribute — a placeholder, a
  // prefill — reset would put the secret back rather than clear it. For a security clear,
  // ambiguity is not worth the shorter line.
  for (const input of form.querySelectorAll?.('input') ?? []) input.value = ''

  return true
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

  applyRemember(next)

  pushToast(
    next ? 'keys remembered on this browser, unencrypted' : 'remembered keys cleared',
    'warn',
  )
  return next
}

/**
 * Make the stored copy match the setting.
 *
 * @param {boolean} next - whether keys should be remembered.
 * @param {object} [deps] - injectable plumbing.
 * @returns {boolean} true when the stored copy now matches.
 */
export function applyRemember(next, deps = {}) {
  // Acted on immediately in both directions: switching it on with keys already loaded should
  // remember *those* keys, and switching it off should take the copy with it rather than
  // leaving one behind until the next lock.
  if (next) return cacheKeys(deps.storage) > 0

  return forgetCachedKeys(deps.storage)
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
