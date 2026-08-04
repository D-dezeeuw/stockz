/**
 * STOCKZ — hyper-scalping micro-trading desk.
 *
 * Entry point. Diagnostics come up first so anything that fails during boot is visible,
 * then the reactive desk is started (see src/app/bootstrap.js).
 */
import { appVersion } from './app/version.js'
import { engineInfo } from './app/engine.js'
import { bootstrap } from './app/bootstrap.js'
import { keyPresenceBanner } from './utils/env.js'
import { createLogger, mountLogOverlay, captureGlobalErrors } from './utils/log.js'

export const APP_NAME = 'STOCKZ'

/**
 * Boot now if the document is ready, otherwise once DOMContentLoaded fires.
 *
 * @param {Document} [doc] - document to boot against.
 * @param {(options: object) => unknown} [boot] - injectable bootstrap, for tests.
 * @returns {unknown} the bootstrap result, or null when boot was deferred.
 */
export function bootWhenReady(doc = globalThis.document, boot = bootstrap) {
  if (!doc) return null

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', () => boot({ doc, now: Date.now(), feeds: true }), {
      once: true,
    })
    return null
  }

  // `feeds: true` only here: the live socket is a property of *running the app*, not of
  // booting the module, so nothing under test dials a venue by accident.
  return boot({ doc, now: Date.now(), feeds: true })
}

const log = createLogger('boot')
const engine = engineInfo()

captureGlobalErrors()
mountLogOverlay()
log.info(
  `${APP_NAME} v${appVersion()} | engine ${engine.name}@${engine.version} | ${keyPresenceBanner()}`,
)

bootWhenReady()
