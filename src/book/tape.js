import { formatClock } from '../charts/crosshair.js'
import { formatPrice } from '../charts/scale.js'
import { recentTrades } from '../pipeline/bus.js'
import { setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

/**
 * Time & sales — the flow, coloured by who crossed the spread.
 *
 * The tape answers a question the chart cannot: *who is being aggressive right now*. A
 * price rising on small buys reads very differently from the same price rising on one
 * 40-lot sweep, and only the tape shows the difference.
 *
 * Two constraints shape everything here. It must be **capped** — a busy pair prints
 * hundreds a second and an unbounded list is a memory leak with a clock on it. And it
 * must be **cheap to re-render** — the buffer is newest-first already, so the template
 * never sorts or reverses on a frame.
 */

/** Prints retained. Roughly a minute of a hot pair, which is as far back as flow reads. */
export const TAPE_CAPACITY = 500

/**
 * Push a print onto the tape, dropping the oldest when full.
 *
 * @param {object[]} prints - the current tape, newest first.
 * @param {object} print - the new print.
 * @param {number} [capacity] - maximum retained.
 * @returns {object[]} a new array, newest first.
 */
export function pushPrint(prints, print, capacity = TAPE_CAPACITY) {
  const list = Array.isArray(prints) ? prints : []
  if (!print || !Number.isFinite(Number(print.px))) return list

  const max = Math.max(1, Math.floor(Number(capacity) || TAPE_CAPACITY))
  // Newest first, so the template renders in insertion order and never reverses a
  // 500-entry array on a frame.
  return [print, ...list].slice(0, max)
}

/**
 * Map a raw trade into a tape print.
 *
 * @param {{px: number, sz?: number, side?: string, ts?: number}} trade - the trade.
 * @returns {{px: number, sz: number, side: string, ts: number}|null} the print.
 */
export function toPrint(trade) {
  const px = Number(trade?.px)
  if (!Number.isFinite(px)) return null

  return {
    px,
    sz: Number(trade?.sz) || 0,
    // Aggressor side, not the maker's: the tape is a record of who crossed.
    side: String(trade?.side ?? '').toLowerCase() === 'sell' ? 'sell' : 'buy',
    ts: Number(trade?.ts) || 0,
  }
}

/**
 * The CSS class for a print's side.
 *
 * @param {string} side - 'buy' or 'sell'.
 * @returns {string} the row class.
 */
export function sideClass(side) {
  return String(side ?? '').toLowerCase() === 'sell' ? 'tape__row tape__row--sell' : 'tape__row tape__row--buy'
}

/**
 * Format a print's timestamp for the tape's time column.
 *
 * @param {number} ts - epoch milliseconds.
 * @returns {string} hh:mm:ss.mmm.
 */
export function formatTapeTime(ts) {
  return formatClock(ts)
}

/**
 * Shorten a size for the tape's size column.
 *
 * @param {number} size - the print size.
 * @returns {string} e.g. '1.2K', '3.4M', '0.75'.
 */
export function formatSizeShort(size) {
  const value = Number(size)
  if (!Number.isFinite(value)) return '—'

  const magnitude = Math.abs(value)
  // Magnitude beats precision on a scrolling tape: the eye is scanning for the outlier,
  // and '1.2M' finds it in a way '1234567.8900' does not.
  if (magnitude >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (magnitude >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  if (magnitude >= 1) return value.toFixed(2)

  return value.toFixed(4)
}

/**
 * Build the tape rows for a symbol from the pipeline's buffer.
 *
 * @param {string} symbol - instrument.
 * @param {{limit?: number, tickSize?: number}} [options] - display options.
 * @returns {Array<object>} rows, newest first.
 */
export function tapeRows(symbol, options = {}) {
  const { limit = 100, tickSize = 0.01 } = options

  return recentTrades(symbol, limit)
    .map(toPrint)
    .filter(Boolean)
    .reverse()
    .map((print) => ({
      ...print,
      cls: sideClass(print.side),
      timeLabel: formatTapeTime(print.ts),
      priceLabel: formatPrice(print.px, tickSize),
      sizeLabel: formatSizeShort(print.sz),
    }))
}

/**
 * Write the focused symbol's tape into state. Called once per frame, never per print.
 *
 * @param {string} focus - the instrument the desk is focused on.
 * @param {{limit?: number, tickSize?: number}} [options] - display options.
 * @returns {number} rows written.
 */
export function flushTape(focus, options = {}) {
  const key = String(focus ?? '')
  if (!key) return 0

  const rows = tapeRows(key, options)
  setValue(PATHS.market.tape, rows)
  return rows.length
}
