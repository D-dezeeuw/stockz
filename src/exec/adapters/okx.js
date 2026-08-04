import { placeOrder, cancelOrder } from '../../venues/okx/rest.js'
import { hasKeys } from '../../venues/vault.js'
import { normalizeReject } from '../types.js'
import { capabilityFor, capabilityFlags } from '../capabilities.js'

/**
 * The OKX adapter.
 *
 * Two OKX facts shape everything here. Every numeric field goes over the wire as a
 * *string* — a JSON number is rejected outright. And the order type carries the
 * time-in-force: there is no separate tif field, so `ioc` is an `ordType` of its own.
 */

/**
 * What OKX can do, derived from the capability record rather than restated.
 *
 * Two hand-written lists would drift, and the drift shows up as a ticket offering a
 * control the adapter then refuses — which reads to the trader as the desk being broken.
 */
export const OKX_CAPABILITIES = Object.freeze(capabilityFlags(capabilityFor('okx', 'SWAP-SWAP')))

/**
 * The OKX `ordType` for an intent.
 *
 * @param {object} intent - the order intent.
 * @returns {string} the venue's order type.
 */
export function okxOrdType(intent) {
  if (intent?.type === 'market') return 'market'

  // OKX folds time-in-force into the order type rather than carrying it separately.
  return { post_only: 'post_only', ioc: 'ioc', fok: 'fok' }[intent?.tif] ?? 'limit'
}

/**
 * Build the OKX request body for an intent.
 *
 * @param {object} intent - the order intent.
 * @param {{mode?: string}} [options] - trade mode.
 * @returns {object} the request body.
 */
export function buildOkxOrder(intent, options = {}) {
  const type = okxOrdType(intent)

  return {
    symbol: intent?.instrument ?? '',
    tdMode: String(options.mode ?? 'cash'),
    side: intent?.side === 'sell' ? 'sell' : 'buy',
    type,
    // Strings, always: OKX rejects numeric JSON for size and price alike.
    sz: String(intent?.size ?? ''),
    ...(type === 'market' ? {} : { px: String(intent?.price ?? '') }),
    ...(intent?.reduceOnly ? { reduceOnly: 'true' } : {}),
    clientId: String(intent?.clientId ?? ''),
  }
}

/**
 * Create the OKX adapter.
 *
 * @param {{place?: Function, cancel?: Function, mode?: string}} [deps] - injectable
 *   venue calls, so the adapter can be exercised without a network.
 * @returns {object} the adapter.
 */
export function createOkxAdapter(deps = {}) {
  const { place = placeOrder, cancel = cancelOrder, mode = 'cash', authed = () => hasKeys('okx') } = deps

  return {
    venue: 'okx',
    capabilities: () => [...OKX_CAPABILITIES],

    async submit(intent) {
      // Checked here rather than in the engine: needing credentials is a property of the
      // venue, not of execution. The public feed runs happily without them, so this is
      // the expected state until keys are entered — not an error worth a stack trace.
      if (!authed()) {
        return { ok: false, reason: 'not_authenticated', message: 'no credentials', clientId: String(intent?.clientId ?? '') }
      }

      const body = buildOkxOrder(intent, { mode })
      const result = await place(body).catch((error) => ({ ok: false, error }))

      if (!result?.ok) {
        return { ok: false, ...normalizeReject(result?.error), clientId: body.clientId }
      }
      return { ok: true, clientId: body.clientId, order: result.order }
    },

    async cancel(order) {
      const result = await cancel({
        symbol: order?.instrument ?? order?.instId,
        clientId: order?.clientId ?? order?.clOrdId,
      }).catch((error) => ({ ok: false, error }))

      if (!result?.ok) return { ok: false, ...normalizeReject(result?.error) }
      return { ok: true }
    },
  }
}
