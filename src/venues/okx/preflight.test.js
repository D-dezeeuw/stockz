import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  keyVerdict,
  checkOkxKeys,
  announceKeyCheck,
  runKeyPreflight,
  OKX_CONFIG_PATH,
  NO_KEYS,
} from './preflight.js'
import { setKeys, clearKeys } from '../vault.js'
import { setValue, appState, tick } from '../../app/engine.js'
import { PATHS } from '../../state/paths.js'
import { resetRateLimits } from './rest.js'
import { webcrypto } from 'node:crypto'

const OKX = { apiKey: 'ak', secretKey: 'sk', passphrase: 'pp' }

/** A fetch double returning a canned OKX envelope. */
function fakeFetch(body) {
  return async () => ({ json: async () => body })
}

beforeEach(() => {
  clearKeys()
  resetRateLimits()
  setValue(PATHS.settings.okxDemo, false)
  setValue(PATHS.ui.keyCheck, { ok: false, code: '', reason: '', fix: '' })
  tick()
})

describe('keyVerdict', () => {
  it('turns each OKX auth code into the one thing to go and do', () => {
    expect(keyVerdict({ ok: true, code: '0' })).toEqual({
      ok: true,
      code: '0',
      reason: 'OKX keys accepted',
      fix: '',
    })

    // 50119 arrives before the signature is ever examined — the platform simply has no key
    // by that name — so the fix always names the universe the desk just asked, out of the
    // four OKX runs (global/EU × live/demo). Getting this wrong sends a trader off to
    // regenerate a key that was never the problem.
    const live = keyVerdict({ ok: false, code: '50119', error: 'OKX does not recognise this key' }, false, false)
    expect(live.ok).toBe(false)
    expect(live.code).toBe('50119')
    expect(live.fix).toMatch(/does not exist on OKX global \(okx\.com\)\./)
    expect(live.fix).toMatch(/OKX EU account/)

    const demo = keyVerdict({ ok: false, code: '50119', error: 'x' }, true, false)
    expect(demo.fix).toMatch(/OKX global \(okx\.com\) demo/)

    const eea = keyVerdict({ ok: false, code: '50119', error: 'x' }, false, true)
    expect(eea.fix).toMatch(/OKX EU \(my\.okx\.com\)/)

    const eeaDemo = keyVerdict({ ok: false, code: '50119', error: 'x' }, true, true)
    expect(eeaDemo.fix).toMatch(/OKX EU \(my\.okx\.com\) demo/)

    expect(keyVerdict({ ok: false, code: '50113' }).fix).toMatch(/secret key does not match/)
    expect(keyVerdict({ ok: false, code: '50102' }).fix).toMatch(/clock is off/)
    expect(keyVerdict({ ok: false, code: '50114' }).fix).toMatch(/IP/)
    expect(keyVerdict({ ok: false, code: '50120' }).fix).toMatch(/trading permission/)

    // An unmapped code still reports the venue's own message rather than inventing advice.
    const odd = keyVerdict({ ok: false, code: '99999', error: 'OKX error 99999' })
    expect(odd.fix).toBe('')
    expect(odd.reason).toBe('OKX error 99999')

    // No result at all is a failure, not a crash.
    expect(keyVerdict().ok).toBe(false)
  })
})

describe('checkOkxKeys', () => {
  it('asks the venue only when there are keys to ask about', async () => {
    // A fresh desk boots without credentials and paper mode is meant to work that way, so
    // this must not spend a request — nor report a failure the trader has to dismiss.
    const untouched = vi.fn()
    expect(await checkOkxKeys({ fetch: untouched })).toEqual({ ...NO_KEYS })
    expect(untouched).not.toHaveBeenCalled()

    setKeys('okx', OKX)
    const good = await checkOkxKeys({
      fetch: fakeFetch({ code: '0', data: [{ uid: '1' }] }),
      subtle: webcrypto.subtle,
    })
    expect(good.ok).toBe(true)

    const bad = await checkOkxKeys({
      fetch: fakeFetch({ code: '50119', msg: "API key doesn't exist", data: [] }),
      subtle: webcrypto.subtle,
    })
    expect(bad.code).toBe('50119')
    expect(bad.fix).toMatch(/demo trading/)
  })
})

describe('announceKeyCheck', () => {
  it('publishes prose the trader can act on and never the credential', () => {
    announceKeyCheck({ ok: false, code: '50119', reason: 'not recognised', fix: 'tick demo' })
    tick()
    expect(appState.ui.keyCheck).toEqual({
      ok: false,
      code: '50119',
      reason: 'not recognised',
      fix: 'tick demo',
    })
    expect(JSON.stringify(appState.ui.keyCheck)).not.toMatch(/ak|sk|pp/)

    announceKeyCheck({ ok: true, code: '0', reason: 'OKX keys accepted', fix: '' })
    tick()
    expect(appState.ui.keyCheck.ok).toBe(true)

    // A desk that was never given credentials should not be told so on every boot.
    tick()
    const before = appState.ui.toasts?.length ?? 0
    announceKeyCheck({ ...NO_KEYS })
    tick()
    expect(appState.ui.toasts?.length ?? 0).toBe(before)

    // An unreachable venue carries no code either, and that one must NOT be swallowed —
    // silently treating it as "no keys" is how a desk that cannot see OKX looks idle.
    announceKeyCheck({ ok: false, code: '', reason: 'OKX unreachable: Failed to fetch', fix: '' })
    tick()
    expect(appState.ui.toasts.length).toBeGreaterThan(before)
    expect(appState.ui.keyCheck.reason).toMatch(/unreachable/)
  })
})

describe('runKeyPreflight', () => {
  it('checks and announces in one call', async () => {
    setKeys('okx', OKX)
    const verdict = await runKeyPreflight({
      fetch: fakeFetch({ code: '50113', msg: 'bad sign', data: [] }),
      subtle: webcrypto.subtle,
    })

    expect(verdict.code).toBe('50113')
    tick()
    expect(appState.ui.keyCheck.fix).toMatch(/secret key does not match/)
  })
})

describe('OKX_CONFIG_PATH', () => {
  it('names an authenticated, side-effect-free endpoint', () => {
    // The preflight must not move money or place anything. `account/config` reads.
    expect(OKX_CONFIG_PATH).toBe('/api/v5/account/config')
    expect(OKX_CONFIG_PATH).not.toMatch(/trade|order/)
  })
})
