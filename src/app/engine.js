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
  setValue,
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
