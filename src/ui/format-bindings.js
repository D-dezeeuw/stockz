import { formatPrice, formatQty, formatPct, formatSigned, formatCompact } from '../utils/format.js'
import { valueClass, sideClass, tickPulseClass } from './status-color.js'

/**
 * Formatters, callable from HTML bindings.
 *
 * Spektrum compiles `{{expr}}` to `with (state) { return (expr) }`, so identifiers
 * resolve from state first and then fall through the normal scope chain to globals.
 * That gives two ways to expose helpers, and only one is safe:
 *
 *   - Putting functions *in state* would work, but state is recorded into history,
 *     `serialize()` and journal exports — functions do not serialize, and every
 *     formatter would ride along in every trade export.
 *   - One frozen global namespace costs nothing, serializes nothing, and reads clearly
 *     in the markup: `{{ fmt.price(market.mid) }}`.
 *
 * So: exactly one global, named, frozen, and registered explicitly at boot.
 */

/** The namespace bindings see. */
export const FORMATTER_NAMESPACE = 'fmt'

/**
 * Build the formatter bundle.
 *
 * Short names because they appear inline in markup, where `{{fmt.price(x)}}` stays
 * readable and `{{formatPriceWithTick(x)}}` does not.
 *
 * @returns {Readonly<Record<string, Function>>} the frozen bundle.
 */
export function buildFormatters() {
  return Object.freeze({
    price: formatPrice,
    qty: formatQty,
    pct: formatPct,
    signed: formatSigned,
    compact: formatCompact,
    // Semantic classes, so a binding can colour a cell in the same expression that
    // formats it: :class="fmt.cls(trade.dayPnl)".
    cls: valueClass,
    side: sideClass,
    pulse: tickPulseClass,
  })
}

/**
 * Register the formatters so HTML bindings can call them.
 *
 * @param {object} [target] - where to attach; defaults to the global object.
 * @returns {Readonly<Record<string, Function>>} the registered bundle.
 */
export function registerFormatters(target = globalThis) {
  const formatters = buildFormatters()
  target[FORMATTER_NAMESPACE] = formatters
  return formatters
}

/**
 * Remove the namespace again — teardown, and keeping tests from leaking into each other.
 *
 * @param {object} [target] - where it was attached.
 * @returns {boolean} true when something was removed.
 */
export function unregisterFormatters(target = globalThis) {
  if (!(FORMATTER_NAMESPACE in target)) return false

  delete target[FORMATTER_NAMESPACE]
  return true
}
