import { createLogger } from '../../utils/log.js'
import { okxPublicBase } from './region.js'
import { OKX_ENDPOINTS } from './endpoints.js'

/**
 * The venue's clock, not the browser's.
 *
 * OKX rejects any signed request whose timestamp is more than **30 seconds** from its own
 * clock, and it rejects it as a flat `401` that reads exactly like a bad API key. A laptop
 * that has been asleep, a VM with no NTP, a phone that drifted — any of them produce an
 * endless stream of 401s on a key that is perfectly valid, and nothing on screen says so.
 *
 * So the desk measures the offset once and signs against it. `/api/v5/public/time` is
 * unauthenticated, which is what makes this fixable before the first signed call rather
 * than after it.
 *
 * The offset is a plain module variable rather than state: it is read on the signing path
 * of every request, `setValue` lands next tick, and a clock correction that arrived a frame
 * late would sign the frame's requests with the number it was correcting.
 */

const log = createLogger('okx-clock')

/** OKX's own clock, unauthenticated. Named here for callers; defined with every other
 *  path in endpoints.js. */
export const OKX_TIME_PATH = OKX_ENDPOINTS.time

/** Past this much drift the browser clock alone would have been rejected. */
export const DRIFT_WARN_MS = 20000

/** venueNow - browserNow, in ms. */
let offsetMs = 0

/**
 * The offset implied by one probe.
 *
 * @param {number} venueMs - the venue's clock.
 * @param {number} sentAt - when the probe was sent.
 * @param {number} gotAt - when the reply landed.
 * @returns {number} venue minus browser, round-trip corrected.
 */
export function clockOffset(venueMs, sentAt, gotAt) {
  const venue = Number(venueMs)
  const from = Number(sentAt)
  const to = Number(gotAt)
  if (!Number.isFinite(venue) || venue <= 0 || !Number.isFinite(from) || !Number.isFinite(to)) return 0

  // The venue stamped its reply somewhere in the middle of the round trip, so the browser
  // instant to compare against is the midpoint — not `gotAt`, which would fold the whole
  // latency into the offset and over-correct by half the RTT on every sync.
  return Math.round(venue - (from + to) / 2)
}

/**
 * Read the offset currently applied.
 *
 * @returns {number} venue minus browser, in ms.
 */
export function clockDrift() {
  return offsetMs
}

/**
 * Apply a measured offset.
 *
 * @param {number} ms - venue minus browser.
 * @returns {number} the offset now in force.
 */
export function setClockOffset(ms) {
  const next = Number(ms)
  offsetMs = Number.isFinite(next) ? next : 0

  if (Math.abs(offsetMs) >= DRIFT_WARN_MS) {
    // Worth saying out loud: at this drift the unsynced desk was signing requests OKX
    // would have refused, and the trader would have read those refusals as bad keys.
    log.warn(`clock is ${Math.round(offsetMs / 1000)}s off OKX — signing against the venue`)
  }

  return offsetMs
}

/**
 * The moment to sign with.
 *
 * @param {() => number} [browserNow] - injectable clock.
 * @returns {number} epoch ms on the venue's clock.
 */
export function okxNow(browserNow = Date.now) {
  return browserNow() + offsetMs
}

/**
 * Measure the desk's drift against OKX.
 *
 * @param {{fetch?: Function, now?: () => number, base?: string}} [deps] - injectable plumbing.
 * @returns {Promise<number>} the offset now in force.
 */
export async function syncOkxClock(deps = {}) {
  // `in` rather than `??`: passing `{fetch: null}` means "do not reach the network", and
  // `null ?? globalThis.fetch` falls straight through to the real one — which is a test
  // that quietly makes a live call, and a caller that cannot switch this off.
  const fetchImpl = 'fetch' in deps ? deps.fetch : globalThis.fetch
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now()
  // Always the global platform: /public/time is unauthenticated, both platforms are NTP,
  // and the EU hosts send no CORS headers — asking them from a browser fails before the
  // clock is ever read. The venue that lets a browser ask is the right one to ask.
  const base = String(deps.base ?? okxPublicBase())
  if (typeof fetchImpl !== 'function') return offsetMs

  const sentAt = now()
  try {
    const response = await fetchImpl(`${base}${OKX_TIME_PATH}`)
    const body = await response.json()
    const venueMs = Number(body?.data?.[0]?.ts)
    // An unreadable reply leaves the offset alone rather than zeroing it: a previously
    // measured correction is better than none, and a failed probe is not evidence the
    // clocks agree.
    if (!Number.isFinite(venueMs) || venueMs <= 0) return offsetMs

    return setClockOffset(clockOffset(venueMs, sentAt, now()))
  } catch (err) {
    log.warn(`clock sync failed: ${err?.message ?? err}`)
    return offsetMs
  }
}

/** Forget the measured offset (tests). */
export function resetClock() {
  offsetMs = 0
  return true
}
