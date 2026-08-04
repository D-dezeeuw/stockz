import { setValue, appState } from '../app/engine.js'
import { PATHS } from '../state/paths.js'
import { registerAction } from '../actions/registry.js'
import { ACTIONS } from '../actions/names.js'
import { createLogger } from '../utils/log.js'

/**
 * Notes and tags.
 *
 * The metrics say what happened. Only the trader knows *why they took it*, and that is the
 * half no amount of arithmetic recovers. A journal without annotations is a very precise
 * record of things nobody learns from.
 *
 * The vocabulary matters more than the feature. A free-text-only field produces "fomo",
 * "FOMO", "fomo?" and "chased it" as four separate categories, and a trader who cannot count
 * how often they did the thing cannot tell whether they are doing it less. So tags are
 * normalised hard — lowercased, trimmed, spaces collapsed — and the catalogue is offered
 * back while typing. The preset palette exists for the same reason: an empty vocabulary is
 * one everybody invents differently on their first bad day.
 *
 * Notes save on blur, not on a button. A save button in a journal is a note that does not
 * get written, and this desk does not add clicks.
 */

const log = createLogger('journal-tags')

/** The vocabulary everybody starts with. */
export const PRESET_TAGS = Object.freeze([
  'plan',
  'fomo',
  'news',
  'revenge',
  'early',
  'late',
  'oversized',
  'good-exit',
])

/** Where annotations live. */
export const NOTES_KEY = 'stockz.journal.notes.v1'

/** tradeId -> {note, tags}. */
let notes = new Map()

/** Every tag ever used here. */
let catalog = new Set(PRESET_TAGS)

/**
 * Normalise a tag so the same idea is always the same word.
 *
 * @param {string} raw - what was typed.
 * @returns {string} the canonical tag, or '' when it is not one.
 */
export function normalizeTag(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    // Punctuation goes, because "fomo?" and "fomo" are the same admission and counting them
    // apart is how a trader concludes they have stopped doing something they have not.
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24)
}

/**
 * The annotation on one trade.
 *
 * @param {string} tradeId - the trade.
 * @returns {{note: string, tags: string[]}} the annotation.
 */
export function annotationFor(tradeId) {
  const id = String(tradeId ?? '')

  return notes.get(id) ?? { note: '', tags: [] }
}

/**
 * Tag a trade.
 *
 * @param {string} tradeId - the trade.
 * @param {string} tag - the tag.
 * @returns {string[]} the trade's tags after.
 */
export function addTag(tradeId, tag) {
  const id = String(tradeId ?? '')
  const clean = normalizeTag(tag)
  if (!id || !clean) return annotationFor(id).tags

  const current = annotationFor(id)
  // Idempotent: tagging twice is a double-click, not an instruction to duplicate.
  const tags = current.tags.includes(clean) ? current.tags : [...current.tags, clean]
  notes.set(id, { ...current, tags })
  catalog.add(clean)

  publishAnnotations()
  return tags
}

/**
 * Untag a trade.
 *
 * @param {string} tradeId - the trade.
 * @param {string} tag - the tag.
 * @returns {string[]} the trade's tags after.
 */
export function removeTag(tradeId, tag) {
  const id = String(tradeId ?? '')
  const clean = normalizeTag(tag)
  const current = annotationFor(id)
  if (!current.tags.includes(clean)) return current.tags

  const tags = current.tags.filter((held) => held !== clean)
  notes.set(id, { ...current, tags })
  // The catalogue keeps the word. A vocabulary that shrank every time a tag was removed
  // would stop suggesting the term a trader uses rarely and most needs to be consistent about.
  publishAnnotations()

  return tags
}

/**
 * Write a note on a trade.
 *
 * @param {string} tradeId - the trade.
 * @param {string} text - the note.
 * @returns {string} the stored note.
 */
export function setNote(tradeId, text) {
  const id = String(tradeId ?? '')
  if (!id) return ''

  const note = String(text ?? '').slice(0, 500)
  const current = annotationFor(id)
  // An emptied note drops the record when there are no tags either: a journal full of blank
  // annotations is a journal whose "annotated" filter means nothing.
  if (!note && current.tags.length === 0) notes.delete(id)
  else notes.set(id, { ...current, note })

  publishAnnotations()
  return note
}

