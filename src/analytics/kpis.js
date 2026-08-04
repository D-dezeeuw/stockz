import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

/**
 * The four numbers that say whether the edge is real.
 *
 * A P&L says what happened. These say whether it will keep happening, and the distinction is
 * the entire reason this module exists: a trader up six hundred on the day with a profit
 * factor of 1.02 has had a good day and does not have an edge, and those two facts call for
 * completely different next weeks.
 *
 * **Empty returns null, never zero.** A desk with no closed trades has no win rate — not a
 * win rate of zero — and rendering zero would put a red 0% on screen for a trader who has
 * simply not traded yet. Every consumer here has to handle null, which is the point: it
 * forces the display to say "—" rather than to lie quietly.
 *
 * Scratches count as neither wins nor losses throughout, consistently with the journal's own
 * day rows. Break-even trades are noise in a ratio built to answer "does the edge exist", and
 * a desk that scratches half its trades would otherwise report fifty percent while making
 * nothing at all.
 */

/**
 * The trades that count, split by outcome.
 *
 * @param {object[]} trades - the enriched trades.
 * @returns {{wins: object[], losses: object[], decided: number}} the split.
 */
export function splitOutcomes(trades) {
  const rows = Array.isArray(trades) ? trades : []
  const wins = rows.filter((trade) => (Number(trade?.net) || 0) > 0)
  const losses = rows.filter((trade) => (Number(trade?.net) || 0) < 0)

  return { wins, losses, decided: wins.length + losses.length }
}

/**
 * How often a trade wins.
 *
 * @param {object[]} trades - the enriched trades.
 * @returns {number|null} 0..1, or null when nothing is decided.
 */
export function winRate(trades) {
  const { wins, decided } = splitOutcomes(trades)
  // Null, not zero: a desk that has not traded has no win rate, and a red 0% on screen for
  // somebody who simply has not started is a readout that lies quietly.
  if (decided === 0) return null

  return Number((wins.length / decided).toFixed(4))
}

/**
 * The typical winner.
 *
 * @param {object[]} trades - the enriched trades.
 * @returns {number|null} the average, or null when there are none.
 */
export function avgWin(trades) {
  const { wins } = splitOutcomes(trades)
  if (wins.length === 0) return null

  const total = wins.reduce((sum, trade) => sum + (Number(trade?.net) || 0), 0)

  return Number((total / wins.length).toFixed(4))
}

/**
 * The typical loser.
 *
 * @param {object[]} trades - the enriched trades.
 * @returns {number|null} the average as a negative number, or null.
 */
export function avgLoss(trades) {
  const { losses } = splitOutcomes(trades)
  if (losses.length === 0) return null

  const total = losses.reduce((sum, trade) => sum + (Number(trade?.net) || 0), 0)

  // Kept negative rather than absolute. A loss is a negative number everywhere else on this
  // desk, and flipping the sign here would make expectancy read as a sum of two positives.
  return Number((total / losses.length).toFixed(4))
}

/**
 * What the next trade is worth, on average.
 *
 * @param {object[]} trades - the enriched trades.
 * @returns {number|null} the expectancy per trade, or null.
 */
export function expectancy(trades) {
  const { wins, decided } = splitOutcomes(trades)
  if (decided === 0) return null

  // Derived from the counts rather than from the published win rate: that one is rounded to
  // four places for display, and multiplying a rounded rate by an average carries the error
  // into a number traders compare across weeks.
  const rate = wins.length / decided
  const win = avgWin(trades) ?? 0
  const loss = avgLoss(trades) ?? 0

  // The one number that answers "should I keep doing this": positive means the process pays
  // over enough repetitions, whatever any individual day looked like.
  return Number((rate * win + (1 - rate) * loss).toFixed(4))
}

/**
 * Gross profit over gross loss.
 *
 * @param {object[]} trades - the enriched trades.
 * @returns {number|null} the factor, or null when nothing is decided.
 */
export function profitFactor(trades) {
  const { wins, losses, decided } = splitOutcomes(trades)
  if (decided === 0) return null

  const won = wins.reduce((sum, trade) => sum + (Number(trade?.net) || 0), 0)
  const lost = Math.abs(losses.reduce((sum, trade) => sum + (Number(trade?.net) || 0), 0))
  // No losses at all is genuinely infinite, and saying so is more honest than a large
  // number that implies a measurement. A trader with four winning trades and no losers has
  // not proven anything, and Infinity reads as "not enough data" to anybody sensible.
  if (lost === 0) return Infinity

  return Number((won / lost).toFixed(4))
}

/**
 * A KPI as text, including the honest blank.
 *
 * @param {number|null} value - the number.
 * @param {string} [kind] - 'pct', 'x' or 'money'.
 * @returns {string} the label.
 */
export function kpiLabel(value, kind = 'money') {
  if (value === null || value === undefined) return '—'
  if (value === Infinity) return '∞'

  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  if (kind === 'pct') return `${Math.round(number * 100)}%`
  if (kind === 'x') return `${number.toFixed(2)}×`

  return `${number >= 0 ? '+' : ''}${number.toFixed(2)}`
}

/**
 * Every KPI, ready to render.
 *
 * @param {object[]} [trades] - the enriched trades.
 * @returns {object[]} the tiles.
 */
export function kpiTiles(trades = appState.analytics?.trades) {
  const rows = Array.isArray(trades) ? trades : []
  const { wins, losses, decided } = splitOutcomes(rows)
  const factor = profitFactor(rows)

  return [
    {
      id: 'winRate',
      label: 'win rate',
      value: kpiLabel(winRate(rows), 'pct'),
      note: `${wins.length}W / ${losses.length}L`,
      // The tone is about the number's meaning, not its sign: a 40% win rate with a 3:1
      // payoff is a fine strategy, so this one never goes red on the rate alone.
      tone: decided === 0 ? 'flat' : 'info',
    },
    {
      id: 'expectancy',
      label: 'expectancy',
      value: kpiLabel(expectancy(rows)),
      note: 'per trade',
      tone: toneOf(expectancy(rows)),
    },
    {
      id: 'profitFactor',
      label: 'profit factor',
      value: kpiLabel(factor, 'x'),
      note: 'gross won / lost',
      tone: factor === null ? 'flat' : factor === Infinity || factor >= 1 ? 'up' : 'down',
    },
    {
      id: 'payoff',
      label: 'avg win / loss',
      value: `${kpiLabel(avgWin(rows))} / ${kpiLabel(avgLoss(rows))}`,
      note: `${rows.length} trades`,
      tone: toneOf((avgWin(rows) ?? 0) + (avgLoss(rows) ?? 0)),
    },
  ]
}

/**
 * Which way a number leans.
 *
 * @param {number|null} value - the number.
 * @returns {string} 'up', 'down' or 'flat'.
 */
export function toneOf(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'flat'

  const number = Number(value)
  // Exact zero is flat, not up. A break-even expectancy is not good news dressed in green.
  if (number === 0) return 'flat'

  return number > 0 ? 'up' : 'down'
}

/**
 * Publish the tiles.
 *
 * @param {object[]} [trades] - the enriched trades.
 * @returns {object[]} the tiles.
 */
export function refreshKpis(trades = appState.analytics?.trades) {
  const tiles = kpiTiles(trades)
  setValue(PATHS.analytics.kpis, tiles)

  return tiles
}
