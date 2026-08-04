import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS, allActionNames } from '../actions/names.js'
import { DEFAULT_BINDINGS, applyDefaultBindings } from './defaults.js'

/**
 * Remapping.
 *
 * Muscle memory is the whole value of a keyboard layout, and every trader arrives with a
 * different one from whatever platform they came from. So the stock layout is a default,
 * not a decision: any chord can be rebound, and the override survives reloads.
 *
 * Two rules make this safe. A chord bound to an action that does not exist is refused,
 * because a key that silently does nothing is worse than no key at all. And a small set
 * of chords is reserved — the ones that get someone *out* of trouble, which must not be
 * possible to bind away.
 */

/** Chords that cannot be rebound: the ways out, and the sheet that explains them. */
export const RESERVED_CHORDS = Object.freeze(['Escape', 'shift+Slash'])

/** The overrides schema version, so an old saved layout can be upgraded. */
export const BINDINGS_VERSION = 1

/**
 * Layer overrides over the defaults.
 *
 * @param {Array<object>} defaults - the stock layout.
 * @param {Record<string, string|null>} overrides - chord -> action, null to unbind.
 * @returns {Array<object>} the effective layout.
 */
export function mergeBindings(defaults, overrides) {
  const base = Array.isArray(defaults) ? defaults : []
  const custom = overrides && typeof overrides === 'object' ? overrides : {}
  const merged = new Map(base.map((binding) => [binding.chord, binding]))

  for (const [chord, action] of Object.entries(custom)) {
    // An explicit null unbinds; a missing entry simply leaves the default alone. The
    // difference matters — otherwise there is no way to say "this key does nothing".
    if (action === null) merged.delete(chord)
    else if (action) merged.set(chord, { chord, action, payload: {}, label: `custom: ${action}` })
  }

  return [...merged.values()]
}

/**
 * Whether a chord may be bound to an action.
 *
 * @param {string} chord - the candidate chord.
 * @param {string} action - the action name.
 * @returns {{ok: boolean, reason: string}} the verdict.
 */
export function validateChord(chord, action) {
  const key = String(chord ?? '')
  if (!key) return { ok: false, reason: 'no chord' }
  // The ways out must stay where they are: a trader who bound away their panic key finds
  // out at exactly the wrong moment.
  if (RESERVED_CHORDS.includes(key)) return { ok: false, reason: 'reserved chord' }

  const name = String(action ?? '')
  if (name && !allActionNames().includes(name)) return { ok: false, reason: 'unknown action' }

  return { ok: true, reason: '' }
}

/**
 * Find what a candidate chord would collide with.
 *
 * @param {string} chord - the candidate chord.
 * @param {Array<object>} bindings - the effective layout.
 * @returns {Array<object>} the bindings already using that chord.
 */
export function findConflicts(chord, bindings) {
  const key = String(chord ?? '')
  if (!key) return []

  return (Array.isArray(bindings) ? bindings : []).filter((binding) => binding?.chord === key)
}

/**
 * Upgrade a saved override map to the current schema.
 *
 * @param {object} saved - whatever was in storage.
 * @returns {{version: number, chords: Record<string, string|null>}} the current shape.
 */
export function migrateBindings(saved) {
  // A bare chord->action map is the v0 shape, which is what shipped before versioning.
  // Reading it as v1 rather than discarding it is the difference between a trader
  // keeping their layout and silently losing it on an update.
  if (saved && typeof saved === 'object' && !('version' in saved)) {
    return { version: BINDINGS_VERSION, chords: { ...saved } }
  }

  const version = Number(saved?.version)
  const chords = saved?.chords && typeof saved.chords === 'object' ? { ...saved.chords } : {}

  return { version: Number.isFinite(version) ? version : BINDINGS_VERSION, chords }
}

/**
 * The layout currently in effect.
 *
 * @returns {Array<object>} the merged bindings.
 */
export function effectiveBindings() {
  const { chords } = migrateBindings(appState.settings?.chords)
  return mergeBindings(DEFAULT_BINDINGS, chords)
}

/**
 * A map that erases every key of the current one.
 *
 * The engine *merges* object writes rather than replacing them, so `setValue(path, {})`
 * is a no-op: reset has to be spelled out key by key. Setting a key to `undefined`
 * clears its value but leaves the key present, which is why every reader here treats an
 * `undefined` entry as "no override" rather than as an entry at all.
 *
 * @param {object} current - the map to clear.
 * @returns {Record<string, undefined>} a map that erases it.
 */
export function clearedMap(current) {
  const keys = Object.keys(current && typeof current === 'object' ? current : {})
  return Object.fromEntries(keys.map((key) => [key, undefined]))
}

/**
 * Register the remapping actions.
 *
 * @returns {string[]} the registered action names.
 */
export function registerBindingActions() {
  registerAction(ACTIONS.keys.rebind, (_state, payload) => {
    const chord = String(payload?.chord ?? '')
    const action = payload?.action === null ? null : String(payload?.action ?? '')

    const verdict = validateChord(chord, action)
    if (!verdict.ok) {
      setValue(PATHS.ui.statusLine, `rebind refused: ${verdict.reason}`)
      return false
    }

    const { chords } = migrateBindings(appState.settings?.chords)
    setValue(PATHS.settings.chords, { ...chords, [chord]: action })
    // Re-applied immediately: a rebind that needed a reload to take effect would be
    // discovered by pressing the old key and getting the old action.
    applyDefaultBindings({ ...chords, [chord]: action })

    return true
  })

  registerAction(ACTIONS.keys.resetBindings, () => {
    setValue(PATHS.settings.chords, clearedMap(appState.settings?.chords))
    applyDefaultBindings({})
    return true
  })

  return [ACTIONS.keys.rebind, ACTIONS.keys.resetBindings]
}
