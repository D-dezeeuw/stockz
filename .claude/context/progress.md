# Progress

The handoff file. A fresh context reads `CLAUDE.md` → **this file** → the current phase
in `masterplan.md`, and knows where the project stands. Rewritten at every phase close.

---

## Status: Phase 17 closed (v0.17.0) · Phase 18 next

**Live:** https://d-dezeeuw.github.io/stockz/ (Pages serves `main` root — pushing is deploying)
**Tests:** 546, one per function, all passing individually. Every gated file >80% branches.
**Branch model:** everything merges to `main`; no feature branches outstanding.

## Phase 17 — Order Types & Execution Engine (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F17.1 | `makeIntent`, `advanceOrderState`, `normalizeReject`, `isSettled`, `roundToLotTick` | `src/exec/types.js` |
| F17.1 | `registerAdapter`, `adapterFor`, `prepare`, `deskMarket`, `submit`, `apply`, `cancel`, `publish`, `liveOrders`, `startEngine` | `src/exec/engine.js` |
| F17.1 | `isAdapter`, `supportsIntent` | `src/exec/adapters/contract.js` |
| F17.2 | `okxOrdType`, `buildOkxOrder`, `createOkxAdapter` · `buildEtoroOrder`, `createEtoroAdapter` | `src/exec/adapters/` |
| F17.3 | `applyTif`, `downgradeTif`, `iocTransitions`, `intentWithTif` | `src/exec/tif.js` |
| F17.4 | `instrumentKind`, `capabilityFor`, `capabilityFlags`, `isEmulated` | `src/exec/capabilities.js` |
| F17.5 | `offsetsFromTicks`, `makeBracket`, `bracketPlan`, `oppositeLeg` | `src/exec/bracket.js` |
| F17.6 | `linkOco`, `siblingOf`, `resolveFill`, `resolveOcoRace`, `closePair`, `linkBracketExits` | `src/exec/oco.js` |
| F17.7 | `nextTrailStop`, `bestPrice`, `startTrail`, `advanceTrail`, `stopTrail` | `src/exec/trail.js` |
| F17.8 | `deviationBps`, `checkSlippage`, `checkSize` | `src/exec/guard.js` |
| F17.9 | `amendDiff`, `amendRoute`, `takeLock`, `releaseLock`, `amendOrder`, `cancelReplace` | `src/exec/amend.js` |
| F17.10 | `setPrefix`, `issueId`, `claimId`, `dedupeOnReconnect` · `stampLatency`, `latencyFor`, `latencySummary` | `src/exec/ids.js`, `src/exec/latency.js` |

**`prepare()` is the choke point.** Every order — ticket, hotkey, repeat-last, and later
strategies — passes through it, which is where validation, capability checks, grid
rounding and both guards live. A check that lived in the ticket and not in a hotkey would
not be a check.

**One transition table, imported not restated.** `advanceOrderState` reads `TRANSITIONS`
from `ticket/lifecycle.js`; the adapters' capability flags are *derived* from
`capabilities.js`. Both are enforced by test — duplicating either is how the desk ends up
showing one status while acting on another.

**`src/ticket/send.js` was deleted**, subsumed by the engine. Its credential check moved
into the OKX adapter, where needing keys is a property of the venue rather than of
execution.

