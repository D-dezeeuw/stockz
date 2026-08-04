/**
 * The headless state container a backtest runs inside.
 *
 * A backtest must not be able to touch the desk. Not "should not" — *must not*: a run
 * scoring a strategy over yesterday's tape that wrote a position, a signal or a focus into
 * live state would move real numbers on a screen somebody is trading from, and the failure
 * would look like a feed glitch rather than a backtest.
 *
 * So the sandbox is a container of its own with the same shape of surface the desk's engine
 * offers — dotted-path `get`/`set`, a `snapshot()` for the end-of-run comparison phase
 * F27.10 hashes — and *no* connection to it. It is deliberately not Spektrum: a module
 * worker gets no importmap, so `spektrum` cannot resolve inside one, and a state container
 * this small is a dozen lines rather than a dependency.
 *
 * `set` lands **immediately**, unlike the desk's `setValue`. There is no frame to batch
 * for and nothing rendering, and a value that appeared a tick late would make a strategy
 * read its own scratchpad stale — the exact class of bug the desk's next-tick semantics
 * cause on the main thread.
 */

/**
 * Split a dotted path, tolerating the empty and the malformed.
 *
 * @param {string} path - e.g. 'run.signals'.
 * @returns {string[]} the segments, empty when there is no usable path.
 */
export function pathSegments(path) {
  return String(path ?? '')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * Create an isolated headless state container.
 *
 * @param {object} [seed] - initial contents, deep-copied so the caller keeps no handle.
 * @returns {{get: Function, set: Function, snapshot: Function, clear: Function}} the sandbox.
 */
export function createSandbox(seed = {}) {
  // Copied rather than adopted: sharing the seed object would let a second run started
  // from the same config see the first run's writes.
  let store = seed && typeof seed === 'object' ? JSON.parse(JSON.stringify(seed)) : {}

  const get = (path, fallback = undefined) => {
    const segments = pathSegments(path)
    // An empty path is not a path. Returning the whole store for `get('')` would make a
    // sloppy read succeed with everything, while `set('')` is a no-op — one of the two
    // would eventually be relied on.
    if (segments.length === 0) return fallback

    let node = store
    for (const segment of segments) {
      if (node === null || typeof node !== 'object') return fallback
      node = node[segment]
    }
    return node === undefined ? fallback : node
  }

  const set = (path, value) => {
    const segments = pathSegments(path)
    if (segments.length === 0) return value

    let node = store
    for (const segment of segments.slice(0, -1)) {
      // Intermediate objects are created on the way down, so a strategy can write
      // `run.stats.wins` without the run having declared `stats` first.
      if (node[segment] === null || typeof node[segment] !== 'object') node[segment] = {}
      node = node[segment]
    }
    node[segments.at(-1)] = value

    return value
  }

  return {
    get,
    set,
    // A deep copy on the way out too: the snapshot is what a run is compared against
    // later, and one that aliased the live store would change under the comparison.
    snapshot: () => JSON.parse(JSON.stringify(store)),
    clear: () => {
      store = {}
      return true
    },
  }
}

/**
 * Call one strategy hook, turning a throw into data.
 *
 * The desk's `safeInvoke` does this too, but it also tallies quarantines into live state,
 * which is the one thing a backtest may not touch. Same contract, no side effects.
 *
 * @param {object} strategy - the strategy.
 * @param {string} hook - 'init', 'onTick' or 'onCandle'.
 * @param {object} ctx - the strategy context.
 * @param {object} payload - the tick or candle.
 * @returns {{ok: boolean, value: any, error: string}} the outcome.
 */
export function invokeStrategy(strategy, hook, ctx, payload) {
  const fn = strategy?.[hook]
  // A missing hook is not an error: `init` is optional by contract, and a backtest that
  // counted its absence as a failure would bench every stateless strategy on tick one.
  if (typeof fn !== 'function') return { ok: true, value: null, error: '' }

  try {
    return { ok: true, value: fn(ctx, payload), error: '' }
  } catch (err) {
    // The run continues. One malformed tick in ninety thousand should cost that tick,
    // not the score.
    return { ok: false, value: null, error: String(err?.message ?? err) }
  }
}
