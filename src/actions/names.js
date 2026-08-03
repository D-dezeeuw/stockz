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
  }),
  app: Object.freeze({
    reset: 'app.reset',
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
