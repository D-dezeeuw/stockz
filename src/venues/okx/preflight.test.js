import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  keyVerdict,
  checkOkxKeys,
  announceKeyCheck,
  runKeyPreflight,
  OKX_CONFIG_PATH,
  NO_KEYS,
  watchKeyAim,
  probeKeyUniverses,
  applyKeyAim,
  aimSignature,
  verdictFresh,
  resetPreflight,
  OKX_UNIVERSES,
  AIM_CODES,
  VERDICT_FRESH_MS,
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

/**
 * A fetch double that answers per (base, x-simulated-trading) pair, so a test can say
 * "the key lives on global-live" and let every other universe refuse it the way OKX does.
 */
function universeFetch(accepts) {
  return async (url, init) => {
    const eea = String(url).startsWith('/okx-eea')
    const demo = init?.headers?.['x-simulated-trading'] === '1'
    const hit = eea === accepts.eea && demo === accepts.demo
    return {
      json: async () =>
        hit
          ? { code: '0', data: [{ uid: '1' }] }
          : { code: '50101', msg: 'APIKey does not match current environment.', data: [] },
    }
  }
}

beforeEach(() => {
  clearKeys()
  resetRateLimits()
  resetPreflight()
  setValue(PATHS.settings.okxEea, true)
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
    // Both allowlist refusals blame the SERVER's address, never the browser's: every call
    // relays through the backend, and on a dual-stack host the venue can see an IPv6 the
    // trader never allowlisted. Saying "this browser's IP" here sent the owner to
    // allowlist an address OKX never sees.
    expect(keyVerdict({ ok: false, code: '50114' }).fix).toMatch(/server/)
    expect(keyVerdict({ ok: false, code: '50114' }).fix).not.toMatch(/this browser is/)
    expect(keyVerdict({ ok: false, code: '50110' }).fix).toMatch(/SERVER/)
    expect(keyVerdict({ ok: false, code: '50110' }).fix).toMatch(/IPv4/)
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

  it('resolves a wrong-aim refusal itself instead of reporting it', async () => {
    setKeys('okx', OKX)
    // The desk boots aimed at EU-live (the default) and the key is a global-live one, so
    // the first call gets 50101 — "APIKey does not match current environment", the failure
    // that reads as a broken key and is really a checkbox.
    const verdict = await checkOkxKeys({
      fetch: universeFetch({ eea: false, demo: false }),
      subtle: webcrypto.subtle,
    })
    tick()

    expect(verdict.ok).toBe(true)
    expect(verdict.reason).toMatch(/re-aimed to OKX global \(okx\.com\) live/)
    // Re-aimed in settings, not just in the message: the next signed call, the sockets and
    // the reload after it all have to follow.
    expect(appState.settings.okxEea).toBe(false)
    expect(appState.settings.okxDemo).toBe(false)

    // A key no universe accepts is still a failure, and the aim is left alone — guessing at
    // it would hide a genuinely bad key behind a setting that changed for no reason.
    const nowhere = await checkOkxKeys({
      fetch: fakeFetch({ code: '50101', msg: 'APIKey does not match current environment.', data: [] }),
      subtle: webcrypto.subtle,
    })
    tick()
    expect(nowhere.ok).toBe(false)
    expect(nowhere.code).toBe('50101')
    expect(nowhere.fix).toMatch(/belongs to a different OKX/)
    expect(appState.settings.okxEea).toBe(false)

    // A failure that is about the key rather than the aim must not spend four requests
    // learning that every platform also dislikes it.
    const calls = vi.fn(async () => ({ json: async () => ({ code: '50113', msg: 'bad sign', data: [] }) }))
    const badSign = await checkOkxKeys({ fetch: calls, subtle: webcrypto.subtle })
    expect(badSign.code).toBe('50113')
    expect(calls).toHaveBeenCalledTimes(1)
  })
})

