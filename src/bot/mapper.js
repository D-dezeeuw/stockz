import { appState } from '../app/engine.js'
import { splitSymbol } from '../lists/ops.js'

/**
 * Signal to order.
 *
 * The one translation step between "a strategy thinks this" and "the venue is asked for
 * that". It is a pure function on purpose: everything it decides — side, size, venue
 * symbol, increments — has to be inspectable in a test rather than argued about after a
 * fill.
 *
 * Sizing is the part worth being careful with. A fraction-of-equity rule sounds safer than
 * a fixed size and is more dangerous when equity is falling, because it sizes *up* into a
 * drawdown relative to what is left. Both are offered; fixed is the default.
 *
 * Everything is snapped to the venue's grid here, and again by `prepare()` downstream. That
 * duplication is deliberate: this one exists so the *decision record* shows what will
 * actually be sent, and the engine's exists because it must be true of every order however
 * it arrived.
 */

/** How a strategy's order size is decided. */
export const SIZE_RULES = Object.freeze(['fixed', 'equityPct'])

/**
 * Round a value onto a venue increment.
 *
 * @param {number} value - the raw value.
 * @param {number} step - the increment.
 * @returns {number} the snapped value.
 */
export function snapToStep(value, step) {
  const raw = Number(value)
  const increment = Number(step)
  if (!Number.isFinite(raw)) return 0
  if (!Number.isFinite(increment) || increment <= 0) return raw

  // The quotient is rounded to 9 places *before* flooring. `70000.2 / 0.1` is
  // 700001.9999999999 in binary floating point, and flooring that lands a tick below the
  // value that was already exactly on the grid.
  const steps = Math.floor(Number((raw / increment).toFixed(9)))
  const decimals = String(increment).split('.')[1]?.length ?? 0

  // Floored rather than rounded: rounding *up* onto the grid can turn a size the trader
  // capped into one a hair above their cap, and a cap that is sometimes exceeded is not a
  // cap.
  return Number((steps * increment).toFixed(Math.min(12, decimals + 2)))
}

/**
 * How big this order should be.
 *
 * @param {object} rules - `{rule, size, equityPct, equity}`.
 * @param {number} price - the price it would trade at.
 * @returns {number} the size, before snapping.
 */
export function ruleSize(rules, price) {
  const rule = SIZE_RULES.includes(String(rules?.rule)) ? String(rules.rule) : 'fixed'
  if (rule === 'fixed') return Math.max(0, Number(rules?.size) || 0)

  const equity = Number(rules?.equity) || 0
  const pct = Number(rules?.equityPct) || 0
  const px = Number(price) || 0
  // A fraction of nothing is nothing, and dividing by a zero price is how a bot asks for
  // an infinite position.
  if (equity <= 0 || pct <= 0 || px <= 0) return 0

  return (equity * (pct / 100)) / px
}

/**
 * The venue's own symbol for an instrument.
 *
 * @param {string} instrument - a qualified symbol like `okx:BTC-USDT`.
 * @returns {{venue: string, instId: string}} the routing.
 */
export function routeInstrument(instrument) {
  const { venue, symbol } = splitSymbol(instrument)

  return { venue: venue || 'okx', instId: symbol || String(instrument ?? '') }
}

/**
 * Turn a signal into a venue-ready order.
 *
 * @param {object} signal - the normalised signal.
 * @param {object} [rules] - sizing, order type and venue increments.
 * @returns {{ok: boolean, order: object|null, reason: string}} the order, or why not.
 */
export function mapSignalToOrder(signal, rules = {}) {
  const action = String(signal?.action ?? '')
  if (action !== 'buy' && action !== 'sell') {
    // An exit is not an order to place from here; flattening is the position layer's job
    // and it knows the size, which this does not.
    return { ok: false, order: null, reason: 'not an entry signal' }
  }

  const { venue, instId } = routeInstrument(signal?.instrument)
  if (!instId) return { ok: false, order: null, reason: 'no instrument' }

  const mid = Number(rules.mid ?? appState.market?.mid) || 0
  const tickSize = Number(rules.tickSize ?? appState.market?.tickSize) || 0
  const lotSize = Number(rules.lotSize ?? appState.market?.lotSize) || 0

  const limit = String(rules.type) === 'limit'
  const offset = Math.max(0, Number(rules.offsetTicks) || 0) * (tickSize || 0)
  // A passive entry sits *behind* the touch on the side it is buying: in front of it is a
  // market order wearing a limit order's name.
  const price = limit ? snapToStep(action === 'buy' ? mid - offset : mid + offset, tickSize) : 0
  if (limit && !(price > 0)) return { ok: false, order: null, reason: 'no price to work' }

  const size = snapToStep(ruleSize(rules, limit ? price : mid), lotSize)
  if (!(size > 0)) return { ok: false, order: null, reason: 'size rounds to zero' }

  return {
    ok: true,
    reason: '',
    order: {
      venue,
      instrument: instId,
      side: action,
      type: limit ? 'limit' : 'market',
      size,
      ...(limit ? { price } : {}),
      // Carried through so the journal can answer "what made it do that" from the order
      // alone, without joining back to a signal that has since been overwritten.
      origin: 'bot',
      strategy: String(signal?.source ?? ''),
      note: String(signal?.reason ?? ''),
    },
  }
}

/**
 * The sizing rules in force for a strategy.
 *
 * @param {string} strategyId - the strategy.
 * @param {object} [state] - the settings slice.
 * @returns {object} the rules.
 */
export function rulesFor(strategyId, state = appState?.settings) {
  const perStrategy = state?.botRules?.[String(strategyId ?? '')] ?? {}

  return {
    rule: perStrategy.rule ?? state?.botSizeRule ?? 'fixed',
    size: perStrategy.size ?? state?.botSize ?? 0,
    equityPct: perStrategy.equityPct ?? state?.botEquityPct ?? 0,
    equity: Number(appState.trade?.buyingPower) || 0,
    type: perStrategy.type ?? state?.botOrderType ?? 'market',
    offsetTicks: perStrategy.offsetTicks ?? state?.botOffsetTicks ?? 0,
  }
}
