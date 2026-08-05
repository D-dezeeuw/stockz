import { okxRequest } from './rest.js'
import { demoTrading } from './sign.js'
import { eeaAccount } from './region.js'
import { syncOkxClock } from './clock.js'
import { hasKeys } from '../vault.js'
import { setValue, watch } from '../../app/engine.js'
import { PATHS } from '../../state/paths.js'
import { pushToast } from '../../ui/toast.js'
import { createLogger } from '../../utils/log.js'

/**
 * Asking OKX whether the keys work, before anything depends on the answer.
 *
 * Every private OKX call authenticates through **headers** — `OK-ACCESS-KEY`,
 * `OK-ACCESS-SIGN`, `OK-ACCESS-TIMESTAMP`, `OK-ACCESS-PASSPHRASE` — regardless of verb.
 * `/api/v5/account/positions` is a GET and stays a GET; there is no variant that carries
 * the credential in the query string or the body, and there should not be, because a
 * secret in a URL ends up in logs, proxies and browser history. So a bad key does not
 * announce itself as a malformed request. It arrives as a bare `401`, in the console,
 * from whichever poller happened to fire first.
 *
 * That 401 has five completely different causes and one appearance. This module makes one
 * deliberate call at a moment of the desk's choosing and turns the venue's error code into
 * the single thing the trader has to go and do.
 */

const log = createLogger('okx-preflight')

/** Authenticated, cheap, and side-effect free — the smallest "do you know me". */
export const OKX_CONFIG_PATH = '/api/v5/account/config'

/**
 * The verdict for a desk that was simply never given credentials.
 *
 * A named constant rather than a string compared at the call site, because two places have
 * to agree on it: this is the one outcome the preflight stays quiet about, and matching it
 * loosely — on "no code", say — would also silence a venue that could not be reached.
 */
export const NO_KEYS = Object.freeze({ ok: false, code: '', reason: 'No OKX keys yet', fix: '' })

/**
 * What an OKX reply means for the keys, and what to do about it.
 *
 * Branching on the venue's numeric code rather than its prose: the message is the venue's
 * to reword, the code is the contract.
 *
 * @param {{ok?: boolean, code?: string, error?: string, data?: unknown[]}} result - an `okxRequest` outcome.
 * @param {boolean} [demo] - whether the desk is pointed at demo trading.
 * @param {boolean} [eea] - whether the desk is pointed at the EU platform.
 * @returns {{ok: boolean, code: string, reason: string, fix: string}} the verdict; `fix` is
 *   empty when there is nothing for the trader to do.
 */
export function keyVerdict(result = {}, demo = false, eea = false) {
  const code = String(result.code ?? '')
  if (result.ok) return { ok: true, code: '0', reason: 'OKX keys accepted', fix: '' }

  // 50119 arrives *before* the signature is examined — verified by probe: a garbage
  // signature on a garbage key still gets 50119, never the bad-signature 50113. So this
  // failure is purely "the platform the desk asked has no key by that name", and the fix is
  // always about *where* the request went: OKX runs four separate key universes (global and
  // EU platforms, live and demo each) and a key exists in exactly one of them. Naming the
  // universe the desk just asked stops the trader regenerating a key that was never wrong.
  const asked = `${eea ? 'OKX EU (my.okx.com)' : 'OKX global (okx.com)'}${demo ? ' demo' : ''}`

  const fixes = {
    '50119': `This key does not exist on ${asked}. Keys work only on the platform that made them — set “OKX EU account” and “demo trading” below to match where this key was created, or create a new key there.`,
    '50113': 'The secret key does not match the API key — they must come from the same OKX key pair.',
    '50105': 'The passphrase is missing — it is the one you chose when creating the key, not your login password.',
    '50102': 'This machine’s clock is off. The desk re-syncs against OKX at boot; reload to measure it again.',
    '50112': 'This machine’s clock is off. The desk re-syncs against OKX at boot; reload to measure it again.',
    '50114': 'The key is restricted to an IP this browser is not on — clear the IP allowlist on the key, or add this one.',
    '50120': 'The key has no trading permission — enable Trade on it in OKX’s API settings.',
  }

  return {
    ok: false,
    code,
    reason: String(result.error ?? 'OKX rejected the keys'),
    fix: fixes[code] ?? '',
  }
}

/**
 * Ask OKX whether it recognises the keys the desk is holding.
 *
 * @param {object} [options] - injectable plumbing, forwarded to `okxRequest`.
 * @returns {Promise<{ok: boolean, code: string, reason: string, fix: string}>} the verdict.
 */
