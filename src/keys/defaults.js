import { ACTIONS } from '../actions/names.js'
import { registerBinding, unregisterBinding, clearBindings, allBindings } from './keymap.js'
import { setValue } from '../app/engine.js'
import { PATHS } from '../state/paths.js'

/**
 * The stock layout.
 *
 * Chosen for the left hand, because the right one is on the mouse for the chart. B and S
 * sit under the fingers, the digits size, the arrows walk the price, F flattens and
 * Escape is the panic key — all reachable without looking, which is the entire point of
 * a keyboard layout on a trading desk.
 *
 * Every entry maps to an action that already exists. A binding that needed its own
 * implementation would be a second code path for something the buttons already do, and
 * the two would drift.
 */

/** The shipped layout: chord, action, payload, label. */
export const DEFAULT_BINDINGS = Object.freeze([
  { chord: 'KeyB', action: ACTIONS.ticket.submit, payload: { side: 'buy' }, label: 'buy' },
  { chord: 'KeyS', action: ACTIONS.ticket.submit, payload: { side: 'sell' }, label: 'sell' },
  { chord: 'KeyF', action: ACTIONS.positions.flattenAll, payload: {}, label: 'flatten all positions' },
  { chord: 'KeyC', action: ACTIONS.orders.cancelAll, payload: {}, label: 'cancel all orders' },
  { chord: 'Escape', action: ACTIONS.keys.panic, payload: {}, label: 'close · Esc Esc = panic' },
  { chord: 'KeyA', action: ACTIONS.ticket.arm, payload: {}, label: 'arm / disarm' },
  // Shift+A, not A: the bot's arm and the ticket's arm are different switches, and a chord
  // one keystroke away from the manual arm would eventually be pressed by mistake.
  { chord: 'shift+KeyA', action: ACTIONS.bot.toggleArm, payload: {}, label: 'arm / disarm auto-trading' },
  // The one chord that must fire with an input focused, which is why it takes three keys:
  // an emergency control that a stray keypress could hit is its own emergency.
  { chord: 'ctrl+shift+KeyK', action: ACTIONS.breaker.kill, payload: { source: 'hotkey' }, label: 'KILL — halt everything' },
  { chord: 'KeyR', action: ACTIONS.ticket.repeatLast, payload: {}, label: 'repeat last order' },
  { chord: 'Digit1', action: ACTIONS.ticket.setSize, payload: { preset: 0.25 }, label: 'size ¼' },
  { chord: 'Digit2', action: ACTIONS.ticket.setSize, payload: { preset: 0.5 }, label: 'size ½' },
  { chord: 'Digit3', action: ACTIONS.ticket.setSize, payload: { preset: 1 }, label: 'size 1×' },
  { chord: 'Digit4', action: ACTIONS.ticket.setSize, payload: { preset: 2 }, label: 'size 2×' },
  { chord: 'ArrowUp', action: ACTIONS.ticket.nudge, payload: { ticks: 1 }, label: 'price +1 tick' },
  {
    chord: 'ArrowDown',
    action: ACTIONS.ticket.nudge,
    payload: { ticks: -1 },
    label: 'price −1 tick',
  },
  {
    chord: 'shift+ArrowUp',
    action: ACTIONS.ticket.nudge,
    payload: { ticks: 10 },
    label: 'price +10 ticks',
  },
  {
    chord: 'shift+ArrowDown',
    action: ACTIONS.ticket.nudge,
    payload: { ticks: -10 },
    label: 'price −10 ticks',
  },
  { chord: 'KeyM', action: ACTIONS.ticket.setMode, payload: { mode: 'market' }, label: 'market' },
  { chord: 'KeyL', action: ACTIONS.ticket.setMode, payload: { mode: 'limit' }, label: 'limit' },
  { chord: 'KeyT', action: ACTIONS.ui.setTheme, payload: {}, label: 'toggle theme' },
  // Scoped: only while the palette owns the keyboard, which is what lets Enter and the
  // arrows mean something different there than they do on the desk.
  {
    chord: 'Enter',
    action: ACTIONS.ui.paletteRun,
    payload: {},
    label: 'run the selected command',
    scope: 'modal:palette',
  },
  {
    chord: 'ArrowDown',
    action: ACTIONS.ui.paletteMove,
    payload: { delta: 1 },
    label: 'next command',
    scope: 'modal:palette',
  },
  {
    chord: 'ArrowUp',
    action: ACTIONS.ui.paletteMove,
    payload: { delta: -1 },
    label: 'previous command',
    scope: 'modal:palette',
  },
  {
    chord: 'PageDown',
    action: ACTIONS.book.setGroup,
    payload: { group: 0.5 },
    label: 'coarser depth grouping',
    scope: 'block:book',
  },
  {
    chord: 'PageUp',
    action: ACTIONS.book.setGroup,
    payload: { group: 0 },
    label: 'finest depth grouping',
    scope: 'block:book',
  },
  {
    chord: 'ctrl+KeyK',
    action: ACTIONS.ui.palette,
    payload: {},
    label: 'command palette',
  },
  {
    chord: 'shift+Slash',
    action: ACTIONS.ui.toggleOverlay,
    payload: { modal: 'keys-help' },
    label: 'this cheat sheet',
  },
])

