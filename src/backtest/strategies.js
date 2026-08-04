import { noopStrategy } from '../strategy/builtin/noop.js'
import { momentumStrategy } from '../strategy/builtin/momentum.js'
import { vwapRevertStrategy } from '../strategy/builtin/vwap-revert.js'
import { spreadCaptureStrategy } from '../strategy/builtin/spread-capture.js'
import { bookImbalanceStrategy } from '../strategy/builtin/book-imbalance.js'
import { tapePressureStrategy } from '../strategy/builtin/tape-pressure.js'
import { rangeFadeStrategy } from '../strategy/builtin/range-fade.js'
import { openDriveStrategy } from '../strategy/builtin/open-drive.js'
import { volSqueezeStrategy } from '../strategy/builtin/vol-squeeze.js'

/**
 * The strategies a backtest can run — the same objects the desk runs, imported by a route
 * that survives inside a Worker.
 *
 * `strategy/engine.js` is the desk's front door and reaches `sandbox.js`, which reaches
 * `app/engine.js`, which imports the bare specifier `spektrum`. That resolves in the
 * document through the importmap and in Vitest through the devDependency — but **a module
 * worker gets neither**, so importing the barrel here would make the worker fail to load
 * with a bare-specifier error and nothing else. Hence a second, flatter list: every import
 * below resolves to a relative path all the way down.
 *
 * `compositeStrategy` is deliberately absent. It blends the *live* signals other runs are
 * publishing right now, which is a desk concept — there is no such thing as a composite of
 * a recording, and a composite in a backtest would silently score as flat forever.
 */

/** Every strategy that can be scored against a recording. */
export const BACKTEST_STRATEGIES = Object.freeze([
  momentumStrategy,
  vwapRevertStrategy,
  spreadCaptureStrategy,
  bookImbalanceStrategy,
  tapePressureStrategy,
  rangeFadeStrategy,
  openDriveStrategy,
  volSqueezeStrategy,
  noopStrategy,
])

/**
 * Look a strategy up by id.
 *
 * @param {string} id - the strategy id.
 * @param {object[]} [catalog] - the list to search.
 * @returns {object|null} the strategy, or null when the id is not one of ours.
 */
export function findBacktestStrategy(id, catalog = BACKTEST_STRATEGIES) {
  const wanted = String(id ?? '')
  if (!wanted) return null

  // Null rather than a fallback to the first entry: a typo'd id must fail the run
  // visibly, not quietly score a different strategy under the requested name.
  return (Array.isArray(catalog) ? catalog : []).find((s) => String(s?.id) === wanted) ?? null
}

/**
 * Describe the catalog for the launcher's picker.
 *
 * @param {object[]} [catalog] - the list to describe.
 * @returns {{id: string, name: string}[]} one row per strategy.
 */
export function backtestStrategyOptions(catalog = BACKTEST_STRATEGIES) {
  return (Array.isArray(catalog) ? catalog : []).map((s) => ({
    id: String(s?.id ?? ''),
    name: String(s?.name ?? s?.id ?? ''),
  }))
}
