import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

/**
 * The block registry — what the dashboard is made of.
 *
 * Blocks live in state and render through `data-each`, so the layout is data, not
 * markup: a feature adds a block by registering it, the grid picks it up, and
 * settings can hide or reorder it without anyone touching HTML.
 *
 * Every function here is pure over an array and returns a **new** array. Mutating the
 * array in place would skip Spektrum's change detection, and the grid would silently
 * stop matching state — the kind of bug that shows up as "my ladder disappeared".
 */

/** What a block can be doing. Drives skeleton, empty and error rendering. */
export const BLOCK_STATUS = Object.freeze({
  loading: 'loading',
  ready: 'ready',
  empty: 'empty',
  error: 'error',
})

/**
 * Normalise a block definition, filling in the fields the grid relies on.
 *
 * @param {{id: string, title?: string, status?: string, visible?: boolean, order?: number,
 *   icon?: string, error?: string}} block - partial definition.
 * @returns {object|null} the complete block, or null without a usable id.
 */
export function makeBlock(block) {
  const id = String(block?.id ?? '').trim()
  if (!id) return null

  const status = Object.values(BLOCK_STATUS).includes(block.status)
    ? block.status
    : BLOCK_STATUS.loading

  return {
    id,
    title: String(block.title ?? id),
    status,
    visible: block.visible !== false,
    order: Number.isFinite(block.order) ? block.order : 0,
    icon: String(block.icon ?? ''),
    error: String(block.error ?? ''),
  }
}

/**
 * Add a block, or replace the one that already holds its id.
 *
 * Replacing rather than duplicating matters on a hot reload: registering twice must not
 * leave two ladders fighting over the same feed.
 *
 * @param {object[]} blocks - current registry.
 * @param {object} block - block definition.
 * @returns {object[]} a new registry.
 */
export function addBlock(blocks, block) {
  const list = Array.isArray(blocks) ? blocks : []
  const next = makeBlock(block)
  if (!next) return list

  const without = list.filter((b) => b?.id !== next.id)
  return sortBlocks([...without, next])
}

/**
 * Remove a block by id.
 *
 * @param {object[]} blocks - current registry.
 * @param {string} id - block id.
 * @returns {object[]} a new registry.
 */
export function removeBlock(blocks, id) {
  const list = Array.isArray(blocks) ? blocks : []
  return list.filter((b) => b?.id !== id)
}

/**
 * Patch one block's fields, leaving the rest untouched.
 *
 * @param {object[]} blocks - current registry.
 * @param {string} id - block id.
 * @param {object} patch - fields to change.
 * @returns {object[]} a new registry.
 */
export function updateBlock(blocks, id, patch = {}) {
  const list = Array.isArray(blocks) ? blocks : []

  return list.map((b) => (b?.id === id ? makeBlock({ ...b, ...patch, id: b.id }) : b))
}

/**
 * Move a block to a new position, renumbering the rest.
 *
 * @param {object[]} blocks - current registry.
 * @param {string} id - block to move.
 * @param {number} toIndex - destination index, clamped to the list.
 * @returns {object[]} a new registry with contiguous order values.
 */
export function reorderBlock(blocks, id, toIndex) {
  const list = sortBlocks(Array.isArray(blocks) ? blocks : [])
  const from = list.findIndex((b) => b?.id === id)
  if (from === -1) return list

  const target = Math.min(Math.max(Number(toIndex) || 0, 0), list.length - 1)
  const moved = [...list]
  const [block] = moved.splice(from, 1)
  moved.splice(target, 0, block)

  return moved.map((b, index) => ({ ...b, order: index }))
}

/**
 * Sort by order, then id, so the grid is deterministic across reloads.
 *
 * @param {object[]} blocks - registry.
 * @returns {object[]} a new sorted array.
 */
export function sortBlocks(blocks) {
  const list = Array.isArray(blocks) ? blocks : []

  return [...list].sort(
    (a, b) => (a?.order ?? 0) - (b?.order ?? 0) || String(a?.id).localeCompare(String(b?.id)),
  )
}

/**
 * The blocks the grid should actually render.
 *
 * @param {object[]} blocks - registry.
 * @returns {object[]} visible blocks, in order.
 */
export function visibleBlocks(blocks) {
  return sortBlocks(blocks).filter((b) => b?.visible !== false)
}

/**
 * Show or hide a block.
 *
 * @param {object[]} blocks - registry.
 * @param {string} id - block id.
 * @param {boolean} [visible] - explicit state; omitted toggles.
 * @returns {object[]} a new registry.
 */
export function toggleBlock(blocks, id, visible) {
  const list = Array.isArray(blocks) ? blocks : []

  return list.map((b) => {
    if (b?.id !== id) return b
    return { ...b, visible: typeof visible === 'boolean' ? visible : b.visible === false }
  })
}

/**
 * Read the registry out of state.
 *
 * @returns {object[]} the current registry (never undefined).
 */
export function currentBlocks() {
  return Array.isArray(appState?.settings?.blocks) ? appState.settings.blocks : []
}

/**
 * Write a registry into state — the single mutation point.
 *
 * Blocks live under `settings.*` because layout is a preference that should survive a
 * reload, and `settings` is the only persisted branch.
 *
 * @param {object[]} blocks - the new registry.
 * @returns {object[]} what was written, sorted.
 */
export function commitBlocks(blocks) {
  const next = sortBlocks(blocks)
  setValue(PATHS.settings.blocks, next)
  return next
}
