import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

/**
 * Strategy tuning, from schema to form to running strategy.
 *
 * The rule that makes this worth building: **no strategy ever ships its own settings UI.**
 * An author declares `{kind, min, max, step, default}` per param and the form builds
 * itself. The moment tuning requires hand-written markup, half the strategies ship without
 * it and get tuned by editing source.
 *
 * Values are coerced on the way *in*, not trusted from the input. A number field returns a
 * string, a saved preset can be years old, and a param that reaches a strategy as `"20"`
 * or as `NaN` is a position sized wrong.
 */

/** The field kinds a param may declare — the same set the settings drawer speaks. */
export const PARAM_KINDS = Object.freeze(['number', 'toggle', 'select', 'text'])

/**
 * Check a param schema, loudly and per field.
 *
 * @param {object} schema - key → spec.
 * @returns {true} when valid.
 * @throws {Error} naming the offending field.
 */
export function validateParamSchema(schema) {
  if (!schema || typeof schema !== 'object') throw new Error('params: schema must be an object')

  for (const [key, spec] of Object.entries(schema)) {
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)) {
      throw new Error(`params: "${key}" must be a plain identifier`)
    }
    if (!spec || typeof spec !== 'object') {
      throw new Error(`params: "${key}" must be a spec object`)
    }

    const kind = String(spec.kind ?? 'number')
    if (!PARAM_KINDS.includes(kind)) throw new Error(`params: "${key}" has unknown kind ${kind}`)

    if (kind === 'select' && !Array.isArray(spec.options)) {
      throw new Error(`params: "${key}" needs options`)
    }

    const { min, max } = spec
    // An inverted range silently clamps every value to one end, which reads on screen as
    // a slider that does nothing.
    if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
      throw new Error(`params: "${key}" has min above max`)
    }
    if (spec.step !== undefined && !(Number(spec.step) > 0)) {
      throw new Error(`params: "${key}" has a non-positive step`)
    }
  }

  return true
}

/**
 * The values a strategy starts with.
 *
 * @param {object} schema - key → spec.
 * @returns {object} the defaults.
 */
export function defaultsFromSchema(schema) {
  const out = {}
  for (const [key, spec] of Object.entries(schema ?? {})) {
    out[key] = spec && typeof spec === 'object' ? spec.default : spec
  }

  return out
}

/**
 * Cast one value into what its spec says it is.
 *
 * @param {object} spec - the param spec.
 * @param {any} value - the raw input.
 * @returns {any} the coerced value.
 */
export function coerceParam(spec, value) {
  const kind = String(spec?.kind ?? 'number')

  if (kind === 'toggle') {
    if (typeof value === 'boolean') return value
    if (value === 'true') return true
    if (value === 'false') return false
    return spec?.default === true
  }

  if (kind === 'select') {
    const options = Array.isArray(spec?.options) ? spec.options : []
    return options.includes(value) ? value : spec?.default
  }

  if (kind === 'text') return value === undefined || value === null ? '' : String(value)

  const num = Number(value)
  if (!Number.isFinite(num)) return spec?.default

  const min = Number.isFinite(Number(spec?.min)) ? Number(spec.min) : -Infinity
  const max = Number.isFinite(Number(spec?.max)) ? Number(spec.max) : Infinity
  const step = Number(spec?.step)

  const clamped = Math.min(max, Math.max(min, num))
  if (!(step > 0)) return clamped

  // Snapped to the step relative to min, so a step of 5 on a min of 2 offers 2/7/12 rather
  // than 0/5/10 — the author picked that min for a reason.
  const base = Number.isFinite(min) ? min : 0
  const snapped = base + Math.round((clamped - base) / step) * step

  return Number(Math.min(max, Math.max(min, snapped)).toFixed(10))
}

/**
 * Coerce a whole bag against a schema.
 *
 * @param {object} schema - key → spec.
 * @param {object} [values] - the raw values.
 * @returns {object} the coerced params.
 */
export function coerceParams(schema, values = {}) {
  const out = {}
  for (const [key, spec] of Object.entries(schema ?? {})) {
    const given = values?.[key]
    out[key] = given === undefined ? defaultsFromSchema({ [key]: spec })[key] : coerceParam(spec, given)
  }

  return out
}

