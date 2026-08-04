import { describe, it, expect, beforeEach } from 'vitest'
import { ACTIONS, allActionNames } from './names.js'
import { registerCoreActions, actionNames, clearActions } from './registry.js'
import { registerLayoutActions } from '../blocks/layout.js'
import { registerHeaderActions } from '../ui/header.js'
import { registerThemeActions } from '../ui/theme.js'
import { registerSettingsActions } from '../ui/settings.js'
import { registerKeyActions } from '../ui/keys.js'
import { registerListActions } from '../lists/state.js'
import { registerWatchActions } from '../lists/watch.js'
import { registerCandleActions } from '../charts/candlestick.js'
import { registerPrefillActions } from '../book/prefill.js'
import { registerGroupingActions } from '../book/grouping.js'
import { registerTapeActions } from '../book/tape.js'
import { registerCompactActions } from '../hud/compact.js'
import { registerAlertActions } from '../alerts/price.js'
import { registerToastActions } from '../ui/toast.js'
import { registerNotifyActions } from '../alerts/notify.js'
import { registerDndActions } from '../alerts/dnd.js'
import { registerLogActions } from '../alerts/log.js'
import { registerPersistActions } from '../alerts/persist.js'
import { registerBotActions } from '../bot/runner.js'
import { registerSessionActions } from '../bot/session.js'
import { registerKillActions } from '../breakers/kill.js'
import { registerRearmActions } from '../breakers/rearm.js'
import { registerLogActions as registerBreakerLogActions } from '../breakers/log.js'
import { registerTagActions } from '../journal/tags.js'
import { registerCheckpointActions } from '../journal/checkpoints.js'
import { registerExportActions } from '../journal/export.js'
import { registerImportActions } from '../journal/import.js'
import { registerFilterActions } from '../journal/filters.js'
import { registerCsvActions } from '../journal/csv.js'
import { registerSummaryActions } from '../journal/summary.js'
import { registerRetentionActions } from '../journal/retention.js'
import { registerRankingActions } from '../analytics/instruments.js'
import { registerPeriodActions } from '../analytics/period.js'
import { registerReportActions } from '../analytics/report.js'
import { registerRecorderActions } from '../replay/recorder.js'
import { registerStrategyActions } from '../strategy/registry.js'
import { registerTicketActions } from '../ticket/actions.js'
import { registerSizingActions } from '../ticket/sizing.js'
import { registerSubmitAction } from '../ticket/submit.js'
import { registerShortcutActions } from '../ticket/shortcuts.js'
import { registerIntentAction } from '../ticket/intent.js'
import { registerBindingActions } from '../keys/overrides.js'
import { registerFlattenActions } from '../positions/flatten.js'
import { registerPaletteActions } from '../keys/palette.js'
import { registerPanicAction } from '../keys/panic.js'
import { registerCaptureActions } from '../keys/capture.js'

beforeEach(() => {
  clearActions()
})

describe('allActionNames', () => {
  it('flattens the declared names and matches what boot actually registers', () => {
    expect(allActionNames()).toEqual([
      'ui.setStatus',
      'ui.toggleBlock',
      'ui.setSection',
      'ui.toggleOverlay',
      'ui.setTheme',
      'ui.svgAttr',
      'ui.setCandleInterval',
      'ui.palette',
      'ui.paletteSearch',
      'ui.paletteMove',
      'ui.paletteRun',
      'ui.toggleCompactHud',
      'ui.dismissToast',
      'ui.hoverToast',
      'strategy.stop',
      'strategy.setParam',
      'strategy.resume',
      'strategy.setWeight',
      'strategy.setPreset',
      'strategy.resetScore',
      'alerts.create',
      'alerts.update',
      'alerts.remove',
      'alerts.toggle',
      'alerts.testSound',
      'alerts.enableNative',
      'alerts.toggleDnd',
      'alerts.snooze',
      'alerts.filterLog',
      'alerts.clearLog',
      'alerts.jumpTo',
      'alerts.export',
      'alerts.import',
      'breaker.kill',
      'breaker.rearm',
      'breaker.hold',
      'breaker.release',
      'breaker.copyLog',
      'analytics.setPeriod',
      'analytics.cyclePeriod',
      'analytics.exportJson',
      'analytics.copySummary',
      'analytics.exportCharts',
      'analytics.pickInstrument',
      'analytics.expandRanking',
      'journal.addTag',
      'journal.removeTag',
      'journal.setNote',
      'journal.editNote',
      'journal.jump',
      'journal.live',
      'journal.export',
      'journal.filter',
      'journal.sort',
      'journal.clearFilters',
      'journal.csv',
      'journal.toggleDay',
      'journal.prune',
      'replay.step',
      'replay.seek',
      'replay.speed',
      'replay.exit',
      'replay.import',
      'replay.record',
      'bot.toggleArm',
      'bot.setAuto',
      'bot.disableAll',
      'bot.resume',
      'bot.toggleDry',
      'bot.resetSession',
      'book.prefill',
      'book.setGroup',
      'book.setFloor',
      'ticket.setSide',
      'ticket.setMode',
      'ticket.setSize',
      'ticket.nudge',
      'ticket.reset',
      'ticket.arm',
      'ticket.applyPreset',
      'ticket.stepQty',
      'ticket.submit',
      'ticket.repeatLast',
      'ticket.intent',
      'orders.cancelAll',
      'positions.flatten',
      'positions.flattenAll',
      'app.reset',
      'lists.focus',
      'lists.add',
      'lists.remove',
      'lists.move',
      'lists.setActive',
      'lists.manage',
      'lists.auto',
      'keys.submit',
      'keys.lock',
      'keys.remember',
      'keys.liveTrading',
      'keys.copyUrl',
      'keys.rebind',
      'keys.resetBindings',
      'keys.panic',
      'keys.capture',
      'keys.captureKey',
      'keys.captureSave',
      'settings.update',
      'settings.reset',
    ])

    // Every declared name must actually be registered by some boot step - a name in
    // ACTIONS that nothing registers is a hotkey bound to nothing.
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
    registerAlertActions()
    registerToastActions()
    registerNotifyActions()
    registerDndActions()
    registerLogActions()
    registerPersistActions()
    registerBotActions()
    registerSessionActions()
    registerKillActions()
    registerRearmActions()
    registerBreakerLogActions()
    registerTagActions()
    registerCheckpointActions()
    registerExportActions()
    registerImportActions()
    registerFilterActions()
    registerCsvActions()
    registerSummaryActions()
    registerRetentionActions()
    registerRankingActions()
    registerPeriodActions()
    registerReportActions()
    registerRecorderActions()
    registerStrategyActions()
    registerTicketActions()
    registerSizingActions()
    registerSubmitAction()
    registerShortcutActions()
    registerIntentAction()
    registerBindingActions()
    registerFlattenActions()
    registerPaletteActions()
    registerPanicAction()
    registerCaptureActions()
    expect(actionNames().sort()).toEqual(allActionNames().sort())

    // Every name follows <namespace>.<verb>, which is what registerAction enforces.
    for (const name of allActionNames()) expect(name).toMatch(/^[a-z]+\.[a-zA-Z]+$/)

    expect(Object.isFrozen(ACTIONS)).toBe(true)
    expect(Object.isFrozen(ACTIONS.ui)).toBe(true)
  })
})
