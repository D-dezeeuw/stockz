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
  { id: 'bot', title: 'Auto-Trade', icon: 'bolt', order: 10, status: BLOCK_STATUS.ready },
  { id: 'journal', title: 'Journal', icon: 'clock', order: 11, status: BLOCK_STATUS.empty },
  { id: 'analytics', title: 'Analytics', icon: 'chart', order: 12, status: BLOCK_STATUS.empty },
  { id: 'backtest', title: 'Backtest', icon: 'bolt', order: 13, status: BLOCK_STATUS.ready },
  { id: 'paper', title: 'Practice Account', icon: 'chart', order: 14, status: BLOCK_STATUS.ready },
  // The server-side loop. Distinct from 'bot' on purpose: that block is this browser's
  // autopilot, this one is a process on the host that keeps trading with every tab closed.
  { id: 'trader', title: 'Server Trader', icon: 'bolt', order: 15, status: BLOCK_STATUS.ready },
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
  if (existing.length === 0 || force) return commitBlocks(DEFAULT_BLOCKS.map(makeBlock))

  const missing = missingBlocks(existing)
  if (missing.length === 0) return existing

  // A returning trader keeps their own order and visibility; blocks added since their last
  // visit are appended. Without this a saved layout was frozen at the shape it had on the
  // trader's first ever load — every block shipped afterwards was seeded into an object
  // that was never consulted again, so the feature existed, rendered nowhere, and looked
  // like it had failed to build.
  return commitBlocks([...existing, ...missing.map(makeBlock)])
}

/**
 * Default blocks a saved layout has never seen.
 *
 * Matched on id alone — a trader who hid, moved or renamed a block has *seen* it, and
 * re-adding it would undo a deliberate choice on every deploy.
 *
 * @param {object[]} existing - the layout in state.
 * @returns {object[]} the defaults not present, in their declared order.
 */
export function missingBlocks(existing) {
  const known = new Set((Array.isArray(existing) ? existing : []).map((block) => block?.id))
  return DEFAULT_BLOCKS.filter((block) => !known.has(block.id))
}
