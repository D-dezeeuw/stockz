# Changelog

All notable changes to STOCKZ. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning is [semver](https://semver.org/).

**Version scheme:** the desk is pre-1.0 while the masterplan is being delivered. Each
closed phase cuts a minor release — phase 1 → `0.1.0`, phase 2 → `0.2.0`, … phase 30 →
`0.30.0`. When phase 30 closes and the desk is feature-complete, it ships as **`1.0.0`**.
Patch releases (`0.7.1`) are for fixes shipped between phase closes.

## [Unreleased]

### Added

- **The four numbers that say whether the edge is real** — a P&L says what happened; these say
  whether it will keep happening, and the distinction is the whole point: a trader up six
  hundred on the day with a profit factor of 1.02 has had a good day and does not have an
  edge, and those two facts call for completely different next weeks. **Empty returns null,
  never zero**, so the tile reads "—": a desk that has not traded has no win rate, and a red
  0% for somebody who simply has not started is a readout that lies quietly. No losses at all
  reports ∞ rather than a large number implying a measurement — four winners and no losers has
  not proven anything, and ∞ reads as "not enough data" to anybody sensible. Scratches count
  as neither wins nor losses throughout. Expectancy derives from the raw counts rather than
  the displayed win rate, since multiplying a rounded rate by an average carries the error
  into a number traders compare across weeks. Tone follows meaning rather than sign: the win
  rate never goes red on the rate alone, because 40% with a 3:1 payoff is a fine strategy.
- **The equity curve** — the tiles say whether the edge exists; the curve says what the ride
  was like, and those are genuinely different questions. Two traders can end the week on the
  same number with one having ground it out and the other having been down four thousand on
  Wednesday, and only the second is about to blow up. Plotted **per trade, not per hour**:
  time on the x-axis makes a lunch break look like a flat patch of trading, and every point
  here is a decision. Zero is always inside the vertical range — a curve that never showed the
  waterline would let a losing session look like a rising one, which is the single most
  misleading thing this chart could do — and the line changes colour at that waterline rather
  than needing a legend. Max drawdown is measured from the **running peak**, not from zero, so
  a trader who was up two thousand and gave back fifteen hundred sees a drawdown even though
  they never went red. The crosshair snaps to a trade rather than interpolating: an equity
  read between two trades is one that never existed.
- **The hour that costs the money** — almost every trader has one that quietly gives back
  everything the rest of the day earns, and almost none of them can name it. It is invisible
  in a P&L, invisible in a win rate, and completely obvious in a seven-by-twenty-four grid.
  Hours are **local**, unlike the journal's UTC day rows, and the difference is the point:
  "do I trade badly after lunch" is a question about the trader's own body clock, not about an
  exchange's session boundary. **An empty cell never looks like a break-even one** — zero P&L
  and no trades are completely different facts, one saying "this hour does not work" and the
  other "you have never tried", and a diverging scale renders both as the neutral midpoint
  unless something is done about it. Untraded hours get their own flat treatment and are
  excluded from the scale entirely, so an absence cannot change how a real number is coloured.
  The scale is symmetric around zero, or a good week's losses would look mild purely because
  the wins were bigger. The best and worst hours are named in words underneath, because that
  is the sentence somebody actually wants told to them.
- **Which instruments actually pay** — traders accumulate symbols the way people accumulate
  browser tabs: something moved once, it went on the watchlist, and it has been quietly
  costing money since. Ranked by net, with the **trade count on every row**, because net alone
  would put one lucky trade above a hundred grinding ones and a ranking that recommended an
  instrument on a single sample is worse than no ranking. Fees are shown per instrument rather
  than folded away, since the symbol that pays least is very often not the one that moves
  least — it is the one being traded most, at the venue charging most, in size too small to
  carry the charge. The tail is **aggregated rather than truncated**: a list that simply
  stopped at ten would hide the twenty small bleeders that together outweigh the instrument at
  the top. A tiny-but-real number still gets a visible sliver of bar, because zero width reads
  as "no data" and that is a different claim from "barely made anything". Rows are DOM rather
  than canvas — the same reason the ladder is — so one click lands on that instrument's trades
  in the journal, which is the whole reason to look at the ranking at all.
- **How long the edge actually lives** — the most common way a scalper stops being one is by
  holding: a good entry, watched working, then stayed in long past the point the move was
  over. That failure is invisible everywhere else on this desk — the P&L nets it out, the win
  rate counts it as one loss, the equity curve shows a dip indistinguishable from a bad trade
  — and it is completely obvious here as a bucket with plenty of trades and a red average.
  Bins are **logarithmic** because they have to be: a linear axis spanning five seconds to
  half an hour puts ninety percent of a scalper's trades in the first bar, which tells the
  reader nothing except that they scalp. Bars are coloured by **average** P&L per bucket, not
  total, since total makes the busiest bucket the greenest by construction and the busiest
  bucket is exactly the one whose per-trade quality matters most. Bin boundaries are
  upper-exclusive, so a round-number hold lands in the faster bin rather than every one of
  them sliding a bin slower. The centre line reports the **median** as well as the mean: one
  trade held overnight by accident drags a mean past every hold the trader intends to take.
  The colour scale is shared with the heatmap on purpose — two charts using different colour
  languages for the same idea is two charts the reader has to learn separately.
- **Streaks, while they are still happening** — this is where a trading day stops being
  arithmetic and starts being psychology. Four losses in a row is not four independent events
  to the person who just had them; it is the moment size starts creeping up, the stop starts
  moving, and the day becomes a story about getting it back. So the run in progress is drawn
  **full height** against inset history: a trader who can see the fifth orange tick appearing
  does not need to be told anything, and one who finds out at the end of the day has already
  had the day. The tilt notice is a hint and stays one — no dialog, no lock-out, because
  phase 24 owns the mechanism that actually stops a desk and a nag here would be something to
  click through and learn to ignore. It fires on the run in progress and never on the record:
  six losers in March is not a reason to warn every session since. Scratches **break** a run
  rather than extending or ending it, since folding a break-even trade into either side
  produces a record streak nobody ever had.

## [0.25.0] — 2026-08-04 — Phase 25: Trade Journal & Time-Travel Audit

A venue reports executions; a trader thinks in scalps. The journal closes that gap — fills
paired into round trips, each carrying where it actually made or lost its money, annotated
in the trader's own words, pinned so the moment can be stood in again, sliced by the
question being asked, and exported as a file they own.

### Added

- **Fills paired into round trips** — a venue reports executions; a trader thinks in scalps.
  On a desk doing hundreds of round trips a day that gap is the whole difference between a
  journal and a log file, because forty fills across six partial exits is *one decision* and
  reviewing it as forty rows teaches nobody anything. Matching is **FIFO and not
  configurable** — not because average-cost is wrong in general, but because a journal exists
  to be trusted later and a policy that can be changed retroactively turns every past entry
  into a number that depends on a setting nobody remembers the value of. Three cases each get
  their own function: a lot consumed by a smaller exit **splits** and carries the remainder
  forward, so a scaled-out scalp stays one trade; a fill that crosses through flat is divided
  into a closing leg and an opening one, with the **fee pro-rated by quantity** so a crossed
  round trip does not look worse than an identical uncrossed one; and every fill is deduped
  by venue execution id, because every reconnect replays recent executions and without the id
  set one dropped frame doubles the day's trade count with no way to tell which half is real.
  Gross and net are both kept — gross says whether the idea worked, net says whether it paid,
  and on a scalping desk those diverge constantly. The half-open lots and the seen-id set
  persist together: restoring lots without the ids would replay the day straight back in.
- **Where each scalp actually made its money** — a net number says a trade worked; it never
  says why, and on a desk taking hundreds of round trips a day the why is the only thing that
  compounds. Five metrics ride on every row. **Hold time**, the difference between a scalp and
  a position that got away, and never negative however the clocks behaved. **Slippage**,
  separating what chasing cost from what the idea earned — a good strategy executed badly and
  a bad one executed well are identical in the net — measured against the order's own intended
  price, now carried onto the fill because the intent is gone by the time anyone reviews the
  trade. **Fees**, which past a certain rate are not a rounding error but the business.
  **MAE/MFE**, which is what separates "that lost money" from "that was never in trouble and
  then gave it all back" — two outcomes that call for opposite fixes — read off a bounded
  in-memory price trail per instrument rather than a tick recording, one array write per frame
  instead of a storage engine, with a trade older than the trail honestly reporting no
  excursion instead of a number reconstructed from candles nobody was looking at. And the **R
  multiple**, which refuses to exist when no stop was tagged: an assumed risk would be
  comparable across trades that never shared the assumption. Rows are enriched on publish, not
  frozen at close, because the excursion of a trade that closed a second ago is still filling
  in behind it.
- **Notes and tags on every trade** — the metrics say what happened; only the trader knows why
  they took it, and that is the half no arithmetic recovers. The vocabulary matters more than
  the feature: free text alone produces "fomo", "FOMO", "fomo?" and "chased it" as four
  categories, and a trader who cannot count how often they did the thing cannot tell whether
  they are doing it less. So tags normalise hard — lowercased, spaces hyphenated, punctuation
  dropped — and the catalogue is offered back while typing, seeded with a preset palette
  because an empty vocabulary is one everybody invents differently on their first bad day. A
  removed tag stays in the catalogue: a vocabulary that shrank on every removal would stop
  suggesting the term a trader uses rarely and most needs to be consistent about. Notes save
  on blur rather than on a button, because a save button in a journal is a note that does not
  get written. An emptied annotation is dropped entirely so "annotated" keeps meaning
  something, and a stored catalogue is merged with the presets rather than replacing them.
- **A labelled pin on every closed scalp** — the engine could already replay to any point in
  its history; what it could not do is say *which* point, and "state 4,812 frames ago" is not
  an answer anybody uses. Each close drops a pin named by what the trade was and what it made,
  so a trader looking for a snapshot looks for a trade. Two rules keep it from being a
  liability: it never costs the fill path anything — deferred to a microtask, and a trade
  already pinned is never pinned again, because a journal feature that added latency to
  execution would trade the thing the desk is *for* against the thing that merely records it
  — and you can always get back, since the live head is pinned before any jump and a fixed
  **VIEWING HISTORY** bar stays on screen the whole time you are away. A trader who forgot
  they were standing in the past would read every number on the desk as the present one and
  act on it. A failed snapshot loses the pin and never the trade, and returning to live clears
  the flag even when there is nothing to return to: a desk stuck showing "viewing history"
  with no way out is worse than one that simply carries on.
- **The whole session as a file the trader owns** — a trading day that exists only inside one
  browser tab is a day one cache clear from never having happened. State tree, paired trades,
  annotations and metrics in one JSON file with a schema version, because an export with no
  version is an export nothing can ever safely import. **Redaction is the precondition, not a
  feature**: the state tree goes out verbatim and a desk holds venue credentials, so anything
  named like one — matched on the *key name*, deep, rather than against a list of known paths,
  since a path list goes stale the first time somebody adds a field and fails silently — is
  replaced with a marker that says it was removed, so a reader can tell redaction from
  absence. A separate audit runs over the finished text rather than the object it came from,
  because the guarantee that matters is about the bytes that leave. The object URL is revoked
  immediately: a held one keeps the whole session's JSON alive for the life of the tab. A
  serialize failure exports the journal alone rather than nothing, since the trades are the
  part nobody can reconstruct and the state tree is the part nobody needs to.
- **Import a session and walk through it** — and the single rule the feature lives or dies by:
  **a replayed session can never send an order.** A trader scrubbing through yesterday
  afternoon is looking at prices that are not real and positions that are not held, so one
  working buy button there is not a bug — it is a market order at a price that stopped
  existing hours ago. The gate is a hard predicate on the one path every order takes, raised
  *before* the payload lands rather than after, because one frame of a live ticket over
  replayed prices is one frame too many. The live head is pinned before the import, so leaving
  is always possible: a trader who loaded a file and could not get back to their desk has lost
  the desk. A file from a newer build is refused by name rather than half-read, since a
  session loaded by something that does not understand half its keys replays a day that never
  happened. The transport steps rather than scrubs a timeline, because the question is never
  "what happened" but "what did I see at the moment I clicked"; it clamps at both ends rather
  than wrapping, and the speed snaps to the offered set with ties going to the slower option —
  being asked to keep up is the failure mode here.
- **The journal block, filter first** — a day's journal is a list nobody reads end to end. The
  value is in slices: *every fomo tag*, *every loser on this instrument*, *the ten worst by
  net*. Filters are **AND, never OR** — "losses tagged fomo on BTC" is a question people
  actually ask and "losses or fomo or BTC" is not one, so offering the choice would make every
  filter read ambiguous. A scratch counts as neither a win nor a loss, because calling it a
  win is how a win-rate becomes a number that flatters rather than informs. Re-selecting an
  active chip clears it, so every filter is its own off switch and none needs a second control
  to undo. Sorting starts descending on a new column — the interesting end of biggest-loss and
  longest-hold is the top — and defaults to newest-first rather than worst-first, because a
  journal that opened on the day's disasters is a journal people stop opening. What the slice
  *hides* is shown alongside it: a filter that quietly matched nothing looks exactly like a
  day with no trades.
- **The slice, as a spreadsheet** — the desk is not where a monthly review happens, and
  pretending otherwise means rebuilding pivot tables badly. What the filters show is what
  downloads. Everything is **locale-independent on purpose**: fixed decimal points and ISO
  8601, never `toLocaleString`, because a file exported on a machine with a comma decimal
  separator imports as text into a spreadsheet expecting dots and fails *silently* — the
  columns look right and every sum reads zero. Escaping is RFC 4180 rather than "wrap it if it
  has a comma": a note containing a quote, a comma or a newline is a note a trader actually
  wrote, and each breaks a naive writer differently. A missing number is written blank rather
  than as zero, since a spreadsheet averaging the column cannot tell an absent value from a
  real one and only one of those changes the answer. The header row is always emitted, so an
  empty filter yields a valid file rather than a broken one, and a toast confirms the download
  because a button that appears to do nothing gets pressed four more times.
- **A line per trading day** — hundreds of rows produce exactly one question worth asking at
  the close: was today good, and why. That is answered by a line, not a list — trades, win
  rate, gross, fees, net — and by the gap between gross and net, which on a scalping desk is
  usually the whole story, so the fee share is a field rather than something the reader is
  left to subtract. Days key on **UTC**, matching the session rollover the rest of the desk
  uses: a local key would split one trading session across two rows for anyone trading through
  their own midnight, and each half would read as a quiet day. Scratches count as neither wins
  nor losses, because a desk that scratched half its trades would otherwise report a fifty
  percent win rate while making nothing. Today's row stays pinned at the top of the block —
  the running score is what a trader checks between trades, and scrolling for it is scrolling
  away from the ticket — and one day expands at a time, since a journal with every day open is
  the list the summaries existed to replace.
- **Retention, so the journal stays fast forever** — a desk that runs for a year accumulates a
  journal that takes a second to filter, and the fix is not a faster filter, it is not keeping
  a year. Age is applied **before** count, deliberately: the other order keeps a thousand
  ancient trades and drops last week's, which is exactly backwards, since recency is what
  makes an entry useful and a trade from March is one nobody is learning from in November.
  Zero means "keep everything" on every field, matching the rest of the desk — a zero meaning
  "keep nothing" would delete a trader's history the first time they cleared a box to see what
  happened. **Nothing valuable disappears silently**: the CSV of what is about to go is
  *offered*, not asked about, because a confirm dialog in a background cleanup is a dialog
  that lands mid-trade. The sweep runs at idle rather than on a timer, since cleanup competing
  with a live order book for a frame costs the trader money to save disk nobody was short of.
  Storage usage is shown against quota, and a browser that declines to report one reads "—"
  rather than 0%, which would be a readout claiming a fact nobody supplied.

## [0.24.0] — 2026-08-04 — Phase 24: Circuit Breakers & Risk Kill Switch

One safety net on a desk built around never slowing the trader down — and the rule that
shapes all of it is that **a breaker never asks**. Three severities kept deliberately
distinct: a cap breach blocks one order, a losing run pauses entries while exits stay
open, and a halt cancels, flattens and disarms. Getting back in is the one deliberate
gesture on the desk, and it takes a second, not paperwork.

### Added

- **Circuit breakers: the core and the daily loss limit** — the one safety net on a desk built
  entirely around not slowing the trader down, which is why the rule that shapes the module is
  that **a breaker never asks**. No confirm dialog, no "are you sure", no modal in the order
  path — not because dialogs are unfashionable but because a breaker that asks is one that gets
  clicked through at exactly the moment it was built for. A trip is a state change and a
  rejection object; the trader finds out because the desk stopped, and stopping is the feature.
  The check is primitive comparisons against a **cached** threshold object, rebuilt from a watch
  on settings — nothing on the hot path reads settings, walks a list or allocates, and the daily
  limit is stored **pre-negated** so it is one `<=`. A benchmark holds it under a microsecond a
  call, because a net that cost a millisecond is a net people turn off. The **latch** matters as
  much as the check: one trip fires exactly one reaction chain, and without it a failing market
  would fire the flatten path forty times a second. The day's number is **realised plus
  unrealised**, since a trader holding a large loser has already lost the money and a breaker
  counting only closed trades would let somebody sit through the exact drawdown it exists to
  stop — recomputed on the frame flush rather than per tick, so the order path reads one
  already-computed number. On a trip the bot is killed **first and synchronously**: anything
  that queued the disarm would leave a window for one more order, and "one more" is the order
  the breaker existed to prevent.
- **Position cap, loss-streak pause and the kill switch** — three guards at three severities,
  and keeping them distinct is the whole design. A size past the per-instrument cap is
  **blocked**: one order refused, the desk untouched. A fat-fingered quantity should not cancel
  every working order and flatten the book — the cure would be worse than the mistake, and a
  safety feature that punishes typos is one traders route around. A run of realised losses
  **pauses**: no new entries, exits always allowed, because trading through a bad run is what
  turns a bad hour into a bad week while a trader who cannot close what they hold is trapped by
  their own net. The kill switch **halts**: one press, no confirmation, cancel then flatten in
  that order — cancelling first removes the working orders that could fill *while* the flatten
  goes out, and flatten-first leaves a resting bid to fill behind the close and open a fresh
  position created by the safety mechanism itself. Both venue calls are dispatched, never
  awaited: a kill switch whose speed depends on the venue that is probably the reason it was
  pressed is not a kill switch. Exits are exempt from every one of them, checked before the cap
  and by sign rather than by flag. The button lives permanently in the header past the 44px hit
  guideline, the chord is Ctrl+Shift+K and reaches the desk from inside a focused field — an
  emergency arriving mid-keystroke is the emergency — and three keys rather than one because a
  control a stray press can hit is its own emergency. Press-to-cancel latency is recorded, the
  ticket flashes the refusal under alternating class names so a second identical block still
  replays, and the saves counter says whether the cap is doing anything or just sitting there.
- **The trip reaction: one wipe, one implementation** — a trip clears the slate through a single
  orchestrator rather than at each call site, because two wipe paths drift and the one that
  drifts is the one nobody exercises until the day it matters. **Disarm, cancel, flatten**, all
  three dispatched in the same synchronous turn and none of them awaited. A failed venue call
  gets exactly one retry: a loop would keep firing cancels into a venue already refusing them,
  at the worst possible moment to be generating load. Not every code wipes — a losing streak
  pauses entries and leaves the book alone, since flattening over a bad run realises losses the
  trader never asked to take. Two bugs this closed, both of which would have made the wipe a
  no-op exactly when it fired: the halt latch was rejecting **its own flatten**, since a tripped
  breaker refused every order including the reduce-only closes it had just sent — exits are now
  exempt by flag or by sign, and a desk that stopped itself and then trapped the trader in the
  position it stopped over was the worst outcome available; and `closeIntent` carried
  `reduceOnly` onto **spot and eToro**, where the flag is unsupported and the order is refused
  outright, so FLAT ALL had been silently doing nothing on those venues. Whatever is still open
  after a wipe is listed in the header in red until it empties: a flatten that half-worked and
  looked finished is more dangerous than one that visibly failed, because the trader walks away
  believing they are flat. The trip codes moved to a leaf module — the enum had lived beside the
  code that reaches into the bot runner, and the first lookup table keyed by a code found it
  still in its temporal dead zone.
- **Breaker lights in the header** — three dots answering the only question asked between
  trades: how much room is left. A number would be more precise and worse, because precision
  is what you read once you have decided to look and these have to work when nobody is looking
  at them. Orange arrives at **80%** of the limit, fixed rather than configurable: a warning
  threshold that is a setting is one that gets moved to 99% by whoever found it annoying, and
  the whole point is to arrive with room left to react. An unset limit reads zero rather than
  full, since a percentage of infinity is a dot the eye learns to skip. Each dot carries the
  exact numbers in a native tooltip — no popover widget on the one bar that must never be busy
  — and is a button onto the limit behind it. Red blinks, except under reduced motion where it
  goes solid rather than silent.
- **Hold to get back in** — the one place on this desk where a deliberate gesture is right,
  and the asymmetry is the reason: a mis-click that halts costs a trader thirty seconds, and a
  mis-click that un-halts hands the market back the account the limit was protecting. So
  re-arming is a **one-second hold** — not a dialog, not a checkbox, not a typed confirmation,
  nothing to read and nothing to click through, which is exactly what makes those useless.
  Press and keep pressing; the bar fills; letting go cancels it. Completing the press *is* the
  re-arm, because waiting for a release would mean a trader who held for two seconds — the
  obvious way to be sure — never re-armed at all. The limit is re-checked at that moment
  rather than trusted from the trip, so a desk let back in under a still-blown limit cannot
  trip again on the very next order and read as broken. The day's P&L and the loss streak
  survive; the bot does not come back, because re-arming says the human is ready and says
  nothing about the robot. The unguarded latch-clear is no longer bound to anything a button
  can reach — leaving it registered would have made the limit re-check optional. The release
  listens on the window, since a finger that slides off the control before lifting would
  otherwise leave the bar filling under a hand that had already let go, and the press start is
  tracked as null rather than zero because a monotonic clock reads near zero early in a page's
  life and a sentinel a real timestamp can equal is a press that silently never starts.
- **The breaker's own record** — every trip, block, pause and re-arm, with the numbers that
  caused it attached. The numbers are the point: "the breaker fired at 14:12" is trivia, and
  "at 14:12 with the day at -412 against a -400 limit" is the answer to the question actually
  being asked, which is always some version of *was it right to*. Recording never slows a
  check — the ring lives outside the reactive tree, the publish is one write, and the persist
  is deferred to a microtask and coalesced behind a flag so a burst of blocks serialises once
  rather than once per block. A log that cost the hot path anything would eventually be the
  reason somebody turned the breaker off. Bounded at a hundred entries, pruned at thirty days,
  copyable as JSON in one click, and readable in the settings drawer newest-first. Stored in
  `localStorage` rather than IndexedDB, deliberately and against the plan text: nothing else
  here uses IDB and the plan's "shared upgrade helper" does not exist, so a hundred bounded
  entries did not justify a second storage engine and a fake-IDB test dependency — the
  guarantees asked for (survives reloads, bounded, pruned) are all met as it stands.
- **Every limit in one place** — and the consolidation found a real seam: the streak *check*
  read `maxConsecLosses` while the cached *threshold* read `botCooldownAfter`, so a trader
  setting one number was configuring half a breaker. A safety feature configured in two places
  is one that is misconfigured in production. All limits are now plain numbers in the account's
  own units — no percentages, no basis points, no aggressive/moderate/conservative presets,
  because a trader knows the number they cannot lose past and asking them to express it as a
  fraction of a moving equity figure is asking for arithmetic at the worst possible moment.
  **Zero means disabled on every field**, consistently, so a blank box is never a trap that
  means "stop immediately" on one input and "no limit" on the next. Anything unparseable clamps
  to the default rather than to Infinity, since NaN on the hot path silently disables a check.
  Each limit is shown beside the number it is limiting. Raising a limit binds on the very next
  order and **never** clears a trip: turning the number up must not become the fastest way past
  a breaker. The loss-streak pause now also expires on its own after a configurable breather,
  counted on the frame pump rather than a timer so a tab backgrounded through its own expiry
  comes back trading instead of still counting down — with zero meaning the break lasts until
  the trader says otherwise.

## [0.23.0] — 2026-08-04 — Phase 23: Auto-Trade Bot Runner

Strategies pull their own trigger. A thin loop turns signals into orders through the same
`prepare()` every hand-typed order passes, behind a gate chain of arming, per-strategy
opt-in, a rate ceiling, a losing-streak bench and a per-instrument cap — every rejection
recorded with its reason, dry-run by default, and one hard stop that disarms.

### Added

- **Position caps, dry run, the session report and the hard stop** — the cap is what stops the
  bot pyramiding: a strategy that keeps signalling the same direction is not wrong, it is doing
  exactly what it was written to do, and without a cap the desk ends up with ten times the
  intended position in whichever instrument the strategy likes today. It measures **open plus
  in flight**, because counting only what has filled lets a burst of signals in the second
  before the first ack all pass the same cap — and it reports the *numbers* on refusal, since
  "position cap" alone leaves the trader guessing whether it was one lot over or ten. A
  hand-placed order never consumes the bot's allowance. **Dry run is the default**, and that is
  the whole opinion here: software that places orders should have to be switched into doing so,
  and going live is logged as its own moment. The rehearsal's accounting is deliberately
  identical to the live path — same gates, same throttle stamps, same caps — because a
  rehearsal that skipped the counters would predict numbers the live run does not produce,
  which is worse than no rehearsal because it would be believed. The hard stop **clears the
  loop before disarming**, so no drain can start between the two, and it disarms even with no
  runner attached: a kill switch with an exception is not one.
- **Signal-to-order mapper, rate throttle and losing-streak cooldown** — the translation from
  "a strategy thinks this" to "the venue is asked for that" is a pure function, so everything
  it decides is inspectable in a test rather than argued about after a fill. A passive entry
  sits **behind** the touch; in front of it is a market order wearing a limit order's name.
  Sizes floor onto the venue grid rather than rounding, because a cap that is sometimes
  exceeded is not a cap — and the quotient is rounded before flooring, since `70000.2 / 0.1`
  is `700001.9999999999` in floating point and a naive floor drops a value that was already
  exactly on the grid by a whole tick. Equity-percent sizing is offered and is **not** the
  default: it sounds safer than a fixed size and is more dangerous in a drawdown, because it
  sizes up relative to what is left. The two guards exist for one reason — a bot's failure
  mode is not being wrong once, it is being wrong *quickly and repeatedly*. The throttle is a
  sliding window pruned lazily inside the check, so no timer keeps a backgrounded tab awake;
  the cooldown counts **consecutive realised losses** rather than drawdown, because three
  losers in a row is evidence about the strategy while three among ten is evidence about
  nothing. Gate order is arming → permission → rate → bench, cheapest first, so a disarmed
  desk never touches the throttle's window at all.
- **Master arm switch and per-strategy opt-in** — the bot's arm is a **different flag** from
  the ticket's, and nothing reads across: manual trading must not stop because the bot was
  disarmed, and the bot must not start because somebody armed the ticket to click a button.
  `botArmed` is now a **transient** setting — stored but never restored — so a session always
  boots disarmed whatever the last one ended in; "the trader will notice" is not a safety
  mechanism. Every flip is recorded with a timestamp and announced, because "when did I arm
  this" is the first question asked about any trade the bot took. Auto permission is granted
  per strategy from its row in the Strategies block, with an AUTO badge and a one-click revoke
  for all of them — and revoking writes every key `false` rather than replacing the map, since
  `setValue` merges objects and a bare `{}` would leave every permission exactly where it was.
  The hotkey is **Shift+A**, not A: a chord one keystroke from the manual arm would eventually
  be pressed by mistake.
- **Bot loop core** — the point of the whole desk arriving at once: strategies already have
  opinions and the execution engine already validates and guards, and this is the thin thing
  that lets the first drive the second with nobody clicking. Every bot order goes through
  `submit()` and therefore `prepare()` — **the same** validation, capability check, grid
  rounding, size guard and slippage guard a hand-typed order passes; a bot with its own
  execution path would be a second answer to "is this order sane", and the two would disagree
  the day it mattered. A signal is not an order: it has to survive arming and a per-strategy
  opt-in before anything else, and **every rejection is recorded with its reason**, because a
  bot that silently does nothing is indistinguishable from a broken one and "why did it not
  take that" must be answerable without a debugger. The gate chain stops at the first failure
  and reports *that* reason rather than whichever was last. Arming is off by default and off
  after every reload — a bot that came back armed because it was armed yesterday is the most
  dangerous default available here — and strategies are **opt-in**, unlike the alert toggles,
  because being told about a signal and having money placed on it are different enough that
  the defaults must differ too. Signals are queued and drained on a 50ms clock rather than
  acted on where they fire, which bounds what a burst can do in one frame and is still four
  times faster than a person.

## [0.22.0] — 2026-08-04 — Phase 22: Alerts & Notifications

The desk taps the trader on the shoulder. One alert bus with one shape and one door, fed by
price crosses, strategy signals, execution events and feed health, and delivered as toasts,
a WebAudio sound pack and native OS notifications — with one mute switch over all of them
and a log that keeps filling regardless.

### Added

- **Alert durability** — the definitions already survived a reload (they live under
  `settings.*`, the one persisted namespace), so this is about the three things that go wrong
  *around* stored data, all of them silent. **A stale fired flag**: an alert saved while
  disarmed comes back disarmed and sits out its cooldown against a `firedAt` from yesterday —
  indistinguishable from one that simply has not triggered — so loading strips the transient
  state and "armed" is the only state a restored alert can have. **A shape from an older
  build**: a renamed field leaves alerts that look valid and never fire, which is the worst
  kind of broken, so migration is versioned and stepwise. **A full localStorage**: the browser
  throws, the desk swallows it, and alerts quietly stop saving — the guard raises it while
  there is still room to act, measuring UTF-16 bytes rather than characters, which understate
  a payload by half. Export strips everything local to one machine by an explicit **pick**
  rather than an omit list, so a field added later has to be decided about rather than shipped
  by default. And a restored alert still cannot fire at boot, because a cross needs two prices
  and the first tick has only one.
- **Alert log block** — the record of everything the desk said, including everything it was
  told not to say out loud: this is the half of do-not-disturb that makes muting safe, since
  the switch stops the interruptions and the log keeps the information. It is deliberately a
  **tail, not a feed to watch** — newest first, filterable, read after the fact — because a
  trader watching the alert log instead of the tape is doing the wrong thing, so it is built
  for the ten seconds after coming back rather than for continuous attention. Clicking a row
  jumps to the instrument it came from: the log's job is to be the way *back* to what
  happened. An empty filter means everything rather than nothing, clicking the active chip
  clears it (a bar whose only route back to "everything" is a separate button is one people
  leave filtered by accident), and the chips carry counts so nobody has to click each one to
  find out what fired.
- **Mute and do-not-disturb** — a trader takes a call, sits in an office, or steps away. One
  switch silences every output, and it has to be *one* switch rather than three: a desk where
  the toasts stopped but the sounds did not is a desk somebody swears at. The rule that makes
  it trustworthy is that **the log is never gated** — silence means "do not interrupt me", not
  "do not tell me", and a trader who mutes for ten minutes must be able to see everything that
  happened, or muting becomes something they are afraid to do, and a mute nobody dares use
  protects nobody. **Errors pierce DND by default**, because "I muted my desk and missed a
  reject" is a real way to lose money and a mute that could do that is one nobody switches on
  — turning that bypass off is available and is a choice. Snooze exists alongside the toggle
  because the honest state is usually "not now" rather than "not ever": a permanent mute
  switched on for a phone call is a permanent mute that stays on until something expensive
  happens. It expires on the frame pump rather than on a timer, so a backgrounded tab comes
  back un-silenced instead of still counting down.
- **Browser notification bridge** — the output for the trader who has tabbed away; toasts and
  sounds both assume the page is in front of somebody, and this is the only channel that
  reaches them when it is not. Two rules keep it from being the thing that makes people
  uninstall trading software. **Permission is asked on an explicit click, never on load** — a
  page that fires the browser prompt in its first second gets "block" from most people, and
  that answer is permanent and silent; the desk asks once the trader has said they want this,
  at which point they say yes. And **native only when the tab is hidden**, because a native
  notification for something already on screen is a duplicate that steals focus, and the
  foreground belongs to the toast. Notifications are tagged per instrument so a second alert
  on the same symbol replaces the first — a trader who tabs back finds one current
  notification rather than forty stale ones — and clicking focuses the tab *and* jumps to
  that instrument, which is what makes it a shortcut instead of an interruption. Info-level
  pings are off by default; that is how a trading app ends up permanently blocked. Denied or
  unsupported is not a failure state: the alert was already going to a toast.
- **WebAudio alert sound pack** — the eye is on the tape, which makes sound the only channel
  that reaches a trader who is not looking: the most valuable output on the desk and the
  easiest to ruin. The pack is built around one rule — **the sounds must be distinguishable
  without being learned**. A rising interval for a buy and the same interval falling for a
  sell is a mapping nobody has to memorise, because it is the one the words already imply;
  the error buzz is low and rough where everything else is high and clean, so it cannot be
  mistaken for a fill at the edge of hearing. Every tone ramps its envelope down, since a
  hard stop on a raw oscillator clicks and a hundred clicks an hour is fatiguing rather than
  informative. Audio unlocks on the **first gesture** — pointer or key, whichever comes first
  — because browsers refuse to play before one and a desk that silently fails looks broken.
  The AudioContext is shared with the phase-15 order cues (browsers cap how many a page may
  create) and sound has its own mute tier, because wanting the toast without the noise is the
  common case in an office and forcing one to imply the other loses both.
- **Severity toasts, fed from the alert bus** — the toast stack the desk has had since phase 2
  now takes every bus alert through **one subscription**, which is the whole reason the bus
  exists: a new alert type must not need a new wire into every output. Repeats **coalesce
  into a count** rather than re-stacking — a venue erroring forty times a second would
  otherwise fill the four-toast cap with one message and push out the three others the
  trader needed to see, and the count is more informative than the repeats were. Hovering a
  toast **freezes its countdown**, because a message that vanishes mid-word is worse than one
  that never appeared, and a paused toast says so rather than looking stuck. The bus severity
  and the toast level are deliberately the same vocabulary: a second mapping table is a
  second place for `error` to quietly become `warn`.
- **Feed and spread health warnings** — the alerts a trader most needs are the ones about
  *conditions* rather than events, because conditions are what make an otherwise good trade
  expensive: a spread that has quietly tripled, a feed lagging by half a second, a venue that
  dropped and came back. None of them announce themselves, and all of them cost money before
  anyone notices. Everything is measured against a **baseline the desk learned**, not a
  constant — a two-tick spread is normal on one instrument and a blowout on another, and a
  threshold that has to be set per instrument is a threshold nobody sets. These are the most
  likely warnings on the desk to be muted for crying wolf, so every detector requires
  persistence: one wide print between two normal ones is a print, not a condition, and
  latency is judged on the **median** rather than the worst sample, because one 900ms round
  trip is a hiccup and warning on it would fire several times an hour on a healthy
  connection. A reconnect always reports the gap, since "back after 400ms" and "back after
  four minutes" call for completely different next actions.
- **Execution event notifications** — a scalper clicks and looks away, and the worst state on
  a fast desk is not knowing whether the order went: the trader who is unsure clicks again,
  and now there are two. Fills, partials, cancels and rejects are announced from the single
  place every lifecycle transition already passes. **Rejects get the loudest tier and the most
  work**, because a reject is the only execution event where the desk did *not* do what was
  asked and the trader has to decide something — OKX answers with `sCode: '51008'`, which
  tells them nothing, and the lookup turns it into "not enough margin", which tells them
  everything. Two rejects in a row are never collapsed: each is a separate decision, and
  hiding the second would be the worst thing available to hide. Partials **coalesce** — a
  market order filling in eleven pieces is one trade to the person who placed it, and eleven
  toasts is the fastest way to make somebody stop reading toasts — with the merged price
  volume-weighted, since averaging the prices misreports the fill whenever the pieces
  differed in size.
- **The alert bus, and strategy signal alerts** — everything that wants the trader's
  attention arrives in one shape, and everything that *delivers* attention subscribes to one
  door; otherwise each new source has to be wired into every output separately and the fourth
  one gets forgotten. The severity ladder is not decoration: it decides what interrupts, and
  a desk stays usable only while `error` is rare enough to still mean something. A strategy
  that fires while the trader is looking at the order book has said nothing at all, so every
  entry and exit becomes an alert carrying **the strategy's own stated reason** — an alert
  that says "SELL" and nothing else cannot be judged, and there is about a second to judge
  it. The design problem is noise: eight strategies on four instruments is thirty-two sources,
  several restating themselves every tick, and a stream that shouts constantly gets muted on
  day two — at which point the feature is worse than absent, because the trader now believes
  they are being told. So "no signal" never alerts, an identical call inside the window is
  one alert while the same strategy flipping side is a new one, and every strategy has its
  own mute — defaulting **on**, because opting out is a decision and opting in should not be.
- **Price-cross alerts** — the one thing a scalper cannot do is watch six instruments at
  once, and the one thing they need is to know the moment one reaches a level. **A gap
  through the level is a cross**: price does not visit every number on the way, and on a fast
  tape it goes 100.0 → 100.7 without ever printing 100.5, so the test is always *between two
  prices* — a `price === level` check would never fire and a bare `price >= level` would fire
  on every tick afterwards. A fired alert is **disarmed, not deleted**, because a level that
  mattered once tends to matter again and an alert that vanished on its first fire is one the
  trader has to re-enter exactly when they are busy; one-shot exists and is not the default.
  Alerts evaluate off the book's own **mid**, not the last print, since a level is about
  where the market is and a single stale trade should not trip one. Every fire in a frame
  folds into one write, ids are derived from what the alert *is* so setting the same one
  twice replaces rather than piles up, and any edit re-arms — a moved level is meant to be
  live, not to inherit the old one's cooldown.

## [0.21.0] — 2026-08-04 — Phase 21: Built-in Scalping Strategies

Eight strategies out of the box, each a plain `defineStrategy` description on the phase-20
engine: momentum burst, VWAP reversion, post-only spread capture, book imbalance, tape
pressure, micro range fade, session-open drive and volatility squeeze — plus tuned preset
packs and a live scoreboard that says which of them is actually earning.

### Added

- **Live strategy scoreboard** — a desk running eight strategies has eight opinions and one
  account; without a per-strategy score the trader knows only their total, which says the day
  went badly and nothing about which idea to stop running. The column it orders by is **net
  per trade**, not win rate, because a strategy can win 80% of its trades and lose money on
  the other 20% — and "which of these do I turn off" is the question the block exists to
  answer. Closes are attributed by **matching the open fire**, so the execution layer never
  has to carry a strategy id: threading one through the order path would couple execution to
  attribution for the sake of one statistic. A close with no matching fire still counts
  toward P&L — the money moved either way — but contributes no hold time, since averaging in
  a zero would report round trips that never happened. Everything is incremental: a rollup
  that rescanned the ledger per close would grow with the session, which is exactly what the
  tick budget exists to forbid.
- **Scalper preset packs** — eight strategies at five or six params each is forty numbers,
  and a trader who has to pick all of them before their first trade will pick none of them
  and run the defaults forever. A pack is one decision instead of forty, and the three names
  mean the same thing across every strategy, which is the only reason having three is useful:
  *conservative* fires less on more confirmation and will sit out moves that paid, *standard*
  is the strategy as designed, *aggressive* fires more on thinner evidence with bigger tails
  both ways. Values are tuned for **one-second scalping**, not for the daily-bar settings
  these indicators are usually quoted with. A pack is **merged onto** the current tuning
  rather than replacing it, so one that tunes four of six params leaves the other two alone,
  and it goes through **the same coercion as a hand edit** — a pack authored against an older
  schema is exactly as untrusted as a typed value, and letting one bypass the clamp would be
  the single path by which an out-of-range param reaches a strategy. Saving a custom pack
  refuses built-in names, which would strand the original with no way back, and a picker
  showing "standard" over params that are no longer standard marks itself dirty.
- **Volatility squeeze expansion** — volatility mean-reverts far more reliably than price
  does: a market that has gone quiet will get loud again, and the only questions are when
  and which way. This answers "when" with a percentile of the instrument's **own** recent
  one-second ranges — two prints a second is dead on BTC and a riot on a stablecoin pair —
  and **refuses to answer "which way" until the expansion itself says so**. That refusal is
  the design: guessing direction during the squeeze turns a good volatility read into a coin
  flip, and the edge is that the first expanding bucket carries direction before the move is
  obvious. A wide bucket that closed where it opened takes no side at all. The exit is
  contraction, because the trade was the volatility rather than the direction — when the
  volatility goes, the reason to hold goes with it. All the percentile work happens per
  closed bucket, never per print: recomputing on every tick would make it the slowest thing
  in the frame by an order of magnitude.
- **Session-open drive** — the minutes after a session opens are the only part of the day
  where a scalper is reliably paid for being fast: volume arrives, the overnight range gets
  tested, and the first genuine break of the opening box tends to run, because everyone who
  was waiting for the open is doing the same arithmetic at the same moment. Crypto has no
  open, which is exactly why the sessions are configurable — the OKX book still moves on the
  London and New York equity opens because the people trading it are awake then. **One entry
  per open, enforced in code**: the second attempt at a failed drive is the trade that turns
  a small loss into the day, and it is precisely the one a trader takes when they are
  annoyed. The exit is a **ratcheting trail**, not a target, because the premise is that the
  move runs further than a target would have caught — and the stop only ever moves one way,
  since a stop that could fall gives back the whole point of trailing. The opening box stops
  growing when its build window ends (a range that kept extending would never break, which
  is a strategy that never trades) and is discarded between sessions, because yesterday's
  opening range is a memory, not a level.
- **Micro range fade** — most of a scalping session is not trending: price oscillates between
  two levels everyone can see, and the trade is to sell the top and buy the bottom with a stop
  just beyond, because when the band finally breaks it breaks fast. Levels are built from
  **confirmed swings**, so one always arrives a few prints late — that lateness is not a
  defect to engineer away, since a level called at the moment of the extreme is just the last
  price, and fading the last price is not a strategy. Nearby swings merge, because a level
  touched at 100.01, 100.00 and 99.99 is one level and treating it as three both triples the
  count and makes each look untested. **The invalidation matters more than the entry**: a
  broken level is deleted and any open fade closes immediately, so this never fights a
  breakout — range traders do not lose money on ranges, they lose it on the one that ended.
  Conviction rises with touch count and is deliberately **capped**, because a level tested ten
  times is one about to break. The levels are published to the micro-chart overlay muted and
  finely dashed: they are an inference about the market, not a fact about the account like an
  entry, and drawing them at the same weight would misstate how much to trust them.
- **Tape pressure shift** — where the imbalance strategy reads intention, this one reads
  what happened: who crossed the spread. The signal is the **shift, not the level** — a tape
  running at 70% buy volume all session is just an instrument with a bid to it, and by the
  time that shows up it is priced in; a tape going from 45% to 70% in ten seconds is somebody
  arriving. The ratio is **volume-weighted, never print-counted**, because fifty one-lot
  prints against one block reads bullish by count and bearish by size, and the size is what
  moved. The venue's own taker-side label always beats the tick rule, and an unchanged print
  stays *unknown* rather than being guessed, which would bias the ratio toward whatever came
  before. A minimum print count exists because three prints can swing a ratio from 0 to 1 and
  mean nothing — without it the strategy would fire hardest exactly when the tape is
  thinnest. An empty window reads as balanced, not as maximum selling pressure.
- **Order-book imbalance** — the book says what people intend, the tape says what they did,
  and this one trades the intention: when resting depth is heavily loaded on one side and
  *stays* loaded, price moves away from the heavy side, because the thin side is where it is
  cheap to push. Raw imbalance is famously noisy, so two filters do all the work.
  **Persistence** — a ratio spiking for one update is a large order placed and pulled, and a
  side flip restarts the count outright, since a ratio that swung from bid-heavy to ask-heavy
  has not been persistent, it has been volatile. **Microprice agreement** — the size-weighted
  mid leads the last trade, so requiring the two to point the same way discards the setups
  where depth is loaded and nothing is actually moving, which is what a spoof looks like from
  here. The exit is the book turning, which usually comes before price does — the whole
  reason to trade the book rather than the tape. An empty book reads as balanced, never as
  loaded, so a disconnect cannot fire an entry.
- **Post-only spread capture** — the only strategy here that earns rather than predicts. It
  quotes both sides passively and has no opinion about direction at all, which means its
  risks and its failure modes are entirely different from the other two. Three of them shape
  the module: a spread that does not cover the **round-trip** maker fee is a losing quote,
  and a maker who forgets the second fill loses money at a perfectly steady rate; requoting
  on every book flicker is how a maker gets rate-limited, and a cancelled quote is one that
  was not in the queue when the fill came, so a drift of exactly the tolerance is not drift;
  and **inventory is the real risk** — passive fills pile up on one side in a trend, turning
  a market maker into a directional trader who did not choose to be one, so the quotes lean
  against the position and the lean is clamped, because a quote pushed arbitrarily far never
  fills and never filling is not the same as getting flat. It emits `flat` with its quotes
  in the reason, never buy or sell: putting a maker's inventory into the directional pipeline
  would mean something else entirely.
- **VWAP mean reversion bands** — the other half of the scalper's book and deliberately the
  momentum strategy's opposite: this one fades. Price stretched several sigma from the
  session's volume-weighted fair value tends to snap back, because the move was one
  impatient participant rather than a repricing. The rule that stops it being a slow way to
  lose money is **confirmation**: a band touch alone is a falling knife — price at three
  sigma can go to five, and fading the first touch of a genuine trend is how a
  mean-reversion account dies — so the setup arms on the touch and fires only once a print
  comes back toward VWAP. Bands are measured in sigma of the price-to-VWAP distance rather
  than in ticks, so the same settings mean the same thing on a quiet instrument and a wild
  one. The target is VWAP itself, since past fair value the reason to hold is gone, and a
  hard sigma stop exists because holding a losing fade "until it reverts" is the failure
  mode of the whole genre.
- **Momentum burst breakout** — a scalper's momentum, which is not "price went up over five
  minutes" but "the tape just got fast". Tick **velocity** leads price on a burst, because
  the flurry of orders arrives before the level breaks; by the time a five-minute candle
  says momentum, the move is over and the scalper is providing the exit liquidity. The
  trigger is always a multiple of **this instrument's own recent baseline**, never an
  absolute rate — twenty prints a second is frantic on a mid-cap and asleep on BTC at the
  open — and the baseline moves deliberately slowly, since one that chased the burst would
  erase the very spike it exists to detect. Fast **and going nowhere** is refused outright:
  that is a two-sided fight, not a breakout, and it is the most expensive thing on the board
  to trade because both sides are there in size. The exit takes the time stop
  unconditionally, because a burst that has not paid within a few seconds was not a burst,
  and the trade held "just a bit longer" is where the day's losses are made.
- **A mutable scratchpad on the strategy context** (`ctx.state`) — the context stays frozen,
  but a strategy keeping a ring buffer or a running baseline now has somewhere to put it
  that costs no per-tick allocation and that two runs on two instruments do not share.

## [0.20.0] — 2026-08-04 — Phase 20: Strategy Engine Core

The desk can now hold an opinion. A plug-in contract with a context that reaches nothing
dangerous, a registry that starts and stops runs per instrument, auto-built tuning, an
expiring signal dialect, incremental EMA/RSI/VWAP/ATR/stddev, a per-strategy tick budget,
an error sandbox that benches repeat offenders, bounded signal history and a weighted
vote that blends several strategies into one decision.

### Added

- **Weighted vote composition** — running four strategies on one instrument does not give a
  trader four edges, it gives them four buttons and a decision to make in the half second
  they do not have. The composite makes that decision the same way every time: a weighted
  sum of direction × conviction, with a **dead zone** in the middle. The dead zone is the
  whole point — without it a blend landing at 0.02 one tick and −0.02 the next goes long,
  short, long off noise, at two spreads and a fee each time, which is how a "consensus"
  system loses money faster than any of its members would alone. **Expired members do not
  vote**: a strategy that has gone quiet is not abstaining in favour of the others, its last
  opinion simply is not evidence, and the blend expires with its shakiest member because a
  consensus is only as current as the oldest opinion inside it. Weights are stored **raw**
  and normalised on read — storing the normalised value would rewrite every other slider, so
  the next drag would renormalise against numbers nobody chose and the sliders would fight
  the hand. The blend never votes on itself, and it registers as an ordinary strategy, so
  the runs list, the quarantine, the tick budget and the history all treat it like a member.
- **Signal history** — the question after a bad trade is never "what is the strategy saying
  now" but "what was it saying when I clicked", and live state cannot answer it: it holds
  one signal per run and overwrites it every tick. So every emission is appended to a
  bounded ring, **one per run** rather than one shared log — a chatty strategy on a fast
  instrument would otherwise evict a quiet strategy's whole history within a minute, and
  the quiet one's three signals a day are exactly the ones somebody will want to look up. A
  repeat of the same call is not appended, since a strategy holding an opinion for ten
  seconds would otherwise fill its history with one decision. History is appended by the
  same call that publishes, so no future emission path can quietly miss it, and
  `exportSignals` reads across runs as **one timeline** — insertion order would be a
  timeline only by accident.
- **Sandboxed strategy errors** — a strategy is somebody's idea, written fast and tested
  less; it will throw, and the only question is whether it takes the tick loop, its
  neighbours and the feed with it. A throw becomes **data**: an `{ok, error}` result, a
  consecutive-error tally, and at three in a row an automatic bench. Three rather than one,
  because a single throw on a malformed frame is a bug worth surviving while three in a row
  is a strategy that will keep throwing every tick until somebody looks — and any success
  clears the tally, so a strategy that throws once an hour is never treated like one
  throwing constantly. Quarantine **stops** the run rather than flagging it, since a benched
  run whose subscription survived would keep throwing behind a UI that says it is off, and
  it is visible and one-click reversible, because a strategy that vanished silently is
  indistinguishable from one with nothing to say. There is now exactly **one** place a
  strategy exception is caught; a second would mean two definitions of "it failed" and a
  tally counting whichever fired. A deliberately hostile built-in throws on a schedule, so a
  regression that lets an exception escape fails a test rather than a session.
- **Per-strategy tick budget** — a strategy runs inside the same frame as the book, the tape
  and the order ticket, so a slow one does not just make itself late, it makes **the desk**
  late. Each run carries a declared budget (2ms by default, merged into every strategy's
  param schema whether or not its author thought about one) and an EWMA of what it actually
  costs. Over budget, it is **throttled, never dropped**: every 2nd, 4th or 8th tick
  depending on the overage, because a degraded signal is still a signal and silently
  disabling one would leave the trader watching a strategy they believe is running. The
  verdict carries 20% hysteresis, without which a strategy sitting exactly on its budget
  flaps between full speed and quarter speed every few ticks — worse than either. The gate
  itself is a modulo and nothing else: it has to be cheaper than the work it skips. A
  throttled run wears its stride and cost in the runs list, so slowness is visible before
  it hurts.
- **VWAP, ATR and rolling stddev** — volume and volatility context on the same closure API
  and the same O(1) budget. The stddev uses **Welford**, not the textbook
  `E[x²] − E[x]²`: on instrument prices — numbers near 60000 whose variance is near 1 —
  the textbook form subtracts two nearly equal large numbers and loses most of its
  significant digits, which is how a band indicator ends up returning a negative variance.
  True range counts the **gap**, because a gap straight through a bar otherwise reads as a
  quiet bar, the single most dangerous thing a volatility number can say. A print with no
  size does not move VWAP, since counting it would quietly turn a volume-weighted average
  into a plain mean, and `zscore` returns 0 rather than Infinity on a flat series — a dead
  market is not the most extreme move ever recorded. VWAP re-anchors at the trading day
  roll by re-running each strategy's `init`, which is how the reset reaches indicators the
  registry never sees: they are built inside `init` in the first place.
- **EMA and RSI as incremental indicators** — these run on every tick of every instrument
  of every running strategy, the hottest path in the desk, so they are closures over a
  handful of numbers with an `update(x)` that allocates nothing and does O(1) work: no
  history array, no window sliced per tick. The EMA **seeds on its first sample** — one
  that spends its first hundred ticks climbing from 0 to 60000 is not a slow reading, it is
  a wrong one. RSI is Wilder-smoothed and checked against Wilder's own worked series, which
  is the only real proof it is right; no losses at all reads as 100 by definition rather
  than as a division by zero. Both report their own **warmup**, because an average of three
  samples of a fourteen-period reading is not wrong so much as not yet meaningful, and a
  strategy acting on it is acting on noise dressed as a number. `crossed()` refuses to fire
  on a pair that merely touched. A hot-path check asserts a per-update ceiling, which is
  what would catch an accidental allocation creeping in later.
- **Signal spine** — one dialect every strategy speaks: direction as a **number**, not a
  word, because a consumer that has to remember whether `'sell'` means -1 or 1 will
  eventually get it backwards, and backwards here means trading the opposite of what was
  signalled. Signals **expire**: a strategy that said "long" once and then went quiet has
  not said "long forever", it has said nothing since — and without a ttl a signal from
  twenty minutes ago sits on screen looking exactly like one from this tick. The sweep runs
  on the frame pump rather than on the instrument's own next tick, because the instrument
  that went quiet is precisely the one whose signal has gone stale and will never produce
  the tick that would have cleared it. A ttl of `0` is a deliberate "until told otherwise",
  and the chip carries the strategy's stated reason — a chip that says "short" and nothing
  else is a number nobody can argue with after the fact.
- **Auto-built strategy tuning** — an author declares `{kind, min, max, step, default}` per
  param and **the form builds itself**; no strategy ever ships its own settings UI, because
  the moment tuning needs hand-written markup half of them ship without it and get tuned by
  editing source. Every value is coerced against the schema on the way *in* — a number
  input hands back a string, a saved preset can be years old, and a param that reaches a
  strategy as `"20"` or as `NaN` is a position sized wrong. Numbers snap to their step
  *relative to min*, so a step of 5 on a floor of 2 offers 2/7/12 rather than 0/5/10. A
  change applies **within the tick and re-runs `init`**, since a threshold computed from a
  lookback at start would otherwise outlive the form that changed it, and a tuning behind a
  restart button is one nobody uses mid-session — the only time it matters.
- **Strategy registry and run lifecycle** — a strategy is *registered* once and **run**
  many times, one run per instrument, each with its own params, its own init state and its
  own tick subscription. Keeping those two ideas apart is what lets the same idea sit on
  four symbols with four different lookbacks and nothing shared and mutable between them.
  **Stopping leaves nothing behind**: the subscription is torn down before the run is
  forgotten, because a run removed from the map while still subscribed is a strategy
  emitting signals from a UI that says it is off — the worst failure available here.
  Starting is idempotent, so a double-click or a re-subscribe after a reconnect never
  leaves two subscriptions racing the same state, and a duplicate id is a named error
  rather than a silent last-one-wins. A new **Strategies** block lists every live run with
  its latest signal and a one-click stop.
- **Strategy contract** — the plug-in surface the rest of phase 20 builds on. A strategy is
  a plain object with `onTick`/`onCandle` (and an optional `init`), and the context it is
  handed is **the only surface it gets**: instrument, resolved params, an indicator
  snapshot, a namespaced logger and an injected clock. No `setValue`, no order function, no
  live store — a bug in somebody's mean-reversion idea should be a wrong signal, not a
  wrong position, and the only way to guarantee that is to make the unsafe thing
  unreachable rather than discouraged. Registration **fails loudly**: a misspelled hook
  that silently never fires is worse than a refusal to load, because the desk then looks
  like it is running a strategy that is doing nothing at all. A hook that throws is
  silenced for that tick and logged, never for the session and never taking the frame with
  it. An unrecognised signal action is silence rather than a guess — coercing a typo to
  `flat` would have a misspelling close positions.

## [0.19.0] — 2026-08-04 — Phase 19: Latency & Metrics HUD

The desk now measures itself: venue round-trip, submit→ack latency, live spread,
per-fill slippage, session pace and streak, traded size and the fees eating it — nine
vitals that collapse into a single severity-ordered row when the screen is needed.

### Added

- **Compact HUD row** — nine vitals in a single block row, so the HUD stops competing with
  the book and the ticket for screen and the metrics stay visible while the trader is
  actually working. The strip is **ordered by severity rather than by a fixed layout**: in
  a row this dense a fixed order means the one reading that matters is wherever it always
  was — off to the right, behind seven that are fine. An active alert outranks any tone,
  because an alert is happening now and a tone has been true for a while; ties keep their
  original order so a quiet row never reshuffles itself under the eye. An unknown metric is
  truncated to three characters rather than dropped, since a missing cell reads as a metric
  that is fine, which is the one thing it must never do.
- **Fee burn meter** — a scalper's edge is measured in ticks and their fees are measured in
  the same ticks, so the two numbers belong on the same screen: a hundred round trips at a
  two-tick edge and a one-tick fee is a day that reads as a win on gross and is a loss in
  the account. **What the venue actually billed always outranks the estimate of it** — the
  rate card (OKX spot 8/10bp, perpetuals 2/5bp, EToro's ~1% markup, which is a fee by
  another name) exists only for the fills nobody has been charged for yet, and an unknown
  venue is priced as OKX rather than as free, because a zero-fee estimate is the one error
  that makes a losing strategy look profitable. The hourly burn rate is **floored at five
  minutes of session**: extrapolating an hour from the first ninety seconds is
  arithmetically true and practically a lie, and a tile that prints a four-figure rate off
  two trades is a tile nobody reads by lunchtime.
- **Session tiles: pace, streak and traded size** — three readings a scalper takes on
  themselves rather than on the market. Pace is **extrapolated from a sliding hour, not
  counted since the open**: ten trades in the last ten minutes is a pace of sixty an hour,
  and that is the number that says whether the current rhythm is sustainable — a
  since-open count says only what already happened. It is banded ±25% against a persisted
  target, because a tile that cries off-target at every wobble is a tile that stops being
  read. The streak tile is the least obvious and the most useful of the three: losing
  streaks are where discipline goes, and the trade after three losses is the one taken too
  big and too early to get it back — so cold earns a colour, a border and a one-shot pulse
  where on-target and neutral stay deliberately unstyled. A scratch **breaks** a streak
  without starting one. All three read the realisation ledger rather than keeping their
  own tallies, so the day-roll they already inherit is the only one there is.
- **Slippage per fill** — the cost a scalper cannot see without measuring: a two-tick edge
  taken at one tick of slippage is half a strategy, and nothing on screen says so unless
  something keeps score. **Positive always means worse**, whichever side was traded — a
  buy filled above its intent and a sell filled below it are the same event, and a column
  where they carry opposite signs cannot be averaged. A fill with no captured intent is
  *not* scored as zero, because zero is a perfect fill and counting unknowns as perfect
  flatters the average exactly where it should not. (F19.5)
- **Spread alert** — slippage is what already happened; a widening spread is what is about
  to. It fires on a real widening past the trader's own limit and never on missing data,
  since an alert that fires on absence is an alert that gets muted. (F19.4)
- **Latency eviction** — an order whose ack never came would otherwise leave a submit
  stamp in the map for the life of the session. Only unmatched stamps are swept; a
  completed round trip is already counted. (F19.3)
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

[Unreleased]: https://github.com/D-dezeeuw/stockz/compare/v0.25.0...HEAD
[0.25.0]: https://github.com/D-dezeeuw/stockz/compare/v0.24.0...v0.25.0
[0.24.0]: https://github.com/D-dezeeuw/stockz/compare/v0.23.0...v0.24.0
[0.23.0]: https://github.com/D-dezeeuw/stockz/compare/v0.22.0...v0.23.0
[0.22.0]: https://github.com/D-dezeeuw/stockz/compare/v0.21.0...v0.22.0
[0.21.0]: https://github.com/D-dezeeuw/stockz/compare/v0.20.0...v0.21.0
[0.20.0]: https://github.com/D-dezeeuw/stockz/compare/v0.19.0...v0.20.0
[0.19.0]: https://github.com/D-dezeeuw/stockz/compare/v0.18.0...v0.19.0
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
