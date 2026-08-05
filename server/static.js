import { readFile } from 'node:fs/promises'
import { resolve, normalize, extname, sep } from 'node:path'

/**
 * Serving the desk itself: raw ES modules straight from the repo, no build step.
 *
 * The one non-negotiable here is the traversal guard — this server also holds `.env` on
 * the host beside it, and a static server that can be walked out of its root with
 * `..%2f` is a credential disclosure, not a 404.
 */

/** What the desk actually ships. Anything else is refused rather than guessed at. */
export const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json; charset=utf-8',
})

/**
 * The content type for a file, or '' when the desk does not serve that kind.
 *
 * @param {string} path - a file path.
 * @returns {string} the MIME type, or ''.
 */
export function contentTypeFor(path) {
  return CONTENT_TYPES[extname(String(path ?? '')).toLowerCase()] ?? ''
}

/**
 * Resolve a URL path to a file inside the root, or nothing.
 *
 * @param {string} root - the directory being served.
 * @param {string} urlPath - the request path (no query).
 * @returns {string} an absolute path inside root, or '' when refused.
 */
export function resolveStatic(root, urlPath) {
  const base = resolve(String(root ?? '.'))
  let clean
  try {
    clean = decodeURIComponent(String(urlPath ?? '/').split('?')[0])
  } catch {
    return ''
  }

  const target = normalize(resolve(base, `.${clean.startsWith('/') ? clean : `/${clean}`}`))
  // Inside the root or refused — `startsWith(base + sep)` and not `startsWith(base)`,
  // because `/srv/app-secrets` starts with `/srv/app`.
  if (target !== base && !target.startsWith(base + sep)) return ''

  return target === base ? resolve(base, 'index.html') : target
}

/**
 * Serve one static file.
 *
 * @param {string} root - the directory being served.
 * @param {string} urlPath - the request path.
 * @param {{read?: Function}} [deps] - injectable reader.
 * @returns {Promise<{status: number, headers: object, body: Buffer|string}>} the reply.
 */
export async function serveStatic(root, urlPath, deps = {}) {
  const read = deps.read ?? readFile
  const notFound = {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    body: 'not found',
  }

  const target = resolveStatic(root, urlPath)
  if (!target) return notFound

  const type = contentTypeFor(target)
  if (!type) return notFound

  try {
    const body = await read(target)
    return {
      status: 200,
      // no-cache, not immutable: pushing is deploying, and a cached module is a stale desk
      // that the build stamp in the footer would then truthfully accuse.
      headers: { 'content-type': type, 'cache-control': 'no-cache' },
      body,
    }
  } catch {
    return notFound
  }
}
