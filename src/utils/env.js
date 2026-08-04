/**
 * Safe access to build-time environment values.
 *
 * Only `STOCKZ_`-prefixed vars are exposed to the bundle (see `envPrefix` in
 * vite.config.js). These are a **local dev convenience only** — in production the
 * browser receives keys via URL params or the key modal, and they live in the
 * in-memory vault, never in env or state.
 *
 * Nothing here logs or returns a key value by accident: callers ask for one name at a
 * time, and `hasEnv` / `venueKeyPresence` answer presence questions without exposing
 * the secret. Every reader takes an optional `bag` so callers (and tests) can inject a
 * source instead of depending on the ambient environment.
 */

/** @returns {Record<string, unknown>} the Vite env bag, or {} off-Vite (e.g. plain Node). */
export function envBag() {
  return import.meta.env ?? {}
}

/**
 * Read one environment value.
 *
 * @param {string} name - full var name, e.g. 'STOCKZ_OKX_API_KEY'.
 * @param {Record<string, unknown>} [bag] - env source; defaults to the Vite env bag.
 * @returns {string} the value, or '' when unset or not a string.
 */
export function readEnv(name, bag = envBag()) {
  const value = bag[name]
  return typeof value === 'string' ? value : ''
}

/**
 * Whether an environment value is configured — presence only, never the value.
 *
 * @param {string} name - full var name.
 * @param {Record<string, unknown>} [bag] - env source; defaults to the Vite env bag.
 * @returns {boolean} true when the var holds a non-empty, non-whitespace value.
 */
export function hasEnv(name, bag = envBag()) {
  return readEnv(name, bag).trim().length > 0
}

/**
 * Which venues have a complete local dev credential set.
 *
 * @param {Record<string, unknown>} [bag] - env source; defaults to the Vite env bag.
 * @returns {{okx: boolean, etoro: boolean}} presence flags, safe to log.
 */
export function venueKeyPresence(bag = envBag()) {
  return {
    okx:
      hasEnv('STOCKZ_OKX_API_KEY', bag) &&
      hasEnv('STOCKZ_OKX_SECRET_KEY', bag) &&
      hasEnv('STOCKZ_OKX_PASSPHRASE', bag),
    etoro: hasEnv('STOCKZ_ETORO_API_KEY', bag) && hasEnv('STOCKZ_ETORO_USER_KEY', bag),
  }
}

/**
 * One-line boot banner telling the dev which venue keys are configured.
 * Contains presence booleans only — never key material.
 *
 * Says **env** out loud, because this reports build-time `STOCKZ_*` variables and nothing
 * else. It prints before the vault has adopted anything from the URL or the key modal, so
 * an unqualified "keys okx:false" a line above "adopted 5 credential fields from the URL"
 * reads as a contradiction, and the reader is left unsure which one to believe.
 *
 * @param {Record<string, unknown>} [bag] - env source; defaults to the Vite env bag.
 * @returns {string} e.g. 'env keys okx:true etoro:false'.
 */
export function keyPresenceBanner(bag = envBag()) {
  const { okx, etoro } = venueKeyPresence(bag)
  return `env keys okx:${okx} etoro:${etoro}`
}
