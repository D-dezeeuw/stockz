import { appState } from '../../app/engine.js'

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
 * @param {object} [state] - engine state.
 * @returns {boolean} true when keys were created on my.okx.com.
 */
export function eeaAccount(state = appState) {
  return state?.settings?.okxEea === true
}

/**
 * The REST base every signed and public OKX call should use.
 *
 * Read at call time, never cached: flipping the region checkbox must redirect the very
 * next request, not the ones after a reload.
 *
 * @param {object} [state] - engine state.
 * @returns {string} the base URL.
 */
export function okxRestBase(state = appState) {
  return eeaAccount(state) ? OKX_REST_HOSTS.eea : OKX_REST_HOSTS.global
}
