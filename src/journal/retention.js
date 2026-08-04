import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { journalTrades } from './pairing.js'
import { buildCsv } from './csv.js'
import { downloadFile } from './export.js'
import { pushToast } from '../ui/toast.js'

/**
 * Keeping the journal fast forever.
 *
 * A desk that runs for a year accumulates a journal that takes a second to filter, and the
 * fix is not a faster filter — it is not keeping a year. Retention is a policy the trader
 * sets, applied at idle so cleanup never competes with live scalping.
 *
 * **Nothing valuable disappears silently.** When a prune would drop trades, the CSV of what
 * is about to go is offered first. A trader who set a thirty-day window and then lost the
 * one trade they wanted to show somebody has been failed by the feature, not served by it,
 * and the difference between the two is one download.
 *
 * Age is applied before count, deliberately. The other order would keep a thousand ancient
 * trades and drop last week's, which is exactly backwards: recency is what makes a journal
 * entry useful, and a trade from March is a trade nobody is learning from in November.
 */

/** What the desk keeps when the trader has said nothing. */
export const DEFAULT_POLICY = Object.freeze({ maxDays: 90, maxTrades: 5000, maxCheckpoints: 200 })

/**
 * The policy in force.
 *
 * @param {object} [state] - the settings slice.
 * @returns {{maxDays: number, maxTrades: number, maxCheckpoints: number}} the policy.
 */
export function retentionPolicy(state = appState?.settings) {
  const read = (key) => {
    const value = Number(state?.[key])
    // Zero is "keep everything", consistently with every other limit on this desk. A zero
    // that meant "keep nothing" would delete a trader's history the first time they cleared
    // a box to see what happened.
    return Number.isFinite(value) && value >= 0 ? value : DEFAULT_POLICY[key]
  }

  return {
    maxDays: read('maxDays'),
    maxTrades: read('maxTrades'),
    maxCheckpoints: read('maxCheckpoints'),
  }
}

/**
 * Split trades into what stays and what goes.
 *
 * @param {object[]} trades - the trades, oldest first.
 * @param {object} [policy] - the retention policy.
 * @param {number} [now] - the current time.
 * @returns {{kept: object[], pruned: object[]}} the split.
 */
export function pruneTrades(trades, policy = retentionPolicy(), now = 0) {
  const rows = Array.isArray(trades) ? trades : []
  const days = Number(policy?.maxDays) || 0
  const cutoff = days > 0 ? (Number(now) || 0) - days * 86400000 : -Infinity

  // Age first, then count. The other order keeps a thousand ancient trades and drops last
  // week's, which is exactly backwards — a trade from March is one nobody is learning from
  // in November.
  const recent = rows.filter((trade) => (Number(trade?.closeTs) || 0) >= cutoff)
  const max = Number(policy?.maxTrades) || 0
  const kept = max > 0 && recent.length > max ? recent.slice(-max) : recent

  const keptIds = new Set(kept)

  return { kept, pruned: rows.filter((trade) => !keptIds.has(trade)) }
}

/**
 * Trim the price trails to the window.
 *
 * @param {Map<string, object>} trails - instrument -> ring.
 * @param {object} [policy] - the retention policy.
 * @param {number} [now] - the current time.
 * @returns {number} how many instruments were dropped.
 */
export function pruneTicks(trails, policy = retentionPolicy(), now = 0) {
  const map = trails instanceof Map ? trails : new Map()
  const days = Number(policy?.maxDays) || 0
  if (days <= 0) return 0

  const cutoff = (Number(now) || 0) - days * 86400000
  let dropped = 0

  for (const [instrument, trail] of map.entries()) {
    const marks = typeof trail?.toArray === 'function' ? trail.toArray() : []
    // An instrument whose whole trail is older than the window is one nobody is trading any
    // more; keeping its ring alive is keeping memory for a symbol off the watchlist.
    if (marks.length && marks[marks.length - 1]?.ts >= cutoff) continue
    map.delete(instrument)
    dropped += 1
  }

  return dropped
}

/**
 * Cap the pin index.
 *
 * @param {object[]} pins - the checkpoints, oldest first.
 * @param {object} [policy] - the retention policy.
 * @returns {{kept: object[], dropped: number}} the split.
 */
