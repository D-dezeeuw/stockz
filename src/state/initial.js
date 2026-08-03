import { APP_VERSION } from '../app/version.js'

/**
 * The state tree the desk boots into.
 *
 * Returned flat (dotted paths → values) because that is exactly how Spektrum records
 * writes: the bootstrap can replay it with one `setValue` per entry, and a test can
 * assert the shape without walking objects.
 *
 * A **factory**, not a shared constant: every call returns a fresh tree, so a reset or
 * a second boot in tests can never inherit a mutated object from the last one.
 *
 * Namespaces (see .claude/context/architecture.md):
 *   app.*      identity of the running build
 *   ui.*       what the trader is looking at
 *   settings.* the only branch that persists to localStorage
 *   market.*   live venue data — never persisted
 *   trade.*    orders, positions, PnL
 *   strategy.* registered strategies and their signals
 *
 * API keys are deliberately absent: state is serialized into history and journal
 * exports, so credentials live only in the in-memory vault.
 *
 * @param {{version?: string, engine?: string, ts?: number}} [overrides] - boot facts the
 *   caller already knows; anything omitted falls back to a safe default.
 * @returns {Record<string, unknown>} flat path → value map.
 */
export function initialState(overrides = {}) {
  const { version = APP_VERSION, engine = 'unknown', ts = 0 } = overrides

  return {
    // identity
    'app.name': 'STOCKZ',
    'app.version': version,
    'app.engine': engine,
    'app.bootedAt': ts,

    // what is on screen
    'ui.status': 'ready',
    'ui.theme': 'night',
    'ui.section': 'dashboard',
    'ui.modal': '',
    'ui.toasts': [],

    // preferences (persisted branch)
    'settings.theme': 'night',
    'settings.blocks': [],

    // live venue data
    'market.instruments': [],
    'market.focus': '',
    'market.ticks': 0,

    // trading
    'trade.armed': false,
    'trade.mode': 'paper',
    'trade.orders': [],
    'trade.positions': [],
    'trade.dayPnl': 0,

    // strategies
    'strategy.registered': [],
    'strategy.signals': [],
  }
}
