# Test Conventions

The single rule (`.claude/context/testing-policy.md`): **one function → one Vitest test →
run alone.**

## Location & naming

Tests are **colocated** with their source, one test file per module:

```
src/lib/pnl.js        ->  src/lib/pnl.test.js
src/engine/bracket.js ->  src/engine/bracket.test.js
```

Inside a test file, one `describe` per function, containing exactly **one** `it`:

```js
describe('avgEntryPrice', () => {
  it('weights partial fills into one average entry', () => { /* ... */ })
})
```

The `describe` name is always the exact function name — that is what makes
`-t "<functionName>"` targeting work. Discovery is `src/**/*.test.js` (configured in
`vite.config.js`); this `tests/` folder holds only shared fixtures.

## Running

```bash
npx vitest run src/lib/pnl.test.js -t "avgEntryPrice"   # one function (the normal run)
npm run test:fn avgEntryPrice                            # same, by name across files
npm run test                                             # whole suite - merge checks only
```

Environment is `node` by default; a test needing DOM opts in per file with
`// @vitest-environment jsdom` on line 1. `globals: true` is enabled, but tests still
import `describe/it/expect` explicitly so files stay self-describing.

## The merge gate

Before a feature auto-merges to `main`, its tests run once with coverage scoped to the
feature's files and must clear **>80% lines, statements, functions and branches**:

```bash
npx vitest run src/lib/pnl.test.js \
  --coverage.enabled --coverage.include='src/lib/pnl.js' --coverage.reporter=text \
  --coverage.thresholds.lines=80 --coverage.thresholds.statements=80 \
  --coverage.thresholds.functions=80 --coverage.thresholds.branches=80
```

Short of the bar: make the one test walk more branches, or split the function so each
part earns its own single test. Never a second test for the same function.
