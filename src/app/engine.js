/**
 * The UI engine, behind one local module.
 *
 * Everything in the app imports Spektrum from here rather than from `'spektrum'`
 * directly: one file to change if the engine is ever swapped, pinned or wrapped, and
 * one place to see the full surface the desk actually uses.
 *
 * Resolution differs by environment but the module is identical in all three:
 * the browser resolves the bare specifier through the importmap in index.html (CDN),
 * while Node, Vitest and the Vite dev server resolve the pinned devDependency.
 */
export {
  // state
  appState,
  appStateDelta,
  addValue,
  resetState,
  reset,
  // actions and derivation
  trigger,
  defineFn,
  computed,
  // reactivity
  addSystem,
  removeSystem,
  watch,
  // async
  addAsync,
  refresh,
  // DOM
  bindDOM,
  run,
  tick,
  refs,
  intents,
  findByIntent,
  // history / time-travel — the journal and audit backbone
  history,
  checkpoint,
  replay,
  serialize,
  snapshots,
  forks,
  // introspection and error routing
  describe,
  explain,
  attempt,
  onError,
  onRecord,
  onFork,
} from 'spektrum'

import {
  setValue as engineSetValue,
  appState as engineState,
  appStateDelta as engineDelta,
} from 'spektrum'

/**
 * How deep an unchanged-value comparison will walk before giving up and writing.
 *
 * The desk's state is shallow — the deepest real path is a row inside a list inside a
 * namespace — so this is generous. It exists only so a cyclic or pathological object can
 * never turn a write into an unbounded walk.
 */
export const EQUAL_DEPTH = 6

/**
 * Are these two values the same as far as a binding is concerned?
 *
 * @param {any} a - the value already in state.
 * @param {any} b - the value being written.
 * @param {number} [depth] - remaining depth budget.
 * @returns {boolean} true when a write would change nothing.
 */
export function sameValue(a, b, depth = EQUAL_DEPTH) {
  if (a === b) return true
  // NaN is the one primitive that is not equal to itself, and a NaN rewritten as NaN is
  // still not a change.
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b)
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  // Out of budget means "assume different": writing needlessly is a wasted frame, while
  // skipping a real change is a stale price on screen, and those are not the same mistake.
  if (depth <= 0) return false

  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false
    return a.every((item, i) => sameValue(item, b[i], depth - 1))
  }

  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => sameValue(a[key], b[key], depth - 1))
}

/**
 * Read what a path will hold once this tick drains.
 *
 * The **delta wins where it has an entry**, and getting this wrong is the one way an
 * unchanged-write skip can corrupt state rather than merely save work. Two writes to the
 * same path inside one tick: the first sets `a` into the delta while `appState` still
 * holds `b`; a second write of `b` compared against `appState` alone would look like a
 * no-op, get skipped, and leave `a` in the delta to land — so the desk would end the tick
 * showing the value that was explicitly overwritten.
 *
 * @param {string} path - a dotted state path.
 * @returns {{found: boolean, value: any}} what the path resolves to after the tick.
 */
export function pendingAt(path) {
  const keys = String(path ?? '').split('.')

  const walk = (root) => {
    let node = root
    for (const key of keys) {
      if (node === null || typeof node !== 'object' || !(key in node)) return { found: false, value: undefined }
      node = node[key]
    }
    return { found: true, value: node }
  }

  const queued = walk(engineDelta)
  return queued.found ? queued : walk(engineState)
}

/**
 * Write a value — unless state already holds it.
 *
 * Spektrum's own `setValue` records unconditionally, and the desk leans on that harder
 * than it looks. One animation frame with a tick on it fans out into roughly forty-four
 * writes: the flush writes the bid, a system watching it recomputes the HUD, another the
 * fee tile, another the scoreboard, the bot's status, the alert panel — and almost all of
 * them produce an object *identical* to the one already there.
 *
 * Each of those no-op writes was costing three separate things. It marked the path dirty,
 * so every binding on it re-rendered, and `bindReactive`'s render path deep-copies the
 * whole state tree **per binding** — which is why 40% of the desk's CPU sat in the
 * engine's `deepMerge` and frames ran to 600ms. It appended to `history`, which grew past
 * sixteen thousand entries in a couple of minutes of idling. And it woke every watcher
 * downstream, fanning the same waste out another level.
 *
 * Skipping is safe by definition: a write that does not change the value has nothing to
 * tell a binding. The one thing it costs is the comparison, and comparing a small object
 * is orders of magnitude cheaper than the render it prevents.
 *
 * @param {string} path - a dotted state path.
 * @param {any} value - the value to write.
 * @param {string} [id] - the history label.
 * @returns {boolean} true when the write actually happened.
 */
export function setValue(path, value, id) {
  if (!path) return Boolean(engineSetValue(path, value, id))

  const current = pendingAt(path)
  if (current.found && sameValue(current.value, value)) return false

  engineSetValue(path, value, id)
  return true
}

/** The engine version this app is pinned to; kept equal to the importmap entry. */
export const ENGINE_VERSION = '1.1.0'

/**
 * Which engine build is actually running, read from the page's importmap rather than
 * assumed — a bug report needs the version the browser loaded, not the one we intended.
 *
 * @param {Document} [doc] - document to read the importmap from.
 * @returns {{name: string, version: string, url: string, pinned: boolean}} engine info;
 *   `version` is 'unknown' when no importmap entry is present, and `pinned` is false
 *   unless the URL names an exact x.y.z version.
 */
export function engineInfo(doc = globalThis.document) {
  const fallback = { name: 'spektrum', version: 'unknown', url: '', pinned: false }

  const script = doc?.querySelector?.('script[type="importmap"]')
  if (!script) return fallback

  let url
  try {
    url = JSON.parse(script.textContent || '{}')?.imports?.spektrum ?? ''
  } catch {
    return fallback
  }
  if (!url) return fallback

  const match = /@(\d+(?:\.\d+){0,2})/.exec(url)
  return {
    name: 'spektrum',
    version: match ? match[1] : 'unknown',
    url,
    pinned: /@\d+\.\d+\.\d+/.test(url),
  }
}
