import { describe, it, expect, beforeEach } from 'vitest'
import { ACTIONS, allActionNames } from './names.js'
import { registerCoreActions, actionNames, clearActions } from './registry.js'
import { registerLayoutActions } from '../blocks/layout.js'
import { registerHeaderActions } from '../ui/header.js'
import { registerThemeActions } from '../ui/theme.js'
import { registerSettingsActions } from '../ui/settings.js'
import { registerKeyActions } from '../ui/keys.js'
import { registerListActions } from '../lists/state.js'
import { registerCandleActions } from '../charts/candlestick.js'
import { registerPrefillActions } from '../book/prefill.js'
import { registerGroupingActions } from '../book/grouping.js'
import { registerTapeActions } from '../book/tape.js'
import { registerCompactActions } from '../hud/compact.js'
import { registerAlertActions } from '../alerts/price.js'
import { registerToastActions } from '../ui/toast.js'
import { registerNotifyActions } from '../alerts/notify.js'
import { registerDndActions } from '../alerts/dnd.js'
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
      'keys.submit',
      'keys.lock',
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
    registerCandleActions()
    registerPrefillActions()
    registerGroupingActions()
    registerTapeActions()
    registerCompactActions()
    registerAlertActions()
    registerToastActions()
    registerNotifyActions()
    registerDndActions()
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
