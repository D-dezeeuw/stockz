import { describe, it, expect } from 'vitest'
import {
  foldPrint,
  bandTouch,
  revertConfirm,
  vwapExit,
  revertTick,
  vwapRevertStrategy,
  REVERT_WARMUP,
} from './vwap-revert.js'
import { createStrategyContext } from '../contract.js'

/** A context with the strategy's scratchpad already built. */
function armed(params = {}) {
  const ctx = createStrategyContext({
    strategy: vwapRevertStrategy,
    instrument: 'okx:BTC-USDT',
    params: { sigmaK: 2, stopSigma: 4, window: 100, ...params },
  })
  vwapRevertStrategy.init(ctx)
  return ctx
}

describe('foldPrint', () => {
  it('defaults a sizeless print to one lot rather than leaving VWAP dead at zero', () => {
    const ctx = armed()

    expect(foldPrint(ctx.state, 100, 2).vwap).toBe(100)
    // A feed that omits size would otherwise leave VWAP permanently at zero and the
    // strategy silently dead.
    expect(foldPrint(ctx.state, 200, undefined).vwap).toBeGreaterThan(100)

    // Not warm until enough prints have been seen.
    expect(foldPrint(ctx.state, 100, 1).warm).toBe(false)
    for (let i = 0; i < REVERT_WARMUP; i += 1) foldPrint(ctx.state, 100 + (i % 5), 1)
    expect(foldPrint(ctx.state, 101, 1).warm).toBe(true)

    expect(foldPrint(null, 100, 1)).toEqual({ vwap: 0, sigma: 0, distance: 0, warm: false })
    expect(foldPrint(ctx.state, NaN, 1).warm).toBe(false)
  })
})

describe('bandTouch', () => {
  it('fades the band, which is the mirror of chasing it', () => {
    // Price below the lower band is a *buy* setup: getting this sign backwards turns a
    // fade into a chase.
    expect(bandTouch(-3, 1, 2)).toBe('buy')
    expect(bandTouch(3, 1, 2)).toBe('sell')

    expect(bandTouch(1, 1, 2)).toBe('')
    expect(bandTouch(-2, 1, 2)).toBe('buy')

    // No dispersion to measure against is no setup.
    expect(bandTouch(3, 0, 2)).toBe('')
    expect(bandTouch(NaN, 1, 2)).toBe('')
  })
})

describe('revertConfirm', () => {
  it('refuses the falling knife, which is how a fade account dies', () => {
    // Armed long: only a print coming back up confirms.
    expect(revertConfirm(101, 100, 'buy')).toBe(true)
    expect(revertConfirm(99, 100, 'buy')).toBe(false)

    expect(revertConfirm(99, 100, 'sell')).toBe(true)
    expect(revertConfirm(101, 100, 'sell')).toBe(false)

    expect(revertConfirm(101, 100, '')).toBe(false)
    expect(revertConfirm(101, NaN, 'buy')).toBe(false)
  })
})

describe('vwapExit', () => {
  it('targets fair value, because past it the reason to hold is gone', () => {
    const entry = { side: 'buy', px: 95, vwap: 100 }

    expect(vwapExit(entry, 98, 100, 4, 1)).toBe('')
    expect(vwapExit(entry, 100, 100, 4, 1)).toBe('reverted to vwap')

    // Stretched further still means the fade was wrong; holding "until it reverts" is the
    // failure mode this stop prevents.
    expect(vwapExit(entry, 95, 100, 4, 1)).toBe('stretched past stop')

    const short = { side: 'sell', px: 105, vwap: 100 }
    expect(vwapExit(short, 100, 100, 4, 1)).toBe('reverted to vwap')
    expect(vwapExit(short, 105, 100, 4, 1)).toBe('stretched past stop')

    expect(vwapExit(null, 100, 100, 4, 1)).toBe('')
  })
})

describe('revertTick', () => {
  it('arms on the touch and fires on the turn, never on the touch alone', () => {
    const ctx = armed()

    // A noisy but centred tape builds VWAP and its dispersion.
    for (let i = 0; i < 60; i += 1) revertTick(ctx, { px: 100 + (i % 2 ? 0.5 : -0.5), size: 1 })

    // A deep dip touches the band — and must not fire on its own.
    expect(revertTick(ctx, { px: 96, size: 1 })).toBeNull()
    expect(ctx.state.armed).toBe('buy')

    // The turn back up is the entry.
    const fired = revertTick(ctx, { px: 97, size: 1 })
    expect(fired).toMatchObject({ action: 'buy' })
    expect(fired.reason).toMatch(/σ from vwap/)
    expect(ctx.state.entry.side).toBe('buy')

    // Back at fair value, the trade is done.
    const exit = revertTick(ctx, { px: 100.5, size: 1 })
    expect(exit).toMatchObject({ action: 'flat', reason: 'reverted to vwap' })
    expect(ctx.state.entry).toBeNull()

    expect(revertTick({ state: {} }, { px: 1 })).toBeNull()
  })
})

describe('vwapRevertStrategy', () => {
  it('is the momentum strategy’s opposite, and says so in its own state', () => {
    expect(vwapRevertStrategy.id).toBe('vwap-revert')
    expect(vwapRevertStrategy.params.sigmaK.default).toBe(2)

    const a = armed()
    const b = armed()
    revertTick(a, { px: 100, size: 1 })

    // Two runs keep their own VWAP anchors.
    expect(a.state.samples).toBe(1)
    expect(b.state.samples).toBe(0)
    expect(vwapRevertStrategy.onCandle()).toBeNull()
  })
})
