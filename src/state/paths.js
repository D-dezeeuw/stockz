/**
 * The state map: every namespace and every path the desk writes.
 *
 * Thirty phases of features share one state tree, so paths are declared here instead of
 * being spelled as string literals at call sites. A typo in `'trade.dyaPnl'` would
 * otherwise create a silent second branch that no binding reads and no test catches —
 * the kind of bug that surfaces as "the PnL tile stopped updating" mid-session.
 *
 * Namespaces:
 *   app.*       identity of the running build — set once at boot
 *   ui.*        what the trader is looking at right now
 *   settings.*  preferences; the ONLY branch persisted to localStorage
 *   market.*    live venue data; never persisted, never in a settings export
 *   trade.*     orders, positions, PnL, arm state
 *   strategy.*  registered strategies and their live signals
 *
 * Credentials are absent on purpose: state flows into history, `serialize()` and journal
 * exports, so keys live only in the in-memory vault.
 */

/** Every legal top-level namespace. */
export const NAMESPACES = Object.freeze([
  'app',
  'ui',
  'settings',
  'market',
  'trade',
  'strategy',
])

/** Namespaces that survive a reload (written to localStorage by spektrum/persist). */
export const PERSISTED_NAMESPACES = Object.freeze(['settings'])

/** Canonical state paths, grouped by namespace. */
export const PATHS = Object.freeze({
  app: Object.freeze({
    name: 'app.name',
    version: 'app.version',
    engine: 'app.engine',
    bootedAt: 'app.bootedAt',
    clock: 'app.clock',
    uptime: 'app.uptime',
    heartbeat: 'app.heartbeat',
    serverTime: 'app.serverTime',
    serverTimeStatus: 'app.serverTimeStatus',
    serverTimeError: 'app.serverTimeError',
  }),
  ui: Object.freeze({
    status: 'ui.status',
    statusLine: 'ui.statusLine',
    theme: 'ui.theme',
    section: 'ui.section',
    modal: 'ui.modal',
    toasts: 'ui.toasts',
    columns: 'ui.columns',
    density: 'ui.density',
    keysPresent: 'ui.keysPresent',
    candleInterval: 'ui.candleInterval',
    chordSheet: 'ui.chordSheet',
    paletteQuery: 'ui.paletteQuery',
    paletteIndex: 'ui.paletteIndex',
    paletteRows: 'ui.paletteRows',
    scope: 'ui.scope',
    pnlPulse: 'ui.pnlPulse',
    pnlPulseAt: 'ui.pnlPulseAt',
    hud: 'ui.hud',
    rtt: 'ui.rtt',
    slippage: 'ui.slippage',
    spreadAlert: 'ui.spreadAlert',
    session: 'ui.session',
    fees: 'ui.fees',
    hudRow: 'ui.hudRow',
    strategyForm: 'ui.strategyForm',
    compositeWeights: 'ui.compositeWeights',
    captureFor: 'ui.captureFor',
    capturePreview: 'ui.capturePreview',
  }),
  settings: Object.freeze({
    theme: 'settings.theme',
    blocks: 'settings.blocks',
    presets: 'settings.presets',
    watchlists: 'settings.watchlists',
    activeListId: 'settings.activeListId',
    soundEnabled: 'settings.soundEnabled',
    defaultSize: 'settings.defaultSize',
    sizePresets: 'settings.sizePresets',
    priceStep: 'settings.priceStep',
    defaultMode: 'settings.defaultMode',
    maxDailyLoss: 'settings.maxDailyLoss',
    maxPosition: 'settings.maxPosition',
    favourites: 'settings.favourites',
    debugCharts: 'settings.debugCharts',
    bookDepth: 'settings.bookDepth',
    imbalanceThreshold: 'settings.imbalanceThreshold',
    whaleMultiplier: 'settings.whaleMultiplier',
    priceGroups: 'settings.priceGroups',
    tapeFloors: 'settings.tapeFloors',
    qtyPresets: 'settings.qtyPresets',
    volume: 'settings.volume',
    maxBurst: 'settings.maxBurst',
    maxDeviationBps: 'settings.maxDeviationBps',
    sessionStartUtc: 'settings.sessionStartUtc',
    spreadLimitBps: 'settings.spreadLimitBps',
    tradesPerHourTarget: 'settings.tradesPerHourTarget',
    compactHud: 'settings.compactHud',
    strategyParams: 'settings.strategyParams',
    activePresets: 'settings.activePresets',
    customPresets: 'settings.customPresets',
    chords: 'settings.chords',
  }),
  market: Object.freeze({
    venues: 'market.venues',
    instruments: 'market.instruments',
    focus: 'market.focus',
    ticks: 'market.ticks',
    bid: 'market.bid',
    ask: 'market.ask',
    quoteTs: 'market.quoteTs',
    tickSize: 'market.tickSize',
    lotSize: 'market.lotSize',
    instrumentMeta: 'market.instrumentMeta',
    book: 'market.book',
    ladder: 'market.ladder',
    tape: 'market.tape',
    tapeHidden: 'market.tapeHidden',
    tapeWindow: 'market.tapeWindow',
    bookStatus: 'market.bookStatus',
    imbalance: 'market.imbalance',
    whales: 'market.whales',
    whaleCount: 'market.whaleCount',
    levels: 'market.levels',
    // derived (written by computed, never by hand)
    mid: 'market.mid',
    spread: 'market.spread',
    spreadBps: 'market.spreadBps',
  }),
  trade: Object.freeze({
    armed: 'trade.armed',
    mode: 'trade.mode',
    orders: 'trade.orders',
    positions: 'trade.positions',
    dayPnl: 'trade.dayPnl',
    pnl: 'trade.pnl',
    ledger: 'trade.ledger',
    score: 'trade.score',
    dayTotal: 'trade.dayTotal',
    dayLabel: 'trade.dayLabel',
    equityPath: 'trade.equityPath',
    buyingPower: 'trade.buyingPower',
    lastReject: 'trade.lastReject',
    queue: 'trade.queue',
    lastOrder: 'trade.lastOrder',
    lastOrderSummary: 'trade.lastOrderSummary',
    ticketPrice: 'trade.ticketPrice',
    ticketSide: 'trade.ticketSide',
    ticketSize: 'trade.ticketSize',
    ticketFlash: 'trade.ticketFlash',
    ticketSymbol: 'trade.ticketSymbol',
    ticketMode: 'trade.ticketMode',
    ticketLimit: 'trade.ticketLimit',
    ticketSource: 'trade.ticketSource',
    // derived
    exposure: 'trade.exposure',
    openOrders: 'trade.openOrders',
  }),
  strategy: Object.freeze({
    registered: 'strategy.registered',
    running: 'strategy.running',
    quarantined: 'strategy.quarantined',
    signals: 'strategy.signals',
  }),
})

