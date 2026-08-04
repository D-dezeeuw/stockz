import { describe, it, expect, beforeEach } from 'vitest'
import {
  validatePreset,
  presetFor,
  applyPreset,
  customPresets,
  savePreset,
  presetDirty,
  presetNames,
  PRESETS,
  PRESET_NAMES,
} from './presets.js'
import { momentumStrategy } from './builtin/momentum.js'
import { paramsFor } from './params.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

beforeEach(() => {
  resetState()
})

describe('validatePreset', () => {
  it('names the keys a strategy does not have, rather than ignoring them', () => {
    expect(validatePreset(PRESETS['momentum-burst'].standard, momentumStrategy.params)).toEqual({
      ok: true,
      unknown: [],
      clamped: [],
    })

    // A pack written against a different version would otherwise leave the trader thinking
    // they had tuned something.
    const stale = validatePreset({ windowMs: 1000, gamma: 3 }, momentumStrategy.params)
    expect(stale).toMatchObject({ ok: false, unknown: ['gamma'] })

    // An out-of-range value is reported, not silently accepted.
    expect(validatePreset({ multiple: 999 }, momentumStrategy.params).clamped).toEqual(['multiple'])
    expect(validatePreset(null, momentumStrategy.params).ok).toBe(false)
  })
})

describe('presetFor', () => {
  it('speaks the same three names for every strategy, which is why three is useful', () => {
    for (const id of Object.keys(PRESETS)) {
      expect(Object.keys(PRESETS[id])).toEqual([...PRESET_NAMES])
    }

    expect(presetFor('momentum-burst', 'aggressive').multiple).toBe(2)
    expect(presetFor('momentum-burst', 'nope')).toBeNull()
    expect(presetFor('nope', 'standard')).toBeNull()
  })
})

describe('applyPreset', () => {
  it('merges onto the current tuning, so a partial pack does not reset the rest', () => {
    setValue('settings.strategyParams', { 'momentum-burst': { budgetMs: 5, windowMs: 4000 } })
    tick()

    const next = applyPreset(momentumStrategy, 'aggressive')
    tick()

    expect(next.multiple).toBe(2)
    expect(next.windowMs).toBe(500)
    // budgetMs is not in the pack, so the trader's own value survives.
    expect(next.budgetMs).toBe(5)
    expect(appState.settings.activePresets['momentum-burst']).toBe('aggressive')

    expect(applyPreset(momentumStrategy, 'nope')).toBeNull()
    expect(applyPreset(null, 'standard')).toBeNull()
  })
})

describe('customPresets', () => {
  it('reads the trader’s own packs back, and an empty desk as empty', () => {
    expect(customPresets()).toEqual({})

    setValue('settings.customPresets', { 'momentum-burst': { mine: { multiple: 7 } } })
    tick()
    expect(customPresets()['momentum-burst'].mine.multiple).toBe(7)
  })
})

describe('savePreset', () => {
  it('refuses to shadow a built-in name, which would strand the original', () => {
    const saved = savePreset(momentumStrategy, 'my scalp', { multiple: 6, windowMs: 800 })
    tick()

    expect(saved.multiple).toBe(6)
    expect(appState.settings.customPresets['momentum-burst']['my scalp'].windowMs).toBe(800)

    // A pack named 'standard' would leave no way back to the real one.
    expect(savePreset(momentumStrategy, 'standard', {})).toBeNull()
    expect(savePreset(momentumStrategy, '  ', {})).toBeNull()
    expect(savePreset(null, 'mine', {})).toBeNull()
  })
})

describe('presetDirty', () => {
  it('reports real drift only, not a value the schema would have clamped anyway', () => {
    applyPreset(momentumStrategy, 'standard')
    tick()
    expect(presetDirty(momentumStrategy, 'standard')).toBe(false)

    setValue('settings.strategyParams', {
      'momentum-burst': { ...paramsFor(momentumStrategy), multiple: 7 },
    })
    tick()
    expect(presetDirty(momentumStrategy, 'standard')).toBe(true)

    expect(presetDirty(momentumStrategy, 'nope')).toBe(false)
  })
})

describe('presetNames', () => {
  it('lists the built-ins first, then whatever the trader saved', () => {
    expect(presetNames('momentum-burst')).toEqual([...PRESET_NAMES])

    setValue('settings.customPresets', { 'momentum-burst': { mine: {}, standard: {} } })
    tick()

    // A custom pack that collides with a built-in name appears once, not twice.
    expect(presetNames('momentum-burst')).toEqual([...PRESET_NAMES, 'mine'])
    expect(presetNames('nope')).toEqual([])
  })
})
