# Design System — Money-Hacker

Green/orange terminal cockpit. Dense, fast, alive. Dark ("night") is the primary theme;
"day" is a bright variant that keeps the identity.

## Color tokens (CSS custom properties on `:root`)

| Token | Night | Day | Use |
| --- | --- | --- | --- |
| `--bg` | `#0a0e0a` | `#f4f6f2` | page background |
| `--bg-block` | `#0f1510` | `#ffffff` | block background |
| `--ink` | `#c8e6c9` | `#1a2e1a` | body text |
| `--green` | `#00e676` | `#00873c` | profit, buy, up-tick, connected |
| `--green-dim` | `#1b5e20` | `#c8e6c9` | borders, subdued fills |
| `--orange` | `#ff9100` | `#e65100` | loss, sell, down-tick, warnings, accents |
| `--orange-hot` | `#ff3d00` | `#d84315` | kill switch, breaker tripped, errors |
| `--glow-green` | `0 0 8px #00e67655` | none | pulse on profitable tick |
| `--glow-orange` | `0 0 8px #ff910055` | none | pulse on losing tick |

Rules: profit/buy is always green, loss/sell always orange — never red/blue. Both
palettes must pass WCAG AA for text. Theme switching swaps one attribute
(`data-theme="night|day"` on `<html>`); no component defines raw colors.

## Typography

- Monospace everywhere: `"JetBrains Mono", "Fira Code", ui-monospace, monospace`.
- All numbers use `font-variant-numeric: tabular-nums` — prices never jiggle columns.
- Sizes: 12px base in blocks, 14px headers, one scale only (`--fs-1..4`).

## Grid rules (non-negotiable)

- Dashboard = CSS Grid of blocks with **identical width and height**
  (`grid-auto-rows: var(--block-h)`, equal columns via `repeat(auto-fill, minmax(...))`).
- Only the **header** and **footer** break the uniform size.
- Blocks never spawn horizontal page scroll; content scrolls *inside* a block.
- Block chrome: 1px `--green-dim` border, title bar with status LED, body, no padding
  waste — density is a feature.

## Header / Footer contract

- **Header:** STOCKZ logo (SVG, green glow) · nav (Dashboard / Trade / Journal /
  Analytics) · venue LEDs · day-PnL ticker · settings gear · day/night toggle.
- **Footer:** "Neko Media" wordmark + LinkedIn, npm, GitHub icons (inline SVG links).
  Single row, quiet, `--green-dim` on `--bg`.

## Motion

- Transitions 100–150ms, `ease-out`, only on `transform`/`opacity`/`color`.
- Tick pulses: one keyframe flash of glow token, never layout-shifting.
- Respect `prefers-reduced-motion: reduce` — disable pulses, keep instant updates.
- Nothing on the order path ever waits for an animation.

## Voice

Terminal-flavored microcopy: `ARMED`, `FLAT`, `KILL`, `+0.42%`, `LIVE`, `PAPER`.
Uppercase status words, lowercase everything else, no exclamation marks — the numbers do
the shouting.
