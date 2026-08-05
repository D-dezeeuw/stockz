import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto'
import { Buffer } from 'node:buffer'
import process from 'node:process'

/**
 * Who is allowed in, and as what.
 *
 * Two accounts, from the server's `.env` and nowhere else: `usr` (the desk, paper only)
 * and `admin` (everything, including live trading and keys). No user database, no
 * registration, no password reset — this is one trader's private desk, and the entire
 * account model is two lines in a file only root can read.
 *
 * Sessions are a signed statement, not server state: `role.expiry.hmac`. The server keeps
 * nothing, restarts clean, and a cookie is valid exactly when its own signature says so.
 * With no configured passwords the desk is LOCKED, not open — a half-provisioned server
 * that let everyone in because nobody had made a password yet would be the worst possible
 * default for a page that can move money.
 */

/** How long a login lasts. A trading desk on a private server, not a bank vault. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** The cookie name. */
export const SESSION_COOKIE = 'stockz.session'

/** The two accounts and the env var each answers to. */
export const ROLES = Object.freeze({
  usr: 'STOCKZ_USER_PASSWORD',
  admin: 'STOCKZ_ADMIN_PASSWORD',
})

/**
 * Constant-time string comparison that also refuses empties.
 *
 * @param {string} a - one value.
 * @param {string} b - the other.
 * @returns {boolean} true when both are non-empty and equal.
 */
export function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ''))
  const right = Buffer.from(String(b ?? ''))
  if (left.length === 0 || right.length === 0) return false
  // Length leaks through timingSafeEqual's precondition; compare against self when the
  // lengths differ so the work done is the same either way and the answer is still no.
  if (left.length !== right.length) return timingSafeEqual(left, left) && false
  return timingSafeEqual(left, right)
}

/**
 * Which role a login attempt earns.
 *
 * @param {string} user - the submitted username ('usr' or 'admin').
 * @param {string} pass - the submitted password.
 * @param {object} env - the environment bag.
 * @returns {string} the role, or '' when refused.
 */
export function loginRole(user, pass, env = process.env) {
  const role = String(user ?? '').trim()
  const envKey = ROLES[role]
  if (!envKey) return ''

  return safeEqual(pass, env[envKey]) ? role : ''
}

/**
 * Is the desk provisioned with any credentials at all?
 *
 * @param {object} env - the environment bag.
 * @returns {boolean} true when at least one account has a password.
 */
export function credentialsConfigured(env = process.env) {
  return Object.values(ROLES).some((key) => typeof env[key] === 'string' && env[key].length > 0)
}

/**
 * Mint a session token.
 *
 * @param {string} role - 'usr' or 'admin'.
 * @param {string} secret - the signing secret.
 * @param {number} [now] - epoch ms.
 * @returns {string} `role.expiry.signature`.
 */
export function signSession(role, secret, now = Date.now()) {
  const expiry = now + SESSION_TTL_MS
  const mac = createHmac('sha256', String(secret)).update(`${role}.${expiry}`).digest('base64url')
  return `${role}.${expiry}.${mac}`
}

/**
 * What a session token proves.
 *
 * @param {string} token - the cookie value.
 * @param {string} secret - the signing secret.
 * @param {number} [now] - epoch ms.
 * @returns {string} the role, or '' when the token is absent, forged or expired.
 */
export function verifySession(token, secret, now = Date.now()) {
  const parts = String(token ?? '').split('.')
  if (parts.length !== 3) return ''

  const [role, expiryRaw, mac] = parts
  if (!ROLES[role]) return ''

  const expiry = Number(expiryRaw)
  if (!Number.isFinite(expiry) || expiry <= now) return ''

  const expected = createHmac('sha256', String(secret)).update(`${role}.${expiry}`).digest('base64url')
  return safeEqual(mac, expected) ? role : ''
}

/**
 * The session role a request carries.
 *
 * @param {string} cookieHeader - the raw Cookie header.
 * @param {string} secret - the signing secret.
 * @param {number} [now] - epoch ms.
 * @returns {string} the role, or ''.
 */
export function requestRole(cookieHeader, secret, now = Date.now()) {
  const cookies = parseCookies(cookieHeader)
  return verifySession(cookies[SESSION_COOKIE], secret, now)
}

/**
 * A Cookie header, as a bag.
 *
 * @param {string} header - the raw header.
 * @returns {Record<string, string>} name → value.
 */
export function parseCookies(header) {
  const out = {}
  for (const pair of String(header ?? '').split(';')) {
    const eq = pair.indexOf('=')
    if (eq < 0) continue
    const name = pair.slice(0, eq).trim()
    if (name) out[name] = pair.slice(eq + 1).trim()
  }
  return out
}

/**
 * The Set-Cookie value for a fresh session (or for logging out with an empty token).
 *
 * @param {string} token - the session token, or '' to clear.
 * @returns {string} the header value.
 */
export function sessionCookie(token) {
  const value = String(token ?? '')
  const expiry = value ? `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}` : 'Max-Age=0'
  // HttpOnly: the session must be invisible to the page's own JS — the desk's state tree
  // is exported, journaled and time-travelled, and a readable session would ride along.
  // SameSite=Strict: no other site may ride this cookie into the proxy.
  return `${SESSION_COOKIE}=${value}; Path=/; ${expiry}; HttpOnly; SameSite=Strict`
}

/**
 * The signing secret to use: configured, or minted for this process.
 *
 * An ephemeral secret means sessions die with a restart — an acceptable cost for a desk
 * that must never be open just because provisioning was half-done.
 *
 * @param {object} env - the environment bag.
 * @returns {string} the secret.
 */
export function sessionSecret(env = process.env) {
  const configured = env.STOCKZ_SESSION_SECRET
  if (typeof configured === 'string' && configured.length >= 16) return configured
  return randomBytes(32).toString('base64url')
}
