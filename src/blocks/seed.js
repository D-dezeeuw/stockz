import { commitBlocks, currentBlocks, makeBlock, BLOCK_STATUS } from './registry.js'

/**
 * The blocks a fresh desk starts with.
 *
 * Placeholders for the features each later phase fills in — the grid exists from day one
 * so every phase drops into a slot rather than reinventing layout. Statuses are honest:
 * a block whose feature does not exist yet says so instead of pretending to load forever.
 */
export const DEFAULT_BLOCKS = Object.freeze([
  { id: 'watchlist', title: 'Watchlist', icon: 'chart', order: 0, status: BLOCK_STATUS.empty },
  { id: 'chart', title: 'Micro Chart', icon: 'chart', order: 1, status: BLOCK_STATUS.loading },
  { id: 'book', title: 'Order Book', icon: 'chart', order: 2, status: BLOCK_STATUS.ready },
  { id: 'tape', title: 'Time & Sales', icon: 'clock', order: 3, status: BLOCK_STATUS.ready },
  { id: 'ticket', title: 'Order Ticket', icon: 'bolt', order: 4, status: BLOCK_STATUS.ready },
  { id: 'positions', title: 'Positions', icon: 'chart', order: 5, status: BLOCK_STATUS.ready },
  { id: 'hud', title: 'Scalper HUD', icon: 'gear', order: 6, status: BLOCK_STATUS.ready },
  { id: 'strategies', title: 'Strategies', icon: 'bolt', order: 7, status: BLOCK_STATUS.ready },
  { id: 'scoreboard', title: 'Strategy Score', icon: 'chart', order: 8, status: BLOCK_STATUS.ready },
  { id: 'alerts', title: 'Alert Log', icon: 'clock', order: 9, status: BLOCK_STATUS.ready },
  { id: 'journal', title: 'Journal', icon: 'clock', order: 10, status: BLOCK_STATUS.empty },
])

/**
 * Seed the registry, without trampling a layout the trader already arranged.
 *
 * Settings persist, so a returning trader keeps their own block order and visibility;
 * seeding only fills an empty registry.
 *
 * @param {boolean} [force] - replace an existing layout (a reset-to-defaults action).
 * @returns {object[]} the registry now in state.
 */
export function seedBlocks(force = false) {
  const existing = currentBlocks()
  if (existing.length > 0 && !force) return existing

  return commitBlocks(DEFAULT_BLOCKS.map(makeBlock))
}
