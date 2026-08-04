import { okxRequest } from './rest.js'
import { demoTrading } from './sign.js'
import { hasKeys } from '../vault.js'
import { setValue } from '../../app/engine.js'
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
 * @returns {{ok: boolean, code: string, reason: string, fix: string}} the verdict; `fix` is
 *   empty when there is nothing for the trader to do.
 */
export function keyVerdict(result = {}, demo = false) {
  const code = String(result.code ?? '')
  if (result.ok) return { ok: true, code: '0', reason: 'OKX keys accepted', fix: '' }

  const fixes = {
    // The one the desk actually keeps hitting. OKX keeps demo and live keys in separate
    // universes: a demo key on the live endpoint is not "wrong", it does not exist there.
    // Which way to point the trader depends on which universe the desk is already aimed at,
    // and getting that backwards sends them to regenerate a key that was never the problem.
    '50119': demo
      ? 'This key is not on OKX’s demo books — untick “OKX demo trading” if it is a live key, otherwise create a new one under Demo Trading.'
      : 'Tick “OKX demo trading” in the key modal if this key came from Demo Trading. If it is a live key, it has been deleted or revoked — create a new one.',
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

  const result = await okxRequest({ path: OKX_CONFIG_PATH, ...options })
  return keyVerdict(result, demoTrading())
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
