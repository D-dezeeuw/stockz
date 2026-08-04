import { describe, it, expect, beforeEach } from 'vitest'
import {
  validateParamSchema,
  defaultsFromSchema,
  coerceParam,
  coerceParams,
  fieldDescriptor,
  fieldDescriptors,
  paramsFor,
  publishParamForm,
  applyParams,
  PARAM_KINDS,
} from './params.js'
import { defineStrategy } from './contract.js'
import { appState, setValue, tick, resetState } from '../app/engine.js'

const SCHEMA = {
  lookback: { kind: 'number', default: 20, min: 5, max: 200, step: 5 },
  aggressive: { kind: 'toggle', default: false },
  mode: { kind: 'select', default: 'fast', options: ['fast', 'slow'] },
}

function stub() {
  return defineStrategy({
    id: 'mean-rev',
    name: 'Mean Reversion',
    params: SCHEMA,
    init: (ctx) => ({ threshold: ctx.params.lookback * 2 }),
    onTick: () => null,
    onCandle: () => null,
  })
}

beforeEach(() => {
  resetState()
})

describe('validateParamSchema', () => {
  it('rejects the schemas that would render as an input that does nothing', () => {
    expect(validateParamSchema(SCHEMA)).toBe(true)

    // An inverted range clamps every value to one end — on screen, a slider that moves
    // and changes nothing.
    expect(() => validateParamSchema({ n: { min: 10, max: 2 } })).toThrow(/min above max/)
    expect(() => validateParamSchema({ n: { step: 0 } })).toThrow(/step/)
    expect(() => validateParamSchema({ n: { kind: 'slider' } })).toThrow(/unknown kind/)
    expect(() => validateParamSchema({ m: { kind: 'select' } })).toThrow(/options/)

    expect(() => validateParamSchema({ 'bad key': {} })).toThrow(/identifier/)
    expect(() => validateParamSchema({ n: 7 })).toThrow(/spec object/)
    expect(() => validateParamSchema(null)).toThrow(/object/)
    expect(PARAM_KINDS).toContain('toggle')
  })
})

describe('defaultsFromSchema', () => {
  it('gives every strategy a sane first run', () => {
    expect(defaultsFromSchema(SCHEMA)).toEqual({
      lookback: 20,
      aggressive: false,
      mode: 'fast',
    })

    // A bare value is its own default.
    expect(defaultsFromSchema({ size: 3 })).toEqual({ size: 3 })
    expect(defaultsFromSchema(null)).toEqual({})
  })
})

describe('coerceParam', () => {
  it('never lets a string or a stale preset reach a strategy as a number', () => {
    // A number input hands back a string; a param that arrives as "20" sizes wrong.
    expect(coerceParam(SCHEMA.lookback, '25')).toBe(25)
    expect(coerceParam(SCHEMA.lookback, 5000)).toBe(200)
    expect(coerceParam(SCHEMA.lookback, 1)).toBe(5)
    expect(coerceParam(SCHEMA.lookback, 'nope')).toBe(20)

    // Snapped relative to min, so a step of 5 on a min of 5 offers 5/10/15 — the author
    // picked that floor for a reason.
    expect(coerceParam(SCHEMA.lookback, 23)).toBe(25)
    expect(coerceParam({ kind: 'number', default: 0, min: 2, step: 5 }, 8)).toBe(7)

    expect(coerceParam(SCHEMA.aggressive, 'true')).toBe(true)
    expect(coerceParam(SCHEMA.aggressive, 'nonsense')).toBe(false)
    expect(coerceParam(SCHEMA.mode, 'slow')).toBe('slow')
    expect(coerceParam(SCHEMA.mode, 'sideways')).toBe('fast')
    expect(coerceParam({ kind: 'text', default: '' }, 7)).toBe('7')
    expect(coerceParam({ kind: 'text' }, null)).toBe('')
  })
})

describe('coerceParams', () => {
  it('fills the gaps from the schema instead of handing a strategy undefined', () => {
    expect(coerceParams(SCHEMA, { lookback: '30' })).toEqual({
      lookback: 30,
      aggressive: false,
      mode: 'fast',
    })

    expect(coerceParams(SCHEMA)).toEqual(defaultsFromSchema(SCHEMA))
    expect(coerceParams(null)).toEqual({})
  })
})

describe('fieldDescriptor', () => {
  it('derives a label the author did not write, because a blank one is never touched', () => {
    expect(fieldDescriptor('lookback', SCHEMA.lookback, 'mean-rev')).toEqual({
      key: 'lookback',
      kind: 'number',
      strategyId: 'mean-rev',
      // The value in force, not the default — a form that always renders defaults tells
      // the trader their tuning did not save.
      value: 20,
      label: 'lookback',
      min: 5,
      max: 200,
      step: 5,
      options: [],
      path: 'settings.strategyParams.mean-rev.lookback',
    })

    // camelCase reads as words rather than as an identifier.
    expect(fieldDescriptor('maxHoldMs', {}, 'x').label).toBe('max hold ms')
    expect(fieldDescriptor('mode', SCHEMA.mode, 'x').options).toEqual(['fast', 'slow'])
    expect(fieldDescriptor('lookback', SCHEMA.lookback, 'x', 45).value).toBe(45)
  })
})

describe('fieldDescriptors', () => {
  it('builds the whole form so no strategy ever ships its own settings UI', () => {
    const fields = fieldDescriptors(stub())

    // budgetMs leads: it is merged in by defineStrategy, so every strategy exposes one.
    expect(fields.map((f) => f.key)).toEqual(['budgetMs', 'lookback', 'aggressive', 'mode'])
    expect(fields.map((f) => f.kind)).toEqual(['number', 'number', 'toggle', 'select'])
    expect(fieldDescriptors(null)).toEqual([])
  })
})

describe('paramsFor', () => {
  it('reads the trader’s saved tuning, coerced on the way out of storage', () => {
    setValue('settings.strategyParams', { 'mean-rev': { lookback: 9999, mode: 'slow' } })
    tick()

    expect(paramsFor(stub())).toMatchObject({ lookback: 200, aggressive: false, mode: 'slow' })

    resetState()
    expect(paramsFor(stub())).toMatchObject(defaultsFromSchema(SCHEMA))
    expect(paramsFor(stub()).budgetMs).toBe(2)
  })
})

describe('publishParamForm', () => {
  it('stores tuning under settings, the only namespace that survives a reload', () => {
    const fields = publishParamForm(stub(), { lookback: '35' })
    tick()

    expect(fields).toHaveLength(4)
    expect(appState.settings.strategyParams['mean-rev']).toEqual({
      budgetMs: 2,
      lookback: 35,
      aggressive: false,
      mode: 'fast',
    })
    expect(appState.ui.strategyForm).toHaveLength(4)

    expect(publishParamForm(null)).toEqual([])
  })
})

describe('applyParams', () => {
  it('re-runs init, so a value derived at start cannot outlive the form that set it', () => {
    const strategy = stub()
    const run = { ctx: Object.freeze({ instrument: 'okx:BTC-USDT', params: { lookback: 20 } }) }

    applyParams(run, { lookback: 50 }, strategy)

    expect(run.ctx.params.lookback).toBe(50)
    expect(run.ctx.instrument).toBe('okx:BTC-USDT')
    // Derived at start from the old lookback; stale the moment the form changed it.
    expect(run.memory).toEqual({ threshold: 100 })
    expect(Object.isFrozen(run.ctx)).toBe(true)

    expect(applyParams(null, {}, strategy)).toBeNull()
    expect(applyParams(run, {}, null)).toBeNull()
  })
})
