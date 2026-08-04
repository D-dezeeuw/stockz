# Changelog

All notable changes to STOCKZ. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning is [semver](https://semver.org/).

**Version scheme:** the desk is pre-1.0 while the masterplan is being delivered. Each
closed phase cuts a minor release — phase 1 → `0.1.0`, phase 2 → `0.2.0`, … phase 30 →
`0.30.0`. When phase 30 closes and the desk is feature-complete, it ships as **`1.0.0`**.
Patch releases (`0.7.1`) are for fixes shipped between phase closes.

## [Unreleased]

### Added

- **Venue RTT monitor** — the number that answers "is it me or is it them", which have
  completely different responses: a busy tab is the trader's problem, a venue having a bad
  minute means sitting out. An unanswered ping resolves as a *reading* rather than an
  error, because "not answering" is the most important measurement there is — and it
  replaces the smoothed value outright instead of blending in, so recovery starts fresh
  rather than from a pre-failure average. Probes are jittered ±20%: two venues polled on
  the same boundary make a synchronised spike in the desk's own network use, a
  self-inflicted version of the problem being measured. (F19.2)
- **Scalper HUD** — vital signs rather than analysis: submit→ack latency with its p95,
  spread in basis points, trades per minute, win rate and gross exposure. Every tile is
  derived from something the desk already recorded, not measured afresh. Spread is in bps
  because a two-tick spread means something different on every instrument and bps is what
  a scalper compares against their own edge; pace is per *minute* because a desk built for
  trades-per-hour has to be able to watch overtrading go wrong. Latency is graded in three
  states, not a gradient — the question is "can I trust the fast path right now", which has
  three answers — and every label is pre-formatted to a fixed width, since a row of numbers
  that reflows as it changes is a row nobody can scan. (F19.1)

## [0.18.0] — 2026-08-04 — Phase 18: Positions & Live PnL

Exact exposure and profit, live to the tick: a position book fed by fills and marked at
what it could be closed at, weighted average entry, through-zero flips, a day ledger net
of fees, one-click flatten, a header P&L that pulses, an equity curve, and reconciliation
against the venue that always wins.

### Added

- **Intraday equity curve** — a day's net is one number and it hides everything: whether
  the session was a steady grind or one lucky trade on a losing morning, whether the
  drawdown came before or after the peak. Sampled on its own clock rather than on every
  mark, and drawdown is measured from the *running* peak — measuring from the end would
  report zero on a day that recovered, when the worst moment still happened. (F18.9)
- **Venue reconciliation** — the local book is built from fills the desk happened to see,
  and a dropped socket, another session, or a venue-side liquidation all produce a book
  that is confidently wrong. Drift is never averaged or waited out: the venue's number
  replaces the local one and the difference is reported. A failed snapshot changes
  nothing at all, because treating "I could not ask" as "there is nothing there" would
  flatten the book on every network hiccup. (F18.10)
- **Day P&L in the header** — realised plus floating, always in view, because a trader
  deciding whether to take the next trade without knowing whether the day is green is
  answering a different question than they think. Either half alone lies: realised-only
  looks flat while a losing position runs, floating-only forgets what is booked. The
  number pulses on a real move and ignores the cent-level wobble that would otherwise
  make the header strobe until nobody sees it, and it is width-stable so the nav does not
  drag around as the figure grows. (F18.6, F18.7, F18.8)
- **Marks, multipliers and the day's score** — a position marks at what it could be
  *closed* at (the mid, then the resting side, then the tape), not at whatever last
  printed; contract multipliers are applied, because a swap is not one unit of the
  underlying and a P&L that assumes it is is out by exactly `ctVal`. Realised closes book
  to a day ledger with fees normalised to one sign convention — OKX reports fees negative
  and EToro positive, and mixing them adds costs to profit on one venue while subtracting
  them on the other. The headline is *net*: a hundred scalps at a two-tick edge and a
  one-tick fee is a losing day that looks like a winning one on gross. The session rolls
  over at the trader's hour rather than UTC midnight, which would cut an Asian session in
  half. (F18.3, F18.4)
- **Positions block with flatten** — every open position with its live P&L and a one-click
  exit, plus FLAT ALL. Closes are reduce-only market orders so they can never overshoot
  into a fresh position, they are never gated on the arm toggle (arming controls
  *entering* risk), and they go out serially — a venue that rate-limits mid-flatten would
  strand the tail, which is precisely the exposure being shed. (F18.5)
- **Positions and live P&L** — a book keyed by venue and instrument, fed by execution
  fills and marked from the book's own mid, because a position's P&L should move with
  what it could be *closed* at rather than with whatever last printed. Two pieces of
  arithmetic get the care they deserve: average entry is weighted by size (overwriting it
  with the last fill price is silent and wrong from the second fill onward), and a fill
  that trades through zero is split into the close it is and the open it becomes, with
  the old position's P&L booked in between. A short's profit is booked when it closes
  *below* entry — the sign flip that otherwise turns a winning short into a reported
  loss. Flat positions are pruned rather than kept as zero rows, so "am I flat?" is not a
  reading exercise. Unlike every other hot store here, fills apply *synchronously*: an
  order list a frame behind is cosmetic, a position a frame behind is a risk number
  someone may size against. (F18.1, F18.2)

## [0.17.0] — 2026-08-04 — Phase 17: Order Types & Execution Engine

One door for every order: validated, identified, guarded and normalised before it reaches
a venue. Time-in-force, brackets, OCO, trailing stops, amend-in-place, a slippage guard,
reconnect dedupe and latency stamps — with venue quirks confined to adapters that declare
what they can honestly do.

### Added

- **Amend in place** — cancel-and-retype loses queue position, and on a maker order the
  queue *is* the edge, so where the venue can move an order in place it does. An inflight
  lock keeps at most one follow-up: a trader nudging six times wants the sixth price, not
  all six sent in sequence, and two amends racing leave the order somewhere nobody chose.
  On the emulated route the replacement goes out only *after* the cancel is acknowledged,
  since sending both at once risks a moment holding double the size. (F17.9)
- **Client ids, reconnect dedupe and latency** — a reconnect is the dangerous moment: the
  desk knows what it sent, the venue knows what it has, and reconciling them badly doubles
  a position silently. The dedupe makes that a set difference, and names the orphans (the
  venue's orders this session never sent — usually another tab) rather than adopting them.
  Latency is stamped on a monotonic clock and reported at p95, because an average hides
  the one submit in twenty that took a second, and that one is the whole story when a desk
  feels unreliable. (F17.10)
- **EToro adapter and grid rounding** — units rather than size, direction rather than
  side, no time-in-force beyond GTC: absorbed in the adapter and declared honestly rather
  than approximated. Sizes round *down* and prices to *nearest* before the guards judge
  them, so an order is checked as what will actually be sent. (F17.2)
- **OCO** — the moment one exit fills the other stops being protection and becomes an
  unhedged order that will happily open a new position the next time price touches it.
  The sibling lookup is a Map, not a scan, because this runs on the fill path where every
  millisecond is exposure nobody chose. A partial fill *shrinks* the sibling rather than
  cancelling it — the remainder still needs protecting — and a cancel that fails because
  the order already filled is read as both legs filling, which is a race, not an error.
  (F17.6)
- **Trailing stops** — the whole value is one property: a trail only ever tightens. The
  ratchet works from the *best* price seen rather than the last, which is precisely the
  bug that turns a scalp up two ticks into one down twenty, and it only amends when the
  move is worth at least a step, because an amend per tick is a rate limit waiting to
  happen. Breach is measured against the live price; the stop exists to fire on what the
  market is doing now. (F17.7)
- **Slippage guard** — the one check between a fat finger and a filled order, and it
  catches a silent failure: an order at 10,000 instead of 100 does not look wrong in a
  form field. It runs inside `prepare`, the single place every order passes, because a
  check the ticket does and a hotkey forgets is not a check. A market order has no price
  to compare, so its book must be live instead. (F17.8)
- **Time-in-force** — IOC, FOK and post-only, each expressing a different intolerance
  (of leftovers, of partial size, of paying the spread) and each costing money in a way
  that is hard to see afterwards when it is wrong. Where a venue lacks one the engine can
  emulate it, but never sells the emulation as the real thing: emulated IOC is a resting
  limit plus a cancel, which is live for a round trip and can fill where the venue's own
  IOC would not. Post-only is *not* emulated at all — there is no way to ask a venue to
  refuse a crossing order afterwards, and a silent fallback pays exactly the taker fee
  the trader was avoiding. A partially filled IOC stays two events, because collapsing it
  to "cancelled" loses the fill. (F17.3)
- **Venue capability map** — the ticket only offers what the venue can honour, and the
  adapter's flag list is *derived* from the same record rather than restated, so the two
  cannot drift into a ticket offering what the adapter then refuses. Anything the engine
  runs rather than the venue is badged as emulated. (F17.4)
- **Brackets** — entry, take-profit and stop as one gesture, which is what makes the stop
  actually exist: the exits are the decisions that get skipped when the market is moving.
  Legs are reduce-only by construction so one firing alone can never open a new position,
  and they are linked — a take-profit that filled while its stop stayed live would leave
  the trader short a position they had already closed. (F17.5)
- **Execution engine** — one door every order goes through, so something true can be said
  about *all* of them: validated before the network, given a client id, its rejection
  normalised into one vocabulary, its state moved only through legal transitions. Venue
  quirks live in adapters (OKX wants strings and folds time-in-force into the order type;
  needing credentials is a property of the venue, not of execution), and capabilities are
  declared honestly — a post-only that would silently become an ordinary limit is refused
  before it costs a taker fee nobody agreed to. The transition table is *imported* from
  the order lifecycle rather than redeclared: two tables would drift, and the moment they
  disagreed the desk would show one status while acting on another. (F17.1, F17.2)

### Removed

- `src/ticket/send.js` — the engine subsumed it. Its one unique behaviour, refusing to
  send without credentials, moved into the OKX adapter where it belongs.

## [0.16.0] — 2026-08-04 — Phase 16: Hotkeys & Command Palette

Hands never leave the keyboard: a scoped keymap over the desk's own actions, a stock
scalper layout, live rebinding by pressing the keys, a Ctrl+K palette that teaches its
own shortcuts, hold-to-repeat price walking, and a double-Escape panic exit.

### Added

- **Rebind by doing** — click a chord on the cheat sheet, press the keys, Enter saves.
  Typing a chord as text is a thing nobody gets right, and it makes the trader translate
  from what their fingers do into a spelling. The conflict check runs *while* recording,
  so "is this key free?" is answered before the commitment rather than after, and nothing
  commits until Enter — a chord that saved on the first press could never be corrected.
  (F16.10)
- **Hold-to-repeat nudge** — hold an arrow and the price walks, accelerating from one
  step per 350ms down to 40ms, so a tap is exactly one tick and a hold covers real
  distance. Only allow-listed actions may repeat: a stuck key repeating *submit* would be
  a hundred orders, and the list makes that structurally impossible rather than merely
  unlikely. The repeat stops on blur and tab-hide as well as keyup — a key held while the
  tab loses focus never sends its keyup, and a nudge still walking in a background tab
  would be discovered as a filled order. (F16.8)
- **Double-Escape panic** — one tap closes what is open, two inside 400ms disarms the
  desk and cancels every working order. Escape is the most-pressed key on any interface,
  so binding a flatten to a single press would fire it by accident within a day. It goes
  cold *before* it cancels: the disarm is instant and local while the cancels are round
  trips, and the other order leaves a window where a held key could add to what is being
  cancelled. (F16.9)
- **Scoped keys** — the same chord means different things in different places, resolved
  nearest-first: a modal beats a focused block, which beats the global layout. A modal
  does *not* fall through to the desk, which is what makes typing in the palette safe —
  B is a letter there, not a buy. Focus tracking only leaves a block when focus really
  does, since moving between two inputs inside one block fires `focusout` too. (F16.7)
- **Command palette** — Ctrl+K, type, Enter. The bindings cover what is used every
  minute; the palette covers the rest, which nobody should memorise a chord for or hunt
  through menus for. Every row shows the chord that would have done the same thing, so a
  trader who reaches for the palette twice learns the key on the third. The selection is
  held outside the reactive tree: holding an arrow fires several keydowns in one frame,
  and a selection read back from state would have every press move from the same index.
  (F16.5, F16.6)
- **Key remapping** — muscle memory is the whole value of a layout and every trader
  arrives with a different one, so the stock keys are a default rather than a decision.
  Rebinds take effect live (one that needed a reload would be discovered by pressing the
  old key and getting the old action), an old saved layout is migrated rather than
  silently discarded, and a chord bound to an action that does not exist is refused — a
  key that does nothing is worse than no key. Escape and `?` are reserved: a trader who
  bound away their panic key finds out at exactly the wrong moment. (F16.3, F16.4)
- **Hotkeys** — on a scalping desk the mouse is a latency tax, so every action is a chord
  away, dispatched through the *same* action the buttons use rather than a second
  implementation that would drift. Chords are built from `event.code`, the physical key,
  so a binding survives a layout switch. An unbound chord is left to the browser —
  otherwise the desk breaks refresh, devtools and find-in-page — and typing in a field is
  typing, except for Escape, which always reaches the desk so nobody gets stuck in an
  input. B/S trade, F and Escape flatten, digits size, arrows walk the price, and `?`
  shows a cheat sheet rendered from the bindings that are actually live. (F16.1, F16.2)

## [0.15.0] — 2026-08-04 — Phase 15: Rapid Order Entry

Intent to live order in one click. The ticket, its price modes and sizing, the arm gate,
the submit fast path, the order lifecycle, feedback, a burst queue, the panic shortcuts,
and click-to-trade off the ladder and the chart.

### Added

- **Click-to-trade** — the ladder and the chart are where a scalper is already looking
  when they decide, so the decision is expressible there: a plain click rests a limit at
  the level, shift crosses it, and a chart click snaps to a tradable tick because an
  order at an unquotable price is a rejection dressed up as an entry. A click on a cold
  desk *stages* the ticket rather than doing nothing — that is what separating arming
  from clicking is for, and a click that silently vanished would teach the trader the
  surface is unreliable. (F15.10)
- **Cancel-all and repeat-last** — the two things reached for when there is no time to
  think. CXL ALL stays enabled while the desk is disarmed: arming gates *entering* risk,
  and a trader who disarmed in a panic must not then find the exit greyed out. Repeat
  refires under a fresh client id — reusing the old one would be rejected as a duplicate
  and could match the wrong fill. Batch cancellations land in a single state write,
  because `setValue` applies a frame later and a loop of single writes would cancel
  exactly one order out of three. (F15.9)
- **Burst-click queue** — four clicks in 300ms mean four orders, each at the price its
  own click saw, drained serially in click order. The payload is frozen on the click
  rather than re-priced on the way out: an order that quietly repriced itself while
  queued is worse than a rejected one. The queue lives *outside* the reactive tree —
  `setValue` lands a frame later, and a burst arrives well inside one frame, so a queue
  read back from state drains the same click twice. Past the cap, clicks are refused
  visibly, because a click that vanishes silently looks like one that never registered.
  (F15.8)
- **Order feedback** — a toast for the trader who glances and a generated tone for the
  one who does not, on fills, rejects and cancels only: a toast per partial on a sweeping
  fill is noise, and interrupting for a working order teaches the trader to ignore
  interruptions. Identical fills inside 500ms collapse into one card with a counter, so a
  burst never becomes a wall over the chart. The announcement fires from the lifecycle
  transition rather than from a watcher — a watcher diffing the order array would
  announce the same fill again whenever an unrelated order moved in the same frame.
  (F15.7)
- **One-click submit** — the payload is assembled *before* the click, so the click reads
  it, paints an optimistic order row in the same frame, and sends. Waiting for the ack to
  paint would put a network round trip inside the one interaction that must feel instant.
  Client order ids are monotonic and unique within a millisecond, which is what makes a
  retry after a timeout safe rather than a coin flip on a double fill. A market price is
  sent as a market order, never as a limit at the crossed price. (F15.5)
- **Order lifecycle** — an explicit transition table, where terminal really is terminal.
  It deliberately does *not* throw on an illegal transition: venues resend acks, deliver
  them out of order, and sometimes report a fill before the ack that created the order,
  and taking the desk down over a redundant message is worse than ignoring it. An
  acknowledgement is `live`, never `filled` — treating one as the other is how a desk
  double-sizes its next trade. (F15.6)
- **Sizing** — percentage chips off buying power, clip multiples, absolute steps and
  typing all land on one clamp-and-round path, because a size the venue rejects costs a
  full round trip and the fill that mattered is gone by the time the rejection returns.
  Lot rounding goes *down*, never up: rounding up can exceed a risk limit that was just
  checked. Below the venue minimum resolves to zero rather than silently trading more
  than asked. (F15.3)
- **Arm toggle** — `trade.armed` now gates `canSubmit`, and it is checked *last*, so a
  ticket that is also missing a size says "no size" — the more useful of the two
  messages. It lives in the `trade` namespace, which is not persisted, so every reload
  starts cold without anyone having to remember to disarm. (F15.4)
- **Order ticket** — oversized BUY/SELL, size presets as multiples of the desk clip, and
  a MKT/BID/ASK/LMT selector that resolves the exact price the order would go out at,
  shown before it is sent. A stale quote falls back to market rather than naming a bid
  that may be long gone, and nudging a price switches the mode to limit, because
  otherwise the number on screen is not the number the order would use. Arming is one
  session toggle, not a dialog per order — on a desk measured in trades per hour, a
  confirmation step is the bug. (F15.1, F15.2)

## [0.14.0] — 2026-08-04 — Phase 14: Order Book & Tape

Depth and flow read like a pro desk — a checksum-validated ladder that is a click target,
a tape coloured by who crossed, pressure and whales called out — and the moment the whole
thing has been waiting for: a live venue feed actually driving it.

### Added

- **The desk is live** — until now every phase built machinery that nothing started:
  the socket reconnected, the pipeline coalesced, the book validated itself, and the
  dashboard rendered seeded state. `src/venues/okx/live.js` is the wiring — the only
  module that knows both a WebSocket frame and a state path — routing trades, depth and
  tickers into the pipeline and flushing once per animation frame rather than once per
  message. Public OKX channels need no credentials, so prices appear before any key is
  entered: keys gate *trading*, not *seeing*. Feeds are opt-in (`feeds: true`, set only
  by the entry point), so nothing under test ever dials a venue.
- **Book integrity & resync hardening** — a depth feed does not fail loudly: the socket
  stays open, the frames stop, and the ladder shows its last book indefinitely, looking
  exactly like a quiet market. So the book now carries an explicit status. Deltas
  arriving mid-resync cannot talk it back into `live` — only a fresh snapshot can — and
  while it is degraded the ladder dims and click-to-trade refuses, because a click on a
  stale ladder is a click on a price that may no longer exist. Resubscribes back off
  exponentially with jitter, so clients that dropped in one outage do not re-create it by
  reconnecting together. (F14.10)
- **Windowed tape rendering** — the DOM holds the rows on screen plus overscan, with
  spacers standing in for the rest so the scrollbar still reflects the whole tape, and
  arriving prints buffer and drain once per frame rather than writing state a thousand
  times a second. Hovering pauses the pin-to-top: a tape that runs away under the cursor
  is one you cannot read a print off. (F14.9)
- **Tape size filter** — a per-instrument noise floor with one-tap presets, and a badge
  saying how much flow it is hiding, because that is the question a filter creates.
  Whales bypass the floor entirely: the print that most changes what the flow means must
  never be a casualty of hiding dust. (F14.8)
- **Price grouping** — collapse the ladder to coarser steps and the resting size appears
  behind the tick-level texture. Bids floor and asks ceil, so a grouped book is never
  narrower than the real one and can never appear crossed; group sizes are whole
  multiples of the tick, so no bucket boundary lands between quotable prices. The choice
  is stored per instrument, because a granularity that reads well on BTC is meaningless
  on a penny alt. (F14.7)
- **Click-to-trade prefill** — the reason the ladder is DOM and not canvas: every price
  on it is a click target that loads the ticket, snapped to a tradable tick and carrying
  the desk's standard clip. Clicking a bid joins it; shift-clicking crosses it. Nothing
  is submitted and nothing is confirmed — a dialog between the click and the ticket adds
  a round trip to human reaction time on the one path where that cost is felt. (F14.6)
- **Whale highlight** — "big" is meaningless as an absolute (5 BTC is a whale, 5 DOGE is
  dust), so the baseline is a rolling *median* of recent print sizes: session-adaptive,
  and median rather than mean precisely so one 400-lot print cannot redefine normal for
  the next two hundred. Per-instrument multipliers, a bounded event feed carrying the
  "6× normal" ratio an alert wants to quote, and a single-cycle pulse — a permanently
  glowing row is one the eye learns to ignore. (F14.5)
- **Imbalance gauge** — bid/ask pressure as one number, smoothed by an EMA because the
  raw reading swings from +0.4 to −0.2 and back on a single cancelled order, and a
  flickering gauge invites acting on noise. Depth is selectable (5/10/20) since the touch
  and the structure behind it disagree constantly, and crossing the persisted threshold
  lights the gauge so pressure registers in peripheral vision. (F14.4)
- **Time & sales tape** — the flow, coloured by who crossed the spread. It answers what
  the chart cannot: a price rising on small buys reads nothing like the same price rising
  on one 40-lot sweep. Hard-capped at 500 prints and stored newest-first so the template
  never reverses an array on a frame, with sizes shown as magnitude (`1.2M`) because the
  eye is scanning for the outlier, not reading the lot. (F14.3)
- **Checksum-validated book state** — depth maintained by deltas is the one structure
  that goes *silently* wrong: a dropped update leaves size resting at a price nobody is
  quoting, and the ladder keeps rendering it confidently. Every applied frame is hashed
  against OKX's CRC32 (matched to zlib in the signed 32-bit space the venue publishes in)
  and checked for sequence gaps; either failure marks the book invalid and triggers a
  resubscribe rather than a repair, because a book that has been wrong once can only be
  replaced. (F14.2)
- **Depth ladder** — bid/ask levels with proportional size bars, cumulative size (what a
  sweep through a level would actually cost), and a spread row quoting the cost in
  *ticks*, the unit that decides whether a scalp clears its own cost. Both sides share
  one scale so a 10-lot bid and a 10-lot ask draw the same width, and the whole view
  derives from a single book snapshot — three separate computeds could each land on a
  different frame and show a spread that never existed. A crossed book is flagged, not
  averaged. (F14.1)

## [0.13.0] — 2026-08-04 — Phase 13: Micro-Charts & Sparklines

Price action at tick resolution in every block: the raw wiggle, micro-candles with
volume, a crosshair that snaps to real prints, your fills on the chart, and one shared
frame heartbeat that stops dead when the market is quiet.

### Added

- **Shared render loop** — one frame heartbeat for every chart layer instead of a
  `requestAnimationFrame` per surface. It stops outright when nothing is dirty (a quiet
  market costs zero CPU, which is what keeps the fan off and the battery alive through a
  session), draws high-priority layers first, and defers low-priority ones past an 8ms
  budget so forty sparklines can never make the price line stutter. A hidden tab pauses
  and redraws everything on return. (F13.9)
- **Price level lines** — last price and every open entry, tagged on the right axis with
  size, because the number a scalper needs constantly is the *distance* to their entry and
  that distance only means money once the size is on it. Winning is green whichever way
  the position points, and a level that scrolls off the plot keeps its tag and gains an
  arrow rather than vanishing — an absent line reads as no position at all. (F13.7)
- **Fill markers** — executions drawn on the wiggle they caught, which is the only way to
  see whether an entry landed on the sweep or two ticks after it. Buys point up from
  below the fill and sells down from above, so a glyph never covers the price it marks,
  and a rapid-fire run merges into one badge rather than smearing over the outlier that
  was mispriced — but never across sides, since a buy and a sell at the same instant is
  exactly the case worth seeing. (F13.6)
- **Crosshair and readout** — hover anywhere and read the exact print: time snaps by
  binary search to the nearest real tick (interpolation would show a price that never
  traded, and traders place orders off these numbers) while price follows the cursor,
  because the level being hovered is one being *considered*. The overlay owns its own
  canvas, so moving the cursor never repaints the chart underneath. (F13.5)
- **Micro-candles with a volume band** — 1s/5s/1m bodies and wicks at scalping
  resolution, framed by their wicks so a spike is never clipped, with the volume
  histogram sharing the candles' x geometry exactly: bars that drift a pixel from their
  candle lie about which second the size traded in. The interval toggle ignores unknown
  values rather than leaving the desk without candles. (F13.4)
- **Tick line chart** — the raw wiggle, drawn honestly and cheaply: a feed stall becomes
  a gap rather than a flat line implying the market sat still, and thousands of prints
  collapse to one min/max segment per pixel column so a one-print spike survives
  downsampling. The last price pulses on each print, and the chart repaints only when its
  own symbol trades. (F13.3)
- **Chart scale maths** — price↔pixel and time↔pixel mapping both ways, auto-ranging
  snapped to the instrument's tick size, and price formatting derived from that same tick
  size, so no axis ever labels a price the instrument cannot trade at. Pan/zoom composes
  as pure transforms, and a debug axis grid (behind the new `debugCharts` setting) draws
  the geometry so it can be seen rather than trusted. (F13.2)
- **Canvas core** — devicePixelRatio scaling (a blurry price is a misread price), a
  palette read from the same CSS tokens the DOM uses, and a dirty-flag render loop that
  skips the draw entirely when nothing changed. The pipeline coalesces state writes; the
  chart coalesces draws, and that spare budget belongs to the order path. (F13.1, F13.8)
- **Charts repaint on a theme flip** — canvas cannot inherit CSS custom properties, so a
  chart drawn in phosphor green would stay green on a white background until something
  redrew it. (F13.10)
- **Chart scale maths** — price→y (inverted, because canvas grows down), index→x, padded
  price ranges, candle geometry that keeps a doji visible, and gridlines snapped to round
  numbers including quarter steps. (F13.1)

## [0.12.0] — 2026-08-03 — Phase 12: Watchlists & Instruments

Curated lists of fast movers with one-click focus, live rows, sparklines and fuzzy search.

### Added

- **Watchlists** — create, rename, delete, add, remove and reorder, persisted with the
  rest of your settings so a list is never rebuilt in the morning. Symbols are
  venue-qualified (`okx:BTC-USDT`), so the same ticker on two venues stays two rows and
  the spread between them is visible rather than merged away. (F12.1, F12.2, F12.8,
  F12.9)
- **Focus follows the list** — clicking a row sets `market.focus`, which the ticket, chart
  and book all follow. Focus is deliberately *not* persisted: restoring yesterday's focus
  would aim the order ticket at an instrument nobody is looking at. (F12.5, F12.10)
- **A list can never be lost by mis-click** — the last list is undeletable, and a stale
  active id falls back to the first list rather than blanking the block. (F12.1)
- **Live rows** — last, % change, spread and volume per row, with a tick pulse that
  compares against the *previous frame* rather than the previous tick, so a page load
  never flashes and a fast tape does not strobe. A symbol with no data says stale instead
  of showing a confident zero. (F12.6)
- **Inline sparklines** — recent prints scaled into ratios rather than pixels, so one
  series renders at any row height; a flat series draws a centred line instead of dividing
  by zero. (F12.7)
- **Fuzzy instrument search** — subsequence matching, so `btu` finds `BTC-USDT`, ranked
  exact → prefix → scattered because that is what someone typing three fast letters meant.
  One box searches both venues. (F12.4)

## [0.11.0] — 2026-08-03 — Phase 11: Real-Time Market Data Pipeline

The path from socket to screen: ring buffers, rAF-coalesced writes, locally built candles,
one entry point for every feed, and honest reporting when a feed goes quiet.

### Added

- **The tick pipeline** — feeds publish to a bus, ticks land in fixed-size ring buffers,
  and a single rAF flush writes one value per path per frame. Writing state per tick would
  re-render the desk hundreds of times a second to show frames a human cannot see; a burst
  of a hundred ticks now collapses into one write. (F11.2, F11.3, F11.4)
- **Fixed memory under load** — buffers have a hard capacity and O(1) writes, so a long
  session cannot degrade into GC pauses exactly when the market gets busy. Drop counts are
  reported rather than hidden. (F11.3, F11.9)
- **Candles built locally at scalping timeframes** — 1s, 5s and 1m folded from raw prints
  rather than requested from the venue: the venue's smallest bar is usually too coarse to
  scalp, and a local bar closes the instant the clock does with no round-trip. Buckets
  align to the wall clock so two instruments produce bars that line up, and a print inside
  the open bar updates it in place instead of drawing hundreds of one-print bars a second.
  Adds VWAP, the reference a mean-reversion scalp measures deviation from. (F11.1, F11.6,
  F11.7)
- **One door for every feed** — live sockets, polled quotes and (later) replayed sessions
  all enter through `ingest`, so replay is indistinguishable from live and a second code
  path cannot grow a second set of bugs. (F11.5)
- **Silent feeds are called out** — an open socket that stopped delivering marks its venue
  stale and its blocks with it. Prices that simply stop moving otherwise read as a calm
  market, which is the most dangerous thing a feed can do. (F11.8, F11.10)

## [0.10.0] — 2026-08-03 — Phase 10: EToro Connectivity

A second venue on the same desk, mapped into identical shapes, polled adaptively, and
fully exercisable offline.

### Added

- **EToro on the same desk** — REST client with key headers, instrument catalogue,
  quotes, and portfolio, all mapped into **exactly** the internal shapes OKX produces. A
  test asserts key-for-key parity, because the moment a block writes
  `if (venue === 'etoro')` the desk has two of everything. (F10.1, F10.2, F10.4, F10.7)
- **Adaptive quote polling** — EToro has no stream, so the focused instrument polls every
  second, watchlist rows every five, and a hidden tab not at all. Polling everything at
  one rate burns the budget on rows nobody is looking at, which is what makes the
  *focused* quote late. (F10.3)
- **The instrument catalogue is cumulative** — a partial refresh teaches new instruments
  without blanking out ones the desk is already showing. (F10.2)
- **Offline EToro** — a mock that answers every endpoint with deterministic, *moving*
  prices through the real mappers and poller, so the whole pipeline stays developable and
  testable without keys or a network. A frozen mock teaches nothing about a UI whose job
  is displaying change. (F10.9)
- **CORS documented honestly** — EToro refuses browser origins, so dev uses a Vite proxy
  and production either uses a relay you host or leaves the venue off. A public CORS proxy
  is explicitly rejected: it would see the API keys in every request header, which is the
  one thing the vault exists to prevent. (F10.6)

## [0.9.0] — 2026-08-03 — Phase 9: OKX Connectivity

A real line to the venue: signed requests, a socket that survives a bad network, and
mappers that keep every venue quirk out of the app.

### Added

- **OKX request signing** — HMAC-SHA256 via Web Crypto, with the secret read from the
  vault at call time rather than cached (a cached key would outlive `keys.lock`). The
  prehash string is pinned by test, including the empty-body rule for GETs and the WS
  login's seconds timestamp, which differs from REST's ISO form — a venue inconsistency
  that otherwise surfaces as an unauthorised socket. (F9.3, F9.4)
- **Reconnecting WebSocket** — exponential backoff forever, and **resubscribe on
  recovery**: a socket that reconnects but forgets its channels shows a frozen book, which
  reads as a quiet market rather than as missing data. A malformed frame is dropped, never
  the session, and `isStale` catches the open-but-silent socket. (F9.1, F9.2)
- **OKX payload mappers** — tickers, trades, books, orders, positions and error codes,
  each a pure function so no venue quirk escapes into the app: `''` becomes `0` rather
  than `NaN`, a signed position size becomes an explicit side, and error codes become
  sentences a trader can act on. (F9.6, F9.10)
- **Signed REST with a client-side rate budget** — orders, cancels and positions over
  HTTPS as the fallback when the socket is reconnecting; a trader who wants out of a
  position does not care which transport carries the cancel. Calls that would breach
  OKX's published limits are refused locally, because being rate-limited mid-scalp costs
  a fill. Every call returns a result object and never throws: an exception on the order
  path leaves the trader unsure whether the order went. (F9.4, F9.5, F9.8)

## [0.8.0] — 2026-08-03 — Phase 8: API Key Access Layer

Credentials in seconds, and nowhere they should not be: URL params scrubbed on arrival, a
vault outside the reactive tree, and a panic lock.

### Added

- **Trade within seconds of opening a link** — credentials arrive as URL params, are read
  once into an in-memory vault, and the address bar is rewritten immediately. A key left
  in the URL reaches browser history, screen shares and `Referer` headers; reading it once
  and scrubbing costs nothing. (F8.1, F8.2)
- **Keys never touch application state** — the vault is a plain module-scoped map outside
  the reactive tree, and only presence booleans reach state. State is recorded into
  history, returned by `serialize()` and exported with the journal: a key that reaches it
  ends up in a file the trader emails to someone. A test asserts a stored key appears in
  neither state nor a serialized session. (F8.4)
- **Key modal and panic lock** — paste credentials once, or clear every one instantly with
  `keys.lock`. Paper mode deliberately never demands keys, so a new user can click a
  working desk before handing anything over. (F8.3, F8.7)

## [0.7.0] — 2026-08-03 — Phase 7: User Settings & Persistence

The desk is configurable: a settings drawer driven by one schema, layout presets, JSON
export/import, and an undoable reset.

### Added

- **A settings drawer** — order size, price step, size presets, risk limits, favourites
  and sounds, opened from the header gear and rendered from one declared schema, so a new
  setting appears by being declared rather than by editing markup. (F7.1, F7.3)
- **Every write is coerced** — a value typed into the drawer gets exactly the same
  treatment as one from an imported file. Junk in a risk field becomes the default rather
  than `NaN`, because a daily-loss limit that quietly became `NaN` is a disabled circuit
  breaker. (F7.2)
- **Layout presets** — save the current block arrangement under a name and switch back to
  it later. (F7.4)
- **Export and import** — settings travel to another machine as JSON, carrying the block
  layout, because "my settings" means the desk as it looked. Imports are normalised: a
  hand-edited file is untrusted input. (F7.7)
- **Reset with one undo** — restoring defaults checkpoints first and rewinds through the
  engine's own history, the same mechanism the trade journal uses, so there is one way to
  go back rather than two. (F7.8)

## [0.6.0] — 2026-08-03 — Phase 6: Day/Night Theme Engine

The desk remembers how you like it: themes persist, load without a flash, and the palette
flips without dragging the prices through a fade.

### Added

- **Your theme and layout survive a reload** — settings persist to localStorage, versioned
  and migrated, so a schema change never costs a trader their arrangement. Only
  `settings.*` is stored: a resurrected position from yesterday that *looks* live is a
  real loss, not a cosmetic bug. Corrupt storage or a refusing browser degrades to
  defaults instead of blocking the boot. (F6.1)
- **No white flash on load** — an inline script stamps the cached theme before any
  stylesheet or module runs, because a night-theme trader loading a white page for one
  frame at 2am is not a small annoyance. (F6.6)
- **150ms theme crossfade** — surfaces and text fade, numbers do not: a price that fades
  between values is a price you cannot read at speed. (F6.7)
- **Canvas re-palette seam** — renderers subscribe to theme changes, since a chart drawn
  in phosphor green stays green on a white background until it is redrawn. (F6.8)
- **Browser chrome follows the theme** — no dark address bar above a light desk. (F6.9)

## [0.5.0] — 2026-08-03 — Phase 5: Header, Branding & Navigation

Orientation without looking away from the prices: wordmark, section nav, venue LEDs,
day-PnL ticker, venue clock, and the theme toggle.

### Added

- **The header** — STOCKZ wordmark, section nav (desk / trade / journal / stats), live
  venue LEDs, the day-PnL ticker, venue-time clock, hotkey and settings buttons, and the
  day/night toggle, in fixed positions so the eye finds each answer by muscle memory
  rather than by searching. (F5.1–F5.9)
- **Sections switch block sets** — `ui.setSection` picks which blocks are on screen, so
  'trade' drops the journal and 'journal' drops the ladder, without the trader hiding
  blocks by hand. An unknown section shows everything rather than an empty screen. (F5.2)
- **Session clock shows uptime** — a desk that silently reconnected an hour ago and one
  that has been streaming all session look identical otherwise. (F5.7)
- **Theme switching** — one attribute on `<html>` flips the whole palette from the token
  sets already in the stylesheet: no stylesheet swap, no reload, nothing to re-fetch
  mid-session. A first-time visitor with a light OS preference gets the day theme. (F5.4)
- **Condensed mobile header** — labels drop, but the LEDs, PnL and clock stay: on a phone
  the trader still needs to know if they are connected and what they are carrying. (F5.10)

## [0.4.0] — 2026-08-03 — Phase 4: Dashboard Grid Shell

The desk got its shape: a header, a uniform grid of same-size blocks driven entirely by a
registry in state, and a footer.

### Added

- **The dashboard grid** — a header, a uniform grid and a footer. Every block is exactly
  the same width and height, auto-fitted into as many columns as the viewport allows with
  no media queries, so the eye learns one cell size and stops re-measuring during a fast
  move. (F4.1)
- **Blocks are data, not markup** — the grid renders from a registry in state, so a
  feature adds a block by registering it and settings can hide or reorder it without
  touching HTML. Every registry function returns a new array; mutating in place would skip
  change detection and the grid would silently stop matching state. (F4.2, F4.10)
- **Block chrome with honest states** — a title bar plus loading, empty and error
  renderings. A block waiting on data shimmers rather than sitting blank: a silent empty
  cell looks exactly like a market that stopped moving, which is when someone decides the
  price is stable and sizes up. (F4.3, F4.5, F4.6)
- **Footer** — Neko Media with LinkedIn, npm and GitHub links as inline SVG. (F4.7)
- **Scroll containment** — the page never scrolls sideways; a busy tape scrolls inside its
  own block. (F4.9)
- **The desk knows its own width** — column count and a density band (compact/normal/wide)
  are measured from the grid element via ResizeObserver, not the window, so a side panel
  narrowing the grid counts as a resize. Blocks will use the band to decide how much
  detail to render on a laptop versus an ultrawide. (F4.4)
- **Block visibility toggles** — `ui.toggleBlock` shows or hides any block by id from HTML
  or a hotkey, and the choice persists with the rest of the layout. (F4.8)

## [0.3.0] — 2026-08-03 — Phase 3: Money-Hacker Design System

The desk got its face: green/orange terminal palette in two themes, monospace with
tabular numerals, density tokens, accents that mean something, and contrast proven by
test rather than by eye.

### Added

- **The money-hacker palette** — matrix-green and hot-orange ramps over near-black
  surfaces, in both night and day themes. Profit/buy is always green and loss/sell always
  orange, in both themes: a scalper reads colour before digits, and a palette that means
  different things on different screens is how the wrong button gets clicked at speed.
  (F3.1)
- **Terminal typography** — monospace throughout, with tabular numerals as the *default*
  rather than an opt-in: proportional digits change width as prices move, so a column of
  quotes shivers on every tick and the eye has to re-find the decimal point. No web fonts
  are loaded — a blocking font request is unacceptable on a page selling latency. (F3.2)
- **Density tokens** — a 4px spacing step, near-square corners and the grid metrics every
  block will share, tuned to fit the most instruments and fills on screen at once. The
  page never scrolls sideways; content scrolls inside its own block. (F3.3)
- **Terminal accents** — glow for armed, a harder glow for a tripped breaker, connection
  LEDs and a one-frame tick pulse. Each accent means exactly one thing and fires only on
  a real event: ambient effects that run constantly train the eye to ignore them. Glows
  switch off in the day theme, where they read as smudges. (F3.4)
- **One colour language** — positive is green, negative is orange, zero is neutral, buy
  matches profit and sell matches loss, in both themes. Zero is explicitly flat, never
  green: colouring a flat position as profit tells a trader they are making money when
  they are not. (F3.5)
- **Motion budget** — 100–150ms, colour and opacity only, nothing on the order path waits
  for an animation, and `prefers-reduced-motion` stops the movement while the numbers keep
  updating at full speed. (F3.6)
- **Inline SVG icons** — arrows, bolt, kill-switch skull, gear, sun/moon, chart, clock and
  keyboard, drawn on one 16px grid and filled with `currentColor`, so a sell arrow turns
  orange from its container rather than hard-coding a colour. No extra request, no flash
  of missing glyph; icon titles are escaped because venue data is not trusted input.
  (F3.7)
- **Formatters inside bindings** — `{{fmt.signed(trade.dayPnl)}}` and
  `:class="fmt.cls(trade.dayPnl)"` format and colour a cell in one place. Exposed as one
  frozen global rather than through state, which is recorded into history and journal
  exports where functions have no business. (F3.8)
- **Utility classes** — a small closed set for text, surface, border, spacing, type and
  layout, every one resolving through tokens so it is correct in both themes without an
  override. (F3.9)
- **Contrast is asserted, not eyeballed** — the WCAG luminance and ratio maths ship as
  tested functions, and one test audits the whole shipped palette in both themes. It
  immediately caught the day-theme orange at 4.17:1 on white, below AA; the token is now
  `#b84600` and passes on both day surfaces. A token that regresses now fails a test
  rather than a trader squinting at a price. (F3.10)

## [0.2.0] — 2026-08-03 — Phase 2: Spektrum Core Integration

The desk became reactive: one state tree, one action registry, derived values that
cannot go stale, and errors that reach the trader instead of the console.

### Added

- **UI engine on tap** — Spektrum 1.1.0 and its companions (persist, devtools, inspect,
  dock, compile) resolve from the unpkg CDN through a pinned importmap, with a
  modulepreload hint so the engine downloads before app code runs. `src/app/engine.js`
  is the single local door to the engine, and `engineInfo()` reports the version the
  page actually loaded. (F2.1)
- **The desk boots reactive** — state is seeded before the DOM is bound, so the first
  paint already carries real values instead of flashing placeholders at someone watching
  prices; the page then uncloaks and the tick pump starts. `initialState()` seeds every
  namespace (app, ui, settings, market, trade, strategy) with trading disarmed, in paper
  mode and flat. (F2.2)
- **One state map** — every namespace and path is declared in `src/state/paths.js`, with
  `buildPath` for dynamic branches, `assertKnownNamespace` as the guard and `isPersisted`
  marking `settings.*` as the only branch that ever reaches localStorage. A lint rule
  rejects raw path literals, so a typo can no longer invent a silent branch that no
  binding reads. (F2.3)
- **Action registry** — every user-triggerable behaviour registers under a
  `<namespace>.<verb>` name, callable from HTML (`data-fn`) or programmatically via
  `dispatchAction`, which is what hotkeys, the command palette and the bot runner will
  all dispatch through. Ships `ui.setStatus` and `app.reset`; duplicate registration is a
  hard error, and an unknown name warns instead of throwing so a stale keybinding cannot
  take the desk down mid-session. (F2.4)
- **Derived values that cannot go stale** — mid, spread, spread in bps, net exposure,
  open-order count and the header status line all recompute the moment a dependency
  moves, so two blocks can never disagree. Exposure is signed *notional*, not quantity:
  one lot of a $60k instrument is not one lot of a $3k one. (F2.5)
- **Background systems** — a UTC clock and uptime counter (venues stamp in UTC, so the
  desk does too), a heartbeat that proves the render pump is alive, a theme watch for
  canvas re-palettes, and a spread-anomaly warning that fires on the *crossing* rather
  than every tick. All teardown-tracked, so a reload cannot stack a second clock on the
  first. (F2.6)
- **Async data with visible status** — every remote source writes the same value/status/
  error trio, so a block can show loading, ready or dead without inventing its own flags.
  A new request aborts the one it replaces (a late reply overwriting a newer one is a
  stale-data bug that is very hard to spot), retries back off exponentially to a ceiling,
  and a failing source degrades only its own block while the rest of the desk keeps
  trading. (F2.7)
- **Devtools in dev only** — a state scrubber and time-travel over the same history the
  trade journal will use, plus `devDumpState()` for bug reports. Production loads none
  of it: the gate is an explicit flag, not a build-time mystery, and a companion that
  fails to load can never stop the desk booting. (F2.8)
- **Toasts instead of console noise** — engine faults, and anything else that changes
  what the trader can do, appear on the page in their own language ('display is falling
  behind the feed', not `E_TICK_OVERFLOW`). The stack is capped at four and newest-first,
  so a venue erroring dozens of times a second cannot bury the prices, and toasts age out
  on the clock tick rather than on per-toast timers. (F2.9)
- **CSP groundwork** — `npm run build:csp` extracts every runtime expression from the
  page and generates a precompiled module, so the desk can eventually run without
  `unsafe-eval` — the directive most worth not having on a page holding API keys. The
  extraction is unit-tested against the real `index.html`, because a missed expression
  fails silently at runtime rather than at build time. The default build is unchanged.
  (F2.10)

## [0.1.0] — 2026-08-03 — Phase 1: Foundation & Tooling

The toolchain a scalping desk gets built on: clone to running app in three commands,
with a test policy and a live URL.

### Added

- **Project skeleton** — `src/` (app, utils, styles), `tests/` for shared fixtures,
  Node 22 pin, `.editorconfig`, LF normalization, and ignore rules proven to keep
  `dist/` and `.env.local` out of git. (F1.1)
- **npm script surface** — `dev`, `build`, `preview`, `test`, `test:fn`, `lint`,
  `lint:fix`, `check:secrets`, `deploy`, `verify:pages`. (F1.2)
- **Vite configuration** — strict port 5173 dev server, es2022 sourcemapped build,
  `@` → `src` alias, Spektrum specifiers marked external so the CDN importmap owns
  them. (F1.3)
- **App shell** — `index.html` with theme-aware metadata, the importmap placeholder for
  Spektrum, and `#app`; `mountApp()` / `autoMount()` boot the page. (F1.4)
- **ESLint flat config** — `eqeqeq`, `no-var`, `prefer-const` and `no-unused-vars` as
  errors; browser + worker globals for app code. (F1.5)
- **Vitest harness** — colocated `src/**/*.test.js` discovery, `tests/CONVENTIONS.md`,
  and `appVersion()` as the reference function for the one-test-per-function policy.
  (F1.6)
- **Environment handling** — `envPrefix: 'STOCKZ_'`, `.env.example` for the five venue
  vars, and `readEnv` / `hasEnv` / `venueKeyPresence` / `keyPresenceBanner`, which
  report key *presence* and never key material. Adds the `check:secrets` tripwire.
  (F1.7)
- **Shared math** — `clamp`, `roundToTick` (tick snapping without float drift),
  `tickDecimals`, `bpsDiff`. (F1.8)
- **Shared formatting** — `formatPrice`, `formatQty` (truncates, never overstates size),
  `formatPct`, `formatSigned`, `formatCompact`. (F1.8)
- **Logging** — `createLogger(ns)` with level control, a 200-entry capped ring buffer,
  a dev-only on-screen overlay, and `captureGlobalErrors` so nothing fails silently.
  (F1.9)
- **Docs** — README quickstart, `docs/architecture.md` module map, `.claude/` context,
  agents and skills, and `.claude/settings.json`. (F1.10)

### Fixed

- **Deploy served a broken page** — the live URL returned 200 while every asset 404'd:
  `index.html` used absolute paths, which escape the `/stockz/` project prefix. Paths
  are relative now, and `scripts/verify-pages.sh` fails loudly on any absolute asset
  path.
- **Publishing leaked source** — `gh-pages -d dist` carried repository dotfiles
  (`.claude/`, `.env.example`, `.gitignore`) onto the public branch.

### Changed

- **Deployment model** — GitHub Pages serves the `main` branch root, so pushing is
  deploying: no build step in the deploy path, no `gh-pages` branch or dependency. The
  app ships as raw ES modules with Spektrum from the unpkg CDN. `appVersion()` reads a
  literal `APP_VERSION` (a JSON import is bundler-only), guarded by a test that fails if
  it drifts from `package.json`; static assets moved from `public/` to the repo root.

[Unreleased]: https://github.com/D-dezeeuw/stockz/compare/v0.18.0...HEAD
[0.18.0]: https://github.com/D-dezeeuw/stockz/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/D-dezeeuw/stockz/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/D-dezeeuw/stockz/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/D-dezeeuw/stockz/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/D-dezeeuw/stockz/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/D-dezeeuw/stockz/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/D-dezeeuw/stockz/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/D-dezeeuw/stockz/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/D-dezeeuw/stockz/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/D-dezeeuw/stockz/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/D-dezeeuw/stockz/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/D-dezeeuw/stockz/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/D-dezeeuw/stockz/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/D-dezeeuw/stockz/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/D-dezeeuw/stockz/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/D-dezeeuw/stockz/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/D-dezeeuw/stockz/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/D-dezeeuw/stockz/releases/tag/v0.1.0
