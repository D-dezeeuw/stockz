import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { openPositions } from '../positions/store.js'
import { liveOrders } from '../exec/engine.js'
import { routeInstrument } from './mapper.js'

/**
 * Per-instrument exposure caps.
 *
 * The gate that stops the bot pyramiding. A strategy that keeps signalling the same
 * direction is not wrong — it is doing exactly what it was written to do — and without a
 * cap the desk ends up with ten times the intended position in the one instrument the
 * strategy happens to like today.
 *
 * The measurement that matters is **open plus in flight**. Counting only what has filled
 * means a burst of signals in the second before the first ack all pass the same cap, and
 * the position lands at several times the limit. Working orders count as position until
 * they do not.
 */

/** The cap when no per-instrument override applies. */
export const DEFAULT_CAP = 1

/**
 * How much of an instrument is already held.
 *
 * @param {string} instId - the venue's symbol.
 * @param {object[]} [positions] - the open positions.
 * @returns {number} absolute size held.
 */
export function getOpenSize(instId, positions = openPositions()) {
  const symbol = String(instId ?? '')
  if (!symbol) return 0

  const total = (Array.isArray(positions) ? positions : []).reduce((sum, position) => {
    const { instId: held } = routeInstrument(position?.instrument)
    if (held !== symbol) return sum

    // Absolute: a cap is about how much of the instrument the desk is exposed to, and a
    // short is exposure exactly like a long is.
    return sum + Math.abs(Number(position?.size ?? position?.qty) || 0)
  }, 0)

  // Rounded, because this number is read out loud in the refusal reason. "holding
  // 0.6000000000000001" is a correct figure and an answer nobody trusts.
  return Number(total.toFixed(10))
}

/**
 * How much is held plus how much the bot has working.
 *
 * @param {string} instId - the venue's symbol.
 * @param {{positions?: object[], orders?: object[]}} [sources] - injectable state.
 * @returns {{open: number, pending: number, total: number}} the exposure.
 */
export function exposureFor(instId, sources = {}) {
  const symbol = String(instId ?? '')
  const open = getOpenSize(symbol, sources.positions ?? openPositions())
  const orders = sources.orders ?? liveOrders()

  const pending = (Array.isArray(orders) ? orders : []).reduce((total, order) => {
    const { instId: on } = routeInstrument(order?.instrument ?? order?.instId)
    // Only the bot's own working orders. A hand-placed order is the trader's decision and
    // must not silently consume the bot's allowance — but it *is* in the open size once it
    // fills, which is where it belongs.
    if (on !== symbol || String(order?.origin ?? '') !== 'bot') return total

    const size = Math.abs(Number(order?.size) || 0)
    const filled = Math.abs(Number(order?.filled) || 0)
    return total + Math.max(0, size - filled)
  }, 0)

  return {
    open,
    pending: Number(pending.toFixed(10)),
    total: Number((open + pending).toFixed(10)),
  }
}

/**
 * The cap in force for an instrument.
 *
 * @param {string} instId - the venue's symbol.
 * @param {object} [state] - the settings slice.
 * @returns {number} the cap.
 */
export function capFor(instId, state = appState?.settings) {
  const override = Number(state?.botCapOverrides?.[String(instId ?? '')])
  if (Number.isFinite(override) && override >= 0) return override

  const base = Number(state?.botMaxPerInstrument)
  return Number.isFinite(base) && base > 0 ? base : DEFAULT_CAP
}

/**
 * The exposure gate.
 *
 * @param {object} signal - the signal.
 * @param {{size?: number, sources?: object}} [context] - the order's size and state.
 * @returns {{pass: boolean, reason: string}} the verdict.
 */
export function capGate(signal, context = {}) {
  const { instId } = routeInstrument(signal?.instrument)
  if (!instId) return { pass: false, reason: 'no instrument' }

  const cap = capFor(instId)
  const exposure = exposureFor(instId, context.sources ?? {})
  const wanted = Math.abs(Number(context.size ?? appState.settings?.botSize) || 0)

  if (exposure.total + wanted <= cap) return { pass: true, reason: '' }

  // The numbers, not just the verdict. "Position cap" alone leaves the trader guessing
  // whether it was one lot over or ten.
  return {
    pass: false,
    reason: `cap ${cap} — holding ${exposure.open}${exposure.pending ? ` + ${exposure.pending} working` : ''}`,
  }
}

/**
 * Which instruments are at their cap.
 *
 * @param {{sources?: object}} [context] - injectable state.
 * @returns {object[]} the capped instruments.
 */
export function cappedInstruments(context = {}) {
  const positions = context.sources?.positions ?? openPositions()
  const seen = new Set()
  const rows = []

  for (const position of Array.isArray(positions) ? positions : []) {
    const { instId } = routeInstrument(position?.instrument)
    if (!instId || seen.has(instId)) continue
    seen.add(instId)

    const cap = capFor(instId)
    const exposure = exposureFor(instId, context.sources ?? {})
    if (exposure.total >= cap) rows.push({ instrument: instId, exposure: exposure.total, cap })
  }

  return rows
}

/**
 * Publish the capped list.
 *
 * @param {{sources?: object}} [context] - injectable state.
 * @returns {object[]} what was published.
 */
export function refreshCaps(context = {}) {
  const rows = cappedInstruments(context)
  setValue(PATHS.bot.capped, rows)
  return rows
}