export async function checkOkxKeys(options = {}) {
  // No keys is not a failure worth shouting about — it is the state a fresh desk boots in,
  // and paper mode is meant to work without them.
  if (!hasKeys('okx')) return { ...NO_KEYS }

  // The EU platform cannot be asked from a browser at all: no CORS headers, 405 on the
  // OPTIONS preflight, on both of its hostnames (probed, not assumed). Saying so beats
  // both alternatives — firing the request produces console CORS errors and a false
  // "OKX unreachable", and staying silent leaves the trader believing the keys were
  // checked. Callers that inject a transport (tests, a future websocket check) still get
  // the REST path below.
  if (eeaAccount() && !('fetch' in options)) {
    return {
      ok: false,
      code: '',
      reason: 'OKX EU (my.okx.com) does not answer browsers over REST',
      fix: 'Keys cannot be verified from the page on the EU platform — market data still streams, but account data and orders need the private websocket, which this desk does not speak yet. If this key is from global okx.com, untick “OKX EU account”.',
    }
  }

  const result = await okxRequest({ path: OKX_CONFIG_PATH, ...options })
  return keyVerdict(result, demoTrading(), eeaAccount())
}

/**
 * Put a verdict where the trader will see it.
 *
 * The verdict goes into state as *prose*, never near the credential itself: the reason and
 * the fix are both safe to render, persist and export, and neither one names a key.
 *
 * @param {{ok: boolean, code: string, reason: string, fix: string}} verdict - what OKX said.
 * @returns {object} the verdict, unchanged, so callers can chain.
 */
export function announceKeyCheck(verdict) {
  setValue(PATHS.ui.keyCheck, {
    ok: verdict?.ok === true,
    code: String(verdict?.code ?? ''),
    reason: String(verdict?.reason ?? ''),
    fix: String(verdict?.fix ?? ''),
  })

  // Silence for "no keys yet", and *only* for that: a desk that has not been given
  // credentials does not need to be told so on every boot, and the key modal already says
  // it. Matched on the reason rather than on the absent code, because an unreachable venue
  // has no code either and that one very much needs saying.
  if (verdict?.reason === NO_KEYS.reason) return verdict

  if (verdict.ok) log.info('OKX keys accepted')
  else log.warn(`${verdict.reason}${verdict.fix ? ` — ${verdict.fix}` : ''}`)

  // The fix, not the failure. "401 Unauthorized" is what the console already said; the
  // whole point of spending a request on this is to say the next move instead.
  pushToast(verdict.ok ? 'OKX keys verified' : verdict.fix || verdict.reason, verdict.ok ? 'success' : 'warn')

  return verdict
}

/**
 * Verify the keys at boot, once, and say what to do if they are wrong.
 *
 * @param {object} [options] - injectable plumbing, forwarded to `checkOkxKeys`.
 * @returns {Promise<object>} the verdict.
 */
export async function runKeyPreflight(options = {}) {
  return announceKeyCheck(await checkOkxKeys(options))
}

/**
 * Re-verify whenever the desk is re-aimed.
 *
 * A verdict describes one (platform, environment, key) combination, and all three of its
 * inputs can change without a reload: the EU and demo checkboxes re-aim the requests, and
 * submitting keys changes what there is to verify (surfaced as `ui.keysPresent`). Without
 * this, ticking "OKX EU account" changed where the *next* call would go and then made no
 * call — the stale `www.okx.com` 401 stayed in the console looking current, which reads as
 * "the fix did nothing".
 *
 * The clock is re-measured before each re-check for the same reason it is measured at
 * boot: the re-aim changes which venue's clock will judge the timestamps.
 *
 * Armed *after* the boot preflight completes, so the flurry of writes boot itself makes —
 * settings restore, key adoption — cannot trigger a second, concurrent first-check.
 *
 * @param {{watch?: Function, recheck?: Function}} [deps] - injectable for tests.
 * @returns {Function} unsubscribe.
 */
export function watchKeyAim(deps = {}) {
  const watchImpl = deps.watch ?? watch
  const recheck = deps.recheck ?? (() => syncOkxClock().then(() => runKeyPreflight()).catch(() => {}))

  return watchImpl(
    [PATHS.settings.okxEea, PATHS.settings.okxDemo, PATHS.ui.keysPresent],
    () => recheck(),
  )
}
