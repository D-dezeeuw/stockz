import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction, dispatchAction } from '../actions/registry.js'
import { ACTIONS, allActionNames } from '../actions/names.js'
import { allBindings } from './keymap.js'
import { chordLabel } from './defaults.js'

/**
 * The command palette.
 *
 * The bindings cover the actions used every minute. The palette covers the rest: the
 * ones used once a session, which nobody should have to memorise a chord for and nobody
 * should have to hunt through menus for either.
 *
 * It also teaches. Every row shows the chord that would have done the same thing, so a
 * trader who reaches for the palette twice learns the key on the third time.
 */

/**
 * The selection, held outside the reactive tree.
 *
 * Holding ArrowDown fires several keydowns inside one frame, and `setValue` lands on the
 * next tick — so a selection read back from state would have every press in that frame
 * move from the same index. State gets a mirror for rendering; this is the truth.
 */
let selection = 0

/** The rows currently on offer, for the same reason. */
let rows = []

/** Human labels for actions, so the palette reads like a desk rather than an API. */
export const ACTION_LABELS = Object.freeze({
  [ACTIONS.ticket.submit]: 'submit order',
  [ACTIONS.ticket.arm]: 'arm / disarm the desk',
  [ACTIONS.ticket.reset]: 'reset the ticket',
  [ACTIONS.ticket.repeatLast]: 'repeat last order',
  [ACTIONS.ticket.setMode]: 'set price mode',
  [ACTIONS.ticket.setSize]: 'set size',
  [ACTIONS.ticket.nudge]: 'nudge price',
  [ACTIONS.orders.cancelAll]: 'cancel all working orders',
  [ACTIONS.keys.resetBindings]: 'reset hotkeys to defaults',
  [ACTIONS.ui.setTheme]: 'toggle day / night',
  [ACTIONS.ui.toggleOverlay]: 'toggle an overlay',
  [ACTIONS.lists.focus]: 'focus an instrument',
  [ACTIONS.settings.reset]: 'reset settings',
  [ACTIONS.app.reset]: 'reset the desk',
})

/**
 * Score a candidate against a query by subsequence match.
 *
 * @param {string} candidate - the label being searched.
 * @param {string} query - what was typed.
 * @returns {number} 0 for no match, higher is better.
 */
export function fuzzyScore(candidate, query) {
  const text = String(candidate ?? '').toLowerCase()
  const needle = String(query ?? '').toLowerCase().trim()
  // An empty query matches everything equally: the palette opens showing the full list
  // rather than nothing.
  if (!needle) return 1
  if (!text) return 0

  let score = 0
  let index = 0

  for (const char of needle) {
    const found = text.indexOf(char, index)
    if (found === -1) return 0

    // Start-of-word hits score highest, then adjacency. That is what makes "ca" rank
    // "cancel all" above "repeat last", which merely contains both letters.
    if (found === 0) score += 4
    else if (text[found - 1] === ' ' || text[found - 1] === '.') score += 3
    else if (found === index) score += 2
    else score += 1

    index = found + 1
  }

  // Shorter matches win ties: an exact short label beats a long one that happens to
  // contain the same letters.
  return score + Math.max(0, 10 - text.length / 4)
}

/**
 * The palette's catalog: every action, labelled, with its chord.
 *
 * @param {Array<object>} [bindings] - the live bindings.
 * @returns {Array<{action: string, label: string, chord: string}>} the catalog.
 */
export function actionCatalog(bindings = allBindings()) {
  const chords = new Map()
  for (const binding of Array.isArray(bindings) ? bindings : []) {
    if (!chords.has(binding.action)) chords.set(binding.action, binding.chord)
  }

  return allActionNames().map((action) => ({
    action,
    label: ACTION_LABELS[action] ?? action,
    // The chord is shown so a trader who reaches for the palette twice learns the key on
    // the third time.
    chord: chords.has(action) ? chordLabel(chords.get(action)) : '',
  }))
}

/**
 * Rank the catalog against a query.
 *
 * @param {string} query - what was typed.
 * @param {Array<object>} [catalog] - the catalog to search.
 * @param {number} [limit] - how many rows to return.
 * @returns {Array<object>} the ranked rows, best first.
 */
export function searchActions(query, catalog = actionCatalog(), limit = 8) {
  return (Array.isArray(catalog) ? catalog : [])
    .map((row) => ({ ...row, score: fuzzyScore(row.label, query) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, Math.max(1, Number(limit) || 8))
}

/**
 * Move the palette's selection, wrapping at both ends.
 *
 * @param {number} index - the current selection.
 * @param {number} delta - how far to move.
 * @param {number} count - how many rows there are.
 * @returns {number} the new index.
 */
export function moveSelection(index, delta, count) {
  const total = Math.max(0, Math.floor(Number(count) || 0))
  if (total === 0) return 0

  // Wrapping rather than clamping: holding ArrowDown should cycle, and the last row is
  // one press from the first.
  return (((Number(index) || 0) + (Number(delta) || 0)) % total + total) % total
}

/**
 * Register the palette actions.
 *
 * @returns {string[]} the registered action names.
 */
export function registerPaletteActions() {
  registerAction(ACTIONS.ui.palette, (_state, payload) => {
    const open = payload?.open ?? appState.ui?.modal !== 'palette'
    setValue(PATHS.ui.modal, open ? 'palette' : '')
    selection = 0
    setValue(PATHS.ui.paletteQuery, '')
    setValue(PATHS.ui.paletteIndex, 0)
    rows = open ? searchActions('') : []
    setValue(PATHS.ui.paletteRows, rows)

    return Boolean(open)
  })

  registerAction(ACTIONS.ui.paletteSearch, (_state, payload) => {
    const query = String(payload?.query ?? payload ?? '')
    rows = searchActions(query)
    selection = 0

    setValue(PATHS.ui.paletteQuery, query)
    setValue(PATHS.ui.paletteIndex, 0)
    setValue(PATHS.ui.paletteRows, rows)

    return true
  })

  registerAction(ACTIONS.ui.paletteMove, (_state, payload) => {
    selection = moveSelection(selection, payload?.delta ?? payload, rows.length)
    setValue(PATHS.ui.paletteIndex, selection)

    return selection
  })

  registerAction(ACTIONS.ui.paletteRun, () => {
    const row = rows[selection]
    if (!row) return false

    // Closed before dispatching: the action may open an overlay of its own, and a
    // palette still on screen behind it is the kind of stuck state nobody enjoys.
    setValue(PATHS.ui.modal, '')
    dispatchAction(row.action, {})

    return true
  })

  return [
    ACTIONS.ui.palette,
    ACTIONS.ui.paletteSearch,
    ACTIONS.ui.paletteMove,
    ACTIONS.ui.paletteRun,
  ]
}
