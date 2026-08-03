#!/usr/bin/env node
/**
 * Generate the precompiled-expression module for a strict-CSP build.
 *
 * Reads index.html, extracts every expression Spektrum would otherwise evaluate at
 * runtime, and writes src/app/compiled-expressions.js. With that module loaded the
 * engine never evaluates a string, so the page runs without `unsafe-eval`.
 *
 * Usage: npm run build:csp
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { collectExpressions, renderPrecompileModule } from '../src/app/csp.js'

const root = new URL('..', import.meta.url)
const htmlPath = new URL('index.html', root)
const outPath = new URL('src/app/compiled-expressions.js', root)

const html = readFileSync(htmlPath, 'utf8')
const expressions = collectExpressions(html)

writeFileSync(outPath, renderPrecompileModule(expressions), 'utf8')

console.log(`compiled ${expressions.length} expressions -> src/app/compiled-expressions.js`)
for (const expr of expressions) console.log(`  ${expr}`)
