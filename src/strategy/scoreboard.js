import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { formatCompact } from '../hud/metrics.js'

/**
 * Which strategy actually earns.
 *
 * A desk running eight strategies has eight opinions and one account. Without a per-strategy
 * scoreboard the trader knows only their total, which tells them the day went badly and
 * nothing at all about which idea to stop running.
 *
 * Everything here is **incremental**. A rollup that rescanned the ledger on every close
 * would be O(closes) per close, and the whole point of the phase-20 budget was that nothing
 * a strategy touches is allowed to grow with the session.
 *
 * The number that matters most is not win rate — a strategy can win 80% of its trades and
 * lose money on the other 20% — it is **net per trade**. It is the one column ordered by,
 * because "which of these should I turn off" is the question the block exists to answer.
 */

/** Per-strategy stats. Held outside the reactive tree, flushed on change. */
let stats = new Map()

/** Fires waiting for an outcome, keyed by strategy and instrument. */
let open = new Map()

/**
 * The blank row a strategy starts from.
 *
 * @param {string} strategyId - the strategy.
 * @returns {object} the row.
 */
export function emptyStats(strategyId) {
  return {
    strategyId: String(strategyId ?? ''),
    fires: 0,
    closes: 0,
    wins: 0,
    net: 0,
    holdMs: 0,
    firstTs: 0,
    lastTs: 0,
  }
}

/**
 * Record that a strategy fired.
 *
 * @param {{strategyId?: string, instrument?: string, action?: string, ts?: number}} event - the signal.
 * @returns {object|null} the strategy's row.
 */
export function recordFire(event) {
  const id = String(event?.strategyId ?? '')
  const action = String(event?.action ?? '')
  // 'flat' and 'none' are a strategy closing or saying nothing, not a fire. Counting them
  // would double the fire count of every strategy that exits by signal.
  if (!id || action === 'flat' || action === 'none' || !action) return null

  const row = stats.get(id) ?? emptyStats(id)
  row.fires += 1
  const ts = Number(event?.ts) || 0
  if (!row.firstTs) row.firstTs = ts
  row.lastTs = Math.max(row.lastTs, ts)
  stats.set(id, row)

  open.set(`${id}@${String(event?.instrument ?? '')}`, { side: action, ts })

  return row
}

/**
 * Attribute a closed trade to the strategy that opened it.
 *
 * @param {{strategyId?: string, instrument?: string, amount?: number, ts?: number}} close - the close.
 * @returns {object|null} the strategy's row.
 */
export function recordOutcome(close) {
  const id = String(close?.strategyId ?? '')
  const amount = Number(close?.amount)
  if (!id || !Number.isFinite(amount)) return null

  const key = `${id}@${String(close?.instrument ?? '')}`
  const fire = open.get(key)
  const ts = Number(close?.ts) || 0

  const row = stats.get(id) ?? emptyStats(id)
  row.closes += 1
  row.net = Number((row.net + amount).toFixed(8))
  if (amount > 0) row.wins += 1
  // Hold time only where the fire is known. A close with no matching fire still counts
  // toward P&L — the money moved either way — but averaging in a zero hold would report
  // instant round trips that never happened.
  if (fire) {
    row.holdMs += Math.max(0, ts - Number(fire.ts))
    open.delete(key)
  }
  row.lastTs = Math.max(row.lastTs, ts)

  stats.set(id, row)
  return row
}

/**
 * Derive the readable numbers from a row.
 *
 * @param {object} row - the accumulator.
 * @returns {object} the rollup.
 */
export function statsRollup(row) {
  const closes = Number(row?.closes) || 0
  const wins = Number(row?.wins) || 0
  const net = Number(row?.net) || 0
  const fires = Number(row?.fires) || 0
  const span = Math.max(0, Number(row?.lastTs) - Number(row?.firstTs))

  return {
    strategyId: String(row?.strategyId ?? ''),
    fires,
    closes,
    net: Number(net.toFixed(8)),
    winRate: closes > 0 ? Number((wins / closes).toFixed(4)) : 0,
    // The column that answers "which of these should I turn off". A strategy can win 80% of
    // its trades and still lose money on the other 20%.
    perTrade: closes > 0 ? Number((net / closes).toFixed(6)) : 0,
    avgHoldMs: closes > 0 ? Math.round((Number(row?.holdMs) || 0) / closes) : 0,
    // Only meaningful once the strategy has been running a while; a fire in the first
    // second would otherwise extrapolate to 3600 an hour.
    firesPerHour: span >= 60000 ? Number(((fires / span) * 3600000).toFixed(1)) : 0,
  }
}

/**
 * Every strategy's scoreboard, worst-earning last.
 *
 * @returns {object[]} the rows.
 */
export function scoreboard() {
  return [...stats.values()]
    .map(statsRollup)
    .sort((a, b) => b.net - a.net || b.closes - a.closes)
}

/**
 * Publish the scoreboard.
 *
 * @returns {object[]} what was published.
 */
export function flushScoreboard() {
  const rows = scoreboard().map((row) => ({
    ...row,
    netLabel: formatCompact(row.net),
    winRateLabel: `${Math.round(row.winRate * 100)}%`,
    holdLabel: row.avgHoldMs >= 1000 ? `${(row.avgHoldMs / 1000).toFixed(1)}s` : `${row.avgHoldMs}ms`,
    tone: row.net > 0 ? 'up' : row.net < 0 ? 'down' : 'flat',
  }))

  setValue(PATHS.strategy.scoreboard, rows)
  return rows
}

/**
 * Attribute a realisation to whichever strategy is long or short that instrument.
 *
 * @param {object} realization - the ledger entry.
 * @returns {object|null} the strategy's row.
 */
export function attributeClose(realization) {
  const instrument = String(realization?.instrument ?? '')
  // Matched by the open fire rather than by anything on the fill: the execution layer
  // deliberately does not know which strategy asked, and threading a strategy id through
  // the order path would couple the two for one statistic.
  const match = [...open.keys()].find((key) => key.endsWith(`@${instrument}`))
  if (!match) return null

  return recordOutcome({ ...realization, strategyId: match.split('@')[0], instrument })
}

/**
 * Reset the day's scoreboard.
 *
 * @returns {boolean} true.
 */
export function resetScoreboard() {
  stats = new Map()
  open = new Map()
  setValue(PATHS.strategy.scoreboard, [])
  return true
}

/**
 * Restore a scoreboard saved across a reload.
 *
 * @param {object[]} [rows] - saved rows.
 * @returns {number} how many were restored.
 */
export function restoreScoreboard(rows = appState.settings?.strategyStats) {
  const saved = Array.isArray(rows) ? rows : []
  stats = new Map()
  for (const row of saved) {
    const id = String(row?.strategyId ?? '')
    if (!id) continue
    stats.set(id, { ...emptyStats(id), ...row, strategyId: id })
  }

  return stats.size
}

/**
 * Save the scoreboard so it survives a reload.
 *
 * @returns {object[]} what was saved.
 */
export function saveScoreboard() {
  const rows = [...stats.values()]
  setValue(PATHS.settings.strategyStats, rows)
  return rows
}
