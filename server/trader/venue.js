import { createHmac } from 'node:crypto'
import { OKX_ENDPOINTS } from '../../src/venues/okx/endpoints.js'

/**
 * The venue, from the server's side.
 *
 * The browser signs its own requests because on a static page there was nowhere else to
 * do it. Here the keys are already in this process — they are read from .env and handed
 * to admin sessions — so the server-side loop signs for itself and never depends on a tab
 * being open.
 *
 * `node:crypto` rather than Web Crypto: it is synchronous, which keeps the order path free
 * of an await that buys nothing, and it is a builtin, which keeps the zero-dependency rule.
 *
 * Paths come from the same `OKX_ENDPOINTS` map the browser uses. That shared import is
 * deliberate: OKX signs the path, so the one thing that must never differ between the two
 * signers is the string being hashed.
 */

/** The real venue hosts. The server talks to OKX directly — no proxy hop from here. */
export const OKX_HOSTS = Object.freeze({
  global: 'https://www.okx.com',
  eea: 'https://eea.okx.com',
})

/**
 * OKX's timestamp format: ISO-8601 with milliseconds.
 *
 * @param {number} ms - epoch ms.
 * @returns {string} e.g. 2026-08-07T14:05:09.221Z
 */
export function okxTimestamp(ms) {
  const at = Number.isFinite(ms) ? ms : 0
  return new Date(at).toISOString().replace(/(\.\d{3})\d*Z$/, '$1Z')
}

/**
 * The headers a signed OKX call needs.
 *
 * @param {{ts: number, method: string, path: string, body?: string}} req - the request.
 * @param {{apiKey: string, secretKey: string, passphrase: string}} keys - credentials.
 * @param {boolean} [demo] - announce the simulated environment.
 * @returns {object} headers; empty when a credential is missing.
 */
export function signHeaders(req, keys, demo = false) {
  if (!keys?.apiKey || !keys?.secretKey || !keys?.passphrase) return {}

  const ts = okxTimestamp(req?.ts)
  const method = String(req?.method ?? 'GET').toUpperCase()
  const body = String(req?.body ?? '')
  const sign = createHmac('sha256', keys.secretKey)
    .update(`${ts}${method}${req?.path ?? ''}${body}`)
    .digest('base64')

  return {
    'OK-ACCESS-KEY': keys.apiKey,
    'OK-ACCESS-SIGN': sign,
    'OK-ACCESS-TIMESTAMP': ts,
    'OK-ACCESS-PASSPHRASE': keys.passphrase,
    'Content-Type': 'application/json',
    // The demo/live axis. Announcing the wrong one is refused as 50101, which reads like
    // a broken key rather than a wrong header — see the browser signer's note.
    ...(demo ? { 'x-simulated-trading': '1' } : {}),
  }
}

/**
 * Make one signed venue call.
 *
 * Never throws, for the same reason the browser client never does: on the order path an
 * exception leaves the caller unsure whether the order went.
 *
 * @param {{method?: string, path: string, body?: object}} req - the request.
 * @param {object} config - the trader config (keys, region, environment).
 * @param {{fetch?: Function, now?: () => number}} [deps] - injectable plumbing.
 * @returns {Promise<{ok: boolean, code: string, data: unknown[], error: string}>} the outcome.
 */
export async function venueRequest(req, config, deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch
  const now = deps.now ?? (() => Date.now())
  const method = String(req?.method ?? 'GET').toUpperCase()
  const body = req?.body ? JSON.stringify(req.body) : ''

  const headers = signHeaders({ ts: now(), method, path: req?.path, body }, config?.keys, config?.demo)
  if (Object.keys(headers).length === 0) {
    return { ok: false, code: '', data: [], error: 'no OKX credentials on the server' }
  }

  const base = config?.eea ? OKX_HOSTS.eea : OKX_HOSTS.global

  try {
    const response = await fetchImpl(`${base}${req.path}`, {
      method,
      headers,
      body: body || undefined,
    })
    const parsed = await response.json()
    const code = String(parsed?.code ?? '')
    const data = Array.isArray(parsed?.data) ? parsed.data : []

    if (code === '0') return { ok: true, code, data, error: '' }

    // A per-item rejection carries its own code; that is the one worth reporting.
    const first = data[0]
    const detail = first?.sCode && first.sCode !== '0' ? first : parsed
    return {
      ok: false,
      code: String(detail?.sCode ?? detail?.code ?? code),
      data,
      error: String(detail?.sMsg ?? detail?.msg ?? 'OKX rejected the request'),
    }
  } catch (err) {
    return { ok: false, code: '', data: [], error: `OKX unreachable: ${err?.message ?? err}` }
  }
}

