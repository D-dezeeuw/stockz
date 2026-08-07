import { describe, it, expect } from 'vitest'
import { signalGate, throttleGate, capGate, cooldownGate, MIN_STRENGTH } from './gates.js'

describe('signalGate', () => {
  it('passes only a directional signal with real conviction', () => {
    expect(signalGate({ action: 'buy', strength: 0.9 })).toEqual({ pass: true, reason: '' })
    expect(signalGate({ action: 'sell', strength: MIN_STRENGTH })).toEqual({ pass: true, reason: '' })

    // 'flat' and 'none' are opinions about not trading; they must never become an order.
    expect(signalGate({ action: 'flat', strength: 1 }).pass).toBe(false)
    expect(signalGate({ action: 'none', strength: 1 }).reason).toBe('no direction')

    const weak = signalGate({ action: 'buy', strength: 0.2 })
    expect(weak.pass).toBe(false)
    // The number, not just "weak": a session that traded nothing should say how close it got.
    expect(weak.reason).toMatch(/0\.20/)

    expect(signalGate(undefined).pass).toBe(false)
    expect(signalGate({ action: 'buy' }).pass).toBe(false)
  })
})

describe('throttleGate', () => {
  it('slides the minute rather than resetting on its boundary', () => {
    const at = 1_000_000
    // A fixed window lets twice the ceiling through across a boundary — precisely when a
    // burst of signals arrives.
    const recent = [at - 59_000, at - 30_000, at - 1_000]

    expect(throttleGate(recent, at, 5).pass).toBe(true)
    const full = throttleGate(recent, at, 3)
    expect(full.pass).toBe(false)
    expect(full.reason).toMatch(/throttled at 3\/min/)

    // Anything older than a minute is forgotten, and the pruned window is handed back so
    // the caller never has to prune it twice.
    const aged = throttleGate([at - 61_000, at - 5_000], at, 2)
    expect(aged.pass).toBe(true)
    expect(aged.kept).toEqual([at - 5_000])

    expect(throttleGate(undefined, at, 1).pass).toBe(true)
  })
})

describe('capGate', () => {
  it('binds in both directions and never blocks the exit', () => {
    const buy = { instrument: 'BTC-USDT', side: 'buy', size: 0.005 }

    expect(capGate(buy, 0, 0.01).pass).toBe(true)
    expect(capGate(buy, 0.005, 0.01).pass).toBe(true)

    const over = capGate(buy, 0.008, 0.01)
    expect(over.pass).toBe(false)
    expect(over.reason).toMatch(/cap 0\.01/)

    // The short side is capped by the same number: a limit written for a long must not be
    // silently doubled by going the other way.
    expect(capGate({ ...buy, side: 'sell' }, -0.008, 0.01).pass).toBe(false)

    // Reducing is always allowed, even from over the cap. A gate that blocks the exit is a
    // gate that traps a position, and no risk limit is worth that.
    expect(capGate({ ...buy, side: 'sell' }, 0.05, 0.01).pass).toBe(true)
    expect(capGate(buy, -0.05, 0.01).pass).toBe(true)

    // No cap configured is no cap.
    expect(capGate(buy, 100, undefined).pass).toBe(true)
  })
})

describe('cooldownGate', () => {
  it('benches until the clock says otherwise, and says for how long', () => {
    expect(cooldownGate(0, 1000)).toEqual({ pass: true, reason: '' })
    expect(cooldownGate(500, 1000).pass).toBe(true)

    const benched = cooldownGate(6000, 1000)
    expect(benched.pass).toBe(false)
    expect(benched.reason).toBe('benched 5s')
  })
})
