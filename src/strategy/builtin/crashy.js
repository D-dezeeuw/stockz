import { defineStrategy } from '../contract.js'

/**
 * A deliberately hostile strategy.
 *
 * Isolation claimed is not isolation proven. This one throws on a schedule so the sandbox
 * can be tested against something that genuinely misbehaves — and so a regression that
 * lets an exception escape the tick loop fails a test rather than a trading session.
 *
 * It ships with the desk rather than living in the test folder because the crash fixture
 * and the sandbox must stay in the same module graph: a fixture that drifts out of sync
 * with the contract proves nothing about the contract.
 */
export const crashyStrategy = defineStrategy({
  id: 'crashy',
  name: 'Crash test (diagnostic)',
  params: {
    everyNth: { kind: 'number', label: 'throw every Nth tick', default: 5, min: 1, max: 100 },
  },
  init: () => ({ ticks: 0 }),
  onTick: (ctx, tick) => {
    // Keyed off the tick rather than module state, so two runs of this strategy on two
    // instruments crash independently and a test can drive the schedule exactly.
    const every = Math.max(1, Number(ctx.params?.everyNth) || 5)
    if (Number(tick?.ts) % every === 0) throw new Error('crashy: scheduled failure')

    return { action: 'none', strength: 0, reason: 'crashy is fine this tick' }
  },
  onCandle: () => null,
})
