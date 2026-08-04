import { describe, it, expect, beforeEach } from 'vitest'
import {
  PRESET_TAGS,
  NOTES_KEY,
  normalizeTag,
  annotationFor,
  addTag,
  removeTag,
  setNote,
  suggestTags,
  tagCatalog,
  publishAnnotations,
  saveAnnotations,
  loadAnnotations,
  registerTagActions,
  resetAnnotations,
} from './tags.js'
import { ACTIONS } from '../actions/names.js'
import { clearActions, dispatchAction } from '../actions/registry.js'
import { appState, tick, resetState } from '../app/engine.js'

/** A localStorage stand-in that can be told to fail. */
function fakeStorage(broken = false) {
  const map = new Map()
  return {
    map,
    getItem: (key) => {
      if (broken) throw new Error('no storage')
      return map.get(key) ?? null
    },
    setItem: (key, value) => {
      if (broken) throw new Error('quota')
      map.set(key, value)
    },
  }
}

beforeEach(() => {
  resetAnnotations()
  resetState()
  clearActions()
})

describe('normalizeTag', () => {
  it('collapses the four spellings of one admission into one word', () => {
    expect(normalizeTag('FOMO')).toBe('fomo')
    expect(normalizeTag('  chased it  ')).toBe('chased-it')
    // "fomo?" and "fomo" are the same admission; counting them apart is how a trader
    // concludes they have stopped doing something they have not.
    expect(normalizeTag('fomo?')).toBe('fomo')
    expect(normalizeTag('good --- exit')).toBe('good-exit')

    expect(normalizeTag('???')).toBe('')
    expect(normalizeTag(null)).toBe('')
    expect(normalizeTag('x'.repeat(40))).toHaveLength(24)
  })
})

describe('annotationFor', () => {
  it('reads an empty annotation for a trade nobody has touched', () => {
    expect(annotationFor('t1')).toEqual({ note: '', tags: [] })

    addTag('t1', 'plan')
    expect(annotationFor('t1').tags).toEqual(['plan'])
  })
})

describe('addTag', () => {
  it('is idempotent, because tagging twice is a double-click', () => {
    expect(addTag('t1', 'FOMO')).toEqual(['fomo'])
    expect(addTag('t1', 'fomo')).toEqual(['fomo'])
    expect(addTag('t1', 'late')).toEqual(['fomo', 'late'])

    // A new word joins the vocabulary the moment it is used.
    expect(addTag('t1', 'squeeze')).toContain('squeeze')
    expect(tagCatalog()).toContain('squeeze')

    expect(addTag('', 'plan')).toEqual([])
    expect(addTag('t2', '???')).toEqual([])
  })
})

describe('removeTag', () => {
  it('drops the tag and keeps the word in the vocabulary', () => {
    addTag('t1', 'squeeze')
    addTag('t1', 'plan')

    expect(removeTag('t1', 'squeeze')).toEqual(['plan'])
    // A vocabulary that shrank on every removal would stop suggesting the term a trader
    // uses rarely and most needs to be consistent about.
    expect(tagCatalog()).toContain('squeeze')

    expect(removeTag('t1', 'never-used')).toEqual(['plan'])
  })
})

describe('setNote', () => {
  it('drops an emptied annotation so "annotated" keeps meaning something', () => {
    expect(setNote('t1', 'chased the break')).toBe('chased the break')
    expect(annotationFor('t1').note).toBe('chased the break')

    expect(setNote('t1', '')).toBe('')
    expect(annotationFor('t1')).toEqual({ note: '', tags: [] })

    // Unless there are tags: the annotation is still real.
    addTag('t2', 'plan')
    setNote('t2', '')
    expect(annotationFor('t2').tags).toEqual(['plan'])

    expect(setNote('', 'x')).toBe('')
    expect(setNote('t3', 'x'.repeat(900))).toHaveLength(500)
  })
})

