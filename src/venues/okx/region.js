import { pendingAt } from '../../app/engine.js'
import { PATHS } from '../../state/paths.js'

/**
 * Which OKX the desk is talking to.
 *
 * OKX is not one venue. EEA customers were migrated onto a separately-regulated platform —
 * the site is `my.okx.com`, the documented API base is `eea.okx.com` — and **API keys do
 * not cross between the platforms**. A key created on the EU platform is not "wrong" on
 * `www.okx.com`; the global platform has simply never heard of it, and it says so as
 * `50119 "API key doesn't exist"`.
 *
 * That failure is uniquely misleading, because it arrives *before* the signature is even
 * examined (verified by probe: a garbage signature on a garbage key still returns 50119,
 * not the bad-signature 50113). Perfect signing code, correct clock, correct passphrase —
 * none of it is ever consulted. The only fix is to aim the request at the platform the key
 * lives on, which is what this module decides.
 *
 * The demo split (`x-simulated-trading`, `wspap` hosts) is orthogonal and stays in
 * `sign.js`/`socket.js`: a key lives in one *region* and one *environment*, and the desk
 * has to match both.
 */

/** The true venue hosts, as documentation and for the backend. Browsers never call these. */
export const OKX_REST_HOSTS = Object.freeze({
  global: 'https://www.okx.com',
  eea: 'https://eea.okx.com',
})

/**
 * The desk's own backend prefixes. Every REST call is same-origin now: the Node backend
 * (server/main.js) strips the prefix and forwards to the venue, which is what lets a
 * browser reach OKX EU at all (it sends no CORS headers on any hostname it has) and what
 * keeps signing intact — OKX signs the path, and the venue receives exactly the string
 * the browser hashed.
 */
export const OKX_PROXY_PREFIXES = Object.freeze({
  global: '/okx',
  eea: '/okx-eea',
})

/**
 * Is the desk pointed at the EU/EEA platform?
 *
 * **EU unless explicitly unticked.** This desk's owner trades from the EU, so the EU
 * platform is home; only the boolean `false` the checkbox writes when deliberately
 * unticked aims at global. Absent, corrupted or half-seeded settings all land on the
 * default — the platform the keys actually live on — rather than silently re-aiming
 * every signed request at a venue that has never heard of them.
 *
 * The live read goes through `pendingAt` — the delta first, then landed state — because
 * the one moment this most matters is the one moment plain `appState` is wrong: boot.
 * `restoreSettings()` queues the persisted value into the delta, and the clock sync fires
 * in the same synchronous pass, *before* the engine's first tick lands it.
 *
 * @param {object} [state] - engine state; pass one explicitly to bypass the pending read.
 * @returns {boolean} true when the desk should talk to my.okx.com / eea.okx.com.
 */
export function eeaAccount(state) {
  if (state !== undefined) return state?.settings?.okxEea !== false

  const pending = pendingAt(PATHS.settings.okxEea)
  return pending.found ? pending.value !== false : true
}

/**
 * The REST base every signed and public OKX call should use.
 *
 * Read at call time, never cached: flipping the region checkbox must redirect the very
 * next request, not the ones after a reload.
 *
 * @param {object} [state] - engine state; omit for the live pending-aware read.
 * @returns {string} the base URL.
 */
export function okxRestBase(state) {
  // No `= appState` default here: filling the parameter in would hand `eeaAccount` a
  // concrete state and silently switch it onto the landed-only branch — exactly the boot
  // race the pending read exists to close.
  return eeaAccount(state) ? OKX_PROXY_PREFIXES.eea : OKX_PROXY_PREFIXES.global
}


/**
 * The base for *public, unauthenticated* market endpoints — always the global proxy.
 *
 * Public data is the shared global matching engine and `/public/time` is NTP on both
 * platforms, so region never matters here. Private endpoints must not use this — a signed
 * request belongs to the platform the key lives on, and `okxRestBase` keeps saying so.
 *
 * @returns {string} the global proxy prefix.
 */
export function okxPublicBase() {
  return OKX_PROXY_PREFIXES.global
}
