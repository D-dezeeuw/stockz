import { createLogger } from '../utils/log.js'
import { readEnv } from '../utils/env.js'
import { encryptBlob, decryptBlob, resetKeystore } from './keystore.js'

/**
 * The key vault.
 *
 * **Credentials never enter Spektrum state.** State is recorded into history, returned by
 * `serialize()`, exported with the trade journal and dumped by devtools — a key that
 * touches state ends up in a file the trader emails to someone. So the vault is a plain
 * module-scoped Map, deliberately outside the reactive tree, and nothing here ever
 * returns a full key to a caller that only needs to know whether one exists.
 *
 * Keys arrive from four places, in priority order: URL params (fastest — open a bookmark
 * and trade), the remembered cache, the key modal, and `import.meta.env` for local dev.
 *
 * **On the cache, plainly.** When "remember keys" is on, credentials are written to
 * `localStorage` so a revisit does not cost the trader their session. They are **encrypted**
 * with a non-extractable WebCrypto key (see `keystore.js`), which means a stolen profile,
 * a sync backup or a glance at devtools yields ciphertext and nothing else. It does not and
 * cannot stop script running on this origin, which can simply ask the same key to decrypt —
 * the mitigation for that lives at the venue, in a trade-only key with an IP allowlist.
 *
 * What does *not* change is the harder guarantee: credentials still never enter Spektrum
 * state. State is recorded into history, returned by `serialize()`, exported with the trade
 * journal and dumped by devtools; the cache is a separate storage key nothing else reads.
 */

const log = createLogger('vault')

/** venue -> { field: value }. Module-scoped on purpose: never reactive, never exported. */
const vault = new Map()

/** Which fields each venue needs before it can be considered configured. */
export const VENUE_FIELDS = Object.freeze({
  okx: Object.freeze(['apiKey', 'secretKey', 'passphrase']),
  etoro: Object.freeze(['apiKey', 'userKey']),
})

/** URL params that map to vault fields. */
export const PARAM_MAP = Object.freeze({
  okxKey: ['okx', 'apiKey'],
  okxSecret: ['okx', 'secretKey'],
  okxPass: ['okx', 'passphrase'],
  etoroKey: ['etoro', 'apiKey'],
  etoroUser: ['etoro', 'userKey'],
})

/**
 * Store credentials for a venue.
 *
 * @param {string} venue - 'okx' or 'etoro'.
 * @param {object} fields - field/value pairs; blank values are ignored, not stored.
 * @returns {string[]} the field names now held for that venue.
 */
export function setKeys(venue, fields = {}) {
  if (!VENUE_FIELDS[venue]) return []

  const current = vault.get(venue) ?? {}
  for (const field of VENUE_FIELDS[venue]) {
    const value = fields[field]
    if (typeof value === 'string' && value.trim()) current[field] = value.trim()
  }

  vault.set(venue, current)
  return Object.keys(current)
}

/**
 * Read one credential — the only way a full key leaves the vault.
 *
 * Deliberately narrow: a caller asks for exactly the field it is about to sign with,
 * which keeps key handling auditable by grep.
 *
 * @param {string} venue - venue name.
 * @param {string} field - field name.
 * @returns {string} the value, or '' when absent.
 */
export function getKey(venue, field) {
  return vault.get(venue)?.[field] ?? ''
}

/**
 * Whether a venue has every credential it needs.
 *
 * @param {string} venue - venue name.
 * @returns {boolean} true when the venue is fully configured.
 */
export function hasKeys(venue) {
  const required = VENUE_FIELDS[venue]
  if (!required) return false

  const held = vault.get(venue) ?? {}
  return required.every((field) => typeof held[field] === 'string' && held[field].length > 0)
}

/**
 * Presence only — safe to log, safe to render, safe to put in state.
 *
 * @returns {{okx: boolean, etoro: boolean}} which venues are configured.
 */
export function keyPresence() {
  return { okx: hasKeys('okx'), etoro: hasKeys('etoro') }
}

/**
 * Forget everything. The lock action, and what a session teardown calls.
 *
 * @param {string} [venue] - a single venue, or omit for all.
 * @returns {number} how many venues were cleared.
 */
export function clearKeys(venue) {
  if (venue) {
    const had = vault.delete(venue)
    return had ? 1 : 0
  }

  const count = vault.size
  vault.clear()
  return count
}

/**
 * Pull credentials out of a URL query string.
 *
 * @param {string} search - `location.search`.
 * @returns {{venue: string, field: string, value: string}[]} what was found.
 */
export function parseKeyParams(search) {
  const params = new URLSearchParams(String(search ?? ''))
  const found = []

  for (const [param, [venue, field]] of Object.entries(PARAM_MAP)) {
    const value = params.get(param)
    if (value && value.trim()) found.push({ venue, field, value: value.trim() })
  }
  return found
}

/**
 * Remove key params from a URL, leaving everything else intact.
 *
 * @param {string} href - the current URL.
 * @returns {string} the URL without credentials.
 */
