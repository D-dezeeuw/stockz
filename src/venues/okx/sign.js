import { appState } from '../../app/engine.js'
import { getKey } from '../vault.js'
import { okxNow } from './clock.js'

/**
 * OKX request signing.
 *
 * OKX signs `timestamp + METHOD + path + body` with HMAC-SHA256 under the secret key,
 * base64-encoded. Web Crypto is used rather than a crypto library: it is in every browser
 * that can run this desk, it keeps the secret in a `CryptoKey` the page cannot casually
 * stringify, and it is one fewer dependency on the path that moves money.
 *
 * The secret is fetched from the vault at call time and never held here — a module-level
 * cached key would outlive `keys.lock`.
 */

/** OKX wants ISO-8601 with milliseconds, e.g. 2026-08-03T14:05:09.221Z. */
export function okxTimestamp(ms) {
  const time = Number.isFinite(ms) ? ms : 0
  return new Date(time).toISOString().replace(/(\.\d{3})\d*Z$/, '$1Z')
}

/**
 * The exact string OKX signs.
 *
 * Order and emptiness both matter: a GET signs an empty body, and the query string is
 * part of the path. Getting this wrong yields a 401 that looks like a bad key.
 *
 * @param {{ts: string, method?: string, path: string, body?: string|object}} parts - request.
 * @returns {string} the prehash string.
 */
export function prehashString({ ts, method = 'GET', path, body = '' }) {
  const verb = String(method).toUpperCase()
  const payload = typeof body === 'string' ? body : body ? JSON.stringify(body) : ''

  // The body is signed *verbatim* — whatever string goes on the wire goes into the hash,
  // including a literal '{}' if that is genuinely sent. This used to special-case '{}'
  // out of the prehash, which meant an empty-object POST would sign one thing and send
  // another; `okxRequest` now serialises once and shares the exact string with both.
  return `${ts}${verb}${path}${payload}`
}

/**
 * Base64 a byte buffer without Node or browser-specific helpers.
 *
 * @param {ArrayBuffer} buffer - bytes to encode.
 * @returns {string} base64.
 */
export function toBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)

  // btoa is the browser path and always exists where this ships. The Buffer branch is
  // reached only under Node (tests), and is read off globalThis so browser bundles never
  // reference a Node global.
  if (typeof btoa === 'function') return btoa(binary)
  return globalThis.Buffer.from(bytes).toString('base64')
}

/**
 * HMAC-SHA256 a message with a secret, base64-encoded.
 *
 * @param {string} message - the prehash string.
 * @param {string} secret - the venue secret.
 * @param {object} [subtle] - Web Crypto subtle, injectable for tests.
 * @returns {Promise<string>} base64 signature, or '' without a secret.
 */
export async function hmacSha256(message, secret, subtle = globalThis.crypto?.subtle) {
  if (!secret || !subtle) return ''

  const encoder = new TextEncoder()
  const key = await subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await subtle.sign('HMAC', key, encoder.encode(message))
  return toBase64(signature)
}

/**
 * Build the headers a signed OKX REST call needs.
 *
 * `demo` overrides the setting for one call. The key probe needs to *ask* both environments
 * before the desk knows which one is right, and it cannot do that by flipping the setting —
 * that would re-aim the whole desk, and the watcher on it, four times per probe.
 *
 * @param {{ts?: number, method?: string, path: string, body?: string|object, subtle?: object,
 *   demo?: boolean, state?: object}} req
 * @returns {Promise<Record<string, string>>} headers; empty object when keys are missing.
 */
export async function signRequest(req) {
  const apiKey = getKey('okx', 'apiKey')
  const secret = getKey('okx', 'secretKey')
  const passphrase = getKey('okx', 'passphrase')

  if (!apiKey || !secret || !passphrase) return {}

  // The *venue's* now, never the epoch and never the raw browser clock. OKX rejects a
  // timestamp more than 30 seconds off its own, and it rejects it as a 401 indistinguishable
  // from a bad key — so a signature dated 1970, or one from a laptop that drifted while
  // asleep, both fail the same way and neither says why.
  const ts = okxTimestamp(req.ts ?? okxNow())
  const demo = req.demo === undefined ? demoTrading(req.state) : req.demo === true
  const sign = await hmacSha256(
    prehashString({ ts, method: req.method, path: req.path, body: req.body }),
    secret,
    req.subtle,
  )

  return {
    'OK-ACCESS-KEY': apiKey,
    'OK-ACCESS-SIGN': sign,
    'OK-ACCESS-TIMESTAMP': ts,
    'OK-ACCESS-PASSPHRASE': passphrase,
    'Content-Type': 'application/json',
    // OKX keeps demo and live keys in *separate universes*. Announcing the wrong one is
    // never reported as "wrong header": on the platform the key lives on the venue says
    // `50101 "APIKey does not match current environment"`, and on a platform it does not
    // live on it says `50119 "API key doesn't exist"` — a deleted-key message that sends
    // people off to regenerate a key that was fine.
    ...(demo ? { 'x-simulated-trading': '1' } : {}),
  }
}

/**
 * Is the desk pointed at OKX's demo environment?
 *
 * @param {object} [state] - engine state.
 * @returns {boolean} true when demo keys should be announced as such.
 */
export function demoTrading(state = appState) {
  return state?.settings?.okxDemo === true
}

/**
 * The login frame for the private WebSocket.
 *
 * The WS login signs a fixed path with a *seconds* timestamp, unlike REST's ISO string —
 * a genuine inconsistency in the venue API and a classic source of "why is my socket
 * unauthorised".
 *
 * @param {{ts?: number, subtle?: object}} [options] - injected clock and crypto.
 * @returns {Promise<object|null>} the login frame, or null without credentials.
 */
export async function buildLoginFrame(options = {}) {
  const apiKey = getKey('okx', 'apiKey')
  const secret = getKey('okx', 'secretKey')
  const passphrase = getKey('okx', 'passphrase')

  if (!apiKey || !secret || !passphrase) return null

  const seconds = Math.floor((options.ts ?? Date.now()) / 1000).toString()
  const sign = await hmacSha256(`${seconds}GET/users/self/verify`, secret, options.subtle)

  return {
    op: 'login',
    args: [{ apiKey, passphrase, timestamp: seconds, sign }],
  }
}
