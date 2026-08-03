import { qualifySymbol } from './ops.js'

/**
 * Fuzzy instrument search.
 *
 * A scalper types three letters and expects the right instrument first. Subsequence
 * matching (not substring) is what makes 'btu' find 'BTC-USDT', and the scoring puts
 * prefix matches on top because that is what someone typing fast actually meant.
 */

/**
 * Score a candidate against a query.
 *
 * @param {string} candidate - the symbol.
 * @param {string} query - what was typed.
 * @returns {number} score; 0 means no match, higher is better.
 */
export function fuzzyScore(candidate, query) {
  const text = String(candidate ?? '').toUpperCase()
  const needle = String(query ?? '').trim().toUpperCase()

  if (!needle) return 1
  if (!text) return 0
  if (text === needle) return 1000
  if (text.startsWith(needle)) return 500 - text.length

  let score = 0
  let index = -1
  let streak = 0

  for (const char of needle) {
    const found = text.indexOf(char, index + 1)
    if (found === -1) return 0

    // Consecutive characters score higher: 'btc' matching 'BTC-USDT' beats a scattered
    // match in some unrelated ticker.
    streak = found === index + 1 ? streak + 1 : 0
    score += 10 + streak * 5
    index = found
  }
  return Math.max(1, score - text.length)
}

/**
 * Search instruments across venues.
 *
 * @param {Array<{symbol: string, venue?: string}>} instruments - the catalogue.
 * @param {string} query - what was typed.
 * @param {number} [limit] - how many results.
 * @returns {Array<{id: string, symbol: string, venue: string, score: number}>} matches.
 */
export function searchInstruments(instruments, query, limit = 10) {
  const list = Array.isArray(instruments) ? instruments : []

  return list
    .map((item) => {
      const symbol = String(item?.symbol ?? '')
      const venue = String(item?.venue ?? 'okx')
      return { id: qualifySymbol(symbol, venue), symbol, venue, score: fuzzyScore(symbol, query) }
    })
    .filter((item) => item.score > 0 && item.id)
    .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol))
    .slice(0, Math.max(0, limit))
}
