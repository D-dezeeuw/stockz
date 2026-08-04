import { appState } from '../app/engine.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { downloadFile } from './export.js'
import { pushToast } from '../ui/toast.js'

/**
 * The journal, in a spreadsheet.
 *
 * The desk is not where a trader will do their monthly review, and pretending otherwise
 * would mean rebuilding pivot tables badly. This exports what the filters are already
 * showing — what you slice is what you get — into a file that opens cleanly in Excel,
 * Sheets or LibreOffice.
 *
 * **Everything here is locale-independent on purpose.** Numbers get fixed decimal points
 * and timestamps get ISO 8601, never `toLocaleString`. A file exported on a machine with a
 * comma decimal separator would import as text into a spreadsheet expecting dots, and the
 * failure is silent: the columns look right and every sum is zero.
 *
 * Escaping is RFC 4180 and not "wrap it in quotes if it has a comma". A note containing a
 * quote, a newline or a leading equals sign is a note a trader actually wrote, and each of
 * those breaks a naive writer differently.
 */

/** What ends up in the file, in order. */
export const CSV_COLUMNS = Object.freeze([
  Object.freeze({ header: 'closed_at', value: (t) => isoOrBlank(t?.closeTs) }),
  Object.freeze({ header: 'opened_at', value: (t) => isoOrBlank(t?.openTs) }),
  Object.freeze({ header: 'instrument', value: (t) => String(t?.instrument ?? '') }),
  Object.freeze({ header: 'side', value: (t) => String(t?.side ?? '') }),
  Object.freeze({ header: 'qty', value: (t) => fixed(t?.qty, 8) }),
  Object.freeze({ header: 'entry_px', value: (t) => fixed(t?.entryPx, 8) }),
  Object.freeze({ header: 'exit_px', value: (t) => fixed(t?.exitPx, 8) }),
  Object.freeze({ header: 'hold_ms', value: (t) => fixed(t?.hold, 0) }),
  Object.freeze({ header: 'gross', value: (t) => fixed(t?.pnl, 2) }),
  Object.freeze({ header: 'fees', value: (t) => fixed(t?.fees, 4) }),
  Object.freeze({ header: 'slippage', value: (t) => fixed(t?.slippage, 4) }),
  Object.freeze({ header: 'net', value: (t) => fixed(t?.net, 2) }),
  Object.freeze({ header: 'mae', value: (t) => fixed(t?.mae, 2) }),
  Object.freeze({ header: 'mfe', value: (t) => fixed(t?.mfe, 2) }),
  Object.freeze({ header: 'r', value: (t) => fixed(t?.r, 2) }),
  Object.freeze({ header: 'tags', value: (t) => (t?.tags ?? []).join(' ') }),
  Object.freeze({ header: 'note', value: (t) => String(t?.note ?? '') }),
])

/**
 * A number with a fixed point, whatever the machine's locale.
 *
 * @param {number} value - the number.
 * @param {number} places - decimals.
 * @returns {string} the text.
 */
export function fixed(value, places) {
  // Checked before the coercion, because `Number(null)` is a perfectly finite zero and a
  // missing value would otherwise be written as a real one. A spreadsheet averaging the
  // column cannot tell those apart, and one of them changes the answer.
  if (value === null || value === undefined || value === '') return ''

  const number = Number(value)
  if (!Number.isFinite(number)) return ''

  return number.toFixed(Math.max(0, Number(places) || 0))
}

/**
 * A timestamp a spreadsheet can parse anywhere.
 *
 * @param {number} ts - the epoch millisecond.
 * @returns {string} an ISO 8601 string, or blank.
 */
export function isoOrBlank(ts) {
  const at = Number(ts)
  if (!Number.isFinite(at) || at <= 0) return ''

  return new Date(at).toISOString()
}

/**
 * One CSV field, escaped.
 *
 * @param {unknown} value - the field.
 * @returns {string} the escaped field.
 */
export function toCsvField(value) {
  const text = String(value ?? '')
  // RFC 4180: quote when the field contains a delimiter, a quote or a line break, and
  // double any quote inside. A note containing any of those is a note a trader wrote.
  if (!/[",\r\n]/.test(text)) return text

  return `"${text.replace(/"/g, '""')}"`
}

/**
 * One CSV line.
 *
 * @param {unknown[]} values - the fields.
 * @returns {string} the line.
 */
export function toCsvRow(values) {
  return (Array.isArray(values) ? values : []).map(toCsvField).join(',')
}

/**
 * The whole document.
 *
 * @param {object[]} trades - the enriched trades.
 * @returns {string} the CSV.
 */
export function buildCsv(trades) {
  const rows = [toCsvRow(CSV_COLUMNS.map((column) => column.header))]

  for (const trade of Array.isArray(trades) ? trades : []) {
    rows.push(toCsvRow(CSV_COLUMNS.map((column) => column.value(trade))))
  }

  // CRLF, because that is what RFC 4180 says and what the one spreadsheet that still cares
  // expects. Nothing that reads CSV is confused by it.
  return `${rows.join('\r\n')}\r\n`
}

/**
 * What the file is called.
 *
 * @param {number} [now] - the export time.
 * @returns {string} the filename.
 */
export function csvName(now = 0) {
  const stamp = new Date(Number(now) || 0).toISOString().slice(0, 10).replace(/-/g, '')

  return `stockz-trades-${stamp}.csv`
}

/**
 * Export the slice on screen.
 *
 * @param {{now?: number, rows?: object[], download?: Function}} [deps] - injectable plumbing.
 * @returns {{name: string, rows: number}} what was written.
 */
export function exportCsv(deps = {}) {
  // The filtered list, not every trade: what you slice is what you get, and an export that
  // ignored the filters would be a surprise nobody checks for until the review.
  const rows = deps.rows ?? appState.journal?.filtered ?? []
  const text = buildCsv(rows)
  const name = csvName(deps.now)

  const download = deps.download ?? downloadFile
  download({ name, text, type: 'text/csv' }, deps)
  // A file download gives no feedback of its own in most browsers, and a button that looks
  // like it did nothing gets pressed four more times.
  pushToast(rows.length ? `exported ${rows.length} trades` : 'exported an empty journal', 'info', Number(deps.now) || 0)

  return { name, rows: rows.length }
}

/**
 * Register the CSV action.
 *
 * @returns {string} the action name.
 */
export function registerCsvActions() {
  registerAction(ACTIONS.journal.csv, () => exportCsv({ now: Date.now() }).rows)

  return ACTIONS.journal.csv
}