/**
 * Apply the stock layout, plus any overrides the trader saved.
 *
 * @param {Record<string, string>} [overrides] - chord -> action, from settings.
 * @returns {string[]} the chords now bound.
 */
export function applyDefaultBindings(overrides = {}) {
  clearBindings()

  for (const binding of DEFAULT_BINDINGS) {
    registerBinding(binding.chord, binding.action, {
      label: binding.label,
      payload: binding.payload,
      scope: binding.scope,
    })
  }

  // Overrides land second so a trader's own chord always wins. An explicit `null`
  // unbinds the chord entirely — that is how a key is switched off — while a missing or
  // empty entry simply leaves the stock binding in place.
  for (const [chord, action] of Object.entries(overrides ?? {})) {
    if (action === null) {
      unregisterBinding(chord)
      continue
    }
    if (!action) continue
    registerBinding(chord, action, { label: `custom: ${action}` })
  }

  // Published so the sheet renders from the bindings that are actually live, including
  // the trader's overrides — a cheat sheet that lists the defaults after someone rebound
  // them is worse than none.
  setValue(PATHS.ui.chordSheet, hotkeyRows(allBindings()))

  return DEFAULT_BINDINGS.map((binding) => binding.chord)
}

/**
 * Group the bindings for the cheat sheet.
 *
 * @param {Array<{chord: string, label: string}>} bindings - the bound chords.
 * @returns {Array<{group: string, rows: Array<object>}>} grouped rows.
 */
export function groupBindings(bindings) {
  const list = Array.isArray(bindings) ? bindings : []
  const groups = new Map()

  for (const binding of list) {
    // Grouped by action namespace, which is already how the desk is organised — the
    // cheat sheet then matches the mental model rather than inventing a second one.
    const group = String(binding?.action ?? '').split('.')[0] || 'other'
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push(binding)
  }

  return [...groups.entries()].map(([group, rows]) => ({ group, rows }))
}

/**
 * A chord as a trader would read it.
 *
 * @param {string} chord - the chord string.
 * @returns {string} e.g. 'Ctrl+Shift+K', 'B', '↑'.
 */
export function chordLabel(chord) {
  const parts = String(chord ?? '').split('+')
  const key = parts.pop() ?? ''

  const pretty =
    {
      ArrowUp: '↑',
      ArrowDown: '↓',
      ArrowLeft: '←',
      ArrowRight: '→',
      Escape: 'Esc',
      Space: '␣',
    }[key] ??
    key.replace(/^Key/, '').replace(/^Digit/, '')

  return [...parts.map((mod) => mod[0].toUpperCase() + mod.slice(1)), pretty].join('+')
}

/**
 * The cheat-sheet rows, ready to bind.
 *
 * @param {Array<object>} bindings - the bound chords.
 * @returns {Array<{key: string, label: string, action: string}>} display rows.
 */
export function hotkeyRows(bindings) {
  return (Array.isArray(bindings) ? bindings : [])
    .filter((binding) => binding?.enabled !== false)
    .map((binding) => ({
      key: chordLabel(binding.chord),
      label: String(binding.label ?? binding.action ?? ''),
      action: String(binding.action ?? ''),
    }))
}
