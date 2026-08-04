import { APP_VERSION } from '../app/version.js'
import { PATHS } from './paths.js'
import { defaultSettings } from './settings-schema.js'

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
 * Paths come from the state map in ./paths.js rather than string literals, so a typo
 * cannot invent a silent branch no binding reads.
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
    [PATHS.app.name]: 'STOCKZ',
    [PATHS.app.version]: version,
    [PATHS.app.engine]: engine,
    [PATHS.app.bootedAt]: ts,
    [PATHS.app.clock]: '',
    [PATHS.app.uptime]: 0,
    [PATHS.app.heartbeat]: 0,
    [PATHS.app.serverTime]: 0,
    [PATHS.app.serverTimeStatus]: 'idle',
    [PATHS.app.serverTimeError]: '',

    // what is on screen
    [PATHS.ui.status]: 'ready',
    [PATHS.ui.statusLine]: '',
    [PATHS.ui.theme]: 'night',
    [PATHS.ui.section]: 'dashboard',
    [PATHS.ui.modal]: '',
    [PATHS.ui.toasts]: [],
    [PATHS.ui.columns]: 1,
    [PATHS.ui.density]: 'compact',
    // presence booleans only - actual credentials live in the vault, never in state
    [PATHS.ui.keysPresent]: { okx: false, etoro: false },
    [PATHS.ui.candleInterval]: '1s',
    [PATHS.ui.chordSheet]: [],
    [PATHS.ui.paletteQuery]: '',
    [PATHS.ui.paletteIndex]: 0,
    [PATHS.ui.paletteRows]: [],

    // preferences (the only persisted branch) - defaults come from the schema so the
    // drawer, the migration and reset-to-defaults can never disagree about them
    ...Object.fromEntries(
      Object.entries(defaultSettings()).map(([key, value]) => [`settings.${key}`, value]),
    ),
    [PATHS.settings.presets]: {},
    [PATHS.settings.priceGroups]: {},
    [PATHS.settings.tapeFloors]: {},
    [PATHS.settings.chords]: {},
    [PATHS.settings.watchlists]: [],
    [PATHS.settings.activeListId]: '',

    // live venue data
    [PATHS.market.venues]: { okx: { state: 'dead' }, etoro: { state: 'dead' } },
    [PATHS.market.instruments]: [],
    [PATHS.market.focus]: '',
    [PATHS.market.ticks]: 0,
    [PATHS.market.bid]: 0,
    [PATHS.market.ask]: 0,
    [PATHS.market.quoteTs]: 0,
    [PATHS.market.book]: { bids: [], asks: [], seqId: 0, ts: 0 },
    [PATHS.market.bookStatus]: 'stale',
    [PATHS.market.ladder]: { bids: [], asks: [], spread: null },
    [PATHS.market.tape]: [],
    [PATHS.market.tapeHidden]: 0,
    [PATHS.market.tapeWindow]: { start: 0, end: 40, topPad: 0, bottomPad: 0, autoscroll: true },
    [PATHS.market.whales]: [],
    [PATHS.market.whaleCount]: 0,
    [PATHS.market.imbalance]: { raw: 0, value: 0, bidPct: 50, askPct: 50, side: 'flat', hot: false, label: '0%' },
    [PATHS.market.mid]: 0,
    [PATHS.market.spread]: 0,
    [PATHS.market.spreadBps]: 0,

    // trading
    [PATHS.trade.armed]: false,
    [PATHS.trade.mode]: 'paper',
    [PATHS.trade.orders]: [],
    [PATHS.trade.positions]: [],
    [PATHS.trade.dayPnl]: 0,
    [PATHS.trade.buyingPower]: 0,
    [PATHS.trade.lastReject]: '',
    [PATHS.trade.queue]: [],
    [PATHS.trade.lastOrder]: null,
    [PATHS.trade.lastOrderSummary]: '',
    [PATHS.trade.ticketPrice]: 0,
    [PATHS.trade.ticketSide]: 'buy',
    [PATHS.trade.ticketSize]: 0,
    [PATHS.trade.ticketFlash]: 0,
    [PATHS.trade.ticketSymbol]: '',
    [PATHS.trade.ticketMode]: 'market',
    [PATHS.trade.ticketLimit]: 0,
    [PATHS.trade.ticketSource]: 'market',
    [PATHS.trade.exposure]: 0,
    [PATHS.trade.openOrders]: 0,

    // strategies
    [PATHS.strategy.registered]: [],
    [PATHS.strategy.signals]: [],
  }
}