export function pruneCheckpoints(pins, policy = retentionPolicy()) {
  const rows = Array.isArray(pins) ? pins : []
  const max = Number(policy?.maxCheckpoints) || 0
  if (max <= 0 || rows.length <= max) return { kept: rows, dropped: 0 }

  // Oldest go first: time travel is for reviewing what just happened, and a snapshot from
  // three months ago restores a desk configuration that no longer exists.
  return { kept: rows.slice(-max), dropped: rows.length - max }
}

/**
 * Offer the CSV of what is about to be deleted.
 *
 * @param {object[]} pruned - what would go.
 * @param {{now?: number, download?: Function}} [deps] - injectable plumbing.
 * @returns {boolean} true when something was offered.
 */
export function archiveBeforePrune(pruned, deps = {}) {
  const rows = Array.isArray(pruned) ? pruned : []
  if (rows.length === 0) return false

  // Offered, not asked. A confirm dialog in a background cleanup is a dialog that appears
  // while somebody is mid-trade, and this desk does not do that — the file simply arrives.
  const download = deps.download ?? downloadFile
  download(
    { name: `stockz-archive-${rows.length}.csv`, text: buildCsv(rows), type: 'text/csv' },
    deps,
  )
  pushToast(`archived ${rows.length} trades before pruning`, 'info', Number(deps.now) || 0)

  return true
}

/**
 * How much room the history is taking.
 *
 * @param {object} [storage] - the storage manager.
 * @returns {Promise<{used: number, quota: number, pct: number}>} the estimate.
 */
export async function storageUsage(storage = globalThis.navigator?.storage) {
  try {
    const estimate = (await storage?.estimate?.()) ?? {}
    const used = Number(estimate.usage) || 0
    const quota = Number(estimate.quota) || 0
    const pct = quota > 0 ? Number((used / quota).toFixed(4)) : 0
    // The label is built here rather than in the template: Spektrum expressions do not carry
    // `Math`, and a binding that silently evaluates to nothing is the worst kind of broken.
    // A quota of zero is "the browser did not say", not "nothing used". Rendering that as
    // 0% would be a readout claiming a fact nobody supplied.
    const usage = { used, quota, pct, label: quota > 0 ? `${Math.round(pct * 100)}%` : '—' }
    setValue(PATHS.journal.storage, usage)

    return usage
  } catch {
    // An unsupported or blocked estimate reads zero rather than throwing: this is a readout,
    // and no browser should be able to break the journal by declining to answer.
    const empty = { used: 0, quota: 0, pct: 0, label: '—' }
    setValue(PATHS.journal.storage, empty)

    return empty
  }
}

/**
 * Run the whole policy.
 *
 * @param {{now?: number, trades?: object[], pins?: object[], archive?: Function}} [deps] -
 *   injectable plumbing.
 * @returns {{trades: number, pins: number}} what was dropped.
 */
export function runRetention(deps = {}) {
  const policy = deps.policy ?? retentionPolicy()
  const now = Number(deps.now) || 0

  const { kept, pruned } = pruneTrades(deps.trades ?? journalTrades(), policy, now)
  if (pruned.length) {
    const archive = deps.archive ?? archiveBeforePrune
    archive(pruned, deps)
  }

  const pins = pruneCheckpoints(deps.pins ?? [], policy)
  setValue(PATHS.journal.pruned, { trades: pruned.length, pins: pins.dropped, at: now })

  return { trades: pruned.length, pins: pins.dropped, kept: kept.length }
}

/**
 * Schedule the cleanup for a moment nobody is trading in.
 *
 * @param {{idle?: Function, run?: Function}} [deps] - injectable plumbing.
 * @returns {boolean} true when it was scheduled.
 */
export function scheduleRetention(deps = {}) {
  const idle =
    deps.idle ?? globalThis.requestIdleCallback?.bind(globalThis) ?? globalThis.setTimeout
  if (typeof idle !== 'function') return false

  // Idle, never on a timer that fires mid-session: cleanup competing with a live order book
  // for a frame is cleanup that costs the trader money to save disk nobody was short of.
  idle(() => (deps.run ?? runRetention)({ now: Date.now() }))

  return true
}

/**
 * Register the retention actions.
 *
 * @returns {string} the action name.
 */
export function registerRetentionActions() {
  registerAction(ACTIONS.journal.prune, () => runRetention({ now: Date.now() }).trades)

  return ACTIONS.journal.prune
}
