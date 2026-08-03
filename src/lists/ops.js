/**
 * Watchlist operations.
 *
 * Pure functions over arrays, returning new arrays — the same discipline as the block
 * registry, and for the same reason: mutating in place skips Spektrum's change detection
 * and the rendered list quietly stops matching state.
 *
 * A watchlist is `{ id, name, symbols: [] }`. Symbols are venue-qualified strings
 * (`'okx:BTC-USDT'`) so the same ticker on two venues stays two rows — a scalper watching
 * both needs to see the spread between them, not one merged line.
 */

/** How many symbols one list may hold. Beyond this a list stops being scannable. */
export const MAX_SYMBOLS = 50

/**
 * Generate a list id.
 *
 * @param {() => string} [uuid] - injected generator, so tests are deterministic.
 * @returns {string} the id.
 */
export function listId(uuid = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)) {
  if (typeof uuid === 'function') return uuid()
  // Deterministic fallback for environments without Web Crypto; still collision-free
  // within a session because the counter is monotonic.
  listId.counter = (listId.counter ?? 0) + 1
  return `list-${listId.counter}`
}

/**
 * Normalise a symbol into its venue-qualified form.
 *
 * @param {string} symbol - raw symbol, optionally already qualified.
 * @param {string} [venue] - venue to qualify with when the symbol has none.
 * @returns {string} e.g. 'okx:BTC-USDT', or '' when unusable.
 */
export function qualifySymbol(symbol, venue = 'okx') {
  const raw = String(symbol ?? '').trim()
  if (!raw) return ''

  if (raw.includes(':')) {
    const [prefix, rest] = raw.split(':')
    return rest ? `${prefix.toLowerCase()}:${rest.toUpperCase()}` : ''
  }
  return `${String(venue).toLowerCase()}:${raw.toUpperCase()}`
}

/**
 * Create a list.
 *
 * @param {object[]} lists - current lists.
 * @param {string} name - list name.
 * @param {{id?: string, symbols?: string[]}} [options] - explicit id and seed symbols.
 * @returns {object[]} a new lists array.
 */
export function createList(lists, name, options = {}) {
  const current = Array.isArray(lists) ? lists : []
  const label = String(name ?? '').trim()
  if (!label) return current

  return [
    ...current,
    {
      id: options.id ?? listId(),
      name: label,
      symbols: (options.symbols ?? []).map((s) => qualifySymbol(s)).filter(Boolean),
    },
  ]
}

/**
 * Rename a list.
 *
 * @param {object[]} lists - current lists.
 * @param {string} id - list id.
 * @param {string} name - new name.
 * @returns {object[]} a new lists array.
 */
export function renameList(lists, id, name) {
  const label = String(name ?? '').trim()
  const current = Array.isArray(lists) ? lists : []
  if (!label) return current

  return current.map((list) => (list?.id === id ? { ...list, name: label } : list))
}

/**
 * Delete a list.
 *
 * The last list is never deleted: an empty desk with no watchlist has no way back except
 * a reset, and a mis-click should not cost that.
 *
 * @param {object[]} lists - current lists.
 * @param {string} id - list id.
 * @returns {object[]} a new lists array.
 */
export function deleteList(lists, id) {
  const current = Array.isArray(lists) ? lists : []
  if (current.length <= 1) return current

  return current.filter((list) => list?.id !== id)
}

/**
 * Add a symbol to a list.
 *
 * @param {object[]} lists - current lists.
 * @param {string} id - list id.
 * @param {string} symbol - symbol to add.
 * @param {string} [venue] - venue when the symbol is unqualified.
 * @returns {object[]} a new lists array.
 */
export function addSymbol(lists, id, symbol, venue = 'okx') {
  const current = Array.isArray(lists) ? lists : []
  const qualified = qualifySymbol(symbol, venue)
  if (!qualified) return current

  return current.map((list) => {
    if (list?.id !== id) return list
    if (list.symbols?.includes(qualified)) return list
    if ((list.symbols?.length ?? 0) >= MAX_SYMBOLS) return list

    return { ...list, symbols: [...(list.symbols ?? []), qualified] }
  })
}

/**
 * Remove a symbol from a list.
 *
 * @param {object[]} lists - current lists.
 * @param {string} id - list id.
 * @param {string} symbol - symbol to remove.
 * @returns {object[]} a new lists array.
 */
export function removeSymbol(lists, id, symbol) {
  const current = Array.isArray(lists) ? lists : []
  const qualified = qualifySymbol(symbol)

  return current.map((list) =>
    list?.id === id
      ? { ...list, symbols: (list.symbols ?? []).filter((s) => s !== qualified) }
      : list,
  )
}

/**
 * Move a symbol within a list.
 *
 * @param {object[]} lists - current lists.
 * @param {string} id - list id.
 * @param {string} symbol - symbol to move.
 * @param {number} toIndex - destination index, clamped.
 * @returns {object[]} a new lists array.
 */
export function reorderSymbol(lists, id, symbol, toIndex) {
  const current = Array.isArray(lists) ? lists : []
  const qualified = qualifySymbol(symbol)

  return current.map((list) => {
    if (list?.id !== id) return list

    const symbols = [...(list.symbols ?? [])]
    const from = symbols.indexOf(qualified)
    if (from === -1) return list

    const target = Math.min(Math.max(Number(toIndex) || 0, 0), symbols.length - 1)
    symbols.splice(target, 0, symbols.splice(from, 1)[0])
    return { ...list, symbols }
  })
}

/**
 * Find a list by id, falling back to the first.
 *
 * A watchlist block must always render something: an unknown active id (a deleted list,
 * a stale persisted setting) shows the first list rather than an empty block.
 *
 * @param {object[]} lists - current lists.
 * @param {string} id - wanted id.
 * @returns {object|null} the list, or null when there are none.
 */
export function findList(lists, id) {
  const current = Array.isArray(lists) ? lists : []
  return current.find((list) => list?.id === id) ?? current[0] ?? null
}

/**
 * Split a qualified symbol back into its parts.
 *
 * @param {string} qualified - e.g. 'okx:BTC-USDT'.
 * @returns {{venue: string, symbol: string}} the parts.
 */
export function splitSymbol(qualified) {
  const raw = String(qualified ?? '')
  const index = raw.indexOf(':')
  if (index === -1) return { venue: '', symbol: raw }

  return { venue: raw.slice(0, index), symbol: raw.slice(index + 1) }
}
