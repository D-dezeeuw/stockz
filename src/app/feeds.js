import { startOkxFeed } from '../venues/okx/live.js'
import { startProbe, probeEtoro } from '../hud/rtt.js'
import { hasKeys } from '../venues/vault.js'
import { appState, watch } from './engine.js'
import { PATHS } from '../state/paths.js'
import { createLogger } from '../utils/log.js'

const log = createLogger('feeds')

/**
 * Starting the venue feeds.
 *
 * Separated from `bootstrap` so the boot sequence stays readable and so a test can boot
 * the desk without opening a socket — which is most of them.
 *
 * The public OKX channels (trades, books, tickers) need no credentials, so the desk
 * shows live prices before any key is entered. Keys gate *trading*, not *seeing*, and a
 * dashboard that shows nothing until you authenticate is one nobody leaves open.
 */

/**
 * Whether a feed should be started in this environment.
 *
 * @param {{feeds?: boolean, socketFactory?: Function}} options - boot options.
 * @param {object} [scope] - the global scope, for the WebSocket check.
 * @returns {boolean} true when a socket can and should be opened.
 */
export function shouldConnect(options = {}, scope = globalThis) {
  if (options.feeds === false) return false
  // An injected socket or factory means the caller supplied its own transport — a test
  // double, or a mock venue.
  if (options.socket || options.socketFactory) return true
  // Opt-in, not opt-out. Node 22 ships a global WebSocket, so an environment check alone
  // would have every `bootstrap()` in the suite dial OKX for real. The entry point asks
  // for feeds explicitly; nothing else gets them by accident.
  if (options.feeds !== true) return false

  return typeof scope?.WebSocket === 'function'
}

/**
 * Start every venue feed the environment supports.
 *
 * @param {{feeds?: boolean, socket?: object, socketFactory?: Function,
 *   raf?: Function}} [options] - boot options.
 * @returns {{okx: object|null, stop: () => void}} the running feeds.
 */
export function connectFeeds(options = {}) {
  if (!shouldConnect(options)) {
    log.info('feeds not started (no transport, or disabled for this boot)')
    return { okx: null, stop: () => {} }
  }

  const okx = startOkxFeed({
    socket: options.socket,
    raf: options.raf,
    focus: () => String(appState.market?.focus ?? ''),
    options: feedOptions(),
  })

  // Re-subscribe when the trader changes instrument. `focusOn` is idempotent, so the
  // watch firing on unrelated writes costs a string comparison.
  const unwatch = watch([PATHS.market.focus], () =>
    okx.focusOn(String(appState.market?.focus ?? '')),
  )

  // Venue lag is measured continuously, jittered so the two probes never align.
  const stopProbe = startProbe('etoro', () => probeEtoro())

  return {
    okx,
    // Reported so the settings drawer can say why trading is unavailable without
    // reaching into the vault itself.
    authenticated: hasKeys('okx'),
    stop: () => {
      unwatch?.()
      stopProbe()
      okx.stop()
    },
  }
}

/**
 * The view options the feed flushes with, read from settings.
 *
 * @returns {{minSize: number, multiplier: number, depth: number}} the options.
 */
export function feedOptions() {
  const focus = String(appState.market?.focus ?? '')

  return {
    minSize: Number(appState.settings?.tapeFloors?.[focus]) || 0,
    multiplier: Number(appState.settings?.whaleMultiplier) || 4,
    depth: Number(appState.settings?.bookDepth) || 10,
  }
}