/**
 * Turn a schema entry into something the form template can render.
 *
 * @param {string} key - the param name.
 * @param {object} spec - the spec.
 * @param {string} strategyId - the owning strategy.
 * @param {any} [value] - the value currently in force.
 * @returns {object} the field descriptor.
 */
export function fieldDescriptor(key, spec, strategyId, value) {
  const kind = String(spec?.kind ?? 'number')

  return {
    key,
    kind,
    strategyId: String(strategyId ?? ''),
    // The value in force, not the default: a form that always renders defaults tells the
    // trader their tuning did not save.
    value: value === undefined ? coerceParam(spec, spec?.default) : value,
    // A label the author did not write is derived from the key rather than left blank: an
    // unlabelled input is a param nobody dares change.
    label: String(spec?.label ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()),
    min: spec?.min,
    max: spec?.max,
    step: spec?.step,
    options: Array.isArray(spec?.options) ? spec.options : [],
    // Where the value lives. Under `settings.` because that is the only namespace that
    // survives a reload.
    path: `${PATHS.settings.strategyParams}.${strategyId}.${key}`,
  }
}

/**
 * Every field of a strategy, ready to render.
 *
 * @param {object} strategy - the strategy descriptor.
 * @param {object} [values] - the values in force.
 * @returns {object[]} the field descriptors.
 */
export function fieldDescriptors(strategy, values) {
  const schema = strategy?.params ?? {}
  const id = String(strategy?.id ?? '')
  const current = values ?? paramsFor(strategy)

  return Object.entries(schema).map(([key, spec]) => fieldDescriptor(key, spec, id, current[key]))
}

/**
 * The tuning currently in force for a strategy.
 *
 * @param {object} strategy - the strategy descriptor.
 * @param {object} [state] - the settings slice.
 * @returns {object} the coerced params.
 */
export function paramsFor(strategy, state = appState?.settings) {
  const saved = state?.strategyParams?.[String(strategy?.id ?? '')] ?? {}
  return coerceParams(strategy?.params, saved)
}

/**
 * Publish a strategy's form and store its tuning.
 *
 * @param {object} strategy - the strategy descriptor.
 * @param {object} [values] - values to save; omit to just publish the form.
 * @returns {object[]} the field descriptors.
 */
export function publishParamForm(strategy, values) {
  const id = String(strategy?.id ?? '')
  if (!id) return []

  if (values) {
    setValue(PATHS.settings.strategyParams, {
      ...(appState.settings?.strategyParams ?? {}),
      [id]: coerceParams(strategy?.params, values),
    })
  }

  // Read back through the coercion rather than echoing what was passed in: the form must
  // show what the strategy will actually receive, clamp and all.
  const fields = fieldDescriptors(strategy, coerceParams(strategy?.params, values ?? paramsFor(strategy)))
  setValue(PATHS.ui.strategyForm, fields)
  return fields
}

/**
 * Re-init a running strategy against new params.
 *
 * @param {object} run - the live run.
 * @param {object} values - the new raw values.
 * @param {object} strategy - the strategy descriptor.
 * @returns {object|null} the run, re-initialised.
 */
export function applyParams(run, values, strategy) {
  if (!run || !strategy) return null

  const params = coerceParams(strategy.params, values)
  // The context is frozen, so tuning rebuilds it rather than mutating it — and init runs
  // again, because a strategy that computed a threshold from its lookback at start would
  // otherwise keep the old one while the form says the new one.
  const ctx = Object.freeze({ ...run.ctx, params: Object.freeze(params) })
  run.ctx = ctx
  run.memory = strategy.init(ctx)

  return run
}

/**
 * Write one param from the form.
 *
 * @param {object} strategy - the strategy descriptor.
 * @param {string} key - the param name.
 * @param {any} raw - the input's value.
 * @returns {object|null} the strategy's params after the write.
 */
export function setStrategyParam(strategy, key, raw) {
  const id = String(strategy?.id ?? '')
  const name = String(key ?? '')
  if (!id || !strategy?.params?.[name]) return null

  const next = { ...paramsFor(strategy), [name]: coerceParam(strategy.params[name], raw) }
  publishParamForm(strategy, next)
  return next
}
