import { publishTick, scheduleFlush, busStats } from './bus.js'
import { addTrade } from './candles.js'
import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { updateBlock, currentBlocks, commitBlocks } from '../blocks/registry.js'
import { isStale } from '../venues/okx/socket.js'

/**
 * Where venues meet the pipeline.
 *
 * One entry point (`ingest`) so every feed — OKX socket, EToro poller, market replay in
 * phase 27 — goes through identical handling. A second path would be a second set of
 * bugs, and replay must be indistinguishable from live or it proves nothing.
 */

/** venue -> epoch ms of the last message seen. */
const lastSeen = new Map()

/**
 * Take a tick from a venue into the pipeline.
 *
 * @param {object} tick - internal tick or trade.
 * @param {{now?: number, focus?: string}} [context] - timing and focus.
 * @returns {boolean} true when the tick was accepted.
 */
export function ingest(tick, context = {}) {
  if (!publishTick(tick)) return false

  const now = Number(context.now ?? tick?.ts ?? 0)
  lastSeen.set(String(tick.venue ?? 'unknown'), now)

  if (Number.isFinite(tick.px)) addTrade(tick.symbol, tick)

  // The UI is updated by the frame, never by the tick.
  scheduleFlush(context.focus ?? appState?.market?.focus ?? tick.symbol)
  return true
}

/**
 * Record a venue's connection state where the header LEDs can see it.
 *
 * @param {string} venue - venue name.
 * @param {string} state - 'live' | 'connecting' | 'stale' | 'dead'.
 * @returns {object} the venue map now in state.
 */
export function setVenueState(venue, state) {
  const venues = { ...(appState?.market?.venues ?? {}) }
  venues[String(venue)] = { ...(venues[String(venue)] ?? {}), state: String(state) }

  setValue(PATHS.market.venues, venues)
  return venues
}

/**
 * Mark venues whose feed has gone quiet.
 *
 * An open socket that has stopped delivering is the dangerous case: the prices simply
 * stop moving, and without this nothing on screen says so.
 *
 * @param {number} now - epoch ms.
 * @param {number} [limitMs] - silence tolerated.
 * @returns {string[]} venues newly marked stale.
 */
export function markStaleFeeds(now, limitMs = 10000) {
  const marked = []

  for (const [venue, seen] of lastSeen) {
    const current = appState?.market?.venues?.[venue]?.state
    if (current === 'live' && isStale(seen, now, limitMs)) {
      setVenueState(venue, 'stale')
      marked.push(venue)
    }
  }
  return marked
}

/**
 * Reflect feed health onto a block, so a chart says "stale" instead of lying quietly.
 *
 * @param {string} blockId - block to update.
 * @param {string} status - a BLOCK_STATUS value.
 * @param {string} [error] - message when status is 'error'.
 * @returns {object[]} the registry after the update.
 */
export function setBlockFeedStatus(blockId, status, error = '') {
  return commitBlocks(updateBlock(currentBlocks(), blockId, { status, error }))
}

/**
 * Pipeline counters for the HUD.
 *
 * @returns {object} bus stats plus per-venue last-seen times.
 */
export function feedStats() {
  return { ...busStats(), lastSeen: Object.fromEntries(lastSeen) }
}

/** Forget feed timing (tests, reconnect). */
export function resetFeed() {
  lastSeen.clear()
}
