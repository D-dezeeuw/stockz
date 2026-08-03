/**
 * STOCKZ — hyper-scalping micro-trading desk.
 *
 * Boot order (see .claude/context/architecture.md):
 *   settings (restore) -> keys (vault) -> feeds -> bindDOM() -> run()
 *
 * Phase 1 only proves the shell boots; phase 2 replaces the body of mountApp()
 * with the Spektrum bootstrap.
 */

import { appVersion } from './app/version.js'
import { engineInfo } from './app/engine.js'
import { keyPresenceBanner } from './utils/env.js'
import { createLogger, mountLogOverlay, captureGlobalErrors } from './utils/log.js'

export const APP_NAME = 'STOCKZ'

/**
 * Mount the app into its root element and reveal it.
 *
 * @param {Document} [doc] - document to mount into; defaults to the global document.
 * @returns {Element|null} the mounted root element, or null when it is absent.
 */
export function mountApp(doc = globalThis.document) {
  const root = doc && doc.getElementById ? doc.getElementById('app') : null
  if (!root) return null

  root.textContent = `${APP_NAME} booting`
  root.removeAttribute('data-cloak')
  return root
}

/**
 * Mount now if the document is ready, otherwise once DOMContentLoaded fires.
 *
 * @param {Document} [doc] - document to boot against; defaults to the global document.
 * @returns {Element|null} the mounted root, or null when mounting was deferred.
 */
export function autoMount(doc = globalThis.document) {
  if (!doc) return null

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', () => mountApp(doc), { once: true })
    return null
  }

  return mountApp(doc)
}

const log = createLogger('boot')

captureGlobalErrors()
mountLogOverlay()
const engine = engineInfo()
log.info(
  `${APP_NAME} v${appVersion()} | engine ${engine.name}@${engine.version} | ${keyPresenceBanner()}`,
)
autoMount()
