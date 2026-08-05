import { appState, pendingAt } from '../../app/engine.js'
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
 * The live read goes through `pendingAt` — the delta first, then landed state — because
 * the one moment this most matters is the one moment plain `appState` is wrong: boot.
 * `restoreSettings()` queues the persisted value into the delta, and the clock sync fires
 * in the same synchronous pass, *before* the engine's first tick lands it. Reading
 * `appState` there would probe the global platform's clock for an EU account on every
 * single boot, and no reload would ever fix it because every reload is that same moment.
 *
 * @param {object} [state] - engine state; pass one explicitly to bypass the pending read.
 * @returns {boolean} true when keys were created on my.okx.com.
 */
export function eeaAccount(state) {
  if (state !== undefined) return state?.settings?.okxEea === true

  const pending = pendingAt(PATHS.settings.okxEea)
  return pending.found ? pending.value === true : appState?.settings?.okxEea === true
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
  return eeaAccount(state) ? OKX_REST_HOSTS.eea : OKX_REST_HOSTS.global
}
