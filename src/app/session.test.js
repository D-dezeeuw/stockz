import { describe, it, expect, beforeEach } from 'vitest'
import { fetchRole, adoptRole, isAdmin, DEV_ROLE } from './session.js'
import { appState, tick, resetState } from './engine.js'

beforeEach(() => {
  resetState()
})

describe('fetchRole', () => {
  it('reads the backend role and falls back to admin where no backend answers', async () => {
    const ok = (role) => async () => ({ ok: true, json: async () => ({ role }) })
    expect(await fetchRole({ fetch: ok('usr') })).toBe('usr')
    expect(await fetchRole({ fetch: ok('admin') })).toBe('admin')

    // Anything unrecognised normalises to admin rather than inventing a third role.
    expect(await fetchRole({ fetch: ok('root') })).toBe('admin')

    // No backend (dev), a refusing backend, and a dead one all mean: nothing to enforce
    // against, so the desk stays fully usable for development.
    expect(await fetchRole({ fetch: async () => ({ ok: false }) })).toBe(DEV_ROLE)
    expect(
      await fetchRole({
        fetch: async () => {
          throw new Error('offline')
        },
      }),
    ).toBe(DEV_ROLE)
    expect(await fetchRole({ fetch: null })).toBe(DEV_ROLE)
  })
})

describe('adoptRole', () => {
  it('publishes the role where the bindings gate on it', async () => {
    await adoptRole({ fetch: async () => ({ ok: true, json: async () => ({ role: 'usr' }) }) })
    tick()
    expect(appState.ui.role).toBe('usr')
  })
})

describe('isAdmin', () => {
  it('answers from state, defaulting open only when no role was ever loaded', () => {
    expect(isAdmin({ ui: { role: 'admin' } })).toBe(true)
    expect(isAdmin({ ui: { role: 'usr' } })).toBe(false)
    // Absent role = no backend = nothing to enforce; the server remains the real gate.
    expect(isAdmin({})).toBe(true)
  })
})
