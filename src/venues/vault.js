import { createLogger } from '../utils/log.js'
import { readEnv } from '../utils/env.js'

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
 * `localStorage` in the clear, so a revisit does not cost the trader their session. Anything
 * with access to the profile — a stolen laptop, a sync backup, a glance at devtools — can
 * read them. That is the trade the desk makes for one-click revisits, and the mitigation for
 * it lives at the venue rather than in this file: a trade-only key with an IP allowlist,
 * which cannot move funds no matter who holds it. Remembering is opt-in for that reason.
 *
 * What the cache does not change is the harder guarantee: credentials still never enter
 * Spektrum state. State is recorded into history, returned by `serialize()`, exported with
 * the trade journal and dumped by devtools; the cache is a separate storage key nothing
 * else reads.
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

/**
 * Build the bookmarkable URL for whatever the vault currently holds.
 *
 * The reverse of `parseKeyParams`, and the point of the whole URL-param path: enter the
 * keys once, keep the link, and every later visit opens a desk that is already
 * authenticated — including on a machine where nothing was ever remembered.
 *
 * **A link like this is a credential.** It goes wherever links go: browser history, a
 * synced bookmark bar, a `Referer` header, a screen share, the clipboard. Anyone holding it
 * holds the keys. That is the trade being made deliberately here, and the only sane way to
 * take it is with a trade-only venue key behind an IP allowlist, which cannot move funds
 * however it leaks. The desk still scrubs the params out of the address bar on arrival, so
 * the link is only as exposed as wherever it is kept.
 *
 * Partial sets are included on purpose: a URL with just the OKX pair is useful to somebody
 * who has not signed up to eToro, and refusing to build one until every venue is filled in
 * would be a rule with no beneficiary.
 *
 * @param {string} [base] - the desk's URL; defaults to the current page.
 * @returns {string} the URL, or '' when the vault is empty.
 */
export function buildKeyUrl(base = globalThis.location?.href ?? '') {
  const params = new URLSearchParams()

  for (const [param, [venue, field]] of Object.entries(PARAM_MAP)) {
    const value = getKey(venue, field)
    if (value) params.set(param, value)
  }
  if ([...params.keys()].length === 0) return ''

  let url
  try {
    // Absolute only, with no fallback base. A bookmark that is not a real address is not a
    // bookmark, and resolving against a placeholder origin the way `scrubKeyParams` does
    // would hand back a `local.invalid` link that looks like it works and never will.
    url = new URL(String(base))
  } catch {
    return ''
  }

  // Existing credential params are dropped first, so building a link from a desk that was
  // itself opened by one cannot end up with two copies of a rotated key.
  for (const param of Object.keys(PARAM_MAP)) url.searchParams.delete(param)
  for (const [param, value] of params) url.searchParams.set(param, value)

  return url.toString()
}

/** Where remembered credentials live. */
export const KEYS_CACHE_KEY = 'stockz.keys.v1'

/**
 * Write the vault to storage.
 *
 * @param {Storage} [storage] - storage to write to.
 * @returns {number} how many venues were written.
 */
export function cacheKeys(storage = globalThis.localStorage) {
  const payload = Object.fromEntries(vault)

  try {
    storage?.setItem?.(KEYS_CACHE_KEY, JSON.stringify(payload))
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
export function loadCachedKeys(storage = globalThis.localStorage) {
  let parsed
  try {
    parsed = JSON.parse(storage?.getItem?.(KEYS_CACHE_KEY) ?? 'null')
  } catch (err) {
    log.warn(`unreadable key cache: ${err?.message ?? err}`)
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
export function forgetCachedKeys(storage = globalThis.localStorage) {
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
