/**
 * Canonical action names.
 *
 * Declared here for the same reason state paths are: these strings are referenced from
 * HTML (`data-fn`), from hotkey bindings and from the command palette, so a typo would
 * silently bind a key to nothing. One list also gives phase 16 something to enumerate.
 *
 * Naming: `<namespace>.<verb>`, namespace matching the state branch the action mainly
 * affects.
 */
export const ACTIONS = Object.freeze({
  ui: Object.freeze({
    setStatus: 'ui.setStatus',
    toggleBlock: 'ui.toggleBlock',
    setSection: 'ui.setSection',
    toggleOverlay: 'ui.toggleOverlay',
    setTheme: 'ui.setTheme',
    setCandleInterval: 'ui.setCandleInterval',
    palette: 'ui.palette',
    paletteSearch: 'ui.paletteSearch',
    paletteMove: 'ui.paletteMove',
    paletteRun: 'ui.paletteRun',
    toggleCompactHud: 'ui.toggleCompactHud',
    dismissToast: 'ui.dismissToast',
    hoverToast: 'ui.hoverToast',
  }),
  strategy: Object.freeze({
    stop: 'strategy.stop',
    setParam: 'strategy.setParam',
    resume: 'strategy.resume',
    setWeight: 'strategy.setWeight',
    setPreset: 'strategy.setPreset',
    resetScore: 'strategy.resetScore',
  }),
  alerts: Object.freeze({
    create: 'alerts.create',
    update: 'alerts.update',
    remove: 'alerts.remove',
    toggle: 'alerts.toggle',
    testSound: 'alerts.testSound',
    enableNative: 'alerts.enableNative',
    toggleDnd: 'alerts.toggleDnd',
    snooze: 'alerts.snooze',
    filterLog: 'alerts.filterLog',
    clearLog: 'alerts.clearLog',
    jumpTo: 'alerts.jumpTo',
    export: 'alerts.export',
    import: 'alerts.import',
  }),
  breaker: Object.freeze({
    kill: 'breaker.kill',
    rearm: 'breaker.rearm',
    hold: 'breaker.hold',
    release: 'breaker.release',
    copyLog: 'breaker.copyLog',
  }),
  journal: Object.freeze({
    addTag: 'journal.addTag',
    removeTag: 'journal.removeTag',
    setNote: 'journal.setNote',
    editNote: 'journal.editNote',
  }),
  bot: Object.freeze({
    toggleArm: 'bot.toggleArm',
    setAuto: 'bot.setAuto',
    disableAll: 'bot.disableAll',
    resume: 'bot.resume',
    toggleDry: 'bot.toggleDry',
    resetSession: 'bot.resetSession',
  }),
  book: Object.freeze({
    prefill: 'book.prefill',
    setGroup: 'book.setGroup',
    setFloor: 'book.setFloor',
  }),
  ticket: Object.freeze({
    setSide: 'ticket.setSide',
    setMode: 'ticket.setMode',
    setSize: 'ticket.setSize',
    nudge: 'ticket.nudge',
    reset: 'ticket.reset',
    arm: 'ticket.arm',
    applyPreset: 'ticket.applyPreset',
    stepQty: 'ticket.stepQty',
    submit: 'ticket.submit',
    repeatLast: 'ticket.repeatLast',
    intent: 'ticket.intent',
  }),
  orders: Object.freeze({
    cancelAll: 'orders.cancelAll',
  }),
  positions: Object.freeze({
    flatten: 'positions.flatten',
    flattenAll: 'positions.flattenAll',
  }),
  app: Object.freeze({
    reset: 'app.reset',
  }),
  lists: Object.freeze({
    focus: 'lists.focus',
    add: 'lists.add',
    remove: 'lists.remove',
    move: 'lists.move',
    setActive: 'lists.setActive',
    manage: 'lists.manage',
  }),
  keys: Object.freeze({
    submit: 'keys.submit',
    lock: 'keys.lock',
    rebind: 'keys.rebind',
    resetBindings: 'keys.resetBindings',
    panic: 'keys.panic',
    capture: 'keys.capture',
    captureKey: 'keys.captureKey',
    captureSave: 'keys.captureSave',
  }),
  settings: Object.freeze({
    update: 'settings.update',
    reset: 'settings.reset',
  }),
})

/** @returns {string[]} every declared action name, flattened. */
export function allActionNames() {
  return Object.values(ACTIONS).flatMap((group) => Object.values(group))
}
