import { okxRequest } from './rest.js'
import { demoTrading } from './sign.js'
import { eeaAccount, okxProxyFor } from './region.js'
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
    // 50101 is 50119's twin from the other side: the key *was* found, but it belongs to a
    // different one of OKX's four universes than the request declared. OKX raises it both
    // for the live/demo axis (the `x-simulated-trading` header disagreeing with the key)
    // and for the region axis (an EU key sent to okx.com, or a global key sent to
    // eea.okx.com). Same two checkboxes fix both, which is why they share their wording.
    '50101': `This key exists but belongs to a different OKX than ${asked}. Set “OKX EU account” and “demo trading” below to match where the key was created — the desk probes all four and re-aims itself, so this normally corrects on its own.`,
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
 * The four OKX runs a key can belong to, in the order they are worth trying.
 *
 * OKX is two axes crossed: **region** (the global platform, and the separately-regulated
 * EEA one) and **environment** (live, and simulated). A key exists in exactly one of the
 * four cells, and the desk has to match both to be recognised. EU-live first because that
 * is this desk's home, then global-live, then the demo pair — a real key is far likelier
 * to be a live one, and the ordering only decides which answer wins if two ever accepted.
 */
export const OKX_UNIVERSES = Object.freeze([
  Object.freeze({ eea: true, demo: false, label: 'OKX EU (my.okx.com) live' }),
  Object.freeze({ eea: false, demo: false, label: 'OKX global (okx.com) live' }),
  Object.freeze({ eea: true, demo: true, label: 'OKX EU (my.okx.com) demo' }),
  Object.freeze({ eea: false, demo: true, label: 'OKX global (okx.com) demo' }),
])

/**
 * The venue codes that mean "you asked the wrong OKX", rather than "your key is bad".
 *
 * Both are aim failures and neither is a reason to touch the credential: `50119` is the
 * platform that has never heard of the key, `50101` is the platform that has but under a
 * different environment. Every other code — bad signature, bad passphrase, clock, IP,
 * permissions — is about the key itself and probing would only spend three more requests
 * collecting the same refusal.
 */
export const AIM_CODES = Object.freeze(['50101', '50119'])

/**
 * Find which OKX the desk's key actually lives on.
 *
 * The trader should not have to work this out from two checkboxes and an error code. The
 * desk can simply ask: `account/config` is authenticated, cheap and side-effect free, so
 * four of them settle the question outright. They go out together rather than in turn —
 * three of the four will fail, and doing that serially would spend four round trips to
 * learn what one takes.
 *
 * @param {object} [options] - injectable plumbing, forwarded to `okxRequest`.
 * @returns {Promise<{eea: boolean, demo: boolean, label: string}|null>} the universe that
 *   accepted the key, or null when none did.
 */
export async function probeKeyUniverses(options = {}) {
  const results = await Promise.all(
    OKX_UNIVERSES.map((universe) =>
      okxRequest({
        path: OKX_CONFIG_PATH,
        ...options,
        // After the spread, not before: an `options` carrying the desk's own aim (or a
        // test's) must not override the very thing this function varies.
        base: okxProxyFor(universe.eea),
        demo: universe.demo,
      }).then((result) => (result.ok ? universe : null)),
    ),
  )

  return results.find(Boolean) ?? null
}

/**
 * Point the desk at the universe the key was found in.
 *
 * Written to settings rather than held in a module variable, because the aim is read by
 * the sockets, the REST base and the settings card, and because it must survive the reload
 * — the persist watcher saves the settings branch, so correcting it once corrects it for
 * good.
 *
 * No confirmation step, deliberately. The desk has just proved which platform the key is
 * on; asking the trader to confirm a fact would be a dialog in front of a fill.
 *
 * @param {{eea: boolean, demo: boolean}} universe - where the key was found.
 * @returns {{eea: boolean, demo: boolean}} the universe, unchanged.
 */
export function applyKeyAim(universe) {
  setValue(PATHS.settings.okxEea, universe?.eea === true)
  setValue(PATHS.settings.okxDemo, universe?.demo === true)
  return universe
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
  const verdict = keyVerdict(result, demoTrading(), eeaAccount())

  // A wrong-aim refusal is the one failure the desk can resolve without the trader, so it
  // does: telling somebody their key "does not match current environment" and leaving them
  // to guess which of four environments is meant is a support ticket, not an error message.
  if (verdict.ok || !AIM_CODES.includes(verdict.code)) return verdict

  const found = await probeKeyUniverses(options)
  if (!found) return verdict

  applyKeyAim(found)
  return {
    ok: true,
    code: '0',
    reason: `OKX keys accepted — re-aimed to ${found.label}`,
    fix: '',
  }
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
  // whole point of spending a request on this is to say the next move instead. On success
  // the verdict's own reason is used rather than a fixed string, because a success that
  // followed a re-aim has something to report — which OKX the desk is now talking to.
  pushToast(
    verdict.ok ? verdict.reason || 'OKX keys verified' : verdict.fix || verdict.reason,
    verdict.ok ? 'success' : 'warn',
  )

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
