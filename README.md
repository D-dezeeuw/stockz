# STOCKZ

**Hyper-scalping micro-trading desk.** A fast, snappy dashboard for high-frequency
manual and assisted scalping — many trades per day, no bureaucratic confirm-dialogs.
Speed is the product: one lean circuit-breaker set is the entire safety surface,
everything else is optimized for trades-per-hour.

## Stack

| Piece | Choice |
| --- | --- |
| UI engine | [Spektrum](https://www.npmjs.com/package/spektrum) `1.x` from the unpkg CDN via importmap — no SPA framework, no bundled UI lib |
| App code | Vanilla ES modules, Node 22 tooling only |
| Dev / build | Vite (dev server, production build with the GitHub Pages base path) |
| Tests | Vitest — exactly one unit test per function |
| Charts | Hand-rolled canvas renderers (tick-level speed) |
| Venues | OKX v5 (WebSocket + signed REST) and EToro (REST) |
| Hosting | GitHub Pages, published locally with `gh-pages` — **no GitHub Actions** |

## Quickstart

```bash
nvm use 22       # or any Node >= 22
npm install
npm run dev      # http://localhost:5173/
```

The page boots with the on-screen dev log overlay in the bottom-right corner (dev only).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 5173 (strict) |
| `npm run build` | Production build to `dist/` with the `/stockz/` base path |
| `npm run preview` | Serve the built bundle locally at `/stockz/` |
| `npm run test` | Whole suite — merge checks only, not the routine loop |
| `npm run test:fn <fn>` | Run exactly one function's test (the routine loop) |
| `npm run lint` / `lint:fix` | ESLint flat config across the repo |
| `npm run check:secrets` | Grep tracked files for secret-shaped strings |
| `npm run deploy` | Build + publish `dist/` to the `gh-pages` branch (local, no CI) |

## API keys

Local development reads `STOCKZ_`-prefixed vars through `import.meta.env`:

```bash
cp .env.example .env.local   # then fill in your values
```

| Var | Venue |
| --- | --- |
| `STOCKZ_OKX_API_KEY`, `STOCKZ_OKX_SECRET_KEY`, `STOCKZ_OKX_PASSPHRASE` | OKX |
| `STOCKZ_ETORO_API_KEY`, `STOCKZ_ETORO_USER_KEY` | EToro |

- Only the `STOCKZ_` prefix reaches the bundle (`envPrefix` in `vite.config.js`).
- `.env.local` is gitignored — **never commit key values.** `npm run check:secrets` is
  the tripwire.
- In production the browser gets keys from URL params (`?okxKey=…`, scrubbed from the
  address bar on load) or the key modal; they live in an in-memory vault, never in
  application state.

## Testing

One function, one test, run alone:

```bash
npm run test:fn avgEntryPrice
npx vitest run src/utils/math.test.js -t "roundToTick"
```

Before a feature merges, its tests run once with coverage scoped to the feature's files
and must clear **>80% lines, statements, functions and branches**. Details in
[`tests/CONVENTIONS.md`](tests/CONVENTIONS.md) and
[`.claude/context/testing-policy.md`](.claude/context/testing-policy.md).

## Deploying

```bash
npm run deploy   # vite build && gh-pages -d dist
```

Ships to `https://d-dezeeuw.github.io/stockz/`. There is no CI in this repository by
design — see [`.claude/context/deployment.md`](.claude/context/deployment.md).

## Project docs

| Doc | Contents |
| --- | --- |
| [`.claude/context/masterplan.md`](.claude/context/masterplan.md) | The delivery plan: 30 phases × 10 features × 10 tasks |
| [`.claude/context/way-of-working.md`](.claude/context/way-of-working.md) | Feature-branch cycle, auto-merge gate, git identity |
| [`.claude/context/architecture.md`](.claude/context/architecture.md) | Module layout and data flow |
| [`.claude/context/design-system.md`](.claude/context/design-system.md) | Green/orange money-hacker theme and grid rules |
| [`.claude/context/integrations.md`](.claude/context/integrations.md) | OKX and EToro clients |
| [`docs/architecture.md`](docs/architecture.md) | One-page module map |

---

Built by [Neko Media](https://github.com/D-dezeeuw).