**Deferred in phase 17:** T17.2.5 WS-first submission (nothing logs into the private
socket yet; `buildLoginFrame` exists from phase 9 and the adapter's `place` is the seam).

## Phase 16 — Hotkeys & Command Palette (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F16.1 | `normalizeChord`, `registerBinding`, `registryKey`, `unregisterBinding`, `resolveKey`, `allBindings`, `isTypingTarget`, `mountKeymap` | `src/keys/keymap.js` |
| F16.2 | `DEFAULT_BINDINGS`, `applyDefaultBindings`, `groupBindings`, `chordLabel`, `hotkeyRows` | `src/keys/defaults.js` |
| F16.3, F16.4 | `mergeBindings`, `validateChord`, `findConflicts`, `migrateBindings`, `effectiveBindings`, `clearedMap`, `registerBindingActions` | `src/keys/overrides.js` |
| F16.5 | `fuzzyScore`, `actionCatalog`, `searchActions`, `moveSelection`, `registerPaletteActions` | `src/keys/palette.js` |
| F16.7 | `pushScope`, `popScope`, `activeScope`, `scopeChain`, `trackBlockFocus`, `resetScopes` | `src/keys/scopes.js` |
| F16.8 | `nextRepeatDelay`, `getNudgeStep`, `isRepeatable`, `createRepeater`, `guardRepeat` | `src/keys/repeat.js` |
| F16.9 | `isDoubleTap`, `panicCooldown`, `tapEscape`, `registerPanicAction` | `src/keys/panic.js` |
| F16.10 | `acceptChord`, `capturePreview`, `registerCaptureActions` | `src/keys/capture.js` |

**Chords resolve nearest-scope-first** (`modal` → `block` → `global`) and a **modal does
not fall through** — that is what makes typing in the palette safe. Scoped bindings share
one registry Map under a `scope chord` key; `mergeBindings` keys on scope *and* chord,
since ArrowDown legitimately means two things.

**Every binding points at an existing action** — `DEFAULT_BINDINGS` has a test asserting
it. A chord bound to a name nobody registered is a key that silently does nothing.

New state: `ui.scope`, `ui.chordSheet`, `ui.palette*`, `ui.captureFor`,
`ui.capturePreview`. New setting: `settings.chords` (chord → action overrides).

**Deferred in phase 16:** T16.9.8 journal panic record (phase 25 owns the journal; the
handler already computes the timestamp and count the entry needs).

## Phase 15 — Rapid Order Entry (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F15.1, F15.2, F15.4 | `buildTicketState`, `resolvePrice`, `canSubmit`, `refreshTicketPrice` | `src/ticket/state.js` |
| F15.1, F15.4 | `sizeForPreset`, `nudgePrice`, `registerTicketActions`, `readTicket` | `src/ticket/actions.js` |
| F15.3 | `applyPreset`, `clampQty`, `roundToLot`, `resolveQty`, `registerSizingActions` | `src/ticket/sizing.js` |
| F15.5 | `makeClientOrderId`, `buildOrderPayload`, `primePayload`, `registerSubmitAction`, `flushQueue` | `src/ticket/submit.js` |
| F15.5 | `rejectionEvent`, `acceptEvent`, `sendOrder` | `src/ticket/send.js` |
| F15.6 | `orderReducer`, `isTerminal`, `applyOrderEvent`, `ingestOrderEvent`, `ingestOrderEvents`, `partitionOrders` | `src/ticket/lifecycle.js` |
| F15.7 | `orderToast`, `coalesceToasts`, `playCue`, `makeAudioContext`, `announceOrder` | `src/ticket/feedback.js` |
| F15.8 | `nextSeq`, `enqueueOrder`, `drainQueue`, `queueOrder`, `takeQueue` | `src/ticket/queue.js` |
| F15.9 | `workingOrders`, `orderSummary`, `cancelAll`, `repeatPayload`, `registerShortcutActions`, `rememberOrder` | `src/ticket/shortcuts.js` |
| F15.10 | `priceFromY`, `intentToOrder`, `registerIntentAction` | `src/ticket/intent.js` |

**The one rule that bit twice: `setValue` lands on the *next* tick.** Anything that
writes the same path more than once inside a frame must fold locally and write once, or
each write reads state that is missing the previous one. It cost a double-drained order
queue (fixed by holding the queue outside the reactive tree) and a cancel-all that
cancelled one order out of three (fixed by `ingestOrderEvents`). Expect this again in any
batch path.

**Arming gates entering risk, never leaving it.** `canSubmit` checks `armed` *last*, so a
ticket that is also missing a size says "no size" — the more useful message. `CXL ALL`
is never disabled. `trade.armed` is in the unpersisted `trade` namespace, so every reload
starts cold by construction.

New state: `trade.ticket*` (symbol/side/size/mode/limit/price/source/flash),
`trade.queue`, `trade.lastOrder`, `trade.lastOrderSummary`, `trade.lastReject`,
`trade.buyingPower`, `market.quoteTs`. New settings: `qtyPresets`, `maxBurst`, `volume`.

**Deferred in phase 15:** T15.4.7 breaker auto-disarm (phase 24 owns the breaker; the
seam is `ticket.arm` with an explicit payload), T15.5.5 EToro submit route (CORS-blocked
without a relay; `sendOrder` takes an injectable `place`), T15.5.7 latency probe (phase 16
owns the HUD).

## Phase 14 — Order Book & Tape (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F14.1, F14.7 | `sizeToPct`, `formatSize`, `ladderRows`, `spreadRow`, `visibleMax`, `ladderView` | `src/book/ladder.js` |
| F14.2 | `emptyBook`, `applySnapshot`, `applyUpdate`, `mergeSide`, `sortSide`, `crc32`, `checksumString`, `verifyChecksum`, `hasSeqGap`, `ingestFrame` | `src/book/book.js` |
| F14.2 | `applyBookFrame`, `bookFor`, `flushBook`, `onResync`, `resetBooks` | `src/book/state.js` |
| F14.3, F14.8 | `pushPrint`, `toPrint`, `sideClass`, `formatTapeTime`, `formatSizeShort`, `tapeRows`, `flushTape`, `passesFilter`, `hiddenCount`, `filterTape`, `registerTapeActions` | `src/book/tape.js` |
| F14.4 | `sumDepth`, `computeImbalance`, `emaSmooth`, `imbalanceGauge`, `updateImbalance`, `resetImbalance` | `src/book/imbalance.js` |
| F14.5 | `rollingMedian`, `isWhale`, `multiplierFor`, `flagWhales`, `emitWhale`, `trimWhales` | `src/book/whale.js` |
| F14.6 | `sideForColumn`, `ticketFromClick`, `registerPrefillActions` | `src/book/prefill.js` |
| F14.7 | `bucketPrice`, `groupLevels`, `groupSizes`, `groupBook`, `registerGroupingActions` | `src/book/grouping.js` |
| F14.9 | `visibleRange`, `createPrintBuffer`, `shouldAutoscroll`, `trackScroll` | `src/book/window.js` |
| F14.10 | `nextBookStatus`, `backoffDelay`, `isBookStale`, `canTradeBook`, `setBookStatus`, `scheduleResync` | `src/book/integrity.js` |
| — | `channelsFor`, `routeFrame`, `flushFeed`, `startOkxFeed` — **the live feed** | `src/venues/okx/live.js` |
| — | `shouldConnect`, `connectFeeds`, `feedOptions` | `src/app/feeds.js` |

**The desk is live.** `live.js` is the only module that knows both a WebSocket frame and
a state path. It subscribes `trades` / `books5` / `tickers` for the focused instrument and
flushes book+tape+imbalance once per animation frame. **`books5` is a snapshot channel** —
every frame replaces the book, so there are no deltas to lose (the full delta+CRC path in
`book.js` is built and tested, and is what the `books` channel would use).

**Feeds are opt-in.** `bootstrap({feeds: true})` — set only in `main.js`. Node 22 has a
global `WebSocket`, so an environment check alone would make every test in the suite dial
OKX for real.

New state: `market.book`, `market.bookStatus`, `market.ladder` (computed),
`market.tape`, `market.tapeHidden`, `market.tapeWindow`, `market.imbalance`,
`market.whales`, `market.whaleCount`, `trade.ticket*`. New settings: `bookDepth`,
`imbalanceThreshold`, `whaleMultiplier`, `priceGroups`, `tapeFloors`.

**Deferred in phase 14** (all recorded in the plan with reasons): T14.2.8 worker offload
(no Worker exists; crc32 over 50 levels is microseconds), T14.9.8 print-storm benchmark
(needs the phase 24 recorder + a real browser profile), T14.10.7 IndexedDB postmortems
(phase 24 store; `ingestFrame` already returns the offending frame and reason).

## Phase 13 — Micro-Charts & Sparklines (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F13.1, F13.8 | `sizeCanvas` (dPR), `chartPalette` (CSS tokens), `createRenderLoop`, `repaintOnTheme` | `src/charts/canvas.js` |
| F13.2 | `mapRange`, `priceRange`, `priceToY`, `yToPrice`, `timeToX`, `xToTime`, `indexToX`, `autoRange`, `formatPrice`, `decimalsOf`, `composeTransform`, `applyTransform`, `candleGeometry`, `gridLines` | `src/charts/scale.js` |
| F13.2, F13.3 | `axisRows`, `drawAxisGrid` | `src/charts/axis.js` |
| F13.3 | `downsampleColumn`, `gapSplit`, `pulseRadius`, `trendUp`, `drawTickLine` | `src/charts/tickline.js` |
| F13.4 | `candleBoxes`, `volumeScale`, `drawCandles`, `drawVolumeBand`, `closeY`, `registerCandleActions` | `src/charts/candlestick.js` |
| F13.5 | `pointerToChart`, `trackPointer`, `snapToTick`, `crosshairReadout`, `formatClock`, `drawCrosshair` | `src/charts/crosshair.js` |
| F13.6 | `layoutMarkers`, `clusterFills`, `hitTestMarker`, `drawMarkers` | `src/charts/markers.js` |
| F13.7 | `levelColor`, `clampLevel`, `drawLevelLine`, `chartLevels`, `LEVEL_DASH` | `src/charts/levels.js` |
| F13.9 | `shouldStop`, `coalesceMarks`, `overBudget`, `createScheduler`, `pauseWhenHidden`, `drawDebugHud`, `framesPerSecond` | `src/charts/loop.js` |
| F13.3, F13.4 | `tickWindow`, `markOnTick`, `mountTickChart`, `mountCandleChart`, `startChart` | `src/charts/mount.js` |

**Renderers are pure draw calls; `mount.js` is the only file that knows about both the
pipeline and the canvas.** Every draw fn takes a palette — no renderer holds a hex
literal. A tick never draws: it marks dirty, and the next frame draws once however many
prints landed.

`startChart` runs either standalone (own dirty-flag loop) or on the shared scheduler —
pass `{scheduler, id, priority}`. The dashboard should use the shared one so sparklines
(`priority: 'low'`) can never outvote the price chart for a frame.

New state: `ui.candleInterval` (`1s`/`5s`/`1m`), `settings.debugCharts` (the debug axis
grid + fps HUD). The `ui.setCandleInterval` action registers in `bootstrap.js`.

## Phase 12 — Watchlists & Instruments (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F12.1, F12.8 | `createList`, `renameList`, `deleteList`, `addSymbol`, `removeSymbol`, `reorderSymbol`, `findList`, `qualifySymbol`, `splitSymbol` | `src/lists/ops.js` |
| F12.2, F12.5, F12.9 | `seedLists`, `activeList`, `setActiveList`, `focusSymbol`, `addToList`, `removeFromList`, `moveInList`, `manageList` | `src/lists/state.js` |
| F12.6, F12.7 | `buildRow`, `buildRows` (frame-based pulse), `sparklinePoints`, `sparklinePath` | `src/lists/rows.js` |
| F12.4 | `fuzzyScore`, `searchInstruments` | `src/lists/search.js` |

Symbols are **venue-qualified** (`okx:BTC-USDT`) everywhere past this point.
`market.focus` holds a qualified symbol and is **not** persisted.

## Phase 11 — Real-Time Market Data Pipeline (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F11.3 | `createRing` (fixed capacity, O(1), `replaceLast`), `arrivalRate` | `src/pipeline/ring.js` |
| F11.2, F11.4 | `publishTick`, `onTick`, `latestTick`, `recentTrades`, `flushToState`, `scheduleFlush`, `busStats` | `src/pipeline/bus.js` |
| F11.1, F11.6, F11.7 | `bucketStart`, `foldTrade`, `addTrade`, `candles`, `vwap` (1s/5s/1m) | `src/pipeline/candles.js` |
| F11.5, F11.8 | `ingest` (the one feed door), `setVenueState`, `markStaleFeeds`, `feedStats` | `src/pipeline/feed.js` |

**The rule: nothing between a socket and `bus.js` may call `setValue`.** One rAF flush
writes one value per path per frame. Candle buckets align to the wall clock; a print
inside the open bucket replaces the open candle (`ring.replaceLast`).

## Phase 10 — EToro Connectivity (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F10.1–F10.4 | `etoroHeaders`, `etoroRequest`, `fetchInstruments`, `fetchQuotes`, `fetchPortfolio`, `pollIntervalFor`, `createQuotePoller` | `src/venues/etoro/rest.js` |
| F10.7 | `mapQuote`, `mapPosition`, `mapOrder`, `mapOrderState`, `mapError`, `learnInstruments`, `symbolFor`, `toEpoch` | `src/venues/etoro/map.js` |
| F10.9 | `createMockFetch`, `seededRandom`, `mockQuote`, `primeMockInstruments` | `src/venues/etoro/mock.js` |
| F10.6 | CORS position: dev proxy, mock offline, relay-or-off in production | `docs/etoro-cors.md` |

**Shape parity is enforced by test** — `mapQuote` must produce the same keys as OKX's
`mapTicker`. Nothing downstream may branch on venue.
**A public CORS proxy is off the table**: it would see the API keys in every header.

## Phase 9 — OKX Connectivity (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F9.3, F9.4 | `okxTimestamp`, `prehashString`, `toBase64`, `hmacSha256`, `signRequest`, `buildLoginFrame` | `src/venues/okx/sign.js` |
| F9.1, F9.2 | `createOkxSocket` (backoff + resubscribe), `subscribeFrame`, `parseFrame`, `isStale` | `src/venues/okx/socket.js` |
| F9.6, F9.10 | `mapTicker/Trade/Book/Order/Position/Error`, `toNum`, `mapOrderState` | `src/venues/okx/map.js` |
| F9.5, F9.8 | `okxRequest`, `placeOrder`, `cancelOrder`, `fetchPositions`, `withinRateLimit` | `src/venues/okx/rest.js` |

Venue facts worth keeping: the WS login signs a **seconds** timestamp while REST signs the
ISO string; a GET signs an **empty** body (`{}` must not be signed); OKX returns HTTP 200
with `code: '1'` for business failures and the real reason is the per-item `sCode`.
Nothing here opens a socket in tests — the socket factory, timer, `fetch` and
`crypto.subtle` are all injected.

## Phase 8 — API Key Access Layer (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F8.1–F8.2 | `parseKeyParams`, `scrubKeyParams`, `adoptKeysFromUrl` | `src/venues/vault.js` |
| F8.4 | the vault: `setKeys`, `getKey`, `hasKeys`, `keyPresence`, `clearKeys` | `src/venues/vault.js` |
| F8.3, F8.7 | key modal, `submitKeys`, `lockKeys`, `needsKeys`, `adoptKeys` | `src/ui/keys.js`, `index.html` |
| F8.9 | `adoptKeysFromEnv` — dev fallback to `STOCKZ_*` | `src/venues/vault.js` |

**THE RULE: credentials never enter Spektrum state.** State goes into history,
`serialize()`, journal exports and devtools dumps. Only `ui.keysPresent` (booleans) is in
state; `getKey(venue, field)` is the single way a full key leaves the vault, which keeps
key handling greppable. The key modal uses plain DOM inputs, never `data-model`.

## Phase 7 — User Settings & Persistence (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F7.1–F7.3 | `SETTINGS_SCHEMA`, `defaultSettings`, `coerceSetting`, `normalizeSettings`, `parseList`, `fieldFor` | `src/state/settings-schema.js` |
| F7.3 | settings drawer (`ui.modal === 'settings'`), `data-model` fields | `index.html`, `src/styles/states.css` |
| F7.4 | `saveLayoutPreset`, `applyLayoutPreset` | `src/ui/settings.js` |
| F7.7 | `exportSettings`, `importSettings` (normalised on the way in) | `src/ui/settings.js` |
| F7.8 | `resetSettings` + `undoSettingsReset` via `checkpoint`/`replay` | `src/ui/settings.js` |

`initialState()` now spreads `defaultSettings()`, so the schema is the single source of
defaults. Adding a setting = add it to `SETTINGS_SCHEMA` (and to `PATHS.settings` so the
paths test stays green).

## Phase 6 — Day/Night Theme Engine (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F6.1 | `loadSettings`, `saveSettings`, `migrateSettings` (versioned), `restoreSettings`, `persistSettings`, `isPersistable` | `src/state/persist.js` |
| F6.6 | inline no-flash boot script — stamps `data-theme` before any stylesheet | `index.html` `<head>` |
| F6.7 | 150ms crossfade on surfaces; numbers explicitly excluded | `src/styles/status.css` |
| F6.8 | `onThemeRepaint` — canvas renderers subscribe here (phase 13 uses it) | `src/state/systems.js` |
| F6.9 | `syncBrowserChrome` + `CHROME_COLOR` | `src/ui/theme.js` |

**Storage key is `stockz.settings.v1`.** The no-flash script duplicates the theme read by
necessity (no module graph that early) — if the key or shape changes, change it in
`persist.js` **and** in `index.html`.

## Phase 5 — Header, Branding & Navigation (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F5.1–F5.9 | wordmark, nav, venue LEDs, PnL ticker, UTC clock, hotkey/settings buttons, theme toggle, sticky header | `index.html`, `src/styles/grid.css` |
| F5.2 | `setSection`, `blockInSection`, `SECTION_BLOCKS` — sections switch block sets | `src/ui/header.js` |
| F5.5, F5.7 | `venueLeds`, `sessionClock` (clock + uptime) | `src/ui/header.js` |
| F5.4 | `preferredTheme`, `applyTheme`, `setTheme` — one attribute on `<html>` | `src/ui/theme.js` |
| — | `toggleOverlay` — same panel twice closes it | `src/ui/header.js` |
| F5.10 | condensed mobile header: labels drop, LEDs/PnL/clock stay | `src/styles/grid.css` |

## Phase 4 — Dashboard Grid Shell (closed)

| Feature | What now exists | Where |
| --- | --- | --- |
| F4.1 | `.app-shell` header/grid/footer rows; equal cells via auto-fit + `grid-auto-rows` | `src/styles/grid.css` |
| F4.2, F4.10 | `makeBlock`, `addBlock`, `removeBlock`, `updateBlock`, `reorderBlock`, `sortBlocks`, `visibleBlocks`, `toggleBlock`, `currentBlocks`, `commitBlocks` | `src/blocks/registry.js` |
| F4.3, F4.5, F4.6 | block chrome, skeleton shimmer, empty and error states | `src/styles/states.css`, `index.html` |
| F4.4 | `columnCount`, `densityFor`, `applyLayout`, `observeLayout` | `src/blocks/layout.js` |
| F4.7 | footer: Neko Media + LinkedIn/npm/GitHub inline SVG | `index.html` |
| F4.8 | `setBlockVisibility` + `ui.toggleBlock` action | `src/blocks/layout.js` |
| — | 8 starter blocks seeded at boot without trampling a saved layout | `src/blocks/seed.js` |

`commitBlocks` is the single write point and normalises through `makeBlock`, so anything
downstream can trust every entry.

## Phase 3 — Money-Hacker Design System (closed)

The desk got its face. Styles are plain CSS files linked from `index.html` (no bundler in
the deploy path), tokens on `:root`, day variant under `[data-theme='day']`.

| Feature | What now exists | Where |
| --- | --- | --- |
| F3.1 | green/orange ramps, near-black surfaces, day variant | `src/styles/tokens.css` |
| F3.2 | monospace stack, type scale, tabular numerals by default | `src/styles/type.css` |
| F3.3 | 4px spacing step, radius/border, grid metrics (`--block-w/h`) | `src/styles/layout.css` |
| F3.4 | glow, LEDs, tick pulse, scanlines; all off under reduced motion | `src/styles/accents.css` |
| F3.5 | `statusOfValue`, `statusClass`, `valueClass`, `sideClass`, `connectionClass`, `tickPulseClass` | `src/ui/status-color.js` |
| F3.6 | 100–150ms motion budget, focus rings, reduced-motion killswitch | `src/styles/status.css` |
| F3.7 | `icon()`, `escapeAttr()`, `sideIcon()` — 10 inline SVGs on a 16px grid | `src/ui/icons.js` |
| F3.8 | `fmt.*` global so bindings can format and colour in one expression | `src/ui/format-bindings.js` |
| F3.9 | token-resolved utility classes; `[data-cloak]` hiding rule | `src/styles/utilities.css` |
| F3.10 | `parseHex`, `relativeLuminance`, `contrastRatio`, `meetsContrast`, `auditContrast` | `src/ui/contrast.js` |

**The contrast audit caught a real defect**: day-theme orange was 4.17:1 on white (below
AA), so loss values would have been harder to read than profit values in daylight. Token
is now `#b84600`. Re-run that test after any token change.

## Phase 2 — Spektrum Core Integration (closed)

The desk became reactive: one state tree, one action registry, derived values that cannot
go stale, and faults that reach the trader instead of the console.

| Feature | What now exists | Where |
| --- | --- | --- |
| F2.1 | spektrum@1.1.0 + 5 companions pinned in the importmap; `engineInfo()` reads the page's own map | `index.html`, `src/app/engine.js` |
| F2.2 | `bootstrap()` seeds state → binds → uncloaks → checkpoints → rAF pump; `makeBootClock` | `src/app/bootstrap.js` |
| F2.3 | `PATHS`, `buildPath`, `assertKnownNamespace`, `isPersisted` + lint rule vs raw path literals | `src/state/paths.js` |
| F2.4 | `registerAction`, `dispatchAction`, `ui.setStatus`, `app.reset`; names in `ACTIONS` | `src/actions/` |
| F2.5 | `spreadOf`, `midOf`, `exposureOf`, `openOrderCount`, `statusLineOf` + `registerDerived` | `src/state/derived.js` |
| F2.6 | UTC clock, uptime, heartbeat, theme watch, latching spread warning, `stopSystems` | `src/state/systems.js` |
| F2.7 | `loadAsync` (aborts in-flight), `retryDelay`, `setAsyncStatus`, `refreshServerTime` | `src/state/async.js` |
| F2.8 | `mountDevtools` (dev only), `devDumpState`, `devReplayTo` | `src/app/devtools.js` |
| F2.9 | `pushToast`, `dismissToast`, `expireToasts`, `describeEngineError`, `wireEngineErrors` | `src/ui/toast.js` |
| F2.10 | `collectExpressions`, `renderPrecompileModule`, `cspMeta`, `npm run build:csp` | `src/app/csp.js`, `docs/csp.md` |

## Next up: Phase 18 — Positions & Live PnL

First feature **F18.1** (positions store core). Exact exposure and P&L to the tick, fed
by execution fills and live marks, with one-tap flatten.

- **Fills already flow**: `exec/engine.js` `apply()` publishes every transition, and
  `ticket/lifecycle.js` holds the order list. Positions derive from those fills plus the
  mark, so nothing new needs to reach the venue.
- `trade.positions` already exists and `trade.exposure` is already a computed over it
  (`state/derived.js`) — the store is what has been missing, not the wiring.
- Flatten is `orders.cancelAll` plus a reduce-only market close per position; the
  reduce-only flag and the guard path both exist (`exec/guard.js`, `makeIntent`).
- **Average entry is the trap**: a partial fill at a new price changes the average, and
  the naive version (overwriting entry with the last fill price) silently misstates every
  P&L that follows.

### Still outstanding across phases
*(none — the boot-time feed gap recorded here through phase 13 was closed in phase 14;
see `src/venues/okx/live.js` and `src/app/feeds.js`.)*

## Gotchas (learned the hard way — do not rediscover)

- **`setValue` on an object MERGES; it never replaces.** `setValue(path, {})` is a no-op,
  and `setValue(path, {a: 1})` over `{b: 2}` yields `{a: 1, b: 2}`. Setting a key to
  `undefined` clears its *value* but leaves the key present (`Object.keys` still lists
  it), so any map read back must treat an `undefined` entry as absent. Clearing a map
  means writing every current key as `undefined` — see `clearedMap` in
  `src/keys/overrides.js`. Arrays, by contrast, replace wholesale.
- **`setValue` lands on the NEXT tick.** Anything writing the same path twice inside one
  frame must fold locally and write once, or the second read misses the first write. This
  cost a double-drained order queue and a cancel-all that cancelled 1 of 3 orders.
- **The credential-shaped-path guard in `initial.test.js` matches `/key|secret|passphrase|token/i`.**
  `settings.keyBindings` and `ui.hotkeyRows` both tripped it; they are now
  `settings.chords` and `ui.chordSheet`. Rename rather than adding an exception — the
  guard is worth more than the name.

- **`replay(n)` applies history entries `[0, n)`** — `history.length` means "the
  present", not out of range. The first `devReplayTo` test assumed `n` was inclusive and
  failed.
- **Inline arrows are invisible to the coverage gate.** A watch callback or a
  `() => x || Date.now()` inside a register function will sink functions/branches below
  80%. Extract it as a named exported function with its own single test — that is the
  policy's remedy, not a second test on the parent.
- **Vite's env bag coerces assigned values to strings**, so `readEnv(name, bag)` takes an
  injectable bag. Prefer injectable sources over ambient globals: it is what keeps branch
  coverage reachable.
- **Default parameters only fire on `undefined`.** `fn(null)` reaches an `if (!arg)`
  guard, `fn(undefined)` does not.
- **`npx vitest -t "<name>"` matches substrings** — `-t mountDevtools` also matches
  `unmountX`-style names. Expected reporter noise, not a policy breach.
- **`pkill -f "<pattern>"` can match its own shell** and kill the rest of the command
  chain (exit 144). Put it in its own call, or use `timeout -k 2 N` to cap servers.
- **A `&&` chain does not stop at a failed coverage gate** if the gate command is on its
  own line — F2.6 merged red and needed a follow-up fix. Check the gate output before
  committing.
- Headless Chromium **cannot reach unpkg in this container** (`ERR_CONNECTION_RESET`),
  though curl can. Browser-based CDN checks are not meaningful here; rely on unit tests.
- **Git tags cannot be pushed** through the session proxy (403). Releases are recorded in
  `CHANGELOG.md`; tag from a local clone if a GitHub tag is wanted.

## Deviations from the masterplan (deliberate — do not "fix")

- **Tests are colocated** (`src/**/*.test.js`), not in a `tests/` mirror; `tests/` holds
  fixtures and `CONVENTIONS.md`. `testing-policy.md` is the stricter authority.
- **No separate `vitest.config.js`** — Vitest reads `vite.config.js` natively.
- **No `gh-pages` package or branch** — Pages serves `main` root, so the deploy is a push
  and the build is a local check only. Phase 30's plan text still assumes gh-pages;
  revise it there, do not restore the branch.
- **Raw ES modules in production**: no JSON imports, no `?raw`, `import.meta.env` only
  behind `?.`, static assets at the repo root, complete import paths with extensions.
- **`app.reset` is not a kill switch** — it restores the screen and deliberately leaves
  venues and the key vault alone. The kill switch is phase 24 and must stay distinct.
- **CSP is groundwork only** — `build:csp` generates the precompiled module, but the
  default build and the live page are untouched. Enforcement belongs with phase 30.
- **Commits are authored as Danny de Zeeuw** (`danny@nekomedia.nl`), never a bot
  identity. The CCR stop-hook flags these as "Unverified"; expected and accepted.
