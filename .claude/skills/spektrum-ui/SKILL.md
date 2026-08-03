---
name: spektrum-ui
description: Build STOCKZ UI with the Spektrum reactive engine from unpkg - importmap setup, bindings, state, actions, persistence, time-travel. Use for any UI, state, or block work.
---

# Spektrum UI

Spektrum (~13kB, zero deps, by Neko Media) is the entire UI engine. Loaded from unpkg —
never bundled, never npm-installed into the build.

## Importmap (in `index.html`)

```html
<script type="importmap">
{
  "imports": {
    "spektrum":          "https://unpkg.com/spektrum@1",
    "spektrum/persist":  "https://unpkg.com/spektrum@1/companions/spektrum-persist.min.js",
    "spektrum/devtools": "https://unpkg.com/spektrum@1/companions/spektrum-devtools.min.js"
  }
}
</script>
```

Dev floats on `@1`; a production release pins the exact version (`@1.1.0`). Add other
companions (`inspect`, `dock`, `compile`, `mcp`, `agent`) only when a feature needs them.

## Core pattern

```js
import { setValue, computed, defineFn, addSystem, watch, bindDOM, run } from 'spektrum'

setValue('trade.dayPnl', 0)                                  // state in
computed('market.spread', s => s['market.ask'] - s['market.bid'])
defineFn('placeOrder', (state, { side }) => { /* action */ })  // events in HTML: data-fn="placeOrder"
addSystem((state, delta) => { /* runs per tick, reads delta */ })
watch('ui.theme', v => repaintCharts(v))
bindDOM(); run()
```

```html
<span class="pnl" :class="trade.dayPnl >= 0 ? 'up' : 'down'">{{trade.dayPnl}}</span>
<button data-action="click" data-fn="placeOrder" data-side="buy">BUY</button>
<div data-each="row in market.watchlist"> ... </div>   <!-- container, not template -->
<input data-model="settings.defaultSize">
<section data-if="ui.section == 'journal'"> ... </section>
```

## House rules

- State namespaces: `ui.*`, `settings.*` (only this persists), `market.*`, `trade.*`,
  `strategy.*`. API keys NEVER enter state (they'd land in history/serialize).
- All user actions go through `defineFn` — that's what makes the desk hotkey-able,
  palette-able, and replayable.
- High-frequency data (ticks) buffers outside state and flushes via one rAF `setValue`
  per namespace per frame — never `setValue` per tick.
- Persistence: `spektrum/persist` with an allowlist on `settings.*`, restored before
  `bindDOM()` so the first paint is already themed and laid out.
- Time-travel is a feature: `checkpoint()` on every closed trade, `serialize()` for
  session export, `replay(n)` for the journal scrubber.
- The whole engine source is ~1350 lines — when unsure about behavior, fetch and read
  it (`https://unpkg.com/spektrum@1/spektrum.js`) instead of guessing.
