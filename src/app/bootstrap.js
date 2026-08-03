import { setValue, bindDOM, run, tick, checkpoint, engineInfo } from './engine.js'
import { initialState } from '../state/initial.js'
import { registerCoreActions, actionNames } from '../actions/registry.js'
import { registerDerived } from '../state/derived.js'
import { registerSystems } from '../state/systems.js'
import { mountDevtools } from './devtools.js'
import { wireEngineErrors } from '../ui/toast.js'
import { registerFormatters } from '../ui/format-bindings.js'
import { seedBlocks } from '../blocks/seed.js'
import { registerLayoutActions, observeLayout } from '../blocks/layout.js'
import { registerHeaderActions } from '../ui/header.js'
import { registerThemeActions, applyTheme, preferredTheme } from '../ui/theme.js'
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
 * @returns {{paths: string[], actions: string[], derived: string[], cleanup: () => void}}
 *   seeded paths, actions and derived paths registered at boot, and a DOM unbind.
 */
export function bootstrap(options = {}) {
  const { doc = globalThis.document, now = 0, autoRun = true } = options

  const state = initialState({
    version: appVersion(),
    engine: engineInfo(doc).version,
    ts: now,
  })

  for (const [path, value] of Object.entries(state)) setValue(path, value)

  // Actions and derivations must exist before bindDOM: data-fn attributes would bind to
  // nothing, and derived paths would render as blanks on the first paint.
  // Formatters must exist before bindDOM: a binding calling fmt.price() would otherwise
  // throw on the first paint.
  registerFormatters()
  registerCoreActions()
  registerLayoutActions()
  registerHeaderActions()
  registerThemeActions()
  applyTheme(doc?.documentElement?.getAttribute?.('data-theme') || preferredTheme(), doc)
  const derived = registerDerived()
  wireEngineErrors()

  registerSystems({ now: makeBootClock(now) })
  seedBlocks()

  const cleanup = bindDOM(doc)
  tick()
  observeLayout({ doc })
  revealApp(doc)
  checkpoint('boot', { version: appVersion() })

  // Dev only, and never awaited: instrumentation must not delay the first paint.
  mountDevtools()

  if (autoRun) run()

  return { paths: Object.keys(state), actions: actionNames(), derived, cleanup }
}

/**
 * The clock the desk's systems read.
 *
 * A fixed timestamp pins time for tests and replay; anything else follows the wall
 * clock. Extracted rather than inlined so both paths are reachable by one test — an
 * inline arrow here is invisible to the coverage gate.
 *
 * @param {number} [fixed] - pinned epoch ms; 0 or omitted means live time.
 * @returns {() => number} the clock function.
 */
export function makeBootClock(fixed) {
  return () => (Number.isFinite(fixed) && fixed > 0 ? fixed : Date.now())
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
