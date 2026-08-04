import { setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

/**
 * Key scopes.
 *
 * The same key has to mean different things in different places, or the desk runs out of
 * keys. PageDown scrolls the ladder when the ladder has focus; typing in the palette
 * must not fire a trade whatever letters are pressed.
 *
 * Resolution is nearest-first: an overlay beats a focused block, which beats the global
 * layout. That ordering is the whole design — a modal is by definition the thing the
 * trader is currently doing, and it gets first refusal on every chord.
 */

/** Scope kinds, most specific first. */
export const SCOPE_ORDER = Object.freeze(['modal', 'block', 'global'])

/**
 * The stack, held outside the reactive tree.
 *
 * Focus events and keydowns interleave inside a single frame, and a stack read back from
 * state would be one frame behind the focus that caused it — the palette would swallow
 * the keystroke that opened it, or worse, miss the first one typed into it.
 */
let stack = []

/**
 * Push a scope.
 *
 * @param {string} kind - a SCOPE_ORDER member.
 * @param {string} id - what owns the scope, e.g. a block id.
 * @returns {Array<object>} the stack after pushing.
 */
export function pushScope(kind, id) {
  const scope = String(kind ?? '')
  if (!SCOPE_ORDER.includes(scope) || scope === 'global') return stack

  // Re-pushing the same scope is a no-op rather than a duplicate: focusin fires again on
  // every click inside an already-focused block.
  const key = `${scope}:${id ?? ''}`
  if (stack.some((entry) => entry.key === key)) return stack

  stack = [...stack, { kind: scope, id: String(id ?? ''), key }]
  setValue(PATHS.ui.scope, activeScope().kind)
  return stack
}

/**
 * Pop a scope by kind and id.
 *
 * @param {string} kind - the scope kind.
 * @param {string} id - the owner.
 * @returns {Array<object>} the stack after popping.
 */
export function popScope(kind, id) {
  const key = `${String(kind ?? '')}:${id ?? ''}`
  stack = stack.filter((entry) => entry.key !== key)
  setValue(PATHS.ui.scope, activeScope().kind)

  return stack
}

/**
 * The scope that currently owns the keyboard.
 *
 * @returns {{kind: string, id: string}} the active scope.
 */
export function activeScope() {
  // A modal anywhere in the stack wins outright: it is by definition what the trader is
  // doing right now, whatever else has focus underneath it.
  const modal = stack.findLast((entry) => entry.kind === 'modal')
  if (modal) return { kind: modal.kind, id: modal.id }

  const last = stack[stack.length - 1]
  return last ? { kind: last.kind, id: last.id } : { kind: 'global', id: '' }
}

/**
 * The chain a chord is resolved against, nearest first.
 *
 * @returns {string[]} scope keys to try, ending at global.
 */
export function scopeChain() {
  const active = activeScope()
  if (active.kind === 'modal') {
    // A modal does not fall through to the desk: that is what makes typing in the
    // palette safe. Only its own bindings, then nothing.
    return [`modal:${active.id}`]
  }
  if (active.kind === 'block') return [`block:${active.id}`, 'global']

  return ['global']
}

/** Empty the stack — closing every overlay, or a test. */
export function resetScopes() {
  stack = []
  setValue(PATHS.ui.scope, 'global')
  return true
}

/**
 * Follow focus into and out of blocks.
 *
 * @param {Document} [doc] - the document to watch.
 * @returns {() => void} unsubscribe.
 */
export function trackBlockFocus(doc = globalThis.document) {
  if (!doc?.addEventListener) return () => {}

  const blockOf = (node) => node?.closest?.('[data-block-id]')?.dataset?.blockId ?? ''

  const onIn = (event) => {
    const id = blockOf(event.target)
    if (id) pushScope('block', id)
  }
  const onOut = (event) => {
    const id = blockOf(event.target)
    // Only when focus actually leaves the block: moving between two inputs inside one
    // block fires focusout too, and popping there would drop the scope mid-interaction.
    if (id && !event.relatedTarget?.closest?.(`[data-block-id="${id}"]`)) popScope('block', id)
  }

  doc.addEventListener('focusin', onIn)
  doc.addEventListener('focusout', onOut)

  return () => {
    doc.removeEventListener?.('focusin', onIn)
    doc.removeEventListener?.('focusout', onOut)
  }
}
