import { emitAlert, alertEnabled } from './bus.js'

/**
 * Execution event notifications.
 *
 * A scalper clicks and looks away. The single worst state on a fast desk is not knowing
 * whether the order went — the trader who is unsure clicks again, and now there are two.
 * These alerts exist to make that uncertainty impossible.
 *
 * Rejects get the loudest treatment and the most work, because a reject is the only
 * execution event where the desk did *not* do what was asked and the trader has to decide
 * something. OKX answers with `sCode: '51008'`, which tells a trader nothing; the lookup
 * turns it into "not enough margin", which tells them everything.
 *
 * Partial fills are coalesced. A market order filling in eleven pieces is one trade to the
 * person who placed it, and eleven toasts for it is the fastest way to make somebody stop
 * reading toasts.
 */

/** How long partials on one order keep merging. */
export const PARTIAL_WINDOW_MS = 1500

/**
 * OKX v5 reject codes worth translating.
 *
 * Only the ones a scalper actually hits. A hundred-entry table that is 90% unreachable is a
 * hundred entries nobody maintains.
 */
export const REJECT_CODES = Object.freeze({
  51000: 'bad parameter',
  51004: 'order size above your position limit',
  51008: 'not enough margin',
  51009: 'account is in trade-suspended mode',
  51010: 'account mode does not allow this order',
  51020: 'order size below the venue minimum',
  51024: 'trading account frozen',
  51119: 'not enough balance',
  51121: 'order size is not a multiple of the lot size',
  51127: 'not enough available balance',
  51131: 'not enough balance',
  51400: 'order already cancelled',
  51503: 'order does not exist',
  59200: 'not enough position to close',
})

/**
 * How loudly an execution event should arrive.
 *
 * @param {string} type - the event type.
 * @returns {string} a severity.
 */
export function execSeverity(type) {
  const kind = String(type ?? '').toLowerCase()
  // A reject is the only one where the desk did not do what was asked, so it is the only
  // one that gets the top tier. Everything else is news, not a problem.
  if (kind === 'reject' || kind === 'rejected') return 'error'
  if (kind === 'filled' || kind === 'fill') return 'success'

  return 'info'
}

/**
 * Turn an OKX reject into something a trader can act on.
 *
 * @param {string|number} sCode - the venue's code.
 * @param {string} sMsg - the venue's message.
 * @returns {string} plain language.
 */
export function parseRejectReason(sCode, sMsg) {
  const code = String(sCode ?? '').trim()
  const known = REJECT_CODES[code]
  if (known) return known

  const message = String(sMsg ?? '').trim()
  // The venue's own message beats a bare code even when it is clumsy, and a bare code beats
  // "rejected" with no reason at all — the trader has to decide *something*.
  if (message) return message

  return code ? `venue code ${code}` : 'rejected'
}

/**
 * Turn an order event into an alert payload.
 *
 * @param {object} event - the lifecycle event.
 * @returns {object|null} the payload, or null when there is nothing to announce.
 */
export function mapOrderEvent(event) {
  const type = String(event?.type ?? event?.state ?? '').toLowerCase()
  if (!type) return null

  const side = String(event?.side ?? '').toUpperCase()
  const instrument = String(event?.instrument ?? '')
  const qty = Number(event?.qty ?? event?.filled) || 0
  const px = Number(event?.px ?? event?.avgPx) || 0
  const at = Number(event?.ts) || 0

  if (type === 'reject' || type === 'rejected') {
    return {
      key: `exec|reject|${String(event?.clientId ?? instrument)}`,
      source: 'exec',
      kind: 'reject',
      severity: 'error',
      text: `REJECT ${side} ${instrument} — ${parseRejectReason(event?.sCode, event?.sMsg ?? event?.reason)}`,
      instrument,
      ts: at,
    }
  }

  if (type === 'cancel' || type === 'cancelled' || type === 'canceled') {
    return {
      key: `exec|cancel|${String(event?.clientId ?? instrument)}`,
      source: 'exec',
      kind: 'cancel',
      severity: 'info',
      text: `CANCEL ${side} ${instrument}`,
      instrument,
      ts: at,
    }
  }

  if (type === 'fill' || type === 'filled' || type === 'partial') {
    const partial = type === 'partial'
    return {
      // Keyed on the order, not the fill: that is what lets the partials of one order
      // collapse into one alert.
      key: `exec|fill|${String(event?.clientId ?? instrument)}`,
      source: 'exec',
      kind: partial ? 'partial' : 'fill',
      severity: partial ? 'info' : 'success',
      text: `${partial ? 'PARTIAL' : 'FILL'} ${side} ${qty} ${instrument} @ ${px}`,
      instrument,
      ts: at,
    }
  }

  return null
}

/** Partials still merging, by order. */
let pending = new Map()

/**
 * Merge partials on one order into a single running fill.
 *
 * @param {object} event - the partial.
 * @param {number} windowMs - how long partials keep merging.
 * @returns {object} the merged event.
 */
export function coalescePartials(event, windowMs = PARTIAL_WINDOW_MS) {
  const id = String(event?.clientId ?? event?.instrument ?? '')
  const at = Number(event?.ts) || 0
  const window = Number(windowMs) >= 0 ? Number(windowMs) : PARTIAL_WINDOW_MS
  if (!id) return { ...event, qty: Number(event?.qty) || 0 }

  const open = pending.get(id)
  const qty = Number(event?.qty) || 0
  const px = Number(event?.px ?? event?.avgPx) || 0

  if (!open || at - open.ts > window) {
    const fresh = { qty, notional: qty * px, ts: at }
    pending.set(id, fresh)
    return { ...event, qty, px }
  }

  // A market order filling in eleven pieces is one trade to the person who placed it. The
  // merged price is volume-weighted, because averaging the prices would misreport the fill
  // whenever the pieces were different sizes.
  open.qty += qty
  open.notional += qty * px
  open.ts = at

  return {
    ...event,
    qty: Number(open.qty.toFixed(10)),
    px: open.qty > 0 ? Number((open.notional / open.qty).toFixed(10)) : px,
  }
}

/**
 * Announce an execution event.
 *
 * @param {object} event - the lifecycle event.
 * @returns {object|null} the alert, or null when muted or suppressed.
 */
export function routeExecAlert(event) {
  const type = String(event?.type ?? event?.state ?? '').toLowerCase()
  const merged = type === 'partial' ? coalescePartials(event) : event

  const payload = mapOrderEvent(merged)
  if (!payload) return null
  if (!alertEnabled('exec', payload.kind)) return null

  // A reject bypasses the debounce entirely: two rejects in a row are two separate
  // decisions the trader has to make, and collapsing them would hide the second.
  return emitAlert(payload, { debounceMs: payload.kind === 'reject' ? 0 : 400 })
}

/**
 * Forget the merging state.
 *
 * @returns {boolean} true.
 */
export function resetExecAlerts() {
  pending = new Map()
  return true
}
