// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { createHandler, startServer, PROXIES } from './main.js'
import { signSession, SESSION_COOKIE } from './auth.js'

const ENV = {
  STOCKZ_USER_PASSWORD: 'paper-pass',
  STOCKZ_ADMIN_PASSWORD: 'admin-pass',
  STOCKZ_SESSION_SECRET: 'a-long-enough-secret',
  BUILD_SHA: 'abc1234',
}

function fakeRes() {
  const res = {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      res.status = status
      res.headers = headers ?? {}
    },
    end(chunk) {
      res.body = chunk === undefined ? '' : String(chunk)
    },
  }
  return res
}

function fakeReq(url, { method = 'GET', cookie = '', body = '' } = {}) {
  const req = new EventEmitter()
  req.url = url
  req.method = method
  req.headers = cookie ? { cookie } : {}
  req.destroy = () => {}
  queueMicrotask(() => {
    if (body) req.emit('data', Buffer.from(body))
    req.emit('end')
  })
  return req
}

const asAdmin = `${SESSION_COOKIE}=${signSession('admin', ENV.STOCKZ_SESSION_SECRET)}`

describe('createHandler', () => {
  it('gates everything but health, logs in, relays, and serves the desk', async () => {
    const fetched = []
    const handle = createHandler({
      env: ENV,
      root: '/srv/app',
      fetch: async (url) => {
        fetched.push(url)
        return {
          status: 200,
          headers: { get: () => 'application/json' },
          arrayBuffer: async () => Buffer.from('{"code":"0"}'),
        }
      },
    })

    // Health is the one open door, and it reveals only the build.
    const health = fakeRes()
    await handle(fakeReq('/api/health'), health)
    expect(health.status).toBe(200)
    expect(JSON.parse(health.body)).toEqual({ ok: true, build: 'abc1234' })

    // Signed out: pages get the login form, API and proxy calls get JSON refusals.
    const page = fakeRes()
    await handle(fakeReq('/'), page)
    expect(page.status).toBe(401)
    expect(page.body).toMatch(/action="\/api\/login"/)

    const apiRefused = fakeRes()
    await handle(fakeReq('/okx-eea/api/v5/account/config'), apiRefused)
    expect(apiRefused.status).toBe(401)
    expect(JSON.parse(apiRefused.body).msg).toMatch(/not signed in/)
    expect(fetched).toHaveLength(0)

    // A wrong password is a 401 with the form and the reason.
    const badLogin = fakeRes()
    await handle(fakeReq('/api/login', { method: 'POST', body: 'user=admin&pass=nope' }), badLogin)
    expect(badLogin.status).toBe(401)
    expect(badLogin.body).toMatch(/Wrong password/)

    // The right password redirects home with the session cookie set.
    const login = fakeRes()
    await handle(fakeReq('/api/login', { method: 'POST', body: 'user=admin&pass=admin-pass' }), login)
    expect(login.status).toBe(303)
    expect(login.headers['set-cookie']).toMatch(new RegExp(`${SESSION_COOKIE}=admin\\.`))

    // Signed in: the session names the role, the proxy relays, the desk serves.
    const session = fakeRes()
    await handle(fakeReq('/api/session', { cookie: asAdmin }), session)
    expect(JSON.parse(session.body)).toEqual({ role: 'admin', build: 'abc1234' })

    const relayed = fakeRes()
    await handle(fakeReq('/okx-eea/api/v5/account/config', { cookie: asAdmin }), relayed)
    expect(fetched[0]).toBe('https://eea.okx.com/api/v5/account/config')
    expect(relayed.body).toBe('{"code":"0"}')

    // Logout clears the cookie and the next page view is the form again.
    const logout = fakeRes()
    await handle(fakeReq('/api/logout', { cookie: asAdmin }), logout)
    expect(logout.headers['set-cookie']).toMatch(/Max-Age=0/)
  })
})

describe('PROXIES', () => {
  it('mounts the EU prefix before the global one, so /okx-eea never falls through to /okx', () => {
    expect(PROXIES.map((p) => p.prefix)).toEqual(['/okx-eea', '/okx', '/etoro'])
    expect(PROXIES[0].target).toBe('https://eea.okx.com')
    expect(PROXIES[1].target).toBe('https://www.okx.com')
    expect(PROXIES[2].target).toBe('https://api.etoro.com')
  })
})

describe('startServer', () => {
  it('binds the configured host and port and answers health over real HTTP', async () => {
    const server = startServer({ env: { ...ENV, STOCKZ_HOST: '127.0.0.1', STOCKZ_PORT: '0' } })
    await new Promise((resolve) => server.once('listening', resolve))

    const { port } = server.address()
    const reply = await fetch(`http://127.0.0.1:${port}/api/health`)
    expect(reply.status).toBe(200)
    expect((await reply.json()).build).toBe('abc1234')

    await new Promise((resolve) => server.close(resolve))
  })
})