/**
 * The tags worth offering for what has been typed so far.
 *
 * @param {string} prefix - what the trader has typed.
 * @param {string[]} [known] - the catalogue.
 * @returns {string[]} up to eight suggestions.
 */
export function suggestTags(prefix, known = [...catalog]) {
  const typed = normalizeTag(prefix)
  const all = [...known].sort()
  // An empty box offers the whole vocabulary rather than nothing: the suggestion list is
  // most useful before a trader has committed to a spelling, not after.
  const matches = typed ? all.filter((tag) => tag.startsWith(typed) && tag !== typed) : all

  return matches.slice(0, 8)
}

/**
 * The tag vocabulary.
 *
 * @returns {string[]} every known tag, sorted.
 */
export function tagCatalog() {
  return [...catalog].sort()
}

/**
 * Publish the annotations and the catalogue.
 *
 * @returns {number} how many trades carry one.
 */
export function publishAnnotations() {
  setValue(PATHS.journal.notes, Object.fromEntries(notes))
  setValue(PATHS.journal.tagCatalog, tagCatalog())
  saveAnnotations()

  return notes.size
}

/**
 * Write annotations to disk.
 *
 * @param {Storage} [storage] - storage to write to.
 * @returns {boolean} true when written.
 */
export function saveAnnotations(storage = globalThis.localStorage) {
  try {
    storage?.setItem?.(
      NOTES_KEY,
      JSON.stringify({ notes: [...notes.entries()], catalog: [...catalog] }),
    )
    return true
  } catch (err) {
    log.warn(`unwritable annotations: ${err?.message ?? err}`)
    return false
  }
}

/**
 * Read annotations back.
 *
 * @param {Storage} [storage] - storage to read from.
 * @returns {number} how many trades carry one.
 */
export function loadAnnotations(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(NOTES_KEY) ?? 'null')
    notes = new Map(Array.isArray(parsed?.notes) ? parsed.notes : [])
    // Merged, never replaced: a stored catalogue from before a preset was added would
    // silently drop it from everybody's suggestions.
    catalog = new Set([...PRESET_TAGS, ...(Array.isArray(parsed?.catalog) ? parsed.catalog : [])])
  } catch (err) {
    log.warn(`unreadable annotations: ${err?.message ?? err}`)
    notes = new Map()
    catalog = new Set(PRESET_TAGS)
  }

  setValue(PATHS.journal.notes, Object.fromEntries(notes))
  setValue(PATHS.journal.tagCatalog, tagCatalog())

  return notes.size
}

/**
 * Register the annotation actions.
 *
 * @returns {string[]} the registered names.
 */
export function registerTagActions() {
  registerAction(ACTIONS.journal.addTag, (_state, payload) =>
    addTag(payload?.id, payload?.tag ?? payload?.value),
  )
  registerAction(ACTIONS.journal.removeTag, (_state, payload) => removeTag(payload?.id, payload?.tag))
  registerAction(ACTIONS.journal.setNote, (_state, payload) =>
    setNote(payload?.id, payload?.note ?? payload?.value),
  )
  registerAction(ACTIONS.journal.editNote, (_state, payload) => {
    const id = String(payload?.id ?? '')
    // A toggle, so the same click closes it. An editor that only opens needs a second
    // control to close, which is a second thing in a row that is already dense.
    setValue(PATHS.journal.editing, appState.journal?.editing === id ? '' : id)

    return id
  })

  return [
    ACTIONS.journal.addTag,
    ACTIONS.journal.removeTag,
    ACTIONS.journal.setNote,
    ACTIONS.journal.editNote,
  ]
}

/**
 * Forget every annotation.
 *
 * @returns {boolean} true.
 */
export function resetAnnotations() {
  notes = new Map()
  catalog = new Set(PRESET_TAGS)
  setValue(PATHS.journal.notes, {})
  setValue(PATHS.journal.tagCatalog, tagCatalog())

  return true
}