/**
 * Compose a dotted state path from segments, validating the namespace.
 *
 * Used where a path is dynamic — per-instrument or per-order branches that cannot be
 * enumerated up front, e.g. `buildPath('market', 'book', 'BTC-USDT')`.
 *
 * @param {string} namespace - a member of NAMESPACES.
 * @param {...string} segments - further path segments; empty ones are dropped.
 * @returns {string} the dotted path.
 * @throws {Error} when the namespace is not one of NAMESPACES.
 */
export function buildPath(namespace, ...segments) {
  assertKnownNamespace(namespace)
  return [namespace, ...segments.filter((s) => s !== '' && s !== null && s !== undefined)].join(
    '.',
  )
}

/**
 * Guard that a path or namespace belongs to the declared state map.
 *
 * @param {string} path - a namespace ('trade') or a full path ('trade.dayPnl').
 * @returns {string} the namespace, when valid.
 * @throws {Error} naming the offender and the legal namespaces.
 */
export function assertKnownNamespace(path) {
  const namespace = String(path ?? '').split('.')[0]

  if (!NAMESPACES.includes(namespace)) {
    throw new Error(
      `unknown state namespace "${namespace}" — expected one of ${NAMESPACES.join(', ')}`,
    )
  }
  return namespace
}

/**
 * Whether a path lives in a namespace that persists across reloads.
 *
 * The persistence layer asks this before writing to localStorage; it is what keeps
 * market data and live positions out of a browser store.
 *
 * @param {string} path - a namespace or full path.
 * @returns {boolean} true when the path is persisted.
 */
export function isPersisted(path) {
  const namespace = String(path ?? '').split('.')[0]
  return PERSISTED_NAMESPACES.includes(namespace)
}
