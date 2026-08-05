import { setValue, bindDOM, run, tick, checkpoint, engineInfo } from './engine.js'
import { initialState } from '../state/initial.js'
import { PATHS } from '../state/paths.js'
import { registerCoreActions, actionNames, dispatchAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { registerDerived } from '../state/derived.js'
import { registerSystems } from '../state/systems.js'
import { mountDevtools } from './devtools.js'
import { wireEngineErrors } from '../ui/toast.js'
import { registerFormatters } from '../ui/format-bindings.js'
import { seedBlocks } from '../blocks/seed.js'
import { registerLayoutActions, observeLayout } from '../blocks/layout.js'
import { registerHeaderActions, mountSectionBlocks } from '../ui/header.js'
import { registerThemeActions, applyTheme, preferredTheme } from '../ui/theme.js'
import { restoreSettings, persistSettings } from '../state/persist.js'
import { registerSettingsActions } from '../ui/settings.js'
import { registerKeyActions, adoptKeys, promptForKeys, showKeyUrl } from '../ui/keys.js'
import { registerListActions } from '../lists/state.js'
import { startWatchlist, registerWatchActions } from '../lists/watch.js'
import { startAutopilot } from '../bot/autopilot.js'
import { registerCandleActions } from '../charts/candlestick.js'
import { registerPrefillActions } from '../book/prefill.js'
import { registerGroupingActions } from '../book/grouping.js'
import { registerTapeActions } from '../book/tape.js'
import { registerCompactActions } from '../hud/compact.js'
import { registerStrategyActions } from '../strategy/registry.js'
import { registerAlertActions } from '../alerts/price.js'
import { publishToggles } from '../alerts/signals.js'
import { registerToastActions, wireAlertToasts } from '../ui/toast.js'
import { wireAlertSounds, unlockAudio } from '../alerts/sounds.js'
import { registerNotifyActions, wireNativeAlerts, permissionState } from '../alerts/notify.js'
import { registerDndActions, refreshDnd } from '../alerts/dnd.js'
import { registerLogActions } from '../alerts/log.js'
import { registerPersistActions, rehydrateAlerts } from '../alerts/persist.js'
import { registerBotActions, createBotRunner } from '../bot/runner.js'
import { mountMarketMode } from '../bot/throttle.js'
import { registerSessionActions } from '../bot/session.js'
import { watchTrip, watchPending } from '../breakers/index.js'
import { watchBreakerSettings } from '../breakers/settings.js'
import { loadOpenLots } from '../journal/pairing.js'
import { registerTagActions, loadAnnotations } from '../journal/tags.js'
import { registerCheckpointActions } from '../journal/checkpoints.js'
import { registerExportActions } from '../journal/export.js'
import { registerImportActions } from '../journal/import.js'
import { registerFilterActions } from '../journal/filters.js'
import { registerCsvActions } from '../journal/csv.js'
import { registerSummaryActions } from '../journal/summary.js'
import { registerRetentionActions, scheduleRetention, storageUsage } from '../journal/retention.js'
import { startEquityChart } from '../analytics/equity.js'
import { startHeatmap } from '../analytics/heatmap.js'
import { registerRankingActions } from '../analytics/instruments.js'
import { registerPeriodActions, mountPeriod } from '../analytics/period.js'
import { registerReportActions } from '../analytics/report.js'
import { registerRecorderActions } from '../playback/recorder.js'
import { registerLibraryActions, refreshLibrary } from '../playback/library.js'
import { registerPlayerActions } from '../playback/player.js'
import { registerBacktestActions } from '../backtest/runner.js'
import { registerBacktestReportActions, startReportChart } from '../backtest/report.js'
import { registerSweepActions } from '../backtest/sweep.js'
import { registerCompareActions, startCompareChart, refreshRuns } from '../backtest/compare.js'
import { setLevelSink } from '../strategy/builtin/range-fade.js'
import { syncOkxClock } from '../venues/okx/clock.js'
import { runKeyPreflight, watchKeyAim } from '../venues/okx/preflight.js'
import { adoptRole } from './session.js'
import { registerModeActions, applyModeParam, applyFirstRunMode } from '../exec/mode.js'
import { startPaperBook } from '../exec/paper/engine.js'
import { startPaperAccount } from '../exec/paper/account.js'
import { startBookCompare } from '../exec/paper/compare.js'
import { startHistogram } from '../analytics/holdtime.js'
import { startStreakStrip } from '../analytics/streaks.js'
import { startFeeBars } from '../analytics/fees.js'
import { startUnderwater } from '../analytics/drawdown.js'
import { registerKillActions } from '../breakers/kill.js'
import { registerRearmActions, mountRelease } from '../breakers/rearm.js'
import {
  registerLogActions as registerBreakerLogActions,
  loadBreakerLog,
  pruneBreakerEvents,
} from '../breakers/log.js'
import { onAlert } from '../alerts/bus.js'
import { knownStrategies } from '../strategy/registry.js'
import { connectFeeds } from './feeds.js'
import { registerTicketActions } from '../ticket/actions.js'
import { registerSizingActions } from '../ticket/sizing.js'
import { registerSubmitAction } from '../ticket/submit.js'
import { registerShortcutActions } from '../ticket/shortcuts.js'
import { registerIntentAction } from '../ticket/intent.js'
import { applyDefaultBindings } from '../keys/defaults.js'
import { mountKeymap } from '../keys/keymap.js'
import { registerBindingActions } from '../keys/overrides.js'
import { registerPaletteActions } from '../keys/palette.js'
import { trackBlockFocus } from '../keys/scopes.js'
import { registerPanicAction } from '../keys/panic.js'
import { registerCaptureActions } from '../keys/capture.js'
import { startEngine, submit as execSubmit } from '../exec/engine.js'
import { registerFlattenActions } from '../positions/flatten.js'
import { startReconciler } from '../positions/reconcile.js'
import { createRepeater, guardRepeat } from '../keys/repeat.js'
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

  // Stored preferences land before anything binds, so the first paint is already the
  // trader's layout and theme rather than defaults that visibly change a frame later.
  restoreSettings()
  persistSettings()
  // Flushed here, not left for the tick before the first paint. `setValue` lands next tick,
  // so every boot step below that *reads* a setting would otherwise see undefined — which is
  // exactly what happened to `rememberEnabled()`: remembered credentials were written on
  // save and then never restored on the revisit they exist for, because the switch still
  // read as off when `adoptKeys` asked.
  tick()

  // Before any adapter binds. A link that opens the desk into paper has to win over the
  // persisted mode, or the override is advice rather than an override.
  // Paper first, always. Not because paper is the safer default in the abstract, but
  // because the alternative is a stranger's first click reaching a venue — and a desk that
  // does that has no way to earn back the trust it just spent.
  applyFirstRunMode()
  applyModeParam(globalThis.location?.search ?? '')

  // Actions and derivations must exist before bindDOM: data-fn attributes would bind to
  // nothing, and derived paths would render as blanks on the first paint.
  // Formatters must exist before bindDOM: a binding calling fmt.price() would otherwise
  // throw on the first paint.
  registerFormatters()
  registerCoreActions()
  registerLayoutActions()
  registerHeaderActions()
  registerThemeActions()
  registerSettingsActions()
  registerKeyActions()
  registerListActions()
  registerWatchActions()
  registerCandleActions()
  registerPrefillActions()
  registerGroupingActions()
  registerTapeActions()
  registerCompactActions()
  registerStrategyActions()
  registerAlertActions()
  registerToastActions()
  wireAlertToasts()
  wireAlertSounds(onAlert)
  // Browsers refuse audio before a gesture; unlocking on the first click means the desk
  // never silently fails and looks broken.
  unlockAudio()
  registerNotifyActions()
  registerDndActions()
  registerLogActions()
  registerPersistActions()
  // Stored definitions come back armed with their transient state stripped. A restored
  // alert still cannot fire until the market moves past it while the desk is watching.
  rehydrateAlerts(undefined, Date.now())
  registerBotActions()
  registerSessionActions()
  // One watcher over every limit: the cache and the settings card move together, and a
  // limit the trader raised that never took effect is the worst kind of stale.
  watchBreakerSettings()
  registerKillActions()
  registerRearmActions()
  mountRelease()
  registerBreakerLogActions()
  // Read back and pruned once at boot: the record is for reviewing a session that has
  // already happened, and thirty days of it is the most anybody looks back.
  loadBreakerLog()
  // The half-open scalp survives a reload: the state worth keeping is precisely the one a
  // refresh lands in the middle of.
  loadOpenLots()
  registerTagActions()
  registerCheckpointActions()
  registerExportActions()
  registerImportActions()
  registerFilterActions()
  registerCsvActions()
  registerSummaryActions()
  registerRetentionActions()
  // Cleanup at idle, never on a timer mid-session: competing with a live order book for a
  // frame costs the trader money to save disk nobody was short of.
  scheduleRetention()
  storageUsage()
  startEquityChart()
  startHeatmap()
  registerRankingActions()
  registerPeriodActions()
  registerReportActions()
  registerRecorderActions()
  registerLibraryActions()
  registerPlayerActions()
  registerModeActions()
  // The paper book works itself down off the same tape the desk renders, so a resting
  // paper order fills when the market actually trades through it.
  if (options.feeds !== false) startPaperBook()
  startPaperAccount()
  startBookCompare()
  registerBacktestActions()
  registerBacktestReportActions()
  registerSweepActions()
  registerCompareActions()
  startCompareChart()
  if (options.feeds !== false) refreshRuns()
  startReportChart()
  // The one strategy with something to show gets its sink here rather than importing the
  // engine itself — see the note in range-fade.js.
  setLevelSink((rows) => setValue(PATHS.market.levels, rows))
  // Measured before the first signed call, not after it. OKX refuses a timestamp more than
  // thirty seconds off its own clock and refuses it as a 401 that reads exactly like a bad
  // key, so a drifted machine would otherwise spend the session being told its valid
  // credentials were rejected.
  // Who is signed in gates the money controls; fetched alongside the clock, not before
  // it — neither blocks the other and boot stays flat.
  if (options.feeds !== false) adoptRole()
  if (options.feeds !== false) {
    // Chained, not fired alongside: the preflight is a *signed* call, so running it before
    // the drift measurement lands would sign it with the clock the sync exists to correct —
    // and a preflight that reports a clock error it caused itself is worse than none.
    // Keys are adopted further down this same synchronous run, so they are in the vault long
    // before this promise resolves.
    // The aim-watch is armed only after the first check completes: boot's own writes —
    // settings restore, key adoption — land on these same paths, and arming early would
    // fire a second, concurrent first-check off them.
    syncOkxClock()
      .then(() => runKeyPreflight())
      .then(() => watchKeyAim())
      .catch(() => {})
  }
  startHistogram()
  startStreakStrip()
  startFeeBars()
  startUnderwater()
  loadAnnotations()
  pruneBreakerEvents(Date.now())
  // The daily-loss trip has no other reaction path — it publishes a code and returns a
  // rejection — so without these the desk would halt with its orders still resting.
  watchTrip()
  watchPending()
  // The runner comes up disarmed by construction: `botArmed` is transient and never
  // restored, so the loop can run from boot and still place nothing.
  // The market mode is a preset for the order-rate ceiling; applied before the runner so
  // the first drain already uses it.
  mountMarketMode()
  createBotRunner()
  wireNativeAlerts(onAlert)
  permissionState()
  refreshDnd(Date.now())
  // After the strategies register, so every one of them gets a mute switch.
  publishToggles(knownStrategies())
  registerTicketActions()
  registerSizingActions()
  // The venue call is injected rather than imported inside the action, so the fast path
  // can be exercised end to end without a network.
  // The engine is the one door orders go through. It comes up before the submit action
  // so a click in the first frame has an adapter to reach.
  startEngine()
  registerSubmitAction({ send: sendViaEngine })
  registerShortcutActions({ send: sendViaEngine })
  registerIntentAction({ submit: submitFromIntent })
  registerFlattenActions()
  registerBindingActions()
  registerPaletteActions()
  registerPanicAction()
  registerCaptureActions()
  adoptKeys()
  // A live-mode desk with no credentials cannot place an order, and finding that out on the
  // first click is finding out too late.
  promptForKeys()
  // The bookmark reflects whatever boot just adopted — from a link, the cache or dev env —
  // so opening the modal on a desk that already has keys shows the URL for those keys.
  showKeyUrl(doc)
  applyTheme(doc?.documentElement?.getAttribute?.('data-theme') || preferredTheme(), doc)
  // Analytics obey the period switch from the first paint, not from the first change.
  // The library loads off the critical path: it is an IndexedDB read nobody is waiting on.
  refreshLibrary().catch(() => [])
  const unperiod = mountPeriod()
  const derived = registerDerived()
  wireEngineErrors()

  registerSystems({ now: makeBootClock(now) })
  seedBlocks()
  // After the registry is seeded and before bindDOM, so the grid has its blocks on the
  // very first frame rather than painting empty and filling in a tick later.
  mountSectionBlocks()

  // Bindings after every action is registered, so a chord can never point at a name
  // that does not exist yet.
  applyDefaultBindings(state[PATHS.settings.chords] ?? {})

  const cleanup = bindDOM(doc)
  tick()
  observeLayout({ doc })
  const unkey = mountKeymap(doc?.defaultView ?? globalThis.window)
  const unfocus = trackBlockFocus(doc)
  const unrepeat = guardRepeat(createRepeater(), doc?.defaultView ?? globalThis.window)
  revealApp(doc)
  checkpoint('boot', { version: appVersion() })

  // Dev only, and never awaited: instrumentation must not delay the first paint.
  mountDevtools()

  // Feeds start *after* the first paint. A socket opened before bindDOM would race the
  // first frame, and a desk that paints in 40ms and connects in 300 feels faster than
  // one that does both in 320.
  const feeds = connectFeeds(options)
  // The venue is the authority on positions; the desk checks itself against it on a
  // timer rather than trusting a book built from fills it happened to see.
  const unreconcile = options.feeds === false ? () => {} : startReconciler()
  // The watchlist fills and quotes itself from the public tickers endpoint, which needs no
  // credentials — so the desk shows live instruments on a first visit, before any key is
  // entered, rather than an empty block waiting to be told what to watch.
  const unwatchlist = options.feeds === false ? () => {} : startWatchlist()
  // Last, because it needs the adapters registered and the watchlist focused. Paper only:
  // it arms the bot when the desk is simulating and grounds it the instant the desk goes
  // live, so real money always takes a deliberate second decision.
  const unautopilot = options.feeds === false ? () => {} : startAutopilot({ now })

  if (autoRun) run()

  return {
    paths: Object.keys(state),
    actions: actionNames(),
    derived,
    cleanup: () => {
      unkey()
      unfocus()
      unrepeat()
      unreconcile()
      unwatchlist()
      unautopilot()
      unperiod?.()
      cleanup?.()
    },
    feeds,
  }
}

/**
 * Send a ticket payload through the execution engine.
 *
 * The ticket speaks OKX payload shape (phase 15); the engine speaks intents. This is the
 * one translation, kept named rather than inline so the coverage gate can see it.
 *
 * @param {object} payload - the venue payload the ticket built.
 * @returns {Promise<object>} the engine's outcome.
 */
export function sendViaEngine(payload) {
  return execSubmit({
    symbol: payload?.instId,
    side: payload?.side,
    size: Number(payload?.sz),
    price: Number(payload?.px) || 0,
    type: payload?.ordType === 'market' ? 'market' : 'limit',
    clientId: payload?.clOrdId,
  })
}

/**
 * Fire the ticket from a click-to-trade intent.
 *
 * Named rather than inlined at the registration site: an inline arrow is invisible to
 * the coverage gate, and this one is on the order path.
 *
 * @param {{side?: string}} click - the intent's click details.
 * @returns {unknown} whatever the submit action returned.
 */
export function submitFromIntent(click) {
  return dispatchAction(ACTIONS.ticket.submit, click)
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
