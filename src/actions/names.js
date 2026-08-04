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
  }),
  orders: Object.freeze({
    cancelAll: 'orders.cancelAll',
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
