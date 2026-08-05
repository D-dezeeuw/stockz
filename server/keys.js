import process from 'node:process'

/**
 * The venue keys, from the server's own .env.
 *
 * Owner decision (2026-08-05, single-user desk): the server is the key store. The desk
 * used to insist keys never touch the server — right for a public static page, wrong for
 * a private authenticated backend whose whole job is holding this trader's things. The
 * keys live in .env beside the compose file, readable by root and the container alone,
 * and are handed only to a logged-in **admin** session over TLS; `usr` is the paper
 * account and gets nothing.
 *
 * Signing still happens in the browser. This process stores and hands over; it never
 * computes a signature, so the relay stays a relay.
 */

/** venue → field → env var. The same names the desk's local-dev adoption always used. */
export const VENUE_ENV = Object.freeze({
  okx: Object.freeze({
    apiKey: 'STOCKZ_OKX_API_KEY',
    secretKey: 'STOCKZ_OKX_SECRET_KEY',
    passphrase: 'STOCKZ_OKX_PASSPHRASE',
  }),
  etoro: Object.freeze({
    apiKey: 'STOCKZ_ETORO_API_KEY',
    userKey: 'STOCKZ_ETORO_USER_KEY',
  }),
})

/**
 * Collect the configured venue keys.
 *
 * Blank and missing values are omitted rather than sent as empty strings, so the
 * client's vault (which ignores blanks anyway) sees exactly what is really configured.
 *
 * @param {object} [env] - the environment bag.
 * @returns {Record<string, Record<string, string>>} venue → fields; venues with nothing
 *   configured are absent entirely.
 */
export function venueKeys(env = process.env) {
  const out = {}

  for (const [venue, fields] of Object.entries(VENUE_ENV)) {
    const held = {}
    for (const [field, envKey] of Object.entries(fields)) {
      const value = env[envKey]
      if (typeof value === 'string' && value.trim()) held[field] = value.trim()
    }
    if (Object.keys(held).length > 0) out[venue] = held
  }

  return out
}
