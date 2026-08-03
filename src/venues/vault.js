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
 * Keys arrive from three places, in priority order: URL params (fastest — open a
 * bookmark and trade), the key modal, and `import.meta.env` for local dev.
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
