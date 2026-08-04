import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Every `from '...'` in a module, including the multi-line ones.
 *
 * Deliberately not anchored to `import`/`export` on the same line: `app/engine.js` re-exports
 * Spektrum's whole surface as a forty-line `export { … } from 'spektrum'`, and a pattern that
 * stopped at a newline missed it — which is how this guard first passed while the worker
 * graph did in fact reach a bare specifier.
 */
const IMPORT = /\bfrom\s+['"]([^'"]+)['"]/g

/**
 * Every module the worker pulls in, transitively.
 *
 * @param {string} entry - an absolute path to a module.
 * @returns {Map<string, string[]>} module path → the specifiers it imports.
 */
function importGraph(entry) {
  const seen = new Map()
  const queue = [entry]

  while (queue.length > 0) {
    const file = queue.pop()
    if (seen.has(file)) continue

    const source = readFileSync(file, 'utf8')
    const specifiers = [...source.matchAll(IMPORT)].map((match) => match[1])
    seen.set(file, specifiers)

    for (const specifier of specifiers) {
      if (specifier.startsWith('.')) queue.push(resolve(dirname(file), specifier))
    }
  }

  return seen
}

describe('backtest worker module graph', () => {
  it('reaches no bare specifier, because a module worker gets no importmap', () => {
    const graph = importGraph(resolve(HERE, 'worker.js'))
    const bare = []

    for (const [file, specifiers] of graph) {
      for (const specifier of specifiers) {
        // Relative only. A `import 'spektrum'` anywhere in this graph — which is what
        // `app/engine.js` does, and what the strategy barrel reaches through its own
        // sandbox — fails the worker at load with a resolution error and no other symptom:
        // the run never starts, no message ever arrives, and the progress bar sits at zero.
        if (!specifier.startsWith('.')) bare.push(`${file.replace(HERE, '.')} → ${specifier}`)
      }
    }

    expect(bare).toEqual([])
    // A sanity floor: a graph that resolved to almost nothing would pass the check above
    // for the wrong reason.
    expect(graph.size).toBeGreaterThan(8)
  })
})