describe('probeKeyUniverses', () => {
  it('finds the one of OKX’s four runs the key belongs to', async () => {
    setKeys('okx', OKX)

    for (const universe of OKX_UNIVERSES) {
      const found = await probeKeyUniverses({
        fetch: universeFetch(universe),
        subtle: webcrypto.subtle,
      })
      expect(found).toEqual(universe)
    }

    // All four asked, every time — the answer is only trustworthy because none was skipped.
    const seen = []
    await probeKeyUniverses({
      fetch: async (url, init) => {
        seen.push(`${String(url).startsWith('/okx-eea') ? 'eea' : 'global'}:${init?.headers?.['x-simulated-trading'] ?? '0'}`)
        return { json: async () => ({ code: '50119', data: [] }) }
      },
      subtle: webcrypto.subtle,
    })
    expect(seen.sort()).toEqual(['eea:0', 'eea:1', 'global:0', 'global:1'])

    // Nothing accepted is null, never a guess.
    expect(
      await probeKeyUniverses({
        fetch: fakeFetch({ code: '50119', data: [] }),
        subtle: webcrypto.subtle,
      }),
    ).toBeNull()
  })
})

describe('applyKeyAim', () => {
  it('writes the found universe into the settings the whole desk reads', () => {
    applyKeyAim({ eea: false, demo: true })
    tick()
    expect(appState.settings.okxEea).toBe(false)
    expect(appState.settings.okxDemo).toBe(true)

    applyKeyAim({ eea: true, demo: false })
    tick()
    expect(appState.settings.okxEea).toBe(true)
    expect(appState.settings.okxDemo).toBe(false)

    // Booleans, never undefined: these paths feed `!== false` and `=== true` reads, and a
    // missing value would land on a default instead of on what was probed.
    applyKeyAim(undefined)
    tick()
    expect(appState.settings.okxEea).toBe(false)
    expect(appState.settings.okxDemo).toBe(false)
  })
})

describe('AIM_CODES', () => {
  it('lists only the refusals that are about where the request went', () => {
    // 50119: the platform never heard of the key. 50101: it did, in another environment.
    expect([...AIM_CODES].sort()).toEqual(['50101', '50119'])
    // Bad signature, passphrase, clock, IP and permissions are about the key itself — a
    // probe would spend three extra requests collecting the same refusal.
    for (const code of ['50113', '50105', '50102', '50110', '50114', '50120']) {
      expect(AIM_CODES).not.toContain(code)
    }
  })
})

describe('OKX_UNIVERSES', () => {
  it('covers region × environment exactly once each', () => {
    expect(OKX_UNIVERSES).toHaveLength(4)
    expect(new Set(OKX_UNIVERSES.map((u) => `${u.eea}:${u.demo}`)).size).toBe(4)
    // EU-live first: this desk's home, and the answer that wins a tie.
    expect(OKX_UNIVERSES[0]).toMatchObject({ eea: true, demo: false })
    for (const universe of OKX_UNIVERSES) expect(universe.label).toBeTruthy()
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

    // Single-flight: boot fires this from several directions inside one tick — the boot
    // chain, key adoption, the aim-watch — and every caller is asking the venue the same
    // question. Two concurrent calls must share one set of venue requests.
    const calls = vi.fn(async () => ({ json: async () => ({ code: '0', data: [{ uid: '1' }] }) }))
    const [first, second] = await Promise.all([
      runKeyPreflight({ fetch: calls, subtle: webcrypto.subtle }),
      runKeyPreflight({ fetch: calls, subtle: webcrypto.subtle }),
    ])
    expect(first).toBe(second)
    expect(calls).toHaveBeenCalledTimes(1)

    // And once resolved, the next call is a fresh check again, not a cached promise.
    await runKeyPreflight({ fetch: calls, subtle: webcrypto.subtle })
    expect(calls).toHaveBeenCalledTimes(2)
  })
})

