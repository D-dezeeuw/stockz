import { defineStrategy, NEUTRAL_SIGNAL } from '../contract.js'

/**
 * The reference strategy.
 *
 * It trades nothing. Its job is to be the living proof that the contract holds end to
 * end — registered, run, and returning a signal the pipeline accepts — so a failure in
 * the *framework* can always be told apart from a failure in somebody's idea.
 *
 * It is also the template a strategy author copies.
 */
export const noopStrategy = defineStrategy({
  id: 'noop',
  name: 'No-op (reference)',
  params: {
    // A param that does nothing, so the schema path is exercised by something that ships.
    label: { default: 'noop' },
  },
  init: (ctx) => ({ startedAt: ctx.now }),
  onTick: () => NEUTRAL_SIGNAL,
  onCandle: () => NEUTRAL_SIGNAL,
})
