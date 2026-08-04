import { defineFn, setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { initialState } from '../state/initial.js'
import { createLogger } from '../utils/log.js'
import { ACTIONS } from './names.js'

/**
 * The action registry — every user-triggerable behaviour on the desk.
 *
 * One registry buys three things at once: HTML can dispatch by name
 * (`data-action="click" data-fn="ui.setStatus"`), phase 16 can bind any of them to a
 * hotkey or the command palette without touching feature code, and every invocation
 * lands in Spektrum history so the journal can replay a session.
 *
 * Actions are plain functions of `(state, payload)`. They stay O(1) and synchronous:
 * this is the path a click takes to an order, and it must never wait on a dialog or a
 * loop over unbounded data.
 */

const log = createLogger('actions')

/** Names registered so far, in registration order. */
const registered = []

/**
 * Local handler map. Spektrum keeps its own `fns` registry for DOM dispatch but does not
 * expose it, so we keep a parallel map to dispatch the same actions programmatically —
 * which is what hotkeys, the command palette and the bot runner all need.
 */
const handlers = new Map()

/**
 * Register one action under a unique name.
 *
 * Duplicate registration is a hard error rather than a silent overwrite: two features
 * quietly claiming `trade.submit` is a bug that would only surface as the wrong order
 * being sent.
 *
 * @param {string} name - dotted action name, `<namespace>.<verb>`.
 * @param {(state: object, payload: object) => unknown} fn - the behaviour.
 * @param {object} [meta] - description surfaced by Spektrum's describe().
 * @returns {string} the registered name.
 * @throws {Error} on a malformed name or a duplicate registration.
 */
export function registerAction(name, fn, meta) {
  if (!/^[a-z]+\.[a-zA-Z]+$/.test(String(name ?? ''))) {
    throw new Error(`action name must be "<namespace>.<verb>", got "${name}"`)
  }
  if (typeof fn !== 'function') {
    throw new Error(`action "${name}" needs a function`)
  }
  if (registered.includes(name)) {
    throw new Error(`action "${name}" is already registered`)
  }

  // Registered through an adapter, never raw. Spektrum calls a `data-fn` handler as
  // `(element, state, delta, value, event, scope)` — the ELEMENT first, not state — while
  // every action here is written `(state, payload)`. Handing it the raw function meant the
  // element landed in `state` and the whole state object landed in `payload`, so every
  // parameter read (`payload.modal`, `payload.section`, `payload.side`) came back undefined
  // and the action quietly did nothing. That is why no button on this desk worked in a
  // browser while every test passed: the tests call `dispatchAction` directly, so both
  // sides agreed with each other and neither agreed with the engine.
  defineFn(name, (...args) => fn(appState, domPayload(...args)), meta)
  handlers.set(name, fn)
  registered.push(name)
  return name
}

/**
 * Build our `payload` from what Spektrum hands a DOM handler.
 *
 * The element is the parameter carrier: `data-modal="keys"` is `payload.modal`, exactly as
 * a caller of `dispatchAction` would pass it. A form submit adds its named fields, and a
 * single input adds its own value, so `keys.submit` sees the same shape either way.
 *
 * @param {Element} el - the bound element.
 * @param {object} _state - engine state (already read from the live tree).
 * @param {object} _delta - the pending delta.
 * @param {unknown} value - `data-value`, pre-parsed by the engine.
 * @param {Event} [ev] - the DOM event.
 * @returns {object} the payload.
 */
export function domPayload(el, _state, _delta, value, ev) {
  // Not a DOM call at all — `dispatchAction` and the bot runner pass a payload straight
  // through, and must keep working unchanged.
  if (!el || typeof el !== 'object' || !('dataset' in el)) return el ?? {}

  const payload = { ...el.dataset }
  // The engine's own attributes are plumbing, not parameters.
  delete payload.action
  delete payload.fn

  // A form submit carries its named fields. This is what the key modal sends.
  for (const field of ev?.target?.elements ?? []) {
    if (field?.name) payload[field.name] = field.type === 'checkbox' ? field.checked : field.value
  }

  // A single bound control carries its own value: an input's text, a checkbox's state.
  // The element itself, for the rare binding that must reach the DOM — an SVG geometry
  // attribute cannot go through `:attr`, because Spektrum assigns non-kebab names as
  // properties and SVG geometry properties are read-only.
  payload.el = el
  if (ev) payload.event = ev

  if (el.type === 'checkbox') payload.value = el.checked
  else if (typeof el.value === 'string' && el.value !== '') payload.value = el.value
  if (value !== undefined) payload.value = value

  return payload
}

/**
 * Invoke a registered action by name — the path hotkeys, the command palette and the
 * bot runner all use.
 *
 * Unknown names return null rather than throwing: a stale keybinding must not take the
 * desk down mid-session.
 *
 * @param {string} name - registered action name.
 * @param {object} [payload] - action payload.
 * @returns {unknown} the action's return value, or null when it is not registered.
 */
export function dispatchAction(name, payload = {}) {
  const fn = handlers.get(name)
  if (!fn) {
    log.warn(`no such action "${name}"`)
    return null
  }
  return fn(appState, payload)
}

/** @returns {string[]} the registered action names, in registration order. */
export function actionNames() {
  return registered.slice()
}

/** Forget every registration (tests and a full engine reset). */
export function clearActions() {
  registered.length = 0
  handlers.clear()
}

/**
 * Set the desk's status line — the one-word answer to "what is the desk doing".
 *
 * @param {object} _state - engine state (unused; status is a plain write).
 * @param {{status?: string}} [payload] - the new status.
 * @returns {string} the status that was set.
 */
export function setStatus(_state, payload = {}) {
  const status = String(payload.status ?? '').trim() || 'ready'
  setValue(PATHS.ui.status, status)
  return status
}

/**
 * Reset the desk to its boot state — the escape hatch when the UI is confused.
 *
 * Deliberately does NOT touch venue connections or the key vault: this restores what is
 * on screen, it is not a kill switch (that is phase 24, and it must stay distinct).
 *
 * @param {object} _state - engine state (unused).
 * @param {{now?: number}} [payload] - boot timestamp for the fresh tree.
 * @returns {number} how many paths were rewritten.
 */
export function resetApp(_state, payload = {}) {
  const fresh = initialState({
    version: appState?.app?.version,
    engine: appState?.app?.engine,
    ts: payload.now ?? 0,
  })

  for (const [path, value] of Object.entries(fresh)) setValue(path, value)
  log.info(`reset ${Object.keys(fresh).length} paths`)
  return Object.keys(fresh).length
}

/**
 * Register the actions that exist independent of any feature phase.
 *
 * Called once during bootstrap; later phases add their own via `registerAction`.
 *
 * @returns {string[]} the names registered by this call.
 */
export function registerCoreActions() {
  const names = []

  if (!registered.includes(ACTIONS.ui.setStatus)) {
    names.push(
      registerAction(ACTIONS.ui.setStatus, setStatus, {
        description: 'Set the desk status line',
      }),
    )
  }
  if (!registered.includes(ACTIONS.app.reset)) {
    names.push(
      registerAction(ACTIONS.app.reset, resetApp, {
        description: 'Reset the desk to boot state',
      }),
    )
  }

  return names
}