describe('aimSignature', () => {
  it('names the exact (platform, environment, keys) combination in force', () => {
    expect(aimSignature()).toBe('eea:true demo:false keys:false')

    setKeys('okx', OKX)
    // Pending-aware on both axes: the signature is recorded at the exact moment the
    // probe's corrective writes are still queued, and a landed-only read would stamp the
    // verdict with the aim it just corrected away from.
    setValue(PATHS.settings.okxEea, false)
    setValue(PATHS.settings.okxDemo, true)
    expect(aimSignature()).toBe('eea:false demo:true keys:true')
    tick()
    expect(aimSignature()).toBe('eea:false demo:true keys:true')
  })
})

describe('verdictFresh', () => {
  it('answers a re-check from a recent verdict for the same aim, and only then', async () => {
    // Nothing verified yet: never fresh.
    expect(verdictFresh()).toBe(false)

    setKeys('okx', OKX)
    await runKeyPreflight({
      fetch: fakeFetch({ code: '0', data: [{ uid: '1' }] }),
      subtle: webcrypto.subtle,
    })
    tick()

    // The aim the verdict described, seconds old — the boot flurry case, answered free.
    expect(verdictFresh()).toBe(true)

    // Stale is stale: past the window the same aim re-verifies over the network.
    expect(verdictFresh(Date.now() + VERDICT_FRESH_MS + 1)).toBe(false)

    // A different aim is a different question, whatever the age.
    setValue(PATHS.settings.okxDemo, true)
    tick()
    expect(verdictFresh()).toBe(false)

    // A failed verdict never answers for anything.
    resetPreflight()
    expect(verdictFresh()).toBe(false)
  })
})

describe('resetPreflight', () => {
  it('forgets the in-flight check and the last verdict', async () => {
    setKeys('okx', OKX)
    await runKeyPreflight({
      fetch: fakeFetch({ code: '0', data: [{ uid: '1' }] }),
      subtle: webcrypto.subtle,
    })
    expect(verdictFresh()).toBe(true)

    expect(resetPreflight()).toBe(true)
    expect(verdictFresh()).toBe(false)
  })
})

describe('watchKeyAim', () => {
  it('re-checks the keys whenever the desk is re-aimed, and unsubscribes cleanly', () => {
    const registered = []
    const recheck = vi.fn()
    const unsub = watchKeyAim({
      watch: (paths, fn) => {
        registered.push({ paths, fn })
        return () => registered.pop()
      },
      recheck,
    })

    // All three inputs a verdict depends on: where requests go (both checkboxes) and what
    // there is to verify (key presence — which is how submitting new keys re-triggers).
    expect(registered[0].paths).toEqual([
      PATHS.settings.okxEea,
      PATHS.settings.okxDemo,
      PATHS.ui.keysPresent,
    ])

    registered[0].fn()
    expect(recheck).toHaveBeenCalledTimes(1)

    unsub()
    expect(registered).toHaveLength(0)
  })

  it('answers the wake its own re-aim caused from the fresh verdict, not the network', async () => {
    // The probe's corrective writes land a tick after the verdict and wake this watcher.
    // With the verdict seconds old and the aim unchanged, the default recheck must spend
    // zero venue calls.
    setKeys('okx', OKX)
    await runKeyPreflight({
      fetch: fakeFetch({ code: '0', data: [{ uid: '1' }] }),
      subtle: webcrypto.subtle,
    })
    tick()

    const registered = []
    watchKeyAim({
      watch: (paths, fn) => {
        registered.push({ paths, fn })
        return () => {}
      },
    })

    // The default recheck path: fresh verdict → resolved promise, no clock sync, no fetch.
    await expect(registered[0].fn()).resolves.toBeUndefined()
  })
})

describe('OKX_CONFIG_PATH', () => {
  it('names an authenticated, side-effect-free endpoint', () => {
    // The preflight must not move money or place anything. `account/config` reads.
    expect(OKX_CONFIG_PATH).toBe('/api/v5/account/config')
    expect(OKX_CONFIG_PATH).not.toMatch(/trade|order/)
  })
})
