import { dispatchAction } from '../actions/registry.js'
import { scopeChain } from './scopes.js'

/**
 * The keymap.
 *
 * On a scalping desk the mouse is a latency tax: a hand that has to travel to a button
 * has already lost the tick it was reaching for. So every action on the desk is
 * reachable by chord, and the chord goes through the *same* action the button does —
 * this module resolves and dispatches, it never reimplements.
 *
 * Chords are built from `event.code`, not `event.key`. `code` is the physical key, so a
 * binding survives a layout switch: on AZERTY, `KeyB` is still the key where B is on a
 * QWERTY board, which is where the trader's finger goes.
 */

/** chord (optionally scope-prefixed) -> {action, label, payload, enabled, scope}. */
const bindings = new Map()

/** Separates a scope from its chord in a registry key. Not legal in either half. */
const SCOPE_SEP = ' '

/** Modifier order, so one chord has exactly one spelling. */
const MODIFIERS = Object.freeze(['ctrl', 'alt', 'shift', 'meta'])

/**
 * Canonicalise a keyboard event into a chord string.
 *
 * @param {KeyboardEvent|{code: string, ctrlKey?: boolean, altKey?: boolean,
 *   shiftKey?: boolean, metaKey?: boolean}} event - the key event.
 * @returns {string} e.g. 'ctrl+shift+KeyK', or '' for a modifier-only press.
 */
export function normalizeChord(event) {
  const code = String(event?.code ?? '')
  // A bare modifier is not a chord: holding Shift on the way to Shift+B must not resolve
  // to anything on its own.
  if (!code || /^(Control|Alt|Shift|Meta)(Left|Right)$/.test(code)) return ''

  const held = MODIFIERS.filter(
    (mod) =>
      ({ ctrl: event?.ctrlKey, alt: event?.altKey, shift: event?.shiftKey, meta: event?.metaKey })[
        mod
      ],
  )

  return [...held, code].join('+')
}

/**
 * Bind a chord to an action.
 *
 * @param {string} chord - the chord string.
 * @param {string} action - a registered action name.
 * @param {{label?: string, payload?: object, enabled?: boolean}} [meta] - binding details.
 * @returns {string} the chord that was bound.
 */
export function registerBinding(chord, action, meta = {}) {
  const key = String(chord ?? '')
  if (!key || !action) return ''

  bindings.set(registryKey(key, meta.scope), {
    action: String(action),
    label: String(meta.label ?? action),
    payload: meta.payload ?? {},
    enabled: meta.enabled !== false,
    scope: meta.scope ? String(meta.scope) : 'global',
  })
  return key
}

/**
 * The registry key for a chord in a scope.
 *
 * Scoped bindings share one Map under a prefixed key, so a chord can mean different
 * things in different places without a second data structure to keep in step.
 *
 * @param {string} chord - the chord.
 * @param {string} [scope] - the owning scope, empty for global.
 * @returns {string} the registry key.
 */
export function registryKey(chord, scope = '') {
  const key = String(chord ?? '')
  return scope && scope !== 'global' ? `${scope}${SCOPE_SEP}${key}` : key
}

/**
 * Remove a binding.
 *
 * @param {string} chord - the chord string.
 * @returns {boolean} true when something was removed.
 */
export function unregisterBinding(chord, scope = '') {
  return bindings.delete(registryKey(chord, scope))
}

/**
 * The binding for a chord.
 *
 * @param {string} chord - the chord string.
 * @returns {object|null} the binding, or null when unbound or disabled.
 */
export function resolveKey(chord, chain = scopeChain()) {
  const key = String(chord ?? '')
  if (!key) return null

  // Nearest scope first, stopping at the first hit: a modal's binding beats a block's,
  // which beats the global layout.
  for (const scope of Array.isArray(chain) && chain.length ? chain : ['global']) {
    const found = bindings.get(registryKey(key, scope))
    if (found?.enabled) return found
  }

  return null
}

/** @returns {Array<object>} every binding, for the palette and the cheat sheet. */
export function allBindings() {
  return [...bindings.entries()].map(([key, binding]) => ({
    chord: key.includes(SCOPE_SEP) ? key.slice(key.indexOf(SCOPE_SEP) + 1) : key,
    ...binding,
  }))
}

/** Forget every binding. */
export function clearBindings() {
  bindings.clear()
  return true
}

/**
 * The chords a focused field never gets to swallow.
 *
 * Escape, because it is how a trader leaves a field they opened by accident, and trapping
 * it inside the field is how people get stuck. The kill chord, because an emergency that
 * arrives while somebody is halfway through typing a limit price is the emergency — a
 * kill switch that needs you to click away first is not one.
 */
export const ALWAYS_ON = Object.freeze(['Escape', 'ctrl+shift+KeyK'])

/**
 * Whether a key event should be ignored because the trader is typing.
 *
 * @param {EventTarget} target - the event's target.
 * @param {string} chord - the resolved chord.
 * @returns {boolean} true when the event belongs to the field, not the desk.
 */
export function isTypingTarget(target, chord = '') {
  const tag = String(target?.tagName ?? '').toLowerCase()
  const editable = target?.isContentEditable === true
  const typing = editable || tag === 'input' || tag === 'textarea' || tag === 'select'
  if (!typing) return false

  return !ALWAYS_ON.includes(chord)
}

/**
 * Wire the keymap to a window.
 *
 * @param {Window} [win] - the window to listen on.
 * @param {{dispatch?: Function}} [options] - injectable dispatch, for tests.
 * @returns {() => void} unsubscribe.
 */
export function mountKeymap(win = globalThis.window, options = {}) {
  const { dispatch = dispatchAction } = options
  if (!win?.addEventListener) return () => {}

  const onKeyDown = (event) => {
    const chord = normalizeChord(event)
    if (!chord || isTypingTarget(event.target, chord)) return

    const binding = resolveKey(chord)
    if (!binding) return

    // Prevented only on a hit: an unbound chord must keep doing whatever the browser
    // does with it, or the desk breaks refresh, devtools and find-in-page.
    event.preventDefault?.()
    dispatch(binding.action, { ...binding.payload, chord, shiftKey: event.shiftKey === true })
  }

  // Capture phase: a keydown handled by a focused widget deeper in the tree would
  // otherwise swallow the chord before the desk sees it.
  win.addEventListener('keydown', onKeyDown, { capture: true })
  return () => win.removeEventListener?.('keydown', onKeyDown, { capture: true })
}