describe('suggestTags', () => {
  it('offers the whole vocabulary before a spelling is committed to', () => {
    // The suggestion list is most useful before the trader has chosen a spelling.
    expect(suggestTags('')).toHaveLength(8)

    expect(suggestTags('f', ['fomo', 'fear', 'plan'])).toEqual(['fear', 'fomo'])
    // An exact match is not a suggestion — it is what they already typed.
    expect(suggestTags('fomo', ['fomo', 'fomo-late'])).toEqual(['fomo-late'])
    expect(suggestTags('zzz', ['fomo'])).toEqual([])
  })
})

describe('tagCatalog', () => {
  it('starts from the preset palette, because an empty vocabulary is invented four ways', () => {
    expect(tagCatalog()).toEqual([...PRESET_TAGS].sort())

    addTag('t1', 'squeeze')
    expect(tagCatalog()).toHaveLength(PRESET_TAGS.length + 1)
  })
})

describe('publishAnnotations', () => {
  it('publishes what the rows bind to', () => {
    addTag('t1', 'plan')

    expect(publishAnnotations()).toBe(1)
    tick()
    expect(appState.journal.notes.t1.tags).toEqual(['plan'])
    expect(appState.journal.tagCatalog).toContain('plan')
  })
})

describe('saveAnnotations', () => {
  it('swallows a full quota rather than losing the trade over a note', () => {
    addTag('t1', 'plan')
    const storage = fakeStorage()

    expect(saveAnnotations(storage)).toBe(true)
    expect(JSON.parse(storage.map.get(NOTES_KEY)).notes[0][0]).toBe('t1')

    expect(saveAnnotations(fakeStorage(true))).toBe(false)
  })
})

describe('loadAnnotations', () => {
  it('merges the stored vocabulary with the presets rather than replacing it', () => {
    const storage = fakeStorage()
    storage.setItem(
      NOTES_KEY,
      JSON.stringify({ notes: [['t1', { note: 'hi', tags: ['squeeze'] }]], catalog: ['squeeze'] }),
    )

    expect(loadAnnotations(storage)).toBe(1)
    expect(annotationFor('t1').note).toBe('hi')
    // A stored catalogue from before a preset shipped would otherwise drop it for everyone.
    expect(tagCatalog()).toContain('plan')
    expect(tagCatalog()).toContain('squeeze')

    storage.map.set(NOTES_KEY, '{not json')
    expect(loadAnnotations(storage)).toBe(0)
    expect(loadAnnotations(fakeStorage(true))).toBe(0)
  })
})

describe('registerTagActions', () => {
  it('binds tagging, notes and the editor toggle', () => {
    expect(registerTagActions()).toEqual([
      ACTIONS.journal.addTag,
      ACTIONS.journal.removeTag,
      ACTIONS.journal.setNote,
      ACTIONS.journal.editNote,
    ])

    dispatchAction(ACTIONS.journal.addTag, { id: 't1', value: 'plan' })
    expect(annotationFor('t1').tags).toEqual(['plan'])

    dispatchAction(ACTIONS.journal.setNote, { id: 't1', value: 'note' })
    expect(annotationFor('t1').note).toBe('note')

    dispatchAction(ACTIONS.journal.editNote, { id: 't1' })
    tick()
    expect(appState.journal.editing).toBe('t1')

    // The same click closes it: an editor that only opens needs a second control.
    dispatchAction(ACTIONS.journal.editNote, { id: 't1' })
    tick()
    expect(appState.journal.editing).toBe('')

    dispatchAction(ACTIONS.journal.removeTag, { id: 't1', tag: 'plan' })
    expect(annotationFor('t1').tags).toEqual([])
  })
})

describe('resetAnnotations', () => {
  it('goes back to the preset vocabulary and no notes', () => {
    addTag('t1', 'squeeze')

    expect(resetAnnotations()).toBe(true)
    tick()
    expect(annotationFor('t1')).toEqual({ note: '', tags: [] })
    expect(tagCatalog()).toEqual([...PRESET_TAGS].sort())
  })
})
