import { APP_VERSION } from '../app/version.js'
import { buildStamp } from '../app/build.js'
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
    [PATHS.app.build]: buildStamp(),
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
    [PATHS.ui.gridBlocks]: [],
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
    [PATHS.ui.scope]: 'global',
    [PATHS.ui.pnlPulse]: '',
    [PATHS.ui.pnlPulseAt]: 0,
    [PATHS.ui.rtt]: { worst: { venue: '', ms: -1, tier: 'unknown' } },
    [PATHS.ui.slippage]: { last: 0, avg: 0, p95: 0, worst: null, count: 0 },
    [PATHS.ui.spreadAlert]: false,
    [PATHS.ui.session]: {
      perHour: 0,
      inWindow: 0,
      target: 0,
      paceState: 'on',
      paceRatio: 0,
      streak: 0,
      streakKind: 'none',
      streakTone: 'neutral',
      contracts: 0,
      turnover: 0,
      paceLabel: '0.0',
      turnoverLabel: '0.0',
    },
    [PATHS.ui.fees]: {
      total: 0,
      rate: 0,
      ratio: 0,
      count: 0,
      estimated: 0,
      totalLabel: '0.0',
      rateLabel: '0.0/h',
      barPct: 0,
      tone: 'ok',
    },
    [PATHS.ui.hudRow]: [],
    [PATHS.ui.strategyForm]: [],
    [PATHS.ui.compositeWeights]: [],
    [PATHS.ui.alertDraft]: 0,
    [PATHS.ui.alertDirection]: 'either',
    [PATHS.ui.alertChips]: [],
    [PATHS.ui.alertToggles]: [],
    [PATHS.ui.audioReady]: false,
    [PATHS.ui.notifyPermission]: 'default',
    [PATHS.ui.dnd]: { silenced: false, muted: false, countdown: '' },
    [PATHS.ui.alertPanel]: { rows: [], chips: [], unread: 0, total: 0, at: 0 },
    [PATHS.ui.logFilter]: { severity: '', source: '' },
    [PATHS.ui.logSeenAt]: 0,
    [PATHS.ui.hud]: {
      latencyMs: 0,
      latencyGrade: 'warn',
      spreadBps: 0,
      tradesPerMin: 0,
      trades: 0,
      winRate: 0,
      exposure: 0,
      latencyLabel: '—',
      spreadLabel: '—',
      tradesLabel: '0.0',
      exposureLabel: '0.0',
      winRateLabel: '0%',
    },
    [PATHS.ui.captureFor]: '',
    [PATHS.ui.capturePreview]: null,

    // preferences (the only persisted branch) - defaults come from the schema so the
    // drawer, the migration and reset-to-defaults can never disagree about them
    ...Object.fromEntries(
      Object.entries(defaultSettings()).map(([key, value]) => [`settings.${key}`, value]),
    ),
    [PATHS.settings.presets]: {},
    [PATHS.settings.priceGroups]: {},
    [PATHS.settings.strategyParams]: {},
    [PATHS.settings.activePresets]: {},
    [PATHS.settings.customPresets]: {},
    [PATHS.settings.strategyStats]: [],
    [PATHS.settings.alerts]: [],
    [PATHS.settings.alertToggles]: {},
    [PATHS.settings.botStrategies]: {},
    [PATHS.settings.botRules]: {},
    [PATHS.settings.botCapOverrides]: {},
    [PATHS.settings.tapeFloors]: {},
    [PATHS.settings.chords]: {},
    [PATHS.settings.watchlists]: [],
    [PATHS.settings.activeListId]: '',

    // live venue data
    [PATHS.market.venues]: { okx: { state: 'dead' }, etoro: { state: 'dead' } },
    [PATHS.market.instruments]: [],
    [PATHS.market.focus]: '',
    [PATHS.market.ticks]: 0,
    [PATHS.market.watchRows]: [],
    [PATHS.market.bid]: 0,
    [PATHS.market.ask]: 0,
    [PATHS.market.quoteTs]: 0,
    [PATHS.market.tickSize]: 0.01,
    [PATHS.market.lotSize]: 0.0001,
    [PATHS.market.instrumentMeta]: {},
    [PATHS.market.book]: { bids: [], asks: [], seqId: 0, ts: 0 },
    [PATHS.market.bookStatus]: 'stale',
    [PATHS.market.ladder]: { bids: [], asks: [], spread: null },
    [PATHS.market.tape]: [],
    [PATHS.market.tapeHidden]: 0,
    [PATHS.market.tapeWindow]: { start: 0, end: 40, topPad: 0, bottomPad: 0, autoscroll: true },
    [PATHS.market.whales]: [],
    [PATHS.market.whaleCount]: 0,
    [PATHS.market.levels]: [],
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
    [PATHS.trade.pnl]: { unrealized: 0, realized: 0, fees: 0, count: 0 },
    [PATHS.trade.ledger]: [],
    [PATHS.trade.score]: { gross: 0, fees: 0, net: 0, count: 0, wins: 0 },
    [PATHS.trade.dayTotal]: 0,
    [PATHS.trade.dayLabel]: '0.00',
    [PATHS.trade.equityPath]: '',
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
    [PATHS.strategy.running]: [],
    [PATHS.strategy.quarantined]: [],
    [PATHS.strategy.signals]: {},
    [PATHS.strategy.scoreboard]: [],

    // the auto-trader
    [PATHS.bot.decisions]: [],
    [PATHS.bot.status]: { armed: false, enabled: 0, queued: 0 },
    [PATHS.bot.limits]: { used: 0, limit: 30, hot: false, streak: 0, cooldownLeft: 0, cooldownLabel: '' },
    [PATHS.bot.cooldownUntil]: 0,
    [PATHS.bot.capped]: [],
    [PATHS.bot.session]: { signals: 0, orders: 0, dry: 0, blocked: 0, startedAt: 0 },

    // recorded markets, and the transport that plays them back
    [PATHS.playback.recording]: null,
    [PATHS.playback.source]: 'live',
    [PATHS.playback.at]: 0,
    [PATHS.playback.library]: [],
    [PATHS.playback.transport]: {
      active: false,
      playing: false,
      cursor: 0,
      total: 0,
      speed: 1,
      label: '',
    },

    // strategies scored against those recordings
    [PATHS.backtest.config]: { sessionId: '', strategyId: 'momentum-burst', instrument: '' },
    [PATHS.backtest.progress]: { running: false, runId: '', played: 0, total: 0, pct: 0, signals: 0 },
    [PATHS.backtest.strategies]: [],
    [PATHS.backtest.recordings]: [],
    [PATHS.backtest.fillConfig]: {},
    [PATHS.backtest.stats]: null,
    [PATHS.backtest.tiles]: [],
    [PATHS.backtest.curve]: [],
    [PATHS.backtest.result]: null,
    [PATHS.backtest.summary]: {
      ran: false,
      strategyId: '',
      instrument: '',
      signals: 0,
      buys: 0,
      sells: 0,
      fills: 0,
      unfilled: 0,
      fees: 0,
      played: 0,
      errors: 0,
      elapsed: '—',
      assumptions: '—',
    },
    [PATHS.backtest.error]: '',

    // the safety net
    [PATHS.breaker.tripped]: 0,
    [PATHS.breaker.reason]: '',
    [PATHS.breaker.at]: 0,
    [PATHS.breaker.values]: {},
    [PATHS.breaker.dayPnl]: 0,
    [PATHS.breaker.dailyPct]: 0,
    [PATHS.breaker.paused]: false,
    [PATHS.breaker.lossStreak]: 0,
    [PATHS.breaker.lastBlock]: null,
    [PATHS.breaker.blocked]: 0,
    [PATHS.breaker.killLatencyMs]: 0,
    [PATHS.breaker.flattenPending]: [],
    [PATHS.breaker.leds]: [],
    [PATHS.breaker.holdPct]: 0,
    [PATHS.breaker.lastRearm]: null,
    [PATHS.breaker.log]: [],
    [PATHS.breaker.limits]: [],

    // replay
    [PATHS.replay.active]: false,
    [PATHS.replay.cursor]: 0,
    [PATHS.replay.total]: 0,
    [PATHS.replay.trade]: null,
    [PATHS.replay.speed]: 1,
    [PATHS.replay.label]: '',
    [PATHS.replay.error]: '',

    // analytics
    [PATHS.analytics.period]: 'all',
    [PATHS.analytics.trades]: [],
    [PATHS.analytics.kpis]: [],
    [PATHS.analytics.equity]: [],
    [PATHS.analytics.drawdown]: { maxDrawdown: 0, peak: 0, trough: 0 },
    [PATHS.analytics.hours]: [],
    [PATHS.analytics.hourExtremes]: { best: null, worst: null },
    [PATHS.analytics.ranking]: [],
    [PATHS.analytics.rankingTotal]: 0,
    [PATHS.analytics.rankingExpanded]: false,
    [PATHS.analytics.holds]: [],
    [PATHS.analytics.holdCentre]: { median: 0, mean: 0, medianLabel: '—', meanLabel: '—' },
    [PATHS.analytics.streaks]: { current: 0, outcome: 'none', maxWin: 0, maxLoss: 0, tilt: false },
    [PATHS.analytics.segments]: [],
    [PATHS.analytics.fees]: { gross: 0, fees: 0, net: 0, ratio: 0, ratioLabel: '—', tone: 'flat', trades: 0 },
    [PATHS.analytics.venueFees]: [],
    [PATHS.analytics.underwater]: [],
    [PATHS.analytics.worstRun]: { depth: 0, duration: 0, recovered: false, current: 0, depthLabel: '0.00', durationLabel: '0 trades', currentLabel: '0.00' },

    // journal
    [PATHS.journal.trades]: [],
    [PATHS.journal.count]: 0,
    [PATHS.journal.last]: null,
    [PATHS.journal.rows]: [],
    [PATHS.journal.notes]: {},
    [PATHS.journal.tagCatalog]: [],
    [PATHS.journal.editing]: '',
    [PATHS.journal.checkpoints]: [],
    [PATHS.journal.replaying]: '',
    [PATHS.journal.filters]: { instrument: '', tag: '', outcome: 'all', sort: 'closeTs', dir: 'desc' },
    [PATHS.journal.filtered]: [],
    [PATHS.journal.instruments]: [],
    [PATHS.journal.hidden]: 0,
    [PATHS.journal.days]: [],
    [PATHS.journal.openDay]: '',
    [PATHS.journal.storage]: { used: 0, quota: 0, pct: 0, label: '—' },
    [PATHS.journal.pruned]: null,

    // alerts
    [PATHS.alerts.fired]: null,
    [PATHS.alerts.log]: [],
  }
}