/**
 * Place a market order.
 *
 * Market rather than limit, deliberately: this loop reacts to a signal computed from the
 * book it just saw, and a resting limit order that the market walks away from is a signal
 * acted on in name only. `tdMode: 'cash'` keeps it spot — this desk does not lever.
 *
 * @param {{instId: string, side: string, size: number, clientId?: string}} order - the order.
 * @param {object} config - the trader config.
 * @param {object} [deps] - injectable plumbing.
 * @returns {Promise<{ok: boolean, id: string, error: string}>} the outcome.
 */
export async function placeMarketOrder(order, config, deps = {}) {
  const result = await venueRequest(
    {
      method: 'POST',
      path: OKX_ENDPOINTS.order,
      body: {
        instId: order?.instId,
        tdMode: 'cash',
        side: String(order?.side ?? '').toLowerCase(),
        ordType: 'market',
        sz: String(order?.size ?? ''),
        // Base currency for a spot market buy, so `sz` means the same thing on both sides.
        tgtCcy: 'base_ccy',
        ...(order?.clientId ? { clOrdId: order.clientId } : {}),
      },
    },
    config,
    deps,
  )

  return {
    ok: result.ok,
    id: String(result.data?.[0]?.ordId ?? ''),
    // The venue's numeric code travels with the message. Two rounds of diagnosis were spent
    // reasoning from the prose alone — exactly what the browser client's own comment warns
    // against, because a message is the venue's to reword and the code is the contract.
    code: result.code,
    error: result.error,
  }
}

/**
 * The venue's own view of open positions.
 *
 * @param {object} config - the trader config.
 * @param {object} [deps] - injectable plumbing.
 * @returns {Promise<{ok: boolean, positions: object[], error: string}>} the snapshot.
 */
export async function fetchVenuePositions(config, deps = {}) {
  const result = await venueRequest({ path: OKX_ENDPOINTS.positions }, config, deps)
  if (!result.ok) return { ok: false, positions: [], error: result.error }

  return {
    ok: true,
    positions: result.data.map((row) => ({
      instrument: String(row?.instId ?? ''),
      qty: Number(row?.pos) || 0,
      avgPx: Number(row?.avgPx) || 0,
    })),
    error: '',
  }
}

/**
 * What this key is actually allowed to do.
 *
 * OKX permissions are a property of the **key**, not of an instrument: `perm` comes back as
 * a comma list like `read_only,trade`. There is no "instruments you may trade" endpoint,
 * because that is not how the model works — a key either carries `trade` and can touch
 * everything the account can reach, or it does not and can touch none of it.
 *
 * Asked once at startup rather than discovered per order. Without it the loop learns the
 * answer from the venue's rejection, on every signal, forever: 1795 orders in one session,
 * every one of them impossible before it was sent.
 *
 * @param {object} config - the trader config.
 * @param {object} [deps] - injectable plumbing.
 * @returns {Promise<{ok: boolean, perm: string, uid: string, error: string}>} the account's
 *   permissions.
 */
export async function fetchAccountConfig(config, deps = {}) {
  const result = await venueRequest({ path: OKX_ENDPOINTS.config }, config, deps)
  if (!result.ok) return { ok: false, perm: '', uid: '', error: result.error }

  const row = result.data?.[0] ?? {}
  return { ok: true, perm: String(row.perm ?? ''), uid: String(row.uid ?? ''), error: '' }
}

/**
 * Does this permission string allow placing orders?
 *
 * @param {string} perm - the `perm` field, e.g. 'read_only,trade'.
 * @returns {boolean} true when orders may be sent.
 */
export function canTrade(perm) {
  return String(perm ?? '')
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .includes('trade')
}

/**
 * The instruments the venue will actually accept orders for.
 *
 * Not a permission list — see `canTrade` for that — but the other half of "why did this
 * order fail": a symbol that is delisted, suspended or simply mistyped is refused just as
 * flatly as one the key may not trade, and the two are worth telling apart before the loop
 * spends a session finding out.
 *
 * @param {object} config - the trader config.
 * @param {string} [instType] - the instrument family.
 * @param {object} [deps] - injectable plumbing.
 * @returns {Promise<{ok: boolean, live: string[], error: string}>} instrument ids in the
 *   `live` state.
 */
export async function fetchInstruments(config, instType = 'SPOT', deps = {}) {
  const result = await venueRequest(
    { path: `${OKX_ENDPOINTS.instruments}?instType=${instType}` },
    config,
    deps,
  )
  if (!result.ok) return { ok: false, live: [], error: result.error }

  return {
    ok: true,
    // `state` matters: a suspended or pre-open instrument is listed and untradable, which
    // would otherwise look exactly like a working symbol until the first order.
    live: result.data.filter((row) => String(row?.state ?? '') === 'live').map((row) => String(row?.instId ?? '')),
    error: '',
  }
}
