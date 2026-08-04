/**
 * The venue adapter contract.
 *
 * Every venue is wrong in its own way — OKX wants strings and a `tdMode`, EToro wants
 * units and a direction, and each has a different idea of what "post only" is called.
 * An adapter absorbs exactly that, and nothing else: it translates an intent into a
 * request and a response into an event, and it makes no decisions.
 *
 * `capabilities` is the honest part. A desk that offers post-only on a venue that has no
 * such thing produces orders that quietly become ordinary limits, which is worse than
 * the button being disabled.
 */

/** What an adapter must provide. */
export const ADAPTER_METHODS = Object.freeze(['submit', 'cancel', 'capabilities'])

/** The capability flags a venue may declare. */
export const CAPABILITIES = Object.freeze([
  'market',
  'limit',
  'post_only',
  'ioc',
  'fok',
  'reduce_only',
  'amend',
  'batch_cancel',
])

/**
 * Whether an object satisfies the adapter contract.
 *
 * @param {object} adapter - the candidate.
 * @returns {{ok: boolean, missing: string[]}} the verdict.
 */
export function isAdapter(adapter) {
  const missing = ADAPTER_METHODS.filter((name) => typeof adapter?.[name] !== 'function')
  return { ok: missing.length === 0, missing }
}

/**
 * Whether a venue can honour an intent as written.
 *
 * @param {object} intent - the order intent.
 * @param {string[]} capabilities - what the venue supports.
 * @returns {{ok: boolean, reason: string}} the verdict.
 */
export function supportsIntent(intent, capabilities) {
  const caps = Array.isArray(capabilities) ? capabilities : []
  if (!intent) return { ok: false, reason: 'no intent' }

  if (!caps.includes(intent.type)) return { ok: false, reason: `no ${intent.type} orders` }
  // A tif the venue does not implement must fail loudly. Silently downgrading post-only
  // to an ordinary limit is how a maker order becomes a taker fee nobody agreed to.
  if (intent.tif !== 'gtc' && !caps.includes(intent.tif)) {
    return { ok: false, reason: `no ${intent.tif}` }
  }
  if (intent.reduceOnly && !caps.includes('reduce_only')) {
    return { ok: false, reason: 'no reduce-only' }
  }

  return { ok: true, reason: '' }
}