export function scrubKeyParams(href) {
  const input = String(href ?? '')
  if (!input) return ''

  let url
  try {
    url = new URL(input, 'https://local.invalid')
  } catch {
    return input
  }

  for (const param of Object.keys(PARAM_MAP)) url.searchParams.delete(param)

  const query = url.searchParams.toString()
  return `${url.pathname}${query ? `?${query}` : ''}${url.hash}`
}

/**
 * Load keys from the URL and scrub the address bar.
 *
 * The scrub matters more than it looks: a key left in the address bar goes into browser
 * history, gets screenshotted during a screen share, and rides along in any `Referer`
 * the page sends. Reading it once and rewriting the URL costs nothing.
 *
 * @param {{location?: object, history?: object}} [win] - injected window.
 * @returns {{loaded: number, scrubbed: boolean}} what happened.
 */
export function adoptKeysFromUrl(win = globalThis) {
  const search = win?.location?.search ?? ''
  const found = parseKeyParams(search)

  for (const { venue, field, value } of found) setKeys(venue, { [field]: value })

  let scrubbed = false
  if (found.length > 0 && typeof win?.history?.replaceState === 'function') {
    const href = `${win.location.pathname ?? ''}${search}${win.location.hash ?? ''}`
    win.history.replaceState(null, '', scrubKeyParams(href))
    scrubbed = true
  }

  if (found.length > 0) log.info(`adopted ${found.length} credential fields from the URL`)
  return { loaded: found.length, scrubbed }
}

/**
 * Fall back to local dev credentials.
 *
 * @param {Record<string, unknown>} [bag] - env bag; defaults to the Vite env.
 * @returns {{okx: boolean, etoro: boolean}} presence after loading.
 */
export function adoptKeysFromEnv(bag) {
  setKeys('okx', {
    apiKey: readEnv('STOCKZ_OKX_API_KEY', bag),
    secretKey: readEnv('STOCKZ_OKX_SECRET_KEY', bag),
    passphrase: readEnv('STOCKZ_OKX_PASSPHRASE', bag),
  })
  setKeys('etoro', {
    apiKey: readEnv('STOCKZ_ETORO_API_KEY', bag),
    userKey: readEnv('STOCKZ_ETORO_USER_KEY', bag),
  })

  return keyPresence()
}

/** Where remembered credentials live. */
export const KEYS_CACHE_KEY = 'stockz.keys.v1'

/**
 * Write the vault to storage.
 *
 * @param {Storage} [storage] - storage to write to.
 * @returns {number} how many venues were written.
 */
export async function cacheKeys(storage = globalThis.localStorage, deps = {}) {
  const payload = Object.fromEntries(vault)
  const sealed = await encryptBlob(JSON.stringify(payload), deps)
  // No keystore, no cache. Writing plaintext as a fallback would quietly hand back exactly
  // the exposure the encryption exists to remove, on the machines least able to afford it.
  if (!sealed) {
    log.warn('no keystore available — credentials will not be remembered')
    return 0
  }

  try {
    storage?.setItem?.(KEYS_CACHE_KEY, JSON.stringify(sealed))
    return Object.keys(payload).length
  } catch (err) {
    // A full or blocked storage loses the convenience, never the session: the keys are
    // already in the vault and this call is only about surviving the next reload.
    log.warn(`could not remember keys: ${err?.message ?? err}`)
    return 0
  }
}

/**
 * Read remembered credentials back into the vault.
 *
 * @param {Storage} [storage] - storage to read from.
 * @returns {number} how many venues were restored.
 */
export async function loadCachedKeys(storage = globalThis.localStorage, deps = {}) {
  let envelope
  try {
    envelope = JSON.parse(storage?.getItem?.(KEYS_CACHE_KEY) ?? 'null')
  } catch (err) {
    log.warn(`unreadable key cache: ${err?.message ?? err}`)
    return 0
  }
  if (!envelope) return 0

  const plain = await decryptBlob(envelope, deps)
  if (!plain) return 0

  let parsed
  try {
    parsed = JSON.parse(plain)
  } catch {
    return 0
  }
  if (!parsed || typeof parsed !== 'object') return 0

  let restored = 0
  for (const [venue, fields] of Object.entries(parsed)) {
    // Through `setKeys` rather than straight into the Map: a cache written by an older
    // build, or hand-edited, must go through the same field filter as anything else.
    if (setKeys(venue, fields ?? {}).length > 0) restored += 1
  }

  return restored
}

/**
 * Forget the remembered credentials.
 *
 * @param {Storage} [storage] - storage to clear.
 * @returns {boolean} true when the cache is gone.
 */
export async function forgetCachedKeys(storage = globalThis.localStorage, deps = {}) {
  // The wrapping key goes too. The ciphertext may already be on a backup somewhere, and
  // destroying the key is what turns those copies into permanent noise.
  await resetKeystore(deps)
  try {
    // Removed rather than overwritten with an empty object: a lock that left a key-shaped
    // hole behind would be a lock the next reader has to interpret.
    storage?.removeItem?.(KEYS_CACHE_KEY)
    return true
  } catch (err) {
    log.warn(`could not clear the key cache: ${err?.message ?? err}`)
    return false
  }
}
