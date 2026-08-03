import { setValue, bindDOM, run, tick, checkpoint, engineInfo } from './engine.js'
import { initialState } from '../state/initial.js'
import { appVersion } from './version.js'

/**
 * Bring the desk up: seed state, bind the DOM to it, take the boot checkpoint, and
 * start the tick pump.
 *
 * Order matters. State is written *before* `bindDOM` so the very first paint already
 * carries real values — binding an empty tree would flash placeholders at a trader who
 * is watching prices. `run()` starts the rAF pump last, once there is something to
 * paint.
 *
 * @param {{doc?: Document, now?: number, autoRun?: boolean}} [options]
 *   `autoRun: false` seeds and binds without starting the rAF loop — what tests want,
 *   since an rAF pump never finishes on its own.
 * @returns {{paths: string[], cleanup: () => void}} the seeded paths and a DOM unbind.
 */
export function bootstrap(options = {}) {
  const { doc = globalThis.document, now = 0, autoRun = true } = options

  const state = initialState({
    version: appVersion(),
    engine: engineInfo(doc).version,
    ts: now,
  })

  for (const [path, value] of Object.entries(state)) setValue(path, value)

  const cleanup = bindDOM(doc)
  tick()
  revealApp(doc)
  checkpoint('boot', { version: appVersion() })

  if (autoRun) run()

  return { paths: Object.keys(state), cleanup }
}

/**
 * Drop `data-cloak` once bindings hold real values, revealing the desk.
 *
 * Cloaked elements are hidden by CSS until this runs, so a trader never sees raw
 * `{{app.name}}` mustaches on a slow load.
 *
 * @param {Document} [doc] - document to uncloak.
 * @returns {number} how many elements were revealed.
 */
export function revealApp(doc = globalThis.document) {
  const cloaked = doc?.querySelectorAll?.('[data-cloak]')
  if (!cloaked) return 0

  for (const el of cloaked) el.removeAttribute('data-cloak')
  return cloaked.length
}
