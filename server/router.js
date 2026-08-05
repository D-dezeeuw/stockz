import { Buffer } from 'node:buffer'

/**
 * The desk's whole HTTP surface, as data.
 *
 * Zero dependencies on purpose, matching the client's own rule: `node:http` is in every
 * Node that can run this, and the router is four capabilities — exact routes, prefix
 * proxies, a static fallthrough, and JSON replies. Anything a framework would add on top
 * of that is surface the desk does not use and code on the path that moves money.
 *
 * The proxy is the reason this server exists at all: OKX's EU platform sends no CORS
 * headers on any of its hostnames, so no browser page may call it directly — hosted
 * anywhere, ever. Same-origin is the escape: the page asks its own server, the server asks
 * the venue, and CORS never applies to either hop.
 */

/** Request bodies above this are refused — a signed venue call is a few hundred bytes. */
export const MAX_BODY_BYTES = 1024 * 1024

/**
 * Headers that must not be forwarded in either direction.
 *
 * Hop-by-hop headers describe one connection, not the request; `host` names the wrong
 * server; cookies are the desk's session and are none of the venue's business — and the
 * venue's cookies are none of the desk's.
 */
export const STRIP_HEADERS = Object.freeze([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'cookie',
  'set-cookie',
  'content-length',
  'accept-encoding',
])

/**
 * The forwardable subset of a header bag.
 *
 * @param {object} headers - incoming headers, node-style (lowercased keys).
 * @returns {object} headers safe to pass to the other side.
 */
export function filterHeaders(headers) {
  const out = {}
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (STRIP_HEADERS.includes(String(key).toLowerCase())) continue
    if (value === undefined) continue
    out[key] = Array.isArray(value) ? value.join(', ') : String(value)
  }
  return out
}

/**
 * Read a request body, bounded.
 *
 * @param {import('node:http').IncomingMessage} req - the request.
 * @param {number} [limit] - refuse beyond this many bytes.
 * @returns {Promise<Buffer>} the body.
 */
export function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      // Rejected *then* destroyed: destroy can emit 'error' synchronously, and a promise
      // keeps its first settlement — reversing these reports "destroyed" instead of why.
      // Destroyed as well as rejected, because a client still streaming into a refused
      // request is bandwidth spent on nothing.
      if (size > limit) {
        reject(new Error(`body exceeds ${limit} bytes`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * Map a proxied URL onto its venue target.
 *
 * The prefix is stripped, which is what keeps signing intact: OKX signs the *path*, so
 * `/okx-eea/api/v5/x` must arrive at the venue as `/api/v5/x` — the exact string that
 * went into the browser's HMAC.
 *
 * @param {string} url - the incoming path (with query).
 * @param {string} prefix - the mount point, e.g. '/okx-eea'.
 * @param {string} target - the venue base, e.g. 'https://eea.okx.com'.
 * @returns {string|null} the full target URL, or null when the url is not under the prefix.
 */
export function proxyTarget(url, prefix, target) {
  const path = String(url ?? '')
  if (path !== prefix && !path.startsWith(`${prefix}/`)) return null

  const rest = path.slice(prefix.length) || '/'
  return `${target}${rest}`
}

/**
 * Send a JSON reply.
 *
 * @param {import('node:http').ServerResponse} res - the response.
 * @param {number} status - HTTP status.
 * @param {unknown} payload - what to send.
 * @returns {boolean} true.
 */
export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload ?? {})
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
  return true
}

/**
 * Forward one request to a venue and relay the answer.
 *
 * Bodies are buffered, not streamed: a venue call is a few hundred bytes of JSON, and a
 * buffered relay is one that can never deadlock on back-pressure or leak a half-piped
 * socket. The venue's status and content-type pass through untouched — the client's
 * envelope reader owns interpreting them, same as when it called the venue directly.
 *
 * @param {import('node:http').IncomingMessage} req - the incoming request.
 * @param {import('node:http').ServerResponse} res - where to relay the reply.
 * @param {string} targetUrl - the resolved venue URL.
 * @param {{fetch?: Function}} [deps] - injectable transport.
 * @returns {Promise<boolean>} true when a reply was written.
 */
export async function relay(req, res, targetUrl, deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch

  try {
    const method = String(req.method ?? 'GET').toUpperCase()
    const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req)

    const reply = await fetchImpl(targetUrl, {
      method,
      headers: filterHeaders(req.headers),
      body: body && body.length > 0 ? body : undefined,
      redirect: 'manual',
    })

    const payload = Buffer.from(await reply.arrayBuffer())
    res.writeHead(reply.status, {
      'content-type': reply.headers.get('content-type') ?? 'application/json',
      'content-length': payload.length,
      'cache-control': 'no-store',
    })
    res.end(payload)
    return true
  } catch (err) {
    // The relay never throws at the caller: the client expects a venue-shaped error it
    // can read, not a dropped socket it has to time out on.
    return sendJson(res, 502, { code: '', msg: `relay failed: ${err?.message ?? err}` })
  }
}
