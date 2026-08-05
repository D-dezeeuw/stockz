import { createServer } from 'node:http'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { proxyTarget, relay, sendJson, readBody } from './router.js'
import {
  loginRole,
  credentialsConfigured,
  signSession,
  requestRole,
  sessionCookie,
  sessionSecret,
} from './auth.js'
import { serveStatic } from './static.js'
import { loginPage, parseForm } from './pages.js'
import { venueKeys } from './keys.js'

/**
 * The STOCKZ backend: one process, three jobs.
 *
 * 1. Serve the desk — the same raw ES modules GitHub Pages used to serve, no build step.
 * 2. Relay venue REST on the desk's own origin, because OKX EU sends no CORS headers on
 *    any hostname it has and no browser may call it directly.
 * 3. Keep the whole thing private: every route but /api/health sits behind the login,
 *    two accounts (usr/admin) from the server's .env, locked — not open — until those
 *    exist.
 *
 * Venue credentials never live here. The browser signs; this process relays.
 */

/** Where each same-origin prefix forwards. The prefix strip is what preserves signing. */
export const PROXIES = Object.freeze([
  { prefix: '/okx-eea', target: 'https://eea.okx.com' },
  { prefix: '/okx', target: 'https://www.okx.com' },
  { prefix: '/etoro', target: 'https://api.etoro.com' },
])

/**
 * Build the request handler.
 *
 * @param {{env?: object, root?: string, fetch?: Function, now?: () => number}} [deps]
 * @returns {(req: object, res: object) => Promise<unknown>} the handler.
 */
export function createHandler(deps = {}) {
  const env = deps.env ?? process.env
  const root = deps.root ?? resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const now = deps.now ?? (() => Date.now())
  const secret = sessionSecret(env)

  return async function handle(req, res) {
    const url = String(req.url ?? '/')
    const path = url.split('?')[0]

    // The one open route: the deploy gate must be able to ask "which build is serving"
    // before anyone has logged in — it reveals a commit hash and nothing else.
    if (path === '/api/health') {
      return sendJson(res, 200, { ok: true, build: env.BUILD_SHA ?? 'dev' })
    }

    const role = requestRole(req.headers?.cookie, secret, now())

    if (path === '/api/login' && req.method === 'POST') {
      const form = parseForm(await readBody(req))
      const granted = loginRole(form.user, form.pass, env)
      if (!granted) {
        res.writeHead(401, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        res.end(loginPage({ configured: credentialsConfigured(env), message: 'Wrong password.' }))
        return true
      }
      res.writeHead(303, {
        location: '/',
        'set-cookie': sessionCookie(signSession(granted, secret, now())),
        'cache-control': 'no-store',
      })
      res.end()
      return true
    }

    if (path === '/api/logout') {
      res.writeHead(303, { location: '/', 'set-cookie': sessionCookie(''), 'cache-control': 'no-store' })
      res.end()
      return true
    }

    // Everything below the line is the desk, and the desk is private.
    if (!role) {
      // JSON callers get JSON; a proxied venue call answered with a login page would be
      // parsed as a venue envelope and read as the venue being broken.
      if (path.startsWith('/api/') || PROXIES.some((p) => proxyTarget(path, p.prefix, p.target))) {
        return sendJson(res, 401, { code: '', msg: 'not signed in' })
      }
      res.writeHead(401, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(loginPage({ configured: credentialsConfigured(env) }))
      return true
    }

    if (path === '/api/session') {
      return sendJson(res, 200, { role, build: env.BUILD_SHA ?? 'dev' })
    }

    // The venue keys, for the signed-in ADMIN alone (owner decision: the server's .env is
    // the key store on this single-user desk). `usr` is the paper account and receives an
    // empty bag — same shape, nothing in it — so the client's adoption code has one path.
    // sendJson marks this no-store like every API reply; nothing caches a credential.
    if (path === '/api/keys') {
      return sendJson(res, 200, role === 'admin' ? venueKeys(env) : {})
    }

    for (const proxy of PROXIES) {
      const target = proxyTarget(url, proxy.prefix, proxy.target)
      if (target) return relay(req, res, target, deps)
    }

    const file = await serveStatic(root, path)
    res.writeHead(file.status, file.headers)
    res.end(file.body)
    return true
  }
}

/**
 * Start the server.
 *
 * @param {{env?: object, root?: string}} [deps] - injectable environment.
 * @returns {import('node:http').Server} the listening server.
 */
export function startServer(deps = {}) {
  const env = deps.env ?? process.env
  const host = env.STOCKZ_HOST ?? '127.0.0.1'
  const port = Number(env.STOCKZ_PORT) || 8643

  const server = createServer(createHandler(deps))
  server.listen(port, host, () => {
    console.log(`[stockz] serving on http://${host}:${port} (build ${env.BUILD_SHA ?? 'dev'})`)
  })
  return server
}

// Started directly (node server/main.js) rather than imported (tests).
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  startServer()
}
