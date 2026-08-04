import { etoroRequest } from '../../venues/etoro/rest.js'
import { normalizeReject } from '../types.js'
import { capabilityFor, capabilityFlags } from '../capabilities.js'

/**
 * The EToro adapter.
 *
 * EToro is REST-only, speaks units rather than contract size, and has no time-in-force
 * beyond good-till-cancelled. Everything it cannot do natively is either emulated by the
 * engine and badged as such, or refused — never quietly approximated.
 */

/** What EToro can do, derived from the capability record rather than restated. */
export const ETORO_CAPABILITIES = Object.freeze(capabilityFlags(capabilityFor('etoro')))

/**
 * Build the EToro request body for an intent.
 *
 * @param {object} intent - the order intent.
 * @returns {object} the request body.
 */
export function buildEtoroOrder(intent) {
  const limit = intent?.type === 'limit'

  return {
    instrumentId: String(intent?.instrument ?? ''),
    // Direction rather than side, units rather than size: EToro's own vocabulary, which
    // is exactly what an adapter exists to absorb.
    direction: intent?.side === 'sell' ? 'Sell' : 'Buy',
    units: Number(intent?.size) || 0,
    ...(limit ? { rate: Number(intent?.price) || 0, orderType: 'Limit' } : { orderType: 'Market' }),
    clientRequestId: String(intent?.clientId ?? ''),
  }
}

/**
 * Create the EToro adapter.
 *
 * @param {{request?: Function}} [deps] - injectable REST call.
 * @returns {object} the adapter.
 */
export function createEtoroAdapter(deps = {}) {
  const { request = etoroRequest } = deps

  return {
    venue: 'etoro',
    capabilities: () => [...ETORO_CAPABILITIES],

    async submit(intent) {
      const body = buildEtoroOrder(intent)
      const result = await request({ method: 'POST', path: '/orders', body }).catch((error) => ({
        ok: false,
        error,
      }))

      if (!result?.ok) {
        return { ok: false, ...normalizeReject(result?.error), clientId: body.clientRequestId }
      }
      return { ok: true, clientId: body.clientRequestId, order: { state: 'live' } }
    },

    async cancel(order) {
      const id = String(order?.venueId ?? order?.clientId ?? '')
      const result = await request({ method: 'DELETE', path: `/orders/${id}` }).catch((error) => ({
        ok: false,
        error,
      }))

      if (!result?.ok) return { ok: false, ...normalizeReject(result?.error) }
      return { ok: true }
    },
  }
}
