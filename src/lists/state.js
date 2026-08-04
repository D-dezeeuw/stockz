import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import {
  createList,
  addSymbol,
  removeSymbol,
  reorderSymbol,
  deleteList,
  renameList,
  findList,
  qualifySymbol,
} from './ops.js'

/**
 * Watchlists in state.
 *
 * Lists live under `settings.*` so they survive a reload — a trader's watchlist is as
 * personal as their layout, and rebuilding it every morning is the kind of friction that
 * makes a desk feel disposable.
 *
 * The active instrument (`market.focus`) is *not* persisted: it says what is on screen
 * right now, and restoring yesterday's focus would point the order ticket at an
 * instrument the trader is not looking at.
 */

/** @returns {object[]} the lists currently in state. */
export function currentLists() {
  return Array.isArray(appState?.settings?.watchlists) ? appState.settings.watchlists : []
}

/**
 * Write lists into state — the single mutation point.
 *
 * @param {object[]} lists - the new lists.
 * @returns {object[]} what was written.
 */
export function commitLists(lists) {
  const next = Array.isArray(lists) ? lists : []
  setValue(PATHS.settings.watchlists, next)
  return next
}

/**
 * The list the block should render.
 *
 * @returns {object|null} the active list, or null when there are none.
 */
export function activeList() {
  return findList(currentLists(), String(appState?.settings?.activeListId ?? ''))
}

/**
 * Switch which list is shown.
 *
 * @param {object} _state - engine state (unused).
 * @param {{id?: string}} [payload] - list id.
 * @returns {string} the active id now in force.
 */
export function setActiveList(_state, payload = {}) {
  const id = String(payload.id ?? '')
  const list = findList(currentLists(), id)
  const next = list?.id ?? ''

  setValue(PATHS.settings.activeListId, next)
  return next
}

/**
 * Focus an instrument — what the ticket, chart and book all follow.
 *
 * @param {object} _state - engine state (unused).
 * @param {{symbol?: string}} [payload] - qualified or bare symbol.
 * @returns {string} the focused symbol.
 */
export function focusSymbol(_state, payload = {}) {
  const qualified = qualifySymbol(payload.symbol ?? '')
  if (!qualified) return String(appState?.market?.focus ?? '')

  setValue(PATHS.market.focus, qualified)
  return qualified
}

/**
 * Add a symbol to the active list.
 *
 * @param {object} _state - engine state (unused).
 * @param {{symbol?: string, venue?: string, listId?: string}} [payload] - what to add.
 * @returns {object[]} the lists after the change.
 */
export function addToList(_state, payload = {}) {
  const id = payload.listId ?? activeList()?.id
  return commitLists(addSymbol(currentLists(), id, payload.symbol, payload.venue ?? 'okx'))
}

/**
 * Remove a symbol from the active list.
 *
 * @param {object} _state - engine state (unused).
 * @param {{symbol?: string, listId?: string}} [payload] - what to remove.
 * @returns {object[]} the lists after the change.
 */
export function removeFromList(_state, payload = {}) {
  const id = payload.listId ?? activeList()?.id
  return commitLists(removeSymbol(currentLists(), id, payload.symbol))
}

/**
 * Move a row within the active list.
 *
 * @param {object} _state - engine state (unused).
 * @param {{symbol?: string, toIndex?: number, listId?: string}} [payload] - the move.
 * @returns {object[]} the lists after the change.
 */
export function moveInList(_state, payload = {}) {
  const id = payload.listId ?? activeList()?.id
  return commitLists(reorderSymbol(currentLists(), id, payload.symbol, payload.toIndex))
}

/**
 * Create, rename or delete a list.
 *
 * @param {object} _state - engine state (unused).
 * @param {{op?: string, id?: string, name?: string}} [payload] - the operation.
 * @returns {object[]} the lists after the change.
 */
export function manageList(_state, payload = {}) {
  const lists = currentLists()

  if (payload.op === 'create') return commitLists(createList(lists, payload.name))
  if (payload.op === 'rename') return commitLists(renameList(lists, payload.id, payload.name))
  if (payload.op === 'delete') return commitLists(deleteList(lists, payload.id))
  return lists
}

/**
 * Register the watchlist actions.
 *
 * @returns {string[]} names registered by this call.
 */
export function registerListActions() {
  return [
    registerAction(ACTIONS.lists.focus, focusSymbol, { description: 'Focus an instrument' }),
    registerAction(ACTIONS.lists.add, addToList, { description: 'Add a symbol to the list' }),
    registerAction(ACTIONS.lists.remove, removeFromList, { description: 'Remove a symbol' }),
    registerAction(ACTIONS.lists.move, moveInList, { description: 'Reorder a watchlist row' }),
    registerAction(ACTIONS.lists.setActive, setActiveList, { description: 'Switch watchlist' }),
    registerAction(ACTIONS.lists.manage, manageList, { description: 'Create/rename/delete a list' }),
  ]
}
