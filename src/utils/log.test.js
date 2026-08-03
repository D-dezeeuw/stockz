// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  LEVELS,
  BUFFER_LIMIT,
  setLogLevel,
  getLogLevel,
  recordEntry,
  logBuffer,
  clearLogBuffer,
  formatEntry,
  createLogger,
  mountLogOverlay,
  renderLogOverlay,
  unmountLogOverlay,
  captureGlobalErrors,
} from './log.js'

const entry = (over = {}) => ({
  ts: '2026-08-03T12:04:31.221Z',
  level: 'info',
  ns: 'test',
  msg: 'hello',
  ...over,
})

beforeEach(() => {
  clearLogBuffer()
  unmountLogOverlay()
  setLogLevel('debug')
  document.body.innerHTML = ''
})

describe('setLogLevel', () => {
  it('accepts known levels and ignores unknown ones', () => {
    expect(setLogLevel('warn')).toBe('warn')
    expect(setLogLevel('nonsense')).toBe('warn')
    expect(setLogLevel('debug')).toBe('debug')
    expect(LEVELS).toEqual(['debug', 'info', 'warn', 'error'])
  })
})

describe('getLogLevel', () => {
  it('reports the level currently in force', () => {
    setLogLevel('error')
    expect(getLogLevel()).toBe('error')
    setLogLevel('info')
    expect(getLogLevel()).toBe('info')
  })
})

describe('recordEntry', () => {
  it('appends entries and evicts the oldest past the buffer limit', () => {
    expect(recordEntry(entry({ msg: 'a' }))).toBe(1)
    expect(recordEntry(entry({ msg: 'b' }))).toBe(2)

    for (let i = 0; i < BUFFER_LIMIT + 50; i += 1) recordEntry(entry({ msg: `x${i}` }))

    const kept = logBuffer()
    expect(kept).toHaveLength(BUFFER_LIMIT)
    expect(kept[0].msg).not.toBe('a')
    expect(kept.at(-1).msg).toBe(`x${BUFFER_LIMIT + 49}`)
  })
})

describe('logBuffer', () => {
  it('returns a detached copy so callers cannot mutate the buffer', () => {
    recordEntry(entry({ msg: 'one' }))

    const copy = logBuffer()
    copy.push(entry({ msg: 'injected' }))

    expect(logBuffer()).toHaveLength(1)
    expect(logBuffer()[0].msg).toBe('one')
  })
})

describe('clearLogBuffer', () => {
  it('drops every retained entry', () => {
    recordEntry(entry())
    recordEntry(entry())
    clearLogBuffer()
    expect(logBuffer()).toEqual([])
  })
})

describe('formatEntry', () => {
  it('renders a padded time-level-namespace line', () => {
    expect(formatEntry(entry({ level: 'warn', ns: 'okx', msg: 'reconnecting' })))
      .toBe('12:04:31.221 WARN  [okx] reconnecting')
    expect(formatEntry({ ts: 'short', level: 'info', ns: 'x', msg: 'm' })).toBe('short INFO  [x] m')
  })
})

describe('createLogger', () => {
  it('records and emits at or above the threshold, dropping quieter calls', () => {
    const seen = []
    const sink = {
      debug: (l) => seen.push(['debug', l]),
      info: (l) => seen.push(['info', l]),
      warn: (l) => seen.push(['warn', l]),
      error: (l) => seen.push(['error', l]),
    }
    const log = createLogger('okx', sink)

    const info = log.info('connected')
    expect(info.ns).toBe('okx')
    expect(info.level).toBe('info')
    expect(seen).toHaveLength(1)

    setLogLevel('warn')
    expect(log.debug('noise')).toBeNull()
    expect(log.info('noise')).toBeNull()
    expect(log.warn('slow')).not.toBeNull()
    expect(log.error('dead')).not.toBeNull()
    expect(seen.map((s) => s[0])).toEqual(['info', 'warn', 'error'])

    // A missing sink method must never throw on the hot path.
    expect(() => createLogger('bare', {}).error('x')).not.toThrow()
    expect(logBuffer().length).toBeGreaterThan(0)
  })
})

describe('mountLogOverlay', () => {
  it('mounts a styled pre in dev only, and never in production', () => {
    expect(mountLogOverlay(document, false)).toBeNull()
    expect(document.getElementById('stockz-log-overlay')).toBeNull()
    expect(mountLogOverlay(null, true)).toBeNull()

    const el = mountLogOverlay(document, true)
    expect(el.tagName).toBe('PRE')
    expect(el.style.position).toBe('fixed')
    expect(el.style.color).toBe('rgb(0, 230, 118)')
    expect(document.getElementById('stockz-log-overlay')).toBe(el)

    el.click()
    expect(document.getElementById('stockz-log-overlay')).toBeNull()
  })
})

describe('renderLogOverlay', () => {
  it('paints the buffer tail when mounted and no-ops when not', () => {
    expect(renderLogOverlay()).toBeNull()

    mountLogOverlay(document, true)
    for (let i = 0; i < 20; i += 1) recordEntry(entry({ msg: `line${i}` }))

    const el = renderLogOverlay()
    const lines = el.textContent.split('\n')
    expect(lines).toHaveLength(12)
    expect(lines.at(-1)).toContain('line19')
    expect(lines[0]).toContain('line8')

    unmountLogOverlay()
    expect(renderLogOverlay()).toBeNull()
  })
})

describe('unmountLogOverlay', () => {
  it('detaches the overlay and is safe to call twice', () => {
    mountLogOverlay(document, true)
    expect(document.getElementById('stockz-log-overlay')).not.toBeNull()

    unmountLogOverlay()
    expect(document.getElementById('stockz-log-overlay')).toBeNull()
    expect(() => unmountLogOverlay()).not.toThrow()
  })
})

describe('captureGlobalErrors', () => {
  it('routes uncaught errors and rejections into the error level', () => {
    const errors = []
    const logger = { error: (msg) => errors.push(msg) }

    expect(captureGlobalErrors(null, logger)).toBe(false)
    expect(captureGlobalErrors(window, logger)).toBe(true)

    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }))
    const rejection = new Event('unhandledrejection')
    rejection.reason = 'promise died'
    window.dispatchEvent(rejection)

    expect(errors).toEqual(['boom', 'unhandled rejection: promise died'])
  })
})
