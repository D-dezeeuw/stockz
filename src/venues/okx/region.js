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

/** REST bases per platform. The EEA one is from OKX's own EEA docs, not guessed. */
export const OKX_REST_HOSTS = Object.freeze({
  global: 'https://www.okx.com',
  eea: 'https://eea.okx.com',
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
  if (!eeaAccount(state)) return OKX_REST_HOSTS.global

  // The EU platform refuses browser REST outright, so an EU desk reaches it through its
  // own server: a relay that forwards to eea.okx.com. Signing survives the indirection
  // because OKX signs the *path*, not the host — the relay strips its own prefix and the
  // venue receives exactly the string that was signed.
  return okxEeaRelay(state) || OKX_REST_HOSTS.eea
}

/**
 * The trader's own relay to the EU platform, when one is configured.
 *
 * A root-relative path (`/okx-eea`, the same-origin nginx location) or an absolute
 * https URL. Same-origin is the better shape — the browser is talking to the host that
 * served the page, so CORS never enters the picture at all.
 *
 * Anything else — a protocol-relative `//host`, a bare word, garbage from a corrupted
 * settings import — reads as *unset* rather than becoming a request target: a signed
 * request must never be aimed somewhere that was not deliberately written down.
 *
 * @param {object} [state] - engine state; pass one explicitly to bypass the pending read.
 * @returns {string} the normalised relay base, or '' when none is configured.
 */
export function okxEeaRelay(state) {
  const raw =
    state !== undefined
      ? state?.settings?.okxEeaRelay
      : (() => {
          const pending = pendingAt(PATHS.settings.okxEeaRelay)
          return pending.found ? pending.value : ''
        })()

  const value = String(raw ?? '').trim().replace(/\/+$/, '')
  if (/^https?:\/\//i.test(value)) return value
  if (/^\/(?!\/)/.test(value)) return value

  return ''
}

/**
 * The base for *public, unauthenticated* market endpoints — always the global platform.
 *
 * Probed, not assumed: `www.okx.com` reflects any Origin in `access-control-allow-origin`,
 * while `eea.okx.com` and `my.okx.com` send **no CORS headers at all** and answer 405 to
 * the OPTIONS preflight — the EU platform does not serve browser REST clients on either
 * hostname. Public data is the one place that costs nothing: the order book is the shared
 * global matching engine and `/public/time` is NTP either way, so the venue that lets a
 * browser ask is the right venue to ask.
 *
 * Private endpoints must not use this — a signed request belongs to the platform the key
 * lives on, reachable or not, and `okxRestBase` keeps saying so.
 *
 * @returns {string} the global REST base.
 */
export function okxPublicBase() {
  return OKX_REST_HOSTS.global
}
