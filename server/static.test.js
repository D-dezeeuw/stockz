// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { contentTypeFor, resolveStatic, serveStatic } from './static.js'

const ROOT = '/srv/app'

describe('contentTypeFor', () => {
  it('names what the desk ships and refuses the rest', () => {
    expect(contentTypeFor('/a/index.html')).toMatch(/text\/html/)
    expect(contentTypeFor('src/app/engine.js')).toMatch(/text\/javascript/)
    expect(contentTypeFor('styles/x.css')).toMatch(/text\/css/)
    expect(contentTypeFor('x.json')).toMatch(/application\/json/)

    // .env, .sh, dotfiles, extensionless: not servable, whatever the path resolution says.
    expect(contentTypeFor('.env')).toBe('')
    expect(contentTypeFor('deploy.sh')).toBe('')
    expect(contentTypeFor('README')).toBe('')
  })
})

describe('resolveStatic', () => {
  it('resolves inside the root and refuses every way out of it', () => {
    expect(resolveStatic(ROOT, '/index.html')).toBe(resolve(ROOT, 'index.html'))
    expect(resolveStatic(ROOT, '/src/app/engine.js')).toBe(resolve(ROOT, 'src/app/engine.js'))
    // The bare root serves the desk.
    expect(resolveStatic(ROOT, '/')).toBe(resolve(ROOT, 'index.html'))

    // Traversal in the clear, encoded, and the sibling-prefix trick — all refused. This
    // server has .env living beside it on the host; a walkable root is a credential
    // disclosure, not a 404.
    expect(resolveStatic(ROOT, '/../.env')).toBe('')
    expect(resolveStatic(ROOT, '/%2e%2e/%2e%2e/etc/passwd')).toBe('')
    expect(resolveStatic(ROOT, '/..%2f.env')).toBe('')
    expect(resolveStatic('/srv/app', '/../app-secrets/x.js')).toBe('')
    // An undecodable path is refused, not crashed on; missing args fall to safe defaults.
    expect(resolveStatic(ROOT, '/%zz')).toBe('')
    expect(resolveStatic(undefined, undefined)).toBe(resolve('.', 'index.html'))
  })
})

describe('serveStatic', () => {
  it('serves known types no-cache and answers 404 for everything else', async () => {
    const read = async (path) => {
      if (path.endsWith('index.html')) return '<!doctype html>'
      throw new Error('ENOENT')
    }

    const ok = await serveStatic(ROOT, '/', { read })
    expect(ok.status).toBe(200)
    expect(ok.headers['cache-control']).toBe('no-cache')
    expect(String(ok.body)).toMatch(/doctype/)

    // Missing file, refused traversal and unservable type share one 404 — none of them
    // explain themselves to a prober.
    expect((await serveStatic(ROOT, '/gone.js', { read })).status).toBe(404)
    expect((await serveStatic(ROOT, '/../.env', { read })).status).toBe(404)
    expect((await serveStatic(ROOT, '/server/deploy.sh', { read })).status).toBe(404)

    // The default reader against a file that does not exist: same 404, no throw.
    expect((await serveStatic('/nonexistent-root', '/x.js')).status).toBe(404)
  })
})
