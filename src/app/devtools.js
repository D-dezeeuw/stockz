import { describe, serialize, replay, history } from './engine.js'
import { createLogger } from '../utils/log.js'
import { describeStrategies } from '../strategy/engine.js'

/**
 * Developer instrumentation — live in dev, absent in production.
 *
 * Spektrum's devtools give a state scrubber and time-travel over the same history the
 * trade journal is built on, which makes "why did that order go out" answerable while
 * developing. None of it should reach a trader: it costs bytes on a page whose whole
 * pitch is latency, and it exposes internals a live desk has no use for.
 *
 * The gate is an explicit `isDev` argument defaulting to Vite's DEV flag, so the
 * decision is testable rather than a build-time mystery.
 */

const log = createLogger('devtools')

/**
 * Load the devtools companion.
 *
 * Indirection on purpose: it keeps the dynamic import out of the mount logic, so tests
 * can supply a fake companion without reaching for a CDN, and so a companion that is
 * missing in one environment cannot take the mount path down with it.
 *
 * @returns {Promise<object>} the companion module.
 */
export async function loadCompanion() {
  return import('spektrum/devtools')
}

/**
 * Mount the devtools panel, in dev only.
 *
 * @param {{isDev?: boolean, loader?: () => Promise<object>, doc?: Document}} [options]
 * @returns {Promise<{mounted: boolean, reason?: string}>} what happened, so the caller
 *   (and the test) can assert the production path really is a no-op.
 */
export async function mountDevtools(options = {}) {
  const {
    isDev = Boolean(import.meta.env?.DEV),
    loader = loadCompanion,
    doc = globalThis.document,
  } = options

  if (!isDev) return { mounted: false, reason: 'production' }
  if (!doc?.createElement) return { mounted: false, reason: 'no-document' }

  try {
    const mod = await loader()
    const mount = mod?.mount ?? mod?.default
    if (typeof mount !== 'function') return { mounted: false, reason: 'no-mount-export' }

    mount({ scrubber: true, inspect: true })
    log.info('devtools mounted')
    return { mounted: true }
  } catch (err) {
    // Devtools failing must never stop the desk from booting.
    log.warn(`devtools unavailable: ${err?.message ?? err}`)
    return { mounted: false, reason: 'load-failed' }
  }
}

/**
 * Snapshot the running desk for a bug report: state, history depth and the manifest of
 * everything the engine knows about.
 *
 * @returns {{state: object, historyLength: number, json: string}} the dump.
 */
export function devDumpState() {
  const manifest = describe()

  return {
    state: manifest.state,
    historyLength: history.length,
    // The strategies the desk knows about, with the hooks each one actually implements —
    // "why is my strategy not firing" is answered here rather than by reading its module.
    strategies: describeStrategies(),
    json: serialize(),
  }
}

/**
 * Rewind the desk to a point in its own history — the same primitive the journal's
 * replay scrubber uses in phase 25.
 *
 * Spektrum replays entries `[0, index)`, so `index` is how many recorded mutations to
 * apply — `history.length` is "all of them", i.e. the present.
 *
 * @param {number} index - how many history entries to replay.
 * @returns {boolean} true when the index was in range and applied.
 */
export function devReplayTo(index) {
  if (!Number.isInteger(index) || index < 0 || index > history.length) return false

  replay(index)
  return true
}
