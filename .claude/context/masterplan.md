# STOCKZ Masterplan — Hyper-Scalping Micro-Trading Desk

> A quick, snappy, high-frequency scalping platform: fast and volatile trading, many
> trades per day, no bureaucratic guardrails — one lean circuit-breaker set and
> everything else built for speed.

## How to read this plan

- **Phase** = agile Epic (30 total). **Feature** = agile Story (10 per phase).
  **Task** = agile To-do (10 per feature) — 30 × 10 × 10 = 3,000 tasks.
- Every phase, feature and task carries two lines: **What** (the value it brings the
  user) and **How** (the way to achieve it).
- IDs: `F<phase>.<feature>` and `T<phase>.<feature>.<task>` — referenced in branch
  names and commit messages.
- Checkboxes `- [ ]` are ticked as tasks merge to `main`.

## Delivery rules (bind every phase)

1. **One feature = one branch** (`feature/f<phase>-<n>-<slug>`), merged to `main` when
   green — see `.claude/context/way-of-working.md`.
2. **One Vitest unit test per function; test runs target only that function** — see
   `.claude/context/testing-policy.md`.
3. **No GitHub Actions.** Deploys go to GitHub Pages via local `npm run deploy`
   (`gh-pages` package) — see `.claude/context/deployment.md`.
4. **UI = Spektrum 1.x from unpkg CDN** (importmap), vanilla ES modules, no framework.
5. **Secrets never in git.** Local dev uses `STOCKZ_OKX_API_KEY` /
   `STOCKZ_OKX_SECRET_KEY` / `STOCKZ_OKX_PASSPHRASE` / `STOCKZ_ETORO_API_KEY` /
   `STOCKZ_ETORO_USER_KEY` via `import.meta.env`; the browser gets keys via URL param
   or key modal.
6. **Design system is law:** green/orange money-hacker theme, day/night modes,
   uniform-size grid blocks between header and footer.

## Phase index

| # | Phase | # | Phase |
| --- | --- | --- | --- |
| 1 | Foundation & Tooling | 16 | Hotkeys & Command Palette |
| 2 | Spektrum Core Integration | 17 | Order Types & Execution Engine |
| 3 | Money-Hacker Design System | 18 | Positions & Live PnL |
| 4 | Dashboard Grid Shell | 19 | Scalper HUD & Session Stats |
| 5 | Header, Branding & Navigation | 20 | Strategy Engine Core |
| 6 | Day/Night Theme Engine | 21 | Built-in Scalping Strategies |
| 7 | User Settings & Persistence | 22 | Alerts & Notifications |
| 8 | API Key Access Layer | 23 | Auto-Trade Bot Runner |
| 9 | OKX Connectivity | 24 | Lean Circuit Breakers |
| 10 | EToro Connectivity | 25 | Trade Journal & Time-Travel Audit |
| 11 | Real-Time Market Data Pipeline | 26 | Analytics & Performance Dashboard |
| 12 | Watchlists & Instruments | 27 | Market Replay & Backtesting |
| 13 | Micro-Charts & Sparklines | 28 | Paper Trading Mode |
| 14 | Order Book & Tape | 29 | Latency & Rendering Optimization |
| 15 | Rapid Order Entry | 30 | Build, GitHub Pages Deploy & Release |

---

## Phase 1 - Foundation & Tooling

**What:** A zero-friction project base so every later feature ships fast and predictably.
**How:** Scaffold a Node 22 + Vite vanilla-ESM workspace with npm scripts, ESLint, Vitest, env handling and repo hygiene.

### F1.1 - Repo Layout & Git Hygiene

**What:** A predictable folder structure so every later phase knows exactly where code, assets and tests live.
**How:** Create the src/, public/, tests/ skeleton in the git repo with a strict .gitignore, .editorconfig and Node 22 pin.

- [x] **T1.1.1 - Cut layout feature branch** - What: Scaffold work stays isolated until proven green. How: Run git checkout -b feature/repo-layout from main.
- [x] **T1.1.2 - Create src/ tree** - What: One obvious home for all application code. How: Add src/ with app/, utils/ and styles/ subfolders plus an empty src/main.js entry stub.
- [x] **T1.1.3 - Create public/ assets folder** - What: Static files served untouched by Vite and GitHub Pages. How: Add public/ containing a favicon.svg placeholder and robots.txt.
- [x] **T1.1.4 - Create tests/ mirror** - What: Predictable test discovery that mirrors source layout. How: Add tests/ mirroring the src/ folders with a placeholder smoke.test.js for Vitest.
- [x] **T1.1.5 - Write .gitignore** - What: node_modules, builds and local secrets can never enter history. How: List node_modules/, dist/, coverage/, .env.local, .env*.local and .DS_Store in .gitignore.
- [x] **T1.1.6 - Add .editorconfig** - What: Identical 2-space LF UTF-8 formatting in every editor. How: Create .editorconfig with indent_style=space, indent_size=2, end_of_line=lf, charset=utf-8.
- [x] **T1.1.7 - Pin Node 22** - What: Everyone runs the exact runtime the toolchain targets. How: Add .nvmrc containing 22 so nvm use matches the Node 22 requirement.
- [x] **T1.1.8 - Normalize line endings** - What: No CRLF diff noise across contributor machines. How: Add .gitattributes with "* text=auto eol=lf".
- [x] **T1.1.9 - Verify ignore rules** - What: Proof that secrets and build output stay untracked. How: Touch dist/probe.txt and .env.local, then confirm git status is clean and git check-ignore matches both.
- [x] **T1.1.10 - Merge layout branch** - What: The skeleton lands on main as the base for all later phases. How: Merge feature/repo-layout into main after the ignore verification passes.

### F1.2 - package.json & npm Scripts

**What:** One-command dev, build, preview, test, lint and deploy so nobody memorizes tool invocations.
**How:** Author package.json for Node 22 with type module and npm scripts wrapping Vite, Vitest, ESLint and gh-pages.

- [x] **T1.2.1 - Cut scripts feature branch** - What: Manifest work merges only once every script runs. How: Run git checkout -b feature/npm-scripts from main.
- [x] **T1.2.2 - Author package manifest** - What: A valid ESM package identity for the whole project. How: Run npm init -y, then set name stockz, private true, type module and engines.node ">=22".
- [x] **T1.2.3 - Install the toolchain** - What: All build and test tooling available offline after one install. How: Run npm install -D vite vitest eslint gh-pages and commit package-lock.json.
- [x] **T1.2.4 - Add dev script** - What: Instant HMR dev server with one command. How: Add "dev": "vite" to package.json scripts.
- [x] **T1.2.5 - Add build and preview scripts** - What: Reproducible production bundles plus a local smoke server. How: Add "build": "vite build" and "preview": "vite preview" scripts.
- [x] **T1.2.6 - Add test scripts** - What: Full runs plus single-function targeting per the one-test-per-function policy. How: Add "test": "vitest run" and "test:fn": "vitest run -t" scripts.
- [x] **T1.2.7 - Add lint scripts** - What: One command to check or auto-fix style across the repo. How: Add "lint": "eslint ." and "lint:fix": "eslint . --fix" scripts.
- [x] **T1.2.8 - Add deploy script pair** - What: One local command publishes the desk to GitHub Pages, no CI needed. How: Add "predeploy": "npm run build" and "deploy": "gh-pages -d dist" scripts.
- [x] **T1.2.9 - Verify every script** - What: Certainty that all commands exit cleanly before anyone depends on them. How: Execute dev (then kill), build, preview, test, lint in sequence and check exit code 0.
- [x] **T1.2.10 - Merge scripts branch** - What: The command surface becomes the contract for all later phases. How: Merge feature/npm-scripts into main after the script verification run.

### F1.3 - Vite Config Ready for GitHub Pages

**What:** A dev server and production build that work locally and under the /stockz/ GitHub Pages subpath.
**How:** Write vite.config.js with a mode-aware base path, es2022 build target, '@' alias and CDN-external Spektrum imports.

- [x] **T1.3.1 - Cut vite-config feature branch** - What: Build config changes cannot break main mid-edit. How: Run git checkout -b feature/vite-config from main.
- [x] **T1.3.2 - Scaffold vite.config.js** - What: A typed, documented single source of build truth. How: Create vite.config.js exporting defineConfig(({ mode }) => ({})) with JSDoc comments.
- [x] **T1.3.3 - Set Pages base path** - What: Assets resolve on GitHub Pages without broken URLs. How: Set base to '/stockz/' when mode is 'production' and '/' otherwise inside the defineConfig callback.
- [x] **T1.3.4 - Configure the dev server** - What: A stable localhost address hotkey docs can reference. How: Set server.port 5173 and server.strictPort true in vite.config.js.
- [x] **T1.3.5 - Configure build output** - What: Modern, debuggable bundles sized for fast Pages loads. How: Set build.outDir 'dist', build.target 'es2022' and build.sourcemap true.
- [x] **T1.3.6 - Add '@' source alias** - What: Clean absolute-style imports like '@/utils/format.js'. How: Add resolve.alias mapping '@' to the src directory via new URL('./src', import.meta.url).
- [x] **T1.3.7 - Externalize Spektrum imports** - What: The importmap CDN modules stay out of the bundle so phase 2 loading works. How: Add build.rollupOptions.external for 'spektrum' and 'spektrum/*' specifiers.
- [x] **T1.3.8 - Verify dev serving** - What: Confidence the day-to-day loop works. How: Run npm run dev and load http://localhost:5173/ confirming index.html serves with no 404s.
- [x] **T1.3.9 - Verify Pages-style build** - What: Proof the production bundle survives the subpath. How: Run npm run build then npm run preview and confirm all asset URLs start with /stockz/.
- [x] **T1.3.10 - Merge vite-config branch** - What: Reliable builds become available to every feature branch. How: Merge feature/vite-config into main after both serving verifications.

### F1.4 - index.html App Shell Entry

**What:** The single HTML page the SPA boots from, with mount point and importmap placeholder ready for Spektrum.
**How:** Author index.html with meta tags, an empty importmap script block, a #app mount div and a module script loading /src/main.js.

- [x] **T1.4.1 - Cut html-entry feature branch** - What: Shell edits stay off main until the page boots. How: Run git checkout -b feature/html-entry from main.
- [x] **T1.4.2 - Author HTML skeleton** - What: A valid standards-mode document as the app's foundation. How: Write index.html with doctype, html lang="en", charset utf-8 and viewport meta.
- [x] **T1.4.3 - Add head metadata** - What: Correct tab title and mobile chrome color for the terminal look. How: Add title STOCKZ, meta description and a dark theme-color meta tag.
- [x] **T1.4.4 - Add importmap placeholder** - What: A marked slot where phase 2 pins spektrum@1 from unpkg. How: Insert an empty script type="importmap" block with an HTML comment naming the phase 2 fill-in.
- [x] **T1.4.5 - Add app mount node** - What: The single root element all Spektrum bindings hang off. How: Add div id="app" with data-cloak between header and footer placeholder comments.
- [x] **T1.4.6 - Wire module entry** - What: The browser loads app code as native ES modules. How: Add script type="module" src="/src/main.js" before the closing body tag.
- [x] **T1.4.7 - Write mountApp boot stub** - What: Visible proof of life on first load. How: Implement mountApp() in src/main.js that writes "STOCKZ booting" into #app and call it on DOMContentLoaded.
- [x] **T1.4.8 - Write the mountApp unit test** - What: The boot function is locked by its one allowed test. How: Add tests/main.mountApp.test.js with a jsdom #app fixture and run vitest run -t mountApp only.
- [x] **T1.4.9 - Verify boot in browser** - What: Certainty the shell renders clean. How: Run npm run dev, load the page and confirm the boot text shows with zero console errors.
- [x] **T1.4.10 - Merge html-entry branch** - What: A booting shell becomes the canvas for every UI phase. How: Merge feature/html-entry into main after browser verification.

### F1.5 - ESLint Flat Config for Vanilla ESM

**What:** Instant feedback on unused vars, sloppy comparisons and style drift so reviews stay fast.
**How:** Write eslint.config.js flat config using @eslint/js recommended rules with browser, worker and Vitest globals.

- [x] **T1.5.1 - Cut eslint feature branch** - What: Lint rollout cannot block other work in progress. How: Run git checkout -b feature/eslint from main.
- [x] **T1.5.2 - Install lint packages** - What: The rule engine and environment globals are locally available. How: Run npm install -D @eslint/js globals.
- [x] **T1.5.3 - Scaffold flat config** - What: A modern single-file lint setup with no legacy .eslintrc. How: Create eslint.config.js exporting an array starting with js.configs.recommended.
- [x] **T1.5.4 - Set language options** - What: The linter understands the exact runtime the app targets. How: Configure ecmaVersion 2024, sourceType module and globals.browser plus globals.worker.
- [x] **T1.5.5 - Tune core rules** - What: The riskiest bug patterns for a trading desk are hard errors. How: Enable no-unused-vars, prefer-const, no-var and eqeqeq at error level.
- [x] **T1.5.6 - Add tests override block** - What: Test files lint clean without imports for describe/it/expect. How: Add a config entry scoped to tests/**/*.test.js injecting Vitest globals.
- [x] **T1.5.7 - Set ignore patterns** - What: Lint runs stay fast by skipping generated output. How: Add an ignores entry for dist/, coverage/ and node_modules/.
- [x] **T1.5.8 - Lint the existing code** - What: A clean baseline so future diffs only show new issues. How: Run npm run lint:fix across the repo and hand-fix anything remaining.
- [x] **T1.5.9 - Verify rule enforcement** - What: Proof the config actually bites. How: Temporarily add an unused variable in src/main.js, confirm eslint fails, then revert it.
- [x] **T1.5.10 - Merge eslint branch** - What: Every future feature branch inherits the same guardrails. How: Merge feature/eslint into main once the repo lints clean.

### F1.6 - Vitest Harness & One-Test-Per-Function Policy

**What:** A test setup where each function has exactly one focused test and targeted runs finish in under a second.
**How:** Configure vitest.config.js with node environment and globals, plus a naming convention and the test:fn targeting workflow.

- [x] **T1.6.1 - Cut vitest feature branch** - What: Test infrastructure lands only when demonstrably fast. How: Run git checkout -b feature/vitest-harness from main.
- [x] **T1.6.2 - Scaffold vitest.config.js** - What: Tests are discovered from one canonical location. How: Create vitest.config.js with test.include ['tests/**/*.test.js'] and environment 'node'.
- [x] **T1.6.3 - Enable test globals** - What: describe/it/expect work without imports, matching the ESLint override. How: Set test.globals true in vitest.config.js.
- [x] **T1.6.4 - Define the naming convention** - What: Any function's single test is findable by name alone. How: Document tests/<area>/<module>.<functionName>.test.js with one it() per file in tests/CONVENTIONS.md.
- [x] **T1.6.5 - Optimize for speed** - What: Sub-second targeted runs that never break scalping flow. How: Disable coverage by default and set test.watch false for the run scripts.
- [x] **T1.6.6 - Add appVersion sample function** - What: A tiny reference function demonstrating the policy end to end. How: Implement appVersion() in src/app/version.js returning the version from package.json import.
- [x] **T1.6.7 - Write the appVersion unit test** - What: The reference function carries its one allowed test. How: Add tests/app/version.appVersion.test.js asserting the semver shape.
- [x] **T1.6.8 - Prove targeted execution** - What: Evidence test:fn runs exactly one test. How: Run npm run test:fn appVersion and confirm the reporter shows 1 passed, 0 skipped files touched otherwise.
- [x] **T1.6.9 - Verify full-suite run** - What: The whole suite still passes as a merge gate. How: Run npm run test and confirm all current tests pass with exit code 0.
- [x] **T1.6.10 - Merge vitest branch** - What: The testing contract every later feature must follow is now enforced. How: Merge feature/vitest-harness into main after both run verifications.

### F1.7 - Local Env & Secret Key Handling

**What:** Local dev can use real STOCKZ_* venue keys with zero risk of committing them.
**How:** Set Vite envPrefix STOCKZ_, ship a .env.example template, and add a tested import.meta.env read helper.

- [x] **T1.7.1 - Cut env-handling feature branch** - What: Secret plumbing merges only after leak checks pass. How: Run git checkout -b feature/env-handling from main.
- [x] **T1.7.2 - Set the env prefix** - What: Only intentional STOCKZ_ vars ever reach browser code. How: Add envPrefix 'STOCKZ_' to vite.config.js so import.meta.env exposes just those.
- [x] **T1.7.3 - Author .env.example** - What: New devs see exactly which keys exist without seeing values. How: List STOCKZ_OKX_API_KEY, STOCKZ_OKX_SECRET_KEY, STOCKZ_OKX_PASSPHRASE, STOCKZ_ETORO_API_KEY and STOCKZ_ETORO_USER_KEY empty.
- [x] **T1.7.4 - Prove .env.local is ignored** - What: A hard guarantee real keys stay out of git. How: Create a dummy .env.local and confirm git check-ignore .env.local succeeds and git status stays clean.
- [x] **T1.7.5 - Implement readEnv helper** - What: One safe accessor instead of scattered import.meta.env reads. How: Write readEnv(name) in src/utils/env.js returning import.meta.env[name] ?? '' and never logging values.
- [x] **T1.7.6 - Write the readEnv unit test** - What: The accessor is locked by its single test. How: Add tests/utils/env.readEnv.test.js stubbing import.meta.env via Vite define and run vitest run -t readEnv.
- [x] **T1.7.7 - Add secrets scan script** - What: A pre-deploy tripwire against pasted key values. How: Add "check:secrets" npm script running git grep -nE for long base64-like strings in tracked files.
- [x] **T1.7.8 - Log key presence at boot** - What: Devs instantly see which venue keys are configured, values hidden. How: In src/main.js log booleans like okx:true etoro:false derived from readEnv results.
- [x] **T1.7.9 - Verify build excludes unset keys** - What: Assurance the production bundle carries no secret material. How: Run npm run build without .env.local and grep dist/ for STOCKZ_ values expecting no hits.
- [x] **T1.7.10 - Merge env-handling branch** - What: Safe key handling is available before any venue phase starts. How: Merge feature/env-handling into main after the build grep verification.

### F1.8 - Shared Utils: Formatting & Math

**What:** One tested toolbox for price and quantity formatting plus scalping math every later phase reuses.
**How:** Build src/utils/format.js and src/utils/math.js as pure ES modules with exactly one Vitest test per function.

- [x] **T1.8.1 - Cut shared-utils feature branch** - What: The toolbox lands atomically with all its tests. How: Run git checkout -b feature/shared-utils from main.
- [x] **T1.8.2 - Implement formatPrice** - What: Prices always render with venue-correct decimals. How: Write formatPrice(value, tickSize) in src/utils/format.js deriving decimal places from the tick size exponent.
- [x] **T1.8.3 - Implement formatQty** - What: Quantities respect each instrument's lot granularity. How: Write formatQty(value, lotSize) in src/utils/format.js truncating to the lot size precision.
- [x] **T1.8.4 - Implement formatPct** - What: PnL badges get signed, consistent percent strings. How: Write formatPct(value) in src/utils/format.js returning "+1.25%" style output with two decimals.
- [x] **T1.8.5 - Implement clamp** - What: Order sizes and UI values stay inside hard bounds. How: Write clamp(value, min, max) in src/utils/math.js using Math.min and Math.max.
- [x] **T1.8.6 - Implement roundToTick** - What: Every computed price is venue-submittable. How: Write roundToTick(price, tickSize) in src/utils/math.js rounding to the nearest tick multiple avoiding float drift.
- [x] **T1.8.7 - Implement bpsDiff** - What: Spread and slippage compare in basis points at a glance. How: Write bpsDiff(a, b) in src/utils/math.js returning ((a - b) / b) * 10000.
- [x] **T1.8.8 - Write the six single unit tests** - What: Each helper is locked by exactly one focused test. How: Add one test file per function under tests/utils/ and run each via vitest run -t with its function name.
- [x] **T1.8.9 - Lint and edge-check the toolbox** - What: Helpers proven safe for zero, negative and NaN inputs. How: Run eslint on src/utils/ and extend each single test's expect set with its edge case inside the same it().
- [x] **T1.8.10 - Merge shared-utils branch** - What: A trusted math base unblocks charts, orders and PnL phases. How: Merge feature/shared-utils into main once all six targeted tests pass.

### F1.9 - Logger & On-Screen Dev Overlay

**What:** Leveled logging plus an on-screen overlay so feed and order issues are visible without opening devtools.
**How:** Build src/utils/log.js with debug/info/warn/error levels, a ring buffer and a dev-only DOM overlay.

- [x] **T1.9.1 - Cut logger feature branch** - What: Logging ships together with its overlay and tests. How: Run git checkout -b feature/logger from main.
- [x] **T1.9.2 - Implement createLogger** - What: Namespaced, timestamped log lines per subsystem. How: Write createLogger(namespace) in src/utils/log.js returning debug/info/warn/error methods with ISO timestamps.
- [x] **T1.9.3 - Implement setLogLevel** - What: Noise control from a single switch during a live session. How: Write setLogLevel(level) filtering which methods emit based on an ordered level list.
- [x] **T1.9.4 - Implement recordEntry ring buffer** - What: The last 200 log lines are retained for the overlay and later audit phases. How: Write recordEntry(entry) appending to a capped in-memory array exported for reads.
- [x] **T1.9.5 - Implement mountLogOverlay** - What: Errors surface on-screen the moment they happen. How: Write mountLogOverlay() rendering the buffer into a fixed bottom-right pre element only when import.meta.env.DEV.
- [x] **T1.9.6 - Style the overlay** - What: Readable green-on-black monospace fitting the terminal vibe. How: Apply inline styles for position fixed, rgba black background, lime text and 11px monospace font.
- [x] **T1.9.7 - Capture global errors** - What: No crash goes unseen, even outside logger calls. How: Wire window.onerror and unhandledrejection listeners into the error level in src/main.js.
- [x] **T1.9.8 - Write the four single unit tests** - What: Each logging function locked by its one test. How: Add targeted tests for createLogger, setLogLevel, recordEntry and mountLogOverlay under tests/utils/ using jsdom where DOM is touched.
- [x] **T1.9.9 - Verify overlay behavior** - What: Proof the overlay helps in dev and vanishes in prod. How: Throw a test error in npm run dev to see it on-screen, then confirm npm run preview shows no overlay.
- [x] **T1.9.10 - Merge logger branch** - What: Every later phase gets instant visible diagnostics. How: Merge feature/logger into main after the dev and preview verification.

### F1.10 - Developer Docs & .claude Context Wiring

**What:** Any new contributor, human or agent, goes from clone to a running desk in under five minutes.
**How:** Write a README quickstart, scripts and env docs, plus CLAUDE.md context encoding the repo's process rules.

- [x] **T1.10.1 - Cut dev-docs feature branch** - What: Docs merge only after a clean-clone dry run. How: Run git checkout -b feature/dev-docs from main.
- [x] **T1.10.2 - Write README pitch and stack** - What: Instant orientation on what STOCKZ is and how it is built. How: Author README.md intro naming the vanilla-ESM SPA, Spektrum via unpkg, Vite, Vitest and GitHub Pages stack.
- [x] **T1.10.3 - Write README quickstart** - What: Three copy-paste commands to a running desk. How: Document nvm use 22, npm install and npm run dev with the localhost:5173 URL.
- [x] **T1.10.4 - Write README scripts table** - What: Every npm command explained in one glance. How: Add a table covering dev, build, preview, test, test:fn, lint, check:secrets and deploy.
- [x] **T1.10.5 - Write README keys section** - What: Clear, safe setup for OKX and EToro credentials. How: Explain copying .env.example to .env.local, the STOCKZ_ prefix rule and the never-commit-values warning.
- [x] **T1.10.6 - Author CLAUDE.md conventions** - What: Agent sessions automatically follow house rules. How: Write root CLAUDE.md covering repo layout, feature-branch-per-feature flow and the one-test-per-function policy with test:fn usage.
- [x] **T1.10.7 - Wire .claude settings** - What: Agents run the standard toolchain without permission friction. How: Add .claude/settings.json allowlisting npm run dev/build/test/test:fn/lint commands.
- [x] **T1.10.8 - Write docs/architecture.md map** - What: A one-page mental model of modules before the codebase grows. How: Diagram src/app, src/utils, tests mirroring and the future Spektrum state tree in Markdown.
- [x] **T1.10.9 - Dry-run the quickstart** - What: Docs proven correct, not aspirational. How: Clone the repo into a scratch directory, follow README verbatim to a running dev server and fix any gap found.
- [x] **T1.10.10 - Merge dev-docs branch** - What: Phase 1 closes with a self-explaining, agent-ready repo. How: Merge feature/dev-docs into main after the dry run succeeds.

---

## Phase 2 - Spektrum Core Integration

**What:** A reactive, auditable UI engine so every screen updates instantly from one state tree.
**How:** Load spektrum@1 and its companions from unpkg via importmap, then bootstrap appState with bindDOM() and run().

### F2.1 - Pinned Importmap for spektrum@1

**What:** The UI engine loads instantly from CDN with zero bundled dependencies and no version drift.
**How:** Fill the index.html importmap with spektrum@1 and companion module URLs from unpkg, plus a local re-export shim.

- [x] **T2.1.1 - Cut importmap feature branch** - What: CDN wiring merges only when modules provably resolve. How: Run git checkout -b feature/importmap from main.
- [x] **T2.1.2 - Pin the core engine** - What: One immutable source of the UI engine for every load. How: Add "spektrum": "https://unpkg.com/spektrum@1" to the importmap placeholder from phase 1.
- [x] **T2.1.3 - Pin the companions** - What: persist, devtools, inspect, dock and compile ready when their phases need them. How: Add importmap entries for each spektrum/* companion pinned to the same @1 unpkg path.
- [x] **T2.1.4 - Add modulepreload hint** - What: The engine starts downloading before main.js executes, cutting boot latency. How: Add link rel="modulepreload" for the spektrum core URL in index.html head.
- [x] **T2.1.5 - Confirm Vite passthrough** - What: The build never mangles or inlines the CDN map. How: Run npm run build and diff the importmap block in dist/index.html against source, relying on the rollup external config.
- [x] **T2.1.6 - Create engine shim module** - What: App code imports one local module, easing future engine swaps. How: Write src/app/engine.js re-exporting setValue, addValue, trigger, computed, addAsync, refresh, addSystem, watch, defineFn, bindDOM, run and friends from 'spektrum'.
- [x] **T2.1.7 - Implement engineInfo** - What: The running engine version is visible for bug reports. How: Write engineInfo() in src/app/engine.js returning the version string exposed by the spektrum module.
- [x] **T2.1.8 - Write the engineInfo unit test** - What: The shim's function locked by its single test. How: Add tests/app/engine.engineInfo.test.js mocking the spektrum import and run vitest run -t engineInfo.
- [x] **T2.1.9 - Verify CDN loading** - What: Proof modules arrive from unpkg with proper caching. How: Load npm run dev in a browser and check the network tab for spektrum requests returning 200 with cache headers.
- [x] **T2.1.10 - Merge importmap branch** - What: The engine supply line becomes part of main. How: Merge feature/importmap into main after the network verification.

### F2.2 - App Bootstrap: State, bindDOM, run

**What:** The app boots into a live reactive state tree, so the DOM reflects state with zero manual wiring.
**How:** Build src/app/bootstrap.js creating initial state, calling bindDOM('#app') and starting the engine with run().

- [x] **T2.2.1 - Cut bootstrap feature branch** - What: The boot path changes only as a proven whole. How: Run git checkout -b feature/bootstrap from main.
- [x] **T2.2.2 - Implement initialState factory** - What: A single canonical seed for the entire state tree. How: Write initialState() in src/app/bootstrap.js returning empty ui, market, trade and settings roots plus ui.bootStatus.
- [x] **T2.2.3 - Implement bootstrap sequence** - What: One deterministic entry that brings the desk alive. How: Write bootstrap() applying initialState via setValue, calling bindDOM('#app') then run() from the engine shim.
- [x] **T2.2.4 - Rewire main.js** - What: The phase 1 stub is replaced by the real reactive boot. How: Replace the mountApp body to await bootstrap() on DOMContentLoaded, keeping its single test updated.
- [x] **T2.2.5 - Wire data-cloak reveal** - What: Users never see raw {{expr}} template flashes. How: Add a CSS rule hiding [data-cloak] and rely on bindDOM removing the attribute after binding.
- [x] **T2.2.6 - Add first live binding** - What: Visible proof state drives the DOM. How: Put {{ui.bootStatus}} in index.html and have bootstrap() setValue it from "booting" to "ready".
- [x] **T2.2.7 - Take the boot checkpoint** - What: A baseline snapshot for time-travel audit in phase 25. How: Call checkpoint('boot') right after run() inside bootstrap().
- [x] **T2.2.8 - Write the two single unit tests** - What: initialState and bootstrap each locked by one test. How: Add targeted jsdom-based tests under tests/app/ and run each via vitest run -t by name.
- [x] **T2.2.9 - Verify reactive boot** - What: Confidence the tree is live end to end. How: In npm run dev confirm bootStatus flips to ready, console is clean and replay() lists the boot mutations.
- [x] **T2.2.10 - Merge bootstrap branch** - What: Every subsequent phase builds on a running engine. How: Merge feature/bootstrap into main after the browser verification.

### F2.3 - State Namespace Conventions

**What:** Every module knows exactly where its state lives, preventing key collisions across all 30 phases.
**How:** Define ui.*, market.*, trade.* and settings.* ownership in docs plus frozen path constants with a dev-time validator.

- [x] **T2.3.1 - Cut namespaces feature branch** - What: Naming rules land atomically with their enforcement. How: Run git checkout -b feature/state-namespaces from main.
- [x] **T2.3.2 - Write the state map doc** - What: A single reference answering "where does this value live". How: Author docs/state-map.md assigning ui, market, trade and settings roots to their owning phase groups.
- [x] **T2.3.3 - Implement path constants** - What: Typo-proof state keys shared by all modules. How: Write src/app/paths.js exporting Object.freeze'd UI, MARKET, TRADE and SETTINGS root constants.
- [x] **T2.3.4 - Implement buildPath helper** - What: Composable dotted paths without string concatenation bugs. How: Write buildPath(root, ...segments) in src/app/paths.js joining segments with dots after validating each.
- [x] **T2.3.5 - Implement assertKnownNamespace** - What: Unknown roots fail loudly in dev instead of silently corrupting state. How: Write assertKnownNamespace(path) throwing when the first segment is not one of the four roots, no-op in prod.
- [x] **T2.3.6 - Seed namespace branches** - What: Placeholder sub-trees later phases can rely on. How: Extend initialState() with ui.theme, market.instruments, trade.orders and settings.user defaults.
- [x] **T2.3.7 - Adopt constants in bootstrap** - What: The boot path itself follows the convention it preaches. How: Replace raw string keys in bootstrap.js and main.js with paths.js constants and buildPath calls.
- [x] **T2.3.8 - Add lint guard for raw paths** - What: The convention is enforced by tooling, not memory. How: Add an ESLint no-restricted-syntax rule flagging setValue string literals outside src/app/paths.js.
- [x] **T2.3.9 - Write the two single unit tests** - What: buildPath and assertKnownNamespace each locked by one test. How: Add targeted tests under tests/app/ and run each with vitest run -t by function name.
- [x] **T2.3.10 - Merge namespaces branch** - What: A collision-free state tree contract reaches main. How: Merge feature/state-namespaces into main after lint and targeted tests pass.

### F2.4 - Action Registry via defineFn

**What:** Every user action lives in one registry callable from HTML data-action, keeping clicks O(1) fast.
**How:** Build src/app/actions.js registering namespaced handlers with Spektrum defineFn and a programmatic dispatch helper.

- [x] **T2.4.1 - Cut actions feature branch** - What: The action layer merges as one reviewed unit. How: Run git checkout -b feature/action-registry from main.
- [x] **T2.4.2 - Scaffold registerActions** - What: One boot call installs every handler. How: Write registerActions() in src/app/actions.js iterating an actions map into defineFn(name, handler) calls.
- [x] **T2.4.3 - Implement app.reset action** - What: A clean-slate command for demos and recovery. How: Add an 'app.reset' handler applying initialState() over the tree via setValue.
- [x] **T2.4.4 - Implement ui.setStatus action** - What: Any module can update the status line uniformly. How: Add a 'ui.setStatus' handler writing its payload to ui.bootStatus through paths constants.
- [x] **T2.4.5 - Document naming convention** - What: Predictable namespace.verb action names forever. How: Write the convention header comment in actions.js and mirror it in docs/state-map.md.
- [x] **T2.4.6 - Wire a DOM dispatch proof** - What: Confidence HTML can trigger registry actions. How: Add a dev-only button with data-action="app.reset" inside a data-if="ui.devMode" block in index.html.
- [x] **T2.4.7 - Implement dispatchAction helper** - What: Hotkeys and bots in later phases call actions programmatically. How: Write dispatchAction(name, payload) in actions.js invoking the registered handler via trigger.
- [x] **T2.4.8 - Guard duplicate registration** - What: Copy-paste bugs surface immediately in dev. How: Make registerActions() throw when defineFn would overwrite an existing action name.
- [x] **T2.4.9 - Write the four single unit tests** - What: registerActions, dispatchAction and both handlers each locked by one test. How: Add targeted tests under tests/app/ running each via vitest run -t.
- [x] **T2.4.10 - Merge actions branch** - What: A stable action surface unblocks order entry and hotkey phases. How: Merge feature/action-registry into main after clicking the dev button resets state in the browser.

### F2.5 - Derived Values via computed

**What:** Spread, mid and exposure totals appear on screen and stay correct without any manual recalculation.
**How:** Register computed() definitions in src/app/derived.js built from pure functions over market.* and trade.* paths.

- [x] **T2.5.1 - Cut derived feature branch** - What: Derived math lands with tests proving it. How: Run git checkout -b feature/computed-derived from main.
- [x] **T2.5.2 - Scaffold registerDerived** - What: One boot call installs all derived values. How: Write registerDerived() in src/app/derived.js called from bootstrap() after state seeding.
- [x] **T2.5.3 - Implement spreadOf and its computed** - What: Live bid-ask spread anywhere in the UI. How: Write pure spreadOf(bid, ask) and register computed market.spread over market.book.bestBid and bestAsk.
- [x] **T2.5.4 - Implement midOf and its computed** - What: A venue-valid midprice for quoting logic. How: Write midOf(bid, ask, tickSize) using roundToTick from phase 1 and register computed market.mid.
- [x] **T2.5.5 - Implement exposureOf and its computed** - What: Total open exposure always current for risk display. How: Write exposureOf(orders) summing size times price and register computed trade.totalExposure over trade.orders.
- [x] **T2.5.6 - Add open order count computed** - What: The HUD phases get a free live order counter. How: Register computed trade.openCount as trade.orders.length via a countOf(orders) pure function.
- [x] **T2.5.7 - Compose the status line** - What: One glanceable line mixing boot state and spread. How: Register computed ui.statusLine joining ui.bootStatus with formatPrice(market.spread) from phase 1 utils.
- [x] **T2.5.8 - Seed and bind demo values** - What: Visible proof derived values react. How: Seed bestBid/bestAsk in initialState and bind {{market.spread}} and {{ui.statusLine}} in index.html.
- [x] **T2.5.9 - Write the four single unit tests** - What: spreadOf, midOf, exposureOf and countOf each locked by one test. How: Add targeted tests under tests/app/ and run each via vitest run -t by name.
- [x] **T2.5.10 - Merge derived branch** - What: Reactive market math is available to charts and HUD phases. How: Merge feature/computed-derived into main after console setValue on bestBid visibly updates the DOM.

### F2.6 - Per-Tick Systems via addSystem and watch

**What:** Repeating per-tick work like clocks and heartbeats runs centrally, so feed phases just plug in.
**How:** Register an addSystem loop in src/app/systems.js plus watch() subscriptions, with HMR-safe teardown.

- [x] **T2.6.1 - Cut systems feature branch** - What: The tick loop merges only once it survives hot reload. How: Run git checkout -b feature/tick-systems from main.
- [x] **T2.6.2 - Scaffold registerSystems** - What: One boot call starts all recurring work. How: Write registerSystems() in src/app/systems.js invoked from bootstrap() after registerDerived.
- [x] **T2.6.3 - Implement the clock system** - What: A shared now timestamp for staleness checks everywhere. How: Add addSystem('clock') writing Date.now() into market.now each tick via a clockTick() function.
- [x] **T2.6.4 - Implement the heartbeat system** - What: A visible liveness counter proving the loop runs. How: Add addSystem('heartbeat') incrementing ui.tickCount with addValue at animation-frame cadence.
- [x] **T2.6.5 - Add theme watch stub** - What: A ready seam for the phase 6 theme engine. How: Register watch on settings.user.theme logging changes through the phase 1 createLogger('systems') namespace.
- [x] **T2.6.6 - Add spread anomaly watch** - What: Crossed markets get flagged the instant they appear. How: Register watch on market.spread calling a spreadFlipped(prev, next) function that warns when the sign changes.
- [x] **T2.6.7 - Implement stopSystems teardown** - What: Vite HMR never leaves duplicate loops running. How: Write stopSystems() removing systems and watchers and wire it to import.meta.hot.dispose.
- [x] **T2.6.8 - Write the four single unit tests** - What: registerSystems, stopSystems, clockTick and spreadFlipped each locked by one test. How: Add targeted tests under tests/app/ run via vitest run -t.
- [x] **T2.6.9 - Verify HMR safety** - What: Proof edits mid-session cannot double the tick rate. How: Edit systems.js during npm run dev and confirm ui.tickCount keeps a single cadence in the overlay.
- [x] **T2.6.10 - Merge systems branch** - What: A central heartbeat is ready for market data phases. How: Merge feature/tick-systems into main after the HMR verification.

### F2.7 - Async Data via addAsync and refresh

**What:** Remote fetches land in state with loading and error flags, ready for the venue phases 9-11.
**How:** Wire addAsync sources in src/app/asyncData.js with refresh()-driven revalidation, backoff and abort handling.

- [x] **T2.7.1 - Cut async-data feature branch** - What: The async pattern merges proven against a real endpoint. How: Run git checkout -b feature/async-data from main.
- [x] **T2.7.2 - Scaffold registerAsync** - What: One boot call declares every remote source. How: Write registerAsync() in src/app/asyncData.js invoked from bootstrap() wiring addAsync definitions.
- [x] **T2.7.3 - Add serverTime async source** - What: A first live remote value proving the whole path. How: Register addAsync for market.serverTime fetching the public OKX /api/v5/public/time REST endpoint.
- [x] **T2.7.4 - Define status convention** - What: Any binding can show loading, ready or error uniformly. How: Have each async writer set a sibling .status key to 'loading', 'ready' or 'error' around the fetch.
- [x] **T2.7.5 - Implement refreshServerTime** - What: On-demand revalidation callable from UI and tests. How: Write refreshServerTime() calling refresh('market.serverTime') and expose it as a data-action dev button.
- [x] **T2.7.6 - Implement retryDelay backoff** - What: Failed sources retry politely without hammering venues. How: Write pure retryDelay(attempt) in asyncData.js returning capped exponential milliseconds used on error status.
- [x] **T2.7.7 - Abort in-flight on dispose** - What: HMR and teardown never leak dangling requests. How: Route fetches through an AbortController cancelled in import.meta.hot.dispose alongside stopSystems.
- [x] **T2.7.8 - Write the three single unit tests** - What: registerAsync, refreshServerTime and retryDelay each locked by one test. How: Add targeted tests mocking fetch with vi.stubGlobal and run via vitest run -t.
- [x] **T2.7.9 - Verify failure recovery** - What: Confidence errors degrade gracefully and heal. How: Toggle devtools offline mode, watch status flip to error, go online and confirm refresh returns it to ready.
- [x] **T2.7.10 - Merge async-data branch** - What: The remote-data pattern all venue code will copy is on main. How: Merge feature/async-data into main after the offline recovery verification.

### F2.8 - Devtools Mounted in Dev Builds Only

**What:** Live state inspection, docking and replay while developing, with zero devtools bytes reaching production users.
**How:** Dynamically import spektrum/devtools, spektrum/inspect and spektrum/dock gated on import.meta.env.DEV.

- [x] **T2.8.1 - Cut devtools feature branch** - What: Tooling merges only after the prod exclusion is proven. How: Run git checkout -b feature/devtools from main.
- [x] **T2.8.2 - Implement mountDevtools** - What: The panel appears automatically in every dev session. How: Write mountDevtools() in src/app/devtools.js awaiting import('spektrum/devtools') only when import.meta.env.DEV.
- [x] **T2.8.3 - Dock the panel** - What: Devtools stay out of the trading grid's way. How: Use spektrum/dock to pin the panel to the bottom edge, collapsed by default with a toggle handle.
- [x] **T2.8.4 - Enable click-to-inspect** - What: Any bound DOM node reveals its state path on click. How: Wire spektrum/inspect activation behind an ?inspect=1 query parameter check in mountDevtools.
- [x] **T2.8.5 - Expose replay controls** - What: One click reruns the mutation log from the boot checkpoint. How: Add dock panel buttons invoking replay() and checkpoint('boot') from the engine shim.
- [x] **T2.8.6 - Implement devDumpState** - What: Full state snapshots pasteable into bug reports. How: Write devDumpState() calling serialize() and copying the JSON to the clipboard via navigator.clipboard.
- [x] **T2.8.7 - Wire into bootstrap** - What: Zero manual steps to get tooling in dev. How: Call mountDevtools() at the end of bootstrap() so the DEV gate decides everything.
- [x] **T2.8.8 - Write the two single unit tests** - What: mountDevtools and devDumpState each locked by one test. How: Add targeted tests stubbing import.meta.env.DEV and the dynamic import, run via vitest run -t.
- [x] **T2.8.9 - Verify prod exclusion** - What: Hard proof users never download devtools. How: Run npm run build and npm run preview, confirming no spektrum/devtools network request and no chunk reference in dist.
- [x] **T2.8.10 - Merge devtools branch** - What: Every developer gets instant state visibility from main. How: Merge feature/devtools into main after the preview exclusion check.

### F2.9 - Engine Errors Mapped to Toasts

**What:** Engine and action failures surface as instant on-screen toasts instead of silent console noise.
**How:** Wrap dispatch in Spektrum attempt(), register a global onError hook, and render ui.toasts via data-each.

- [x] **T2.9.1 - Cut error-toasts feature branch** - What: Error UX merges as one tested unit. How: Run git checkout -b feature/error-toasts from main.
- [x] **T2.9.2 - Implement pushToast** - What: Any module can raise a user-visible notice in one call. How: Write pushToast(message, level) in src/app/toasts.js using addValue to append {message, level, at} onto ui.toasts.
- [x] **T2.9.3 - Render the toast stack** - What: Users see errors where they are looking, over the grid. How: Add a data-each="ui.toasts" block in index.html rendering level-classed toast divs in a fixed corner.
- [x] **T2.9.4 - Implement expireToasts system** - What: Toasts clear themselves so the desk never clutters. How: Write expireToasts() removing entries older than 4 seconds and register it via addSystem('toast-expiry').
- [x] **T2.9.5 - Wrap dispatch in attempt** - What: A throwing action can never kill the engine loop. How: Change dispatchAction in actions.js to invoke handlers through attempt() and pushToast on failure.
- [x] **T2.9.6 - Register the onError hook** - What: Even non-action engine faults become visible toasts. How: Write onEngineError(err) mapping name and message into pushToast('error') and register it as the engine's global error handler in bootstrap.
- [x] **T2.9.7 - Bridge to the logger** - What: Every toast also lands in the phase 1 overlay and ring buffer. How: Call createLogger('engine').error from onEngineError alongside the toast.
- [x] **T2.9.8 - Write the three single unit tests** - What: pushToast, expireToasts and onEngineError each locked by one test. How: Add targeted tests under tests/app/ and run each with vitest run -t by name.
- [x] **T2.9.9 - Verify the failure path** - What: Proof a crash becomes a toast, then disappears. How: Add a dev-only 'app.crashTest' action that throws, click it, and watch the toast appear and expire within 4 seconds.
- [x] **T2.9.10 - Merge error-toasts branch** - What: Fault visibility ships before any real-money phase begins. How: Merge feature/error-toasts into main after the crash-test verification.

### F2.10 - CSP Readiness via spektrum/compile

**What:** The desk can later run under a strict no-eval Content-Security-Policy without a rewrite.
**How:** Add a spektrum/compile precompile script, a build:csp npm path and a runtime switch, documented for future hardening.

- [x] **T2.10.1 - Cut csp-compile feature branch** - What: The hardening path merges without touching the default build. How: Run git checkout -b feature/csp-compile from main.
- [x] **T2.10.2 - Write the CSP readiness doc** - What: The team understands why and when the eval-free path is needed. How: Author docs/csp.md explaining strict CSP, the spektrum/compile flow and GitHub Pages header limits.
- [x] **T2.10.3 - Implement compileTemplates script** - What: Bindings become precompiled modules with no runtime eval. How: Write compileTemplates() in scripts/compile-templates.mjs running spektrum/compile over index.html and emitting src/app/compiled-bindings.js.
- [x] **T2.10.4 - Add build:csp npm script** - What: One command produces the hardened bundle. How: Add "build:csp" running node scripts/compile-templates.mjs then vite build with STOCKZ_CSP=1 in the env.
- [x] **T2.10.5 - Add the runtime switch** - What: One codebase serves both normal and CSP builds. How: Make bootstrap() import compiled-bindings.js when readEnv('STOCKZ_CSP') === '1', else bind templates live.
- [x] **T2.10.6 - Add report-only CSP meta** - What: Violations show up in dev long before enforcement. How: Add a Content-Security-Policy-Report-Only meta tag in index.html allowing unpkg.com and self.
- [x] **T2.10.7 - Write the compileTemplates unit test** - What: The compile step locked by its single test. How: Add tests/scripts/compile-templates.compileTemplates.test.js over a fixture HTML snippet and run vitest run -t compileTemplates.
- [x] **T2.10.8 - Verify the hardened build** - What: Proof the desk boots with eval disabled. How: Run npm run build:csp, serve dist with an enforcing CSP meta and confirm boot with zero violations in console.
- [x] **T2.10.9 - Verify the default build unchanged** - What: Assurance normal deploys carry no compile overhead. How: Run npm run build without the flag and diff dist output against a pre-branch build for parity.
- [x] **T2.10.10 - Merge csp-compile branch** - What: Phase 2 closes with an engine that is fast today and hardenable tomorrow. How: Merge feature/csp-compile into main after both build verifications.

---

## Phase 3 - Money-Hacker Design System

**What:** A green/orange terminal cockpit look that makes the desk feel fast and alive.
**How:** Build a CSS custom-property token system (color, type, spacing, glow) with a JetBrains Mono stack, terminal accents and Vitest-tested format helpers.

### F3.1 - Core Color Token Palette

**What:** Matrix-green profit hues, hot-orange accent/loss hues and near-black backgrounds that give every screen the money-hacker look.
**How:** Define --sz-green/--sz-orange/--sz-bg/--sz-ink CSS custom properties in src/styles/tokens.css, bundled by Vite from the main.css entry.

- [x] **T3.1.1 - Cut color-tokens branch** - What: An isolated line of work for the palette. How: git checkout -b feat/color-tokens from an up-to-date main.
- [x] **T3.1.2 - Scaffold tokens.css entry** - What: One canonical home for all design tokens. How: Create src/styles/tokens.css with a :root block and @import it from src/styles/main.css so Vite bundles it.
- [x] **T3.1.3 - Matrix-green ramp** - What: A profit color family from faint tint to full glow. How: Add --sz-green-100..900 custom properties anchored on #00ff41 with computed darker and lighter steps.
- [x] **T3.1.4 - Hot-orange ramp** - What: A loss/accent family with real heat. How: Add --sz-orange-100..900 anchored on #ff7a00, mirroring the green ramp step-for-step.
- [x] **T3.1.5 - Near-black background layers** - What: Deep terminal canvas surfaces with subtle depth. How: Add --sz-bg-0/--sz-bg-1/--sz-bg-2 (#050705, #0b0f0b, #121712) for page, block and inset surfaces.
- [x] **T3.1.6 - Ink text tokens** - What: Readable primary, dim and faint text colors on dark ground. How: Add --sz-ink, --sz-ink-dim and --sz-ink-faint as greenish-gray values derived from the ramps.
- [x] **T3.1.7 - Apply base surface styles** - What: The app opens straight onto the terminal canvas. How: Set body background and color in main.css from var(--sz-bg-0) and var(--sz-ink).
- [x] **T3.1.8 - Token swatch demo block** - What: A visual QA sheet showing every color token at once. How: Dev-only swatch list rendered with Spektrum data-each over a token-name array bound via bindDOM.
- [x] **T3.1.9 - Lint and build check** - What: Confidence the palette ships clean. How: Run npx eslint . and npm run build (Vite), then eyeball the swatch sheet on the Vite dev server.
- [x] **T3.1.10 - Merge palette to main** - What: The palette becomes the base layer for all later phases. How: Merge feat/color-tokens into main once lint and build are green.

### F3.2 - Terminal Monospace Typography

**What:** Crisp monospace text with tabular numerals so stacked prices align and scan instantly.
**How:** A --sz-font-mono JetBrains Mono fallback chain, a compact type scale and font-variant-numeric utilities in tokens.css.

- [x] **T3.2.1 - Cut typography branch** - What: Type work proceeds without touching main. How: git checkout -b feat/typography from main.
- [x] **T3.2.2 - Monospace stack token** - What: One font token every component inherits. How: Add --sz-font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace to tokens.css.
- [x] **T3.2.3 - Self-host JetBrains Mono** - What: The signature face loads offline-safe on GitHub Pages. How: Place woff2 files in public/fonts with @font-face rules and font-display: swap.
- [x] **T3.2.4 - Compact type scale** - What: Sizes tuned for dense grid blocks. How: Add --sz-text-2xs..--sz-text-xl tokens (10px-20px) with a 1.2 ratio in tokens.css.
- [x] **T3.2.5 - Line-height and tracking tokens** - What: Tight but legible vertical rhythm. How: Add --sz-leading-tight/normal and --sz-tracking tokens sized for terminal density.
- [x] **T3.2.6 - Tabular numeral utility** - What: Price digits line up in perfect columns. How: Add .sz-num with font-variant-numeric: tabular-nums slashed-zero in main.css.
- [x] **T3.2.7 - Base element type styles** - What: Body, headings and code default to the terminal voice. How: Style body, h1-h4 and code from the font, scale and leading tokens.
- [x] **T3.2.8 - Type specimen demo block** - What: Proof digits align and sizes read at density. How: Dev-only specimen with a fake price column rendered via Spektrum data-each.
- [x] **T3.2.9 - Verify typography build** - What: Type ships without lint or bundle errors. How: Run npx eslint . plus npm run build and check the specimen in Vite dev.
- [x] **T3.2.10 - Merge typography to main** - What: Every later phase types in the terminal voice. How: Merge feat/typography into main when checks pass.

### F3.3 - Density Spacing, Radius and Border Tokens

**What:** Tight, consistent gaps and edges so many blocks fit on screen without visual noise.
**How:** A 4px-base spacing scale, small radii and hairline border tokens in tokens.css sized for dense grids.

- [x] **T3.3.1 - Cut density-tokens branch** - What: Spacing work isolated from main. How: git checkout -b feat/density-tokens from main.
- [x] **T3.3.2 - Spacing scale tokens** - What: Predictable gaps everywhere. How: Add --sz-space-0..8 on a 4px base (0-32px) to tokens.css.
- [x] **T3.3.3 - Radius tokens** - What: Sharp terminal corners with a hint of soften. How: Add --sz-radius-xs/sm/md (2px/4px/6px) tokens.
- [x] **T3.3.4 - Hairline border tokens** - What: Crisp 1px block edges that never smear. How: Add --sz-border-hair: 1px solid var(--sz-line) with a --sz-line color alias to the ink family.
- [x] **T3.3.5 - Block padding and gap presets** - What: One knob controls grid density. How: Add --sz-block-pad and --sz-gap tokens composed from the spacing scale.
- [x] **T3.3.6 - Focus ring token** - What: Keyboard focus visible without breaking density. How: Add --sz-focus outline token using the green ramp at 2px offset 1px.
- [x] **T3.3.7 - Apply density to demo blocks** - What: Swatch and specimen blocks demonstrate real density. How: Restyle the dev demo blocks using only the new spacing/radius/border tokens.
- [x] **T3.3.8 - Density audit at laptop width** - What: The scale holds up on a 13-inch screen. How: Check the Vite dev server at 1280px and adjust token values where blocks feel cramped.
- [x] **T3.3.9 - Lint and build pass** - What: Density tokens ship clean. How: Run npx eslint . and npm run build with no warnings.
- [x] **T3.3.10 - Merge density tokens to main** - What: The grid shell in phase 4 can consume the tokens. How: Merge feat/density-tokens into main when green.

### F3.4 - Glow, Scanline and Flicker Accents

**What:** Sparing CRT-style glow and scanline effects that mark state changes without slowing the desk.
**How:** Glow shadow tokens, a repeating-linear-gradient scanline overlay and a flicker keyframe, all compositor-friendly CSS.

- [x] **T3.4.1 - Cut terminal-accents branch** - What: Effects work stays off main until proven fast. How: git checkout -b feat/terminal-accents from main.
- [x] **T3.4.2 - Glow shadow tokens** - What: Reusable green and orange glow intensities. How: Add --sz-glow-green/--sz-glow-orange box-shadow and text-shadow values to tokens.css.
- [x] **T3.4.3 - Glow utility classes** - What: Any element can light up in one class. How: Add .sz-glow-green/.sz-glow-orange/.sz-glow-text utilities referencing the glow tokens.
- [x] **T3.4.4 - Scanline overlay class** - What: A subtle CRT texture on hero surfaces. How: Add .sz-scanlines using a ::after repeating-linear-gradient at 3px pitch and low opacity.
- [x] **T3.4.5 - Flicker keyframes** - What: A split-second flicker for dramatic state flips. How: Add @keyframes sz-flicker (opacity steps) plus a .sz-flicker one-shot class capped at 300ms.
- [x] **T3.4.6 - Reduced-motion guard** - What: Motion-sensitive users get a calm desk. How: Wrap flicker and scanline animation in @media (prefers-reduced-motion: no-preference).
- [x] **T3.4.7 - Usage guardrail comment** - What: Effects stay rare and meaningful. How: Header comment in the effects CSS: glow/flicker only on state changes, never idle, max one scanline surface per view.
- [x] **T3.4.8 - Compositor performance check** - What: Effects never cost a frame. How: Record the Chrome DevTools Performance panel while toggling effects; confirm opacity/shadow-only, no layout thrash.
- [x] **T3.4.9 - Lint and build verify** - What: Accents ship clean. How: Run npx eslint . and npm run build, then toggle each effect class on the Vite dev server.
- [x] **T3.4.10 - Merge accents to main** - What: State-change styling is available desk-wide. How: Merge feat/terminal-accents into main when checks pass.

### F3.5 - Semantic Status Colors

**What:** Profit, loss, warning and neutral read instantly from color alone anywhere on the desk.
**How:** Semantic --sz-status-* tokens aliasing the ramps, a statusFor helper registered via Spektrum defineFn, and utility classes.

- [x] **T3.5.1 - Cut status-colors branch** - What: Semantic mapping developed in isolation. How: git checkout -b feat/status-colors from main.
- [x] **T3.5.2 - Semantic status tokens** - What: Meaning-named colors decoupled from raw hues. How: Add --sz-status-profit/loss/warn/neutral aliasing green, orange and ink ramp values.
- [x] **T3.5.3 - Day and night variant values** - What: Statuses stay legible in both themes. How: Override status tokens under [data-theme="day"] and [data-theme="night"] scopes ready for the phase 6 engine.
- [x] **T3.5.4 - statusFor helper function** - What: One source of truth turning a delta into a status name. How: Write pure statusFor(delta) in src/lib/status.js returning 'profit', 'loss' or 'neutral'.
- [x] **T3.5.5 - Register statusFor with Spektrum** - What: Templates can classify values inline. How: Call defineFn('statusFor', statusFor) so {{ }} and data-fn bindings can use it.
- [x] **T3.5.6 - Single unit test for statusFor** - What: The classifier is locked by exactly one test. How: Write its one Vitest test and run npx vitest run tests/status.test.js -t statusFor.
- [x] **T3.5.7 - Status utility classes** - What: One class paints any element with its state. How: Add .sz-profit/.sz-loss/.sz-warn/.sz-neutral text and border utilities from the status tokens.
- [x] **T3.5.8 - Status-to-glow pairing** - What: Profit and loss states can flare with matching glow. How: Compose .sz-profit-glow/.sz-loss-glow combining status color with the F3.4 glow tokens.
- [x] **T3.5.9 - Status swatch verify** - What: All four statuses inspected in both themes. How: Extend the dev swatch block with a status row and flip data-theme manually on the Vite dev server.
- [x] **T3.5.10 - Merge status colors to main** - What: PnL and alert phases inherit consistent state colors. How: Merge feat/status-colors into main when the targeted test and lint are green.

### F3.6 - Motion and Tick-Pulse Rules

**What:** Snappy 100-150ms transitions and pulse-on-tick flashes that make prices feel live, never sluggish.
**How:** Duration/easing tokens, sz-pulse keyframes and a pulse(el, cls) retrigger helper tested with Vitest on happy-dom.

- [x] **T3.6.1 - Cut motion-rules branch** - What: Motion tuning isolated from main. How: git checkout -b feat/motion-rules from main.
- [x] **T3.6.2 - Duration and easing tokens** - What: One speed law for the whole desk. How: Add --sz-motion-fast: 100ms, --sz-motion-base: 150ms and --sz-ease: cubic-bezier(0.2,0,0,1) to tokens.css.
- [x] **T3.6.3 - Transition utility** - What: Consistent snappy transitions in one class. How: Add .sz-trans applying transition on color, background, box-shadow and transform using the tokens.
- [x] **T3.6.4 - Pulse keyframes** - What: Up-ticks flash green, down-ticks flash orange. How: Add @keyframes sz-pulse-up and sz-pulse-down fading a background tint over 150ms.
- [x] **T3.6.5 - Pulse one-shot classes** - What: A single class fires one tick flash. How: Add .sz-pulse-up/.sz-pulse-down running their keyframes once with var(--sz-motion-base).
- [x] **T3.6.6 - pulse retrigger helper** - What: Rapid consecutive ticks each visibly flash. How: Write pulse(el, cls) in src/lib/motion.js that removes the class, forces reflow via offsetWidth, then re-adds it.
- [x] **T3.6.7 - Single unit test for pulse** - What: The retrigger trick is locked by exactly one test. How: Write its one Vitest test on happy-dom and run npx vitest run tests/motion.test.js -t pulse.
- [x] **T3.6.8 - Reduced-motion fallback** - What: Pulses degrade to a gentle color change. How: Under prefers-reduced-motion: reduce, replace pulse animation with a plain 150ms background transition.
- [x] **T3.6.9 - Tick simulator verify** - What: Pulses proven under fast fake ticks. How: Dev-only interval calling Spektrum setValue on a fake price with a watch invoking pulse; observe on Vite dev.
- [x] **T3.6.10 - Merge motion rules to main** - What: Market-data phases get ready-made tick feedback. How: Merge feat/motion-rules into main when targeted test and lint pass.

### F3.7 - Inline SVG Icon Set

**What:** Sharp terminal icons (arrows, bolt, skull kill-switch, gear) that inherit status colors automatically.
**How:** An inline SVG symbol sprite plus an icon(name) helper registered with Spektrum defineFn for template use.

- [x] **T3.7.1 - Cut icon-set branch** - What: Icon work isolated from main. How: git checkout -b feat/icon-set from main.
- [x] **T3.7.2 - Sprite scaffold** - What: One inline sprite serves every icon with zero requests. How: Create src/assets/sprite.svg with <symbol> defs and inject it into index.html at startup.
- [x] **T3.7.3 - Arrow up/down symbols** - What: Directional icons for price and order moves. How: Draw 24px-grid arrow-up and arrow-down symbols with stroke="currentColor".
- [x] **T3.7.4 - Bolt and gear symbols** - What: Icons for fast actions and settings entry. How: Draw bolt and gear symbols on the same 24px grid and stroke style.
- [x] **T3.7.5 - Skull kill-switch symbol** - What: An unmistakable mark for the phase 24 circuit breaker. How: Draw a skull symbol with heavier stroke weight so it reads at 16px.
- [x] **T3.7.6 - icon helper function** - What: Templates get icons from a name string. How: Write icon(name, size) in src/lib/icons.js returning an <svg><use href="#sz-name"> markup string.
- [x] **T3.7.7 - Register icon with Spektrum** - What: Any binding can render an icon inline. How: Call defineFn('icon', icon) so {{ icon('bolt') }} and data-fn work in templates.
- [x] **T3.7.8 - Icon sizing CSS** - What: Icons scale with text and inherit state color. How: Add .sz-icon at 1em square with fill/stroke currentColor and vertical-align middle.
- [x] **T3.7.9 - Single unit test for icon** - What: The helper is locked by exactly one test. How: Write its one Vitest test asserting the use href and run npx vitest run tests/icons.test.js -t icon.
- [x] **T3.7.10 - Merge icon set to main** - What: Chrome, footer and HUD phases can drop in icons. How: Merge feat/icon-set into main when the targeted test and lint are green.

### F3.8 - Price and Number Format Helpers

**What:** Every price, PnL and size renders with correct sign, decimals and compact notation, everywhere the same.
**How:** Pure functions in src/lib/format.js using Intl.NumberFormat, registered via Spektrum defineFn, each with a single Vitest test.

- [x] **T3.8.1 - Cut number-format branch** - What: Formatting helpers isolated from main. How: git checkout -b feat/number-format from main.
- [x] **T3.8.2 - Scaffold format module** - What: One ES module owns all number rendering. How: Create src/lib/format.js exporting named pure functions, no side effects.
- [x] **T3.8.3 - formatPrice function** - What: Prices show a fixed, instrument-appropriate decimal count. How: Implement formatPrice(value, decimals) with toFixed and a NaN guard returning '-'.
- [x] **T3.8.4 - formatSigned function** - What: Gains always show an explicit plus sign. How: Implement formatSigned(value, decimals) prefixing + for positives on top of formatPrice.
- [x] **T3.8.5 - formatCompact function** - What: Big sizes read as 1.2K or 3.4M in tight cells. How: Implement formatCompact(value) with Intl.NumberFormat notation 'compact', maximumFractionDigits 1.
- [x] **T3.8.6 - formatPct function** - What: PnL percentages read with sign and two decimals. How: Implement formatPct(value) composing formatSigned with a trailing % suffix.
- [x] **T3.8.7 - Register formatters with Spektrum** - What: Templates format numbers inline without imports. How: defineFn each of the four so {{ formatSigned(price) }} works in bindings.
- [x] **T3.8.8 - Single unit tests per formatter** - What: Each function locked by exactly one test. How: Write one Vitest test per function in tests/format.test.js and run each via npx vitest run -t formatPrice etc.
- [x] **T3.8.9 - Demo price cell verify** - What: Formatting proven live in a bound cell. How: Bind a dev block cell to {{ formatSigned(price) }} with .sz-num and check alignment on Vite dev.
- [x] **T3.8.10 - Merge formatters to main** - What: All data phases share one formatting brain. How: Merge feat/number-format into main when targeted tests and lint pass.

### F3.9 - Theme-Aware Utility Classes

**What:** Fast composition of text, background and border styles that automatically follow the day/night theme.
**How:** sz- prefixed utility classes that reference only var() tokens, so a data-theme swap restyles them with zero extra classes.

- [x] **T3.9.1 - Cut theme-utilities branch** - What: Utility layer isolated from main. How: git checkout -b feat/theme-utilities from main.
- [x] **T3.9.2 - Text color utilities** - What: One class colors any text semantically. How: Add .sz-text-green/.sz-text-orange/.sz-text-dim/.sz-text-faint referencing ink and ramp tokens.
- [x] **T3.9.3 - Background utilities** - What: Surfaces switch depth with one class. How: Add .sz-bg-0/.sz-bg-1/.sz-bg-2 plus .sz-bg-profit/.sz-bg-loss tints from status tokens.
- [x] **T3.9.4 - Border utilities** - What: Hairline edges applied in one class. How: Add .sz-border, .sz-border-green and .sz-border-orange using --sz-border-hair and ramp tokens.
- [x] **T3.9.5 - Composite state utilities** - What: Common state looks become single classes. How: Add .sz-cell-profit/.sz-cell-loss combining text, tint and glow tokens for data cells.
- [x] **T3.9.6 - Theme resolution check** - What: Utilities restyle instantly when the theme flips. How: Toggle data-theme between day and night in DevTools and confirm every utility follows via var() only.
- [x] **T3.9.7 - Utility cheat-sheet block** - What: Developers see every utility rendered live. How: Dev-only block iterating a utility-name array with Spektrum data-each, each row styled by its own class.
- [x] **T3.9.8 - Naming convention header** - What: The utility layer stays predictable as it grows. How: Document the sz- prefix and element-modifier ordering in a comment atop utilities.css.
- [x] **T3.9.9 - Bundle size and lint check** - What: Utilities stay featherweight. How: Run npm run build, confirm the CSS chunk stays small in Vite output, and run npx eslint . clean.
- [x] **T3.9.10 - Merge utilities to main** - What: Every phase composes styling from shared classes. How: Merge feat/theme-utilities into main when checks are green.

### F3.10 - Palette Contrast Verification

**What:** Guaranteed readable text in both day and night variants, so no trade info ever disappears into the background.
**How:** WCAG contrast functions in src/lib/contrast.js, a Node 22 check script over a token-pair manifest, wired as an npm script.

- [x] **T3.10.1 - Cut contrast-audit branch** - What: The audit runs without disturbing main. How: git checkout -b feat/contrast-audit from main.
- [x] **T3.10.2 - relativeLuminance function** - What: A correct luminance base for all contrast math. How: Implement relativeLuminance(hex) in src/lib/contrast.js per the WCAG sRGB formula.
- [x] **T3.10.3 - contrastRatio function** - What: Any two colors get a trustworthy ratio. How: Implement contrastRatio(fgHex, bgHex) as (L1+0.05)/(L2+0.05) over relativeLuminance.
- [x] **T3.10.4 - Single unit tests for contrast math** - What: Both functions locked by one test each. How: Write one Vitest test per function and run npx vitest run tests/contrast.test.js -t contrastRatio and -t relativeLuminance.
- [x] **T3.10.5 - Token pair manifest** - What: The exact combinations that must stay readable are explicit. How: Create scripts/contrast-pairs.json listing ink-on-bg and status-on-bg pairs for day and night.
- [x] **T3.10.6 - Contrast check script** - What: One command audits the whole palette. How: Write scripts/check-contrast.mjs (Node 22) that evaluates every pair and exits non-zero below 4.5:1 (3:1 for large text).
- [x] **T3.10.7 - npm run check:contrast** - What: The audit is one keystroke for any developer. How: Add a check:contrast script entry to package.json invoking the Node script.
- [x] **T3.10.8 - Fix night-variant failures** - What: Night mode passes every pair. How: Nudge failing night token values in tokens.css and re-run npm run check:contrast until green.
- [x] **T3.10.9 - Fix day-variant failures** - What: Day mode passes every pair too. How: Adjust day-scope token overrides and re-run the check plus a visual pass on the Vite dev server.
- [x] **T3.10.10 - Merge contrast audit to main** - What: The palette ships proven readable and stays checkable forever. How: Merge feat/contrast-audit into main with targeted tests and the check green.

---

## Phase 4 - Dashboard Grid Shell

**What:** A uniform grid of same-size blocks so the whole desk is scannable at a glance.
**How:** CSS Grid auto-fill layout of equal cells between fixed header and footer, rendered from a Spektrum block registry with data-each.

### F4.1 - Equal-Cell Grid Layout

**What:** Every dashboard block gets the exact same footprint, so the eye finds anything in one sweep.
**How:** A page frame of grid-template-rows auto/1fr/auto over 100dvh with a repeat(auto-fill, minmax()) main grid and fixed grid-auto-rows.

- [x] **T4.1.1 - Cut grid-shell branch** - What: Layout work isolated from main. How: git checkout -b feat/grid-shell from an up-to-date main.
- [x] **T4.1.2 - Page frame rows** - What: Header and footer stay pinned while blocks own the middle. How: In src/styles/layout.css set the body wrapper to display grid, grid-template-rows auto 1fr auto over 100dvh.
- [x] **T4.1.3 - Auto-fill cell columns** - What: Cells fill any screen edge-to-edge with equal widths. How: Give .sz-grid grid-template-columns repeat(auto-fill, minmax(var(--sz-cell-min), 1fr)).
- [x] **T4.1.4 - Uniform cell height** - What: Every block is the same height as its neighbors. How: Set grid-auto-rows to a fixed --sz-cell-h token so rows never stretch to content.
- [x] **T4.1.5 - Token-driven gaps** - What: Grid spacing matches the phase 3 density system. How: Apply gap and padding on .sz-grid from --sz-gap and --sz-space tokens only.
- [x] **T4.1.6 - Placeholder cell fixture** - What: The wrap behavior is visible before real blocks exist. How: Render eight dummy .sz-block divs in index.html to exercise multi-row wrapping.
- [x] **T4.1.7 - Partial-row equality check** - What: A last row of two blocks matches the size of full rows. How: Verify auto-fill keeps orphan cells identical and pin minmax values if they drift.
- [x] **T4.1.8 - Resize sweep** - What: The grid stays uniform from narrow to ultrawide. How: Drag the Vite dev server window across widths and confirm no cell ever differs in size.
- [x] **T4.1.9 - Lint and build verify** - What: The shell ships clean. How: Run npx eslint . and npm run build (Vite) with zero warnings.
- [x] **T4.1.10 - Merge grid shell to main** - What: All block features build on a proven frame. How: Merge feat/grid-shell into main once checks are green.

### F4.2 - Spektrum Block Registry

**What:** The set of dashboard blocks lives in one data structure, so the desk renders and reshapes from state alone.
**How:** A blocks array in Spektrum state (setValue) rendered through a data-each template, with a pure selectVisible filter behind a computed.

- [x] **T4.2.1 - Cut block-registry branch** - What: Registry work isolated from main. How: git checkout -b feat/block-registry from main.
- [x] **T4.2.2 - Registry state module** - What: One authoritative list of blocks. How: Create src/state/blocks.js calling setValue('blocks', []) with entries shaped {id, type, title, status, visible}.
- [x] **T4.2.3 - Seed default blocks** - What: A fresh desk opens with a sensible starter layout. How: Seed placeholder entries (watchlist, chart, tape, orders) in blocks.js for later phases to claim.
- [x] **T4.2.4 - selectVisible pure function** - What: Visibility filtering has one testable source of truth. How: Write selectVisible(blocks) in src/lib/blocks-util.js returning only entries with visible true.
- [x] **T4.2.5 - visibleBlocks computed** - What: The grid reacts automatically when visibility changes. How: Register computed('visibleBlocks') deriving from the blocks state via selectVisible.
- [x] **T4.2.6 - data-each block template** - What: Blocks appear on screen straight from state. How: Add a data-each="visibleBlocks" template stamping one .sz-block per entry, wired with bindDOM and run in main.js.
- [x] **T4.2.7 - Cloak and refs** - What: No flash of raw templates, and each block is addressable. How: Put data-cloak on the grid container and data-ref="block-{{block.id}}" on each cell.
- [x] **T4.2.8 - Single unit test for selectVisible** - What: The filter is locked by exactly one test. How: Write its one Vitest test and run npx vitest run tests/blocks-util.test.js -t selectVisible.
- [x] **T4.2.9 - Devtools reactivity check** - What: Registry edits repaint the grid instantly. How: Load spektrum/devtools, mutate the blocks state live and watch the data-each re-render.
- [x] **T4.2.10 - Merge registry to main** - What: Every later block plugs into one registry. How: Merge feat/block-registry into main when the targeted test and lint pass.

### F4.3 - Block Chrome Component

**What:** Every block wears the same slim title bar with a status LED and action icons, so state reads at a glance.
**How:** A shared chrome partial inside the data-each template using {{block.title}}, a status-token LED via :class, and sprite icons.

- [x] **T4.3.1 - Cut block-chrome branch** - What: Chrome work isolated from main. How: git checkout -b feat/block-chrome from main.
- [x] **T4.3.2 - Chrome markup partial** - What: Title bar, LED slot, actions slot and body slot in every block. How: Extend the block template with .sz-block-head ({{block.title}}, LED, actions) above .sz-block-body.
- [x] **T4.3.3 - Status LED binding** - What: A glance at the LED tells each block's health. How: Bind :class on the LED span mapping block.status to .sz-led-profit/.sz-led-warn/.sz-led-loss/.sz-led-neutral from status tokens.
- [x] **T4.3.4 - Action icons from sprite** - What: Gear and bolt actions sit ready in every title bar. How: Render {{ icon('gear') }} and {{ icon('bolt') }} via the phase 3 defineFn icon helper.
- [x] **T4.3.5 - Action event stubs** - What: Icon clicks emit events later features can catch. How: Add data-action="block:menu" and data-action="block:quick" firing Spektrum trigger with the block id payload.
- [x] **T4.3.6 - Hover reveal of actions** - What: Chrome stays quiet until the cursor arrives. How: Fade action icons in on .sz-block:hover using the --sz-motion-fast transition token.
- [x] **T4.3.7 - Chrome density styling** - What: The bar costs minimal vertical space. How: Style head height, --sz-block-pad padding and a --sz-border-hair divider from density tokens.
- [x] **T4.3.8 - Day/night chrome check** - What: Chrome stays crisp in both themes. How: Toggle data-theme in DevTools and verify LED, icons and divider contrast in each variant.
- [x] **T4.3.9 - Lint and build verify** - What: Chrome ships clean. How: Run npx eslint . plus npm run build and inspect chrome on the Vite dev server.
- [x] **T4.3.10 - Merge chrome to main** - What: All feature blocks inherit uniform chrome for free. How: Merge feat/block-chrome into main when green.

### F4.4 - Responsive Column Count

**What:** The desk shows 1, 2, 3 or 4 columns depending on available width, always with equal-size blocks.
**How:** container-type inline-size on the grid wrapper with @container breakpoints switching explicit column templates.

- [x] **T4.4.1 - Cut responsive-columns branch** - What: Breakpoint work isolated from main. How: git checkout -b feat/responsive-columns from main.
- [x] **T4.4.2 - Breakpoint tokens** - What: Column switch points are named, not magic numbers. How: Add --sz-bp-2/--sz-bp-3/--sz-bp-4 width tokens to tokens.css.
- [x] **T4.4.3 - Container query context** - What: Columns respond to the grid's own width, not the viewport. How: Set container-type: inline-size and container-name: deskgrid on the grid wrapper.
- [x] **T4.4.4 - One and two column tiers** - What: Phones and split screens get readable stacks. How: Write @container deskgrid rules pinning grid-template-columns to 1 then 2 equal fr tracks.
- [x] **T4.4.5 - Three and four column tiers** - What: Laptops and ultrawides use all their space. How: Add @container rules for 3 and 4 equal fr tracks above --sz-bp-3 and --sz-bp-4.
- [x] **T4.4.6 - Per-tier cell height** - What: Blocks keep useful proportions at every tier. How: Override --sz-cell-h inside each @container tier so cells stay same-size within a tier.
- [x] **T4.4.7 - Per-tier gap tuning** - What: Density feels right from phone to ultrawide. How: Scale --sz-gap per tier using the phase 3 spacing scale.
- [x] **T4.4.8 - Responsive sweep verify** - What: Every tier proven at real device widths. How: Use Chrome DevTools responsive mode at 390, 820, 1280 and 2560px and confirm 1/2/3/4 columns of equal cells.
- [x] **T4.4.9 - Lint and build verify** - What: Breakpoint CSS ships clean. How: Run npx eslint . and npm run build with no warnings.
- [x] **T4.4.10 - Merge responsive columns to main** - What: The desk fits every screen traders use. How: Merge feat/responsive-columns into main when green.

### F4.5 - Skeleton Shimmer Loading State

**What:** Blocks waiting on data show a calm terminal shimmer instead of blank holes, so the desk never looks broken.
**How:** A data-if skeleton template keyed on block.status 'loading' with an sz-shimmer gradient animation and an addAsync demo loader.

- [x] **T4.5.1 - Cut block-skeleton branch** - What: Loading-state work isolated from main. How: git checkout -b feat/block-skeleton from main.
- [x] **T4.5.2 - Loading status semantics** - What: One agreed lifecycle for block readiness. How: Document status values loading/ready/empty/error in a comment atop src/state/blocks.js and seed new blocks as loading.
- [x] **T4.5.3 - Skeleton template** - What: Loading blocks render placeholder bones. How: Add a data-if="block.status === 'loading'" branch in the block body template.
- [x] **T4.5.4 - Shimmer keyframes** - What: A moving sheen signals live loading. How: Add @keyframes sz-shimmer translating a dim-green linear-gradient across skeleton bars.
- [x] **T4.5.5 - Skeleton bone layout** - What: The skeleton previews the block's real shape. How: Style title-width and body-row bars with density tokens matching the chrome proportions.
- [x] **T4.5.6 - Reduced-motion skeleton** - What: Motion-sensitive users get a static placeholder. How: Under prefers-reduced-motion: reduce, freeze sz-shimmer to a flat tint.
- [x] **T4.5.7 - addAsync demo loader** - What: The full loading-to-ready flow is demonstrable now. How: Register a Spektrum addAsync fake fetch that flips a block's status to ready after a delay.
- [x] **T4.5.8 - Minimum display time** - What: Fast loads never strobe the skeleton. How: Keep the skeleton visible at least 150ms via a timestamp check before flipping to ready.
- [x] **T4.5.9 - Slow-loader verify** - What: Shimmer proven under throttled conditions. How: Set the demo loader delay to 3s on the Vite dev server and inspect the shimmer frame rate.
- [x] **T4.5.10 - Merge skeleton to main** - What: Every data block gets a loading look for free. How: Merge feat/block-skeleton into main when lint and build pass.

### F4.6 - Empty and Error States

**What:** Blocks with no data or a failed feed say so in terse terminal language with a one-click retry, never a silent blank.
**How:** data-if branches for status empty and error, Spektrum attempt() around loaders, and a block:retry data-action trigger.

- [x] **T4.6.1 - Cut block-states branch** - What: State-rendering work isolated from main. How: git checkout -b feat/block-states from main.
- [x] **T4.6.2 - Empty-state template** - What: An empty block explains itself instantly. How: Add a data-if="block.status === 'empty'" branch showing a dim icon plus a NO DATA line.
- [x] **T4.6.3 - Empty-state styling** - What: Empty reads as calm, not alarming. How: Style with --sz-ink-faint, centered layout, no glow, using density tokens.
- [x] **T4.6.4 - Error-state template** - What: A failed block is unmissable. How: Add a data-if="block.status === 'error'" branch with the skull sprite icon and --sz-status-loss orange accents.
- [x] **T4.6.5 - attempt() error capture** - What: Loader crashes become visible error states, not dead blocks. How: Wrap block loaders in Spektrum attempt() setting status error and storing the message on the entry.
- [x] **T4.6.6 - Retry action wiring** - What: One click re-runs a failed feed. How: Add data-action="block:retry" on the error branch firing trigger to re-invoke that block's addAsync loader.
- [x] **T4.6.7 - Terse microcopy pass** - What: Messages match the terminal voice and stay scannable. How: Write all-caps strings like FEED DOWN - RETRY and NO DATA, max one line each.
- [x] **T4.6.8 - Forced-failure verify** - What: The whole error path proven end to end. How: Throw inside the demo loader on the Vite dev server, see skull state, click retry, see recovery.
- [x] **T4.6.9 - Lint and build verify** - What: State branches ship clean. How: Run npx eslint . and npm run build with zero warnings.
- [x] **T4.6.10 - Merge block states to main** - What: Every future feed failure has a face and a fix. How: Merge feat/block-states into main when green.

### F4.7 - Footer Component

**What:** A slim footer crediting Neko Media with LinkedIn, npm and GitHub links, closing the frame of the desk.
**How:** A footer row in the page grid with wordmark plus inline SVG icon links from the sprite, glowing on hover.

- [x] **T4.7.1 - Cut footer branch** - What: Footer work isolated from main. How: git checkout -b feat/footer from main.
- [x] **T4.7.2 - Footer markup** - What: The desk is signed by its maker. How: Add a footer element in the page grid's bottom row with a Neko Media wordmark and current year.
- [x] **T4.7.3 - Social icons in sprite** - What: Recognizable LinkedIn, npm and GitHub marks. How: Draw the three symbols into src/assets/sprite.svg on the 24px currentColor grid.
- [x] **T4.7.4 - Icon link wiring** - What: One click reaches Neko Media's profiles safely. How: Wrap each {{ icon(name) }} in an anchor with href, target="_blank" and rel="noopener noreferrer".
- [x] **T4.7.5 - Footer layout** - What: Brand left, links right, never taller than one line. How: Flex row with space-between, --sz-space padding and a --sz-border-hair top divider.
- [x] **T4.7.6 - Hover glow accents** - What: Links respond with the terminal's signature flare. How: Apply .sz-glow-text on anchor hover with the --sz-motion-fast transition token.
- [x] **T4.7.7 - Accessible labels** - What: Screen readers announce each destination. How: Add aria-label="LinkedIn"/"npm"/"GitHub" to the icon anchors.
- [x] **T4.7.8 - Day/night footer check** - What: The footer holds contrast in both themes. How: Toggle data-theme and verify wordmark and icons against contrast expectations in each variant.
- [x] **T4.7.9 - Lint and build verify** - What: The footer ships clean. How: Run npx eslint . plus npm run build and review on the Vite dev server.
- [x] **T4.7.10 - Merge footer to main** - What: The page frame is complete top to bottom. How: Merge feat/footer into main when green.

### F4.8 - Block Visibility Toggles

**What:** Traders show or hide any block instantly, and their layout choice survives reloads.
**How:** A toggle panel of data-model checkboxes, a toggleBlock function, and spektrum/persist syncing the flags to localStorage.

- [x] **T4.8.1 - Cut block-toggles branch** - What: Visibility work isolated from main. How: git checkout -b feat/block-toggles from main.
- [x] **T4.8.2 - Toggle panel markup** - What: One list controls every block's presence. How: Render a panel with data-each over blocks, each row a checkbox bound via data-model="block.visible".
- [x] **T4.8.3 - toggleBlock function** - What: A single tested entry point flips visibility. How: Write toggleBlock(id) in src/state/blocks.js flipping the entry's visible flag through setValue.
- [x] **T4.8.4 - Panel action wiring** - What: Checkbox clicks route through the one function. How: Bind data-action on rows to call toggleBlock with the row's block id.
- [x] **T4.8.5 - Persist visibility flags** - What: The chosen layout is still there tomorrow. How: Wire spektrum/persist to sync the blocks state to the localStorage key stockz.blocks.
- [x] **T4.8.6 - Hydration order check** - What: Saved choices beat seed defaults on load. How: Ensure persist restore runs before bindDOM/run in main.js and verify with a prepared localStorage value.
- [x] **T4.8.7 - Single unit test for toggleBlock** - What: The flip logic locked by exactly one test. How: Write its one Vitest test and run npx vitest run tests/blocks.test.js -t toggleBlock.
- [x] **T4.8.8 - Reflow polish** - What: Blocks appear and vanish without the page jumping. How: Let the grid reflow under a 150ms --sz-motion-base transition and confirm scroll position holds.
- [x] **T4.8.9 - Toggle-reload verify** - What: The full cycle proven: hide, reload, still hidden. How: Toggle blocks on the Vite dev server, hard-reload, and confirm restored visibility.
- [x] **T4.8.10 - Merge toggles to main** - What: Personal desk layouts become a core capability. How: Merge feat/block-toggles into main when targeted test and lint pass.

### F4.9 - Scroll Containment

**What:** Content scrolls inside its own block while the page itself never scrolls sideways, keeping the desk rock solid.
**How:** overflow auto plus overscroll-behavior contain on block bodies, min-width 0 on cells, and a styled thin terminal scrollbar.

- [x] **T4.9.1 - Cut scroll-containment branch** - What: Scroll work isolated from main. How: git checkout -b feat/scroll-containment from main.
- [x] **T4.9.2 - Block body scroll rules** - What: Long content scrolls privately per block. How: Set overflow auto and overscroll-behavior contain on .sz-block-body so wheel momentum never leaks to the page.
- [x] **T4.9.3 - Page overflow guard** - What: Horizontal page scroll becomes impossible. How: Set overflow-x hidden on html and body and keep the page frame at max-width 100%.
- [x] **T4.9.4 - min-width zero fix** - What: Wide tables can never stretch grid cells. How: Add min-width 0 (and min-height 0) to .sz-block so grid tracks stay authoritative.
- [x] **T4.9.5 - Terminal scrollbar styling** - What: Scrollbars match the money-hacker look. How: Style scrollbar-width thin and scrollbar-color green-on-black plus matching ::-webkit-scrollbar rules.
- [x] **T4.9.6 - Stable scrollbar gutter** - What: Content never shifts when a scrollbar appears. How: Apply scrollbar-gutter stable on .sz-block-body.
- [x] **T4.9.7 - Wide-content fixture** - What: The worst case is on hand for testing. How: Add a dev block containing an oversized pre table wider than any cell.
- [x] **T4.9.8 - Keyboard scroll access** - What: Blocks scroll without a mouse. How: Add tabindex="0" plus the --sz-focus outline token on scrollable block bodies.
- [x] **T4.9.9 - Breakpoint sweep verify** - What: Zero sideways page scroll at any width. How: Sweep DevTools responsive mode at all four column tiers with the wide fixture active.
- [x] **T4.9.10 - Merge containment to main** - What: Feeds and tables can grow without breaking the desk. How: Merge feat/scroll-containment into main when green.

### F4.10 - Registry Mutation API

**What:** Blocks can be added, removed and reordered programmatically, powering settings screens and future drag features.
**How:** Pure addBlock/removeBlock/reorderBlocks functions on the Spektrum registry, exposed via defineFn, each with a single Vitest test.

- [x] **T4.10.1 - Cut registry-api branch** - What: Mutation work isolated from main. How: git checkout -b feat/registry-api from main.
- [x] **T4.10.2 - addBlock function** - What: New blocks join the desk at runtime. How: Write addBlock(def) in src/state/blocks.js appending via addValue with a duplicate-id guard.
- [x] **T4.10.3 - removeBlock function** - What: Any block can be dismissed cleanly. How: Write removeBlock(id) replacing the array through setValue with the entry filtered out.
- [x] **T4.10.4 - reorderBlocks function** - What: The desk order becomes rearrangeable. How: Write reorderBlocks(from, to) producing a new array via splice and committing it with setValue.
- [x] **T4.10.5 - Bounds and id validation** - What: Bad calls can never corrupt the layout. How: Return the state unchanged for unknown ids or out-of-range indices in all three functions.
- [x] **T4.10.6 - Template-callable mutations** - What: Chrome menus and panels can mutate the registry directly. How: Register the three functions with Spektrum defineFn and route data-action events to them.
- [x] **T4.10.7 - Single unit tests per mutation** - What: Each mutation locked by exactly one test. How: Write one Vitest test per function in tests/blocks.test.js, run via npx vitest run -t addBlock, -t removeBlock, -t reorderBlocks.
- [x] **T4.10.8 - Persist interplay check** - What: Mutations survive a reload like toggles do. How: Add and reorder blocks on the Vite dev server, hard-reload, and confirm spektrum/persist restored the result.
- [x] **T4.10.9 - Lint and targeted test verify** - What: The API ships clean and covered. How: Run npx eslint . plus the three targeted vitest runs, all green.
- [x] **T4.10.10 - Merge registry API to main** - What: Later phases mount their blocks through one stable API. How: Merge feat/registry-api into main when checks pass.

---

## Phase 5 - Header, Branding & Navigation

**What:** Instant orientation: logo, nav, settings and market status one glance away at all times.
**How:** Fixed Spektrum-bound header bar with inline-SVG STOCKZ wordmark, section nav, settings gear, theme slot, venue LEDs, PnL ticker and clocks.

### F5.1 - Fixed header shell with STOCKZ glow wordmark

**What:** A permanent branded top bar so the trader always knows where they are and where every control lives.
**How:** position:fixed header in index.html with left/center/right flex zones and a hand-coded inline SVG wordmark glowing via CSS drop-shadow tokens.

- [x] **T5.1.1 - Cut header shell branch** - What: Isolated line of work for the header shell. How: git checkout -b feature/header-shell from main and push with -u origin.
- [x] **T5.1.2 - Scaffold header module** - What: A mountable header entry point later features plug into. How: Create src/ui/header/header.js exporting mountHeader(root) and import it from main.js.
- [x] **T5.1.3 - Build fixed bar markup** - What: A bar pinned above the grid through any scroll. How: Add header element with data-ref="header", three flex zones, position:fixed and z-index above grid blocks.
- [x] **T5.1.4 - Hand-code SVG wordmark** - What: A crisp STOCKZ logo at any DPI with zero image requests. How: Write src/ui/header/wordmark.js exporting wordmarkSvg() returning inline SVG path markup.
- [x] **T5.1.5 - Apply green/orange glow** - What: The money-hacker brand glow on the logo. How: Style the wordmark with filter: drop-shadow using --glow-green and --glow-orange tokens from the phase 3 system.
- [x] **T5.1.6 - Wire logo home action** - What: One click on the logo returns to the Dashboard. How: Add data-action="goHome" on the wordmark calling Spektrum trigger('nav:goto', 'dashboard').
- [x] **T5.1.7 - Offset the page body** - What: Grid content never hides under the fixed bar. How: Set body padding-top to var(--header-height) and define that custom property in header.css.
- [x] **T5.1.8 - Lint header modules** - What: Header code held to project style from day one. How: Run npx eslint src/ui/header and fix every reported issue.
- [x] **T5.1.9 - Unit-test shell functions** - What: mountHeader and wordmarkSvg each locked by exactly one test. How: Write one Vitest test per function and run vitest run -t mountHeader then -t wordmarkSvg.
- [x] **T5.1.10 - Merge shell to main** - What: The shell lands as the base for all later header features. How: Verify render in the Vite dev server, then merge feature/header-shell into main.

### F5.2 - Section nav toggling block sets

**What:** One-click jumps between Dashboard, Trade, Journal and Analytics without any page load.
**How:** Nav links rendered with data-each from a sections model, writing ui.section in Spektrum so grid blocks show or hide via data-if.

- [x] **T5.2.1 - Branch off nav work** - What: Nav development kept off main until green. How: git checkout -b feature/header-nav from freshly pulled main.
- [x] **T5.2.2 - Define sections model** - What: A single source of truth for app sections. How: Create src/ui/header/nav-model.js exporting navSections() returning {id,label} for dashboard, trade, journal, analytics.
- [x] **T5.2.3 - Render nav links** - What: Visible section links in the header center zone. How: Use Spektrum data-each over navSections() output producing one anchor per section with data-action="navGoto".
- [x] **T5.2.4 - Implement navigate handler** - What: Clicking a link switches the active section instantly. How: Add navigate(id) in nav.js calling setValue('ui.section', id), bound through data-action.
- [x] **T5.2.5 - Compute active link state** - What: The current section is always visually obvious. How: Spektrum computed per link driving :class="active" and aria-current="page" from ui.section.
- [x] **T5.2.6 - Gate grid block sets** - What: Each section shows only its own dashboard blocks. How: Tag phase 4 grid block templates with data-if comparing their section id against ui.section.
- [x] **T5.2.7 - Sync location.hash** - What: Deep links like #trade restore the right section on load. How: Write hash in navigate(), read it at boot, and listen to hashchange to call setValue.
- [x] **T5.2.8 - Style active underline** - What: A snappy terminal-style cue for the current section. How: Orange underline slide-in using a transform transition plus green text glow on hover.
- [x] **T5.2.9 - Single tests for nav functions** - What: navSections and navigate each covered by one test. How: One Vitest test per function, executed via vitest run -t navSections and -t navigate.
- [x] **T5.2.10 - Green-merge nav branch** - What: Section switching available to everyone on main. How: Run the two targeted tests plus eslint, then merge feature/header-nav into main.

### F5.3 - Settings gear and drawer trigger

**What:** Settings reachable in one click from anywhere, without leaving the trading view.
**How:** A gear icon button in the right zone flipping ui.settingsOpen and firing a Spektrum trigger the phase 7 drawer listens to.

- [x] **T5.3.1 - Start gear branch** - What: Gear work isolated from other header features. How: git checkout -b feature/header-settings-gear off main.
- [x] **T5.3.2 - Draw gear icon module** - What: A sharp vector gear matching the terminal look. How: Create src/ui/header/gear-icon.js exporting gearIconSvg() with an inline SVG cog path.
- [x] **T5.3.3 - Place gear button** - What: A labeled, clickable gear in the header right zone. How: Button element with data-action="openSettings" and aria-label="Settings" rendered by mountHeader.
- [x] **T5.3.4 - Implement drawer toggle** - What: The gear opens and closes the settings drawer. How: toggleSettingsDrawer() flipping ui.settingsOpen via setValue and firing trigger('settings:open').
- [x] **T5.3.5 - Add Escape close path** - What: Escape instantly dismisses the drawer for keyboard traders. How: keydown listener that sets ui.settingsOpen false when the drawer is open and Escape is pressed.
- [x] **T5.3.6 - Animate hover spin** - What: Tactile feedback that the gear is interactive. How: CSS transition rotating the cog 45deg on :hover with 120ms ease-out, no JS.
- [x] **T5.3.7 - Show unsaved dot** - What: A hint when settings changed but are not yet persisted. How: Small orange badge span gated by data-if="settings.dirty" on the gear button.
- [x] **T5.3.8 - Style focus ring** - What: Clear keyboard focus without breaking the dark aesthetic. How: outline using --glow-green token on :focus-visible for the gear button.
- [x] **T5.3.9 - Unit-test gear functions** - What: gearIconSvg and toggleSettingsDrawer each pinned by one test. How: One Vitest test apiece, run with vitest run -t gearIconSvg and -t toggleSettingsDrawer.
- [x] **T5.3.10 - Land gear on main** - What: Settings access shipped for the drawer feature to hook into. How: Confirm open/close in Vite dev, then merge feature/header-settings-gear to main.

### F5.4 - Day/night toggle slot

**What:** A reserved, correctly placed home for the theme switch so phase 6 drops in without layout churn.
**How:** A data-ref slot in the header right zone with a mount function and a placeholder button firing trigger('theme:toggle').

- [x] **T5.4.1 - Open slot branch** - What: Slot work tracked separately until merge. How: git checkout -b feature/header-theme-slot from main.
- [x] **T5.4.2 - Reserve slot element** - What: A stable anchor point for the theme control. How: Add span with data-ref="themeSlot" between the gear and the LEDs in the right zone markup.
- [x] **T5.4.3 - Export mount function** - What: Phase 6 can inject its toggle with one call. How: mountThemeSlot(componentEl) in header.js replacing slot children with the given element.
- [x] **T5.4.4 - Add placeholder button** - What: Theme flipping works even before phase 6 ships. How: Temporary button in the slot firing Spektrum trigger('theme:toggle') on click.
- [x] **T5.4.5 - Bind pressed state** - What: Assistive tech knows which mode is active. How: :aria-pressed bound to the expression ui.theme === 'night' in the slot markup.
- [x] **T5.4.6 - Add tooltip title** - What: Discoverability of the control and its hotkey. How: title attribute "Toggle day/night (T)" set on the slot button.
- [x] **T5.4.7 - Match icon sizing** - What: Visual rhythm across all right-zone icons. How: CSS sizing the slot to the shared 32px hit area and gap used by the gear.
- [x] **T5.4.8 - Verify tab order** - What: Logical keyboard flow gear, theme, LEDs. How: Check natural DOM order gives the expected focus sequence in Chrome and fix markup order if not.
- [x] **T5.4.9 - Unit-test slot mount** - What: mountThemeSlot pinned by its single test. How: One Vitest test asserting child replacement, run via vitest run -t mountThemeSlot.
- [x] **T5.4.10 - Merge slot branch** - What: A ready socket on main for the phase 6 toggle. How: Merge feature/header-theme-slot after the targeted test and eslint pass.

### F5.5 - Venue connection LEDs

**What:** Socket health for OKX and EToro visible at a glance, so dead feeds never surprise a scalper mid-trade.
**How:** Two labeled LED dots bound to conn.okx.status and conn.etoro.status Spektrum values written by the phase 9/10 connectors.

- [x] **T5.5.1 - Branch LED feature** - What: LED work sandboxed from main. How: git checkout -b feature/header-leds off main.
- [x] **T5.5.2 - Build LED markup** - What: Two compact status dots labeled OKX and EToro. How: Right-zone spans with data-ref="ledOkx"/"ledEtoro", each an 8px dot plus tiny venue label.
- [x] **T5.5.3 - Declare status contract** - What: A stable state shape connectors can fill later. How: setValue defaults conn.okx.status and conn.etoro.status to 'down', documented in src/state/conn.js.
- [x] **T5.5.4 - Map status to class** - What: Color always mirrors real socket state. How: ledClass(status) returning led-up, led-connecting or led-down, bound with a Spektrum computed on :class.
- [x] **T5.5.5 - Blink reconnecting state** - What: Reconnects are visibly in progress, not silently stuck. How: CSS @keyframes orange blink applied only by the led-connecting class.
- [x] **T5.5.6 - Compute heartbeat tooltip** - What: Hover reveals status plus last heartbeat time. How: computed :title combining status and conn.*.lastBeat formatted as UTC seconds ago.
- [x] **T5.5.7 - Wire click reconnect** - What: A dead venue can be kicked without opening settings. How: data-action on each LED firing trigger('conn:reconnect', venue) for the connectors to consume.
- [x] **T5.5.8 - Style LED glow** - What: LEDs read instantly against both themes. How: box-shadow glow from --glow-green and --glow-orange tokens, dim red via --down token when offline.
- [x] **T5.5.9 - Unit-test ledClass** - What: The status mapping locked by one test. How: Single Vitest test over all three statuses, run with vitest run -t ledClass.
- [x] **T5.5.10 - Merge LEDs to main** - What: Connection visibility live for the venue phases to light up. How: Simulate statuses via setValue in dev, then merge feature/header-leds.

### F5.6 - Equity and day-PnL mini ticker

**What:** Account equity and today's PnL always in view, the scalper's scoreboard while flipping trades.
**How:** Header ticker bound with {{}} expressions to account state, formatted via Intl.NumberFormat and flashed on change through watch.

- [x] **T5.6.1 - Cut ticker branch** - What: Ticker work merged only when green. How: git checkout -b feature/header-ticker from main.
- [x] **T5.6.2 - Lay out ticker markup** - What: Equity and day-PnL side by side near the nav. How: Two bound spans {{fmt.equity}} and {{fmt.dayPnl}} in a ticker container in the center-right zone.
- [x] **T5.6.3 - Compute day PnL** - What: Live day performance derived, never manually synced. How: Spektrum computed acct.dayPnl = acct.equity - acct.dayOpenEquity in src/state/acct.js.
- [x] **T5.6.4 - Write formatter functions** - What: Compact, signed, readable numbers at all magnitudes. How: formatEquity(n) and formatPnl(n) in src/ui/format.js using Intl.NumberFormat compact notation.
- [x] **T5.6.5 - Color by sign** - What: Green gains, orange losses, zero neutral, readable in a blink. How: :class from a computed sign expression mapping to pnl-up, pnl-down, pnl-flat.
- [x] **T5.6.6 - Flash on change** - What: Every equity tick is felt, not hunted for. How: watch('acct.equity') adding a .flash class removed on animationend for a 200ms glow pulse.
- [x] **T5.6.7 - Toggle percent mode** - What: One click switches PnL between absolute and percent. How: data-action flipping ui.tickerMode, with formatPnl branching on that value.
- [x] **T5.6.8 - Hide without keys** - What: No misleading zeros before an API key is loaded. How: data-if="keys.present" on the ticker container, fed by the phase 8 key layer state.
- [x] **T5.6.9 - Unit-test formatters** - What: formatEquity and formatPnl each guarded by one test. How: One Vitest test per function, run via vitest run -t formatEquity and -t formatPnl.
- [x] **T5.6.10 - Merge ticker branch** - What: The scoreboard live on main. How: Drive acct values with setValue in dev to confirm flashes, then merge feature/header-ticker.

### F5.7 - UTC and session clock

**What:** Exchange-true UTC time plus a market-session hint, so entries line up with volatility windows.
**How:** A 1s interval writing clock.now into Spektrum, rendered by pure formatters with a session label chip.

- [x] **T5.7.1 - Branch clock work** - What: Clock feature isolated until verified. How: git checkout -b feature/header-clock off main.
- [x] **T5.7.2 - Build clock engine** - What: A single ticking source of truth for header time. How: startClock() in src/ui/header/clock.js running setInterval 1000ms calling setValue('clock.now', Date.now()).
- [x] **T5.7.3 - Format UTC readout** - What: Unambiguous HH:MM:SS UTC matching venue timestamps. How: formatUtcClock(ms) using Intl.DateTimeFormat with timeZone 'UTC' and hour12 false.
- [x] **T5.7.4 - Derive session hint** - What: Instant context: Asia, London, New York or overlap. How: sessionHint(ms) mapping UTC hour ranges to a session label string.
- [x] **T5.7.5 - Bind clock markup** - What: Time and session visible left of the LEDs. How: Spans bound to {{fmt.utc}} and {{fmt.session}} computeds fed from clock.now.
- [x] **T5.7.6 - Stop width jitter** - What: A rock-steady clock that never nudges neighbors. How: font-variant-numeric: tabular-nums plus fixed ch width on the time span.
- [x] **T5.7.7 - Pause when hidden** - What: Zero wasted timers in background tabs. How: visibilitychange listener stopping the interval on hidden and restarting plus resyncing on visible.
- [x] **T5.7.8 - Highlight overlap window** - What: The high-volatility EU/US overlap pops out. How: Orange chip styling applied via :class when sessionHint returns the overlap label.
- [x] **T5.7.9 - Unit-test clock functions** - What: startClock, formatUtcClock and sessionHint each with one test. How: One Vitest test per function using fake timers, run per test name with vitest run -t.
- [x] **T5.7.10 - Merge clock branch** - What: Session awareness shipped to main. How: Eyeball a minute of ticking in Vite dev, then merge feature/header-clock.

### F5.8 - Keyboard hint and hotkey overlay trigger

**What:** A visible reminder that STOCKZ is keyboard-first, opening the hotkey cheat sheet in one press.
**How:** A kbd icon button plus a global "?" shortcut, both firing trigger('hotkeys:overlay') for the phase 16 overlay.

- [x] **T5.8.1 - Start hint branch** - What: Hint work off main until tests pass. How: git checkout -b feature/header-kbd-hint from main.
- [x] **T5.8.2 - Draw kbd icon** - What: A keycap glyph that reads as "shortcuts here". How: kbdIconSvg() in src/ui/header/kbd-icon.js returning an inline SVG keycap with a ? legend.
- [x] **T5.8.3 - Place hint button** - What: The shortcut entry point beside the clock. How: Button with data-action="showHotkeys" and aria-label="Keyboard shortcuts" in the right zone.
- [x] **T5.8.4 - Fire overlay trigger** - What: One event any overlay implementation can subscribe to. How: Handler calling Spektrum trigger('hotkeys:overlay'), consumed later by phase 16.
- [x] **T5.8.5 - Guard typing targets** - What: Pressing ? inside an input never hijacks focus. How: isTypingTarget(el) checking input, textarea and contenteditable before the shortcut acts.
- [x] **T5.8.6 - Bind global shortcut** - What: ? opens the overlay from anywhere. How: window keydown listener matching '?' and calling the same handler when isTypingTarget is false.
- [x] **T5.8.7 - Pulse until first use** - What: New users get nudged toward hotkeys once, not forever. How: ui.kbdHintSeen flag synced by spektrum/persist gating a CSS pulse animation.
- [x] **T5.8.8 - Style hint alignment** - What: Icon sits flush with the other right-zone controls. How: Apply the shared 32px hit-area sizing and gap tokens in header.css.
- [x] **T5.8.9 - Unit-test hint functions** - What: kbdIconSvg and isTypingTarget each locked by one test. How: One Vitest test per function, run via vitest run -t kbdIconSvg and -t isTypingTarget.
- [x] **T5.8.10 - Merge hint branch** - What: Hotkey discoverability live on main. How: Confirm trigger fires in spektrum/devtools, then merge feature/header-kbd-hint.

### F5.9 - Scroll density condensing

**What:** More chart pixels while scrolling: the header slims down automatically and returns on scroll-up.
**How:** rAF-throttled scroll listener feeding a pure hysteresis function that flips ui.headerDense and a dense CSS variant.

- [x] **T5.9.1 - Branch density work** - What: Density behavior developed in isolation. How: git checkout -b feature/header-density off main.
- [x] **T5.9.2 - Write hysteresis function** - What: Clean flips with zero flicker at the boundary. How: densityFor(scrollY, current) in density.js returning 'dense' past 64px and 'full' under 24px.
- [x] **T5.9.3 - Attach scroll listener** - What: Density tracks scroll without jank. How: window scroll listener throttled through requestAnimationFrame writing setValue('ui.headerDense', ...).
- [x] **T5.9.4 - Build dense variant CSS** - What: A slimmer bar that keeps every control reachable. How: .header--dense class shrinking --header-height, hiding ticker labels, scaling the wordmark 80%.
- [x] **T5.9.5 - Animate the collapse** - What: A smooth, non-distracting height change. How: 120ms transition on height and transform properties only, avoiding layout-thrash animations.
- [x] **T5.9.6 - Sync body offset** - What: Grid content reflows exactly with the bar height. How: Flip --header-height custom property together with the class so body padding follows.
- [x] **T5.9.7 - Register passive cleanup** - What: No scroll-blocking or leaked listeners. How: addEventListener with passive:true plus a removeEventListener path in the header unmount.
- [x] **T5.9.8 - Respect reduced motion** - What: Motion-sensitive users get instant snaps, not animation. How: Wrap the transition rules in a prefers-reduced-motion: no-preference media query.
- [x] **T5.9.9 - Unit-test densityFor** - What: Hysteresis thresholds pinned by one test. How: Single Vitest test sweeping scrollY values both directions, run via vitest run -t densityFor.
- [x] **T5.9.10 - Merge density branch** - What: Auto-condensing shipped on main. How: Scroll-test against the phase 4 grid in Vite dev, then merge feature/header-density.

### F5.10 - Condensed mobile header

**What:** Full orientation on a phone: logo, LEDs and theme stay visible while secondary items tuck into a menu.
**How:** A matchMedia-driven narrow flag collapsing nav, ticker and clock into an overflow popover below 720px.

- [x] **T5.10.1 - Open mobile branch** - What: Mobile variant built without touching desktop. How: git checkout -b feature/header-mobile from main.
- [x] **T5.10.2 - Bind narrow flag** - What: One reactive value describing viewport class. How: bindNarrowFlag(mql) wiring matchMedia('(max-width: 719px)') change events to setValue('ui.narrow', ...).
- [x] **T5.10.3 - Draw menu icon** - What: A recognizable overflow entry point. How: menuIconSvg() in menu-icon.js returning a three-line inline SVG hamburger.
- [x] **T5.10.4 - Build overflow popover** - What: Nav links and clock still reachable on small screens. How: Popover panel gated by data-if="ui.narrow && ui.menuOpen" reusing the data-each nav rendering.
- [x] **T5.10.5 - Prioritize visible items** - What: Only mission-critical status stays on the bar. How: CSS in the narrow query keeping logo, LEDs and theme slot, moving ticker and clock into the popover.
- [x] **T5.10.6 - Size touch targets** - What: Fat-finger-proof taps during mobile scalping. How: min 44px hit areas on all header buttons inside the max-width 719px media query.
- [x] **T5.10.7 - Pad safe areas** - What: No controls hidden behind an iOS notch. How: padding derived from env(safe-area-inset-top) and inset-left/right on the header element.
- [x] **T5.10.8 - Auto-close on navigate** - What: The menu gets out of the way after a choice. How: watch('ui.section') setting ui.menuOpen false whenever the section changes.
- [x] **T5.10.9 - Unit-test mobile functions** - What: bindNarrowFlag and menuIconSvg each held by one test. How: One Vitest test per function with a stubbed mql, run via vitest run -t per name.
- [x] **T5.10.10 - Merge mobile branch** - What: A phone-ready header on main. How: Check 375px and 719px widths in Chrome device mode, then merge feature/header-mobile.

---

## Phase 6 - Day/Night Theme Engine

**What:** Comfortable screens across long sessions: hacker-dark nights, clean bright days.
**How:** CSS custom-property theme sets flipped on :root by Spektrum state, persisted via spektrum/persist and defaulting to prefers-color-scheme.

### F6.1 - Persisted theme state store

**What:** The chosen theme survives reloads, restarts and even other tabs, so night mode is set once and stays.
**How:** A ui.theme value in Spektrum synced to localStorage through spektrum/persist, with a validated setTheme function and a theme:changed trigger.

- [x] **T6.1.1 - Cut theme state branch** - What: State work isolated until proven. How: git checkout -b feature/theme-state from freshly pulled main.
- [x] **T6.1.2 - Scaffold state module** - What: One home for all theme state logic. How: Create src/theme/state.js registering ui.theme with setValue and a 'night' default.
- [x] **T6.1.3 - Implement setTheme** - What: Theme changes go through one validated gate. How: setTheme(name) accepting only 'day', 'night' or 'auto', ignoring anything else, then calling setValue.
- [x] **T6.1.4 - Wire persist sync** - What: The choice written to disk automatically. How: Configure spektrum/persist to mirror ui.theme under the stockz.settings localStorage namespace.
- [x] **T6.1.5 - Sanitize stored values** - What: A corrupted localStorage entry can never break boot. How: sanitizeTheme(raw) coercing unknown persisted strings back to 'night' before first setValue.
- [x] **T6.1.6 - Broadcast changes** - What: Every subsystem hears about theme flips the same way. How: Fire Spektrum trigger('theme:changed', name) at the end of every successful setTheme.
- [x] **T6.1.7 - Stamp root attribute** - What: CSS can select palettes off a single attribute. How: watch('ui.theme') writing document.documentElement.dataset.theme on every change.
- [x] **T6.1.8 - Verify multi-tab sync** - What: Flipping theme in one tab flips all tabs. How: Open two Vite dev tabs and confirm the spektrum/persist storage-event sync updates both.
- [x] **T6.1.9 - Unit-test state functions** - What: setTheme and sanitizeTheme each pinned by one test. How: One Vitest test per function, run via vitest run -t setTheme and -t sanitizeTheme.
- [x] **T6.1.10 - Merge state branch** - What: The theme backbone available on main. How: Merge feature/theme-state after the two targeted tests and eslint come back clean.

### F6.2 - Sun/moon header toggle

**What:** A satisfying one-click sun/moon switch exactly where the header reserved space for it.
**How:** A toggle component mounted through the phase 5 mountThemeSlot, swapping SVG icons and routing clicks into setTheme.

- [x] **T6.2.1 - Branch toggle work** - What: Toggle built without disturbing main. How: git checkout -b feature/theme-toggle off main.
- [x] **T6.2.2 - Scaffold toggle component** - What: A self-contained control ready for the header. How: src/theme/toggle.js exporting createThemeToggle() returning a button element, passed to mountThemeSlot.
- [x] **T6.2.3 - Draw sun and moon** - What: Instantly readable mode iconography. How: themeToggleSvg(theme) returning a sun path for night (tap for day) and moon path for day.
- [x] **T6.2.4 - Route toggle clicks** - What: Clicks flip day and night reliably. How: onToggleTheme() reading ui.theme and calling setTheme with the opposite value, bound via data-action.
- [x] **T6.2.5 - Swap icon reactively** - What: The icon always shows the next mode, never a stale one. How: Spektrum computed re-rendering the button innerHTML from themeToggleSvg on ui.theme change.
- [x] **T6.2.6 - Animate the flip** - What: A delightful 150ms rotate-fade on switch. How: CSS transition on transform and opacity keyed off a data-theme attribute on the button.
- [x] **T6.2.7 - Label for a11y** - What: Screen readers announce the action, not the icon. How: Dynamic aria-label "Switch to day theme"/"Switch to night theme" plus aria-pressed binding.
- [x] **T6.2.8 - Consume theme:toggle trigger** - What: The phase 5 placeholder event and future hotkey both work. How: Subscribe to trigger('theme:toggle') and route it into onToggleTheme.
- [x] **T6.2.9 - Unit-test toggle functions** - What: themeToggleSvg and onToggleTheme each held by one test. How: One Vitest test per function, run with vitest run -t themeToggleSvg and -t onToggleTheme.
- [x] **T6.2.10 - Merge toggle branch** - What: The real switch replaces the placeholder on main. How: Click-test both directions in Vite dev, then merge feature/theme-toggle.

### F6.3 - Night palette tokens

**What:** The signature money-hacker look: near-black depths, phosphor green text, hot orange highlights.
**How:** A :root[data-theme="night"] custom-property set in night.css plus a matching nightPalette() JS object for canvas renderers.

- [x] **T6.3.1 - Branch night palette** - What: Palette work reviewable in isolation. How: git checkout -b feature/theme-night from main.
- [x] **T6.3.2 - Create night.css** - What: A single stylesheet owning every dark token. How: src/theme/night.css with a :root[data-theme="night"] block, imported from the main style entry.
- [x] **T6.3.3 - Set core tokens** - What: The base canvas of the night look. How: --bg near-black #060a08, --fg phosphor green #2bff9e, --accent hot orange #ff7a1a.
- [x] **T6.3.4 - Layer semantic tokens** - What: Consistent panels, borders and states everywhere. How: --bg-panel, --border, --muted, --up, --down defined from the core trio, never raw hex in components.
- [x] **T6.3.5 - Define chart tokens** - What: Hand-rolled canvas charts share the exact palette. How: --chart-grid, --chart-up, --chart-down, --chart-crosshair tokens scoped in the same block.
- [x] **T6.3.6 - Tune glow tokens** - What: Wordmark, LEDs and flashes glow with one dial. How: --glow-green and --glow-orange rgba values sized for dark backgrounds.
- [x] **T6.3.7 - Mirror palette in JS** - What: Canvas code reads colors without touching getComputedStyle per frame. How: nightPalette() in src/theme/palettes.js returning the same hex values as night.css.
- [x] **T6.3.8 - Style selection and scrollbars** - What: Even browser chrome feels like the terminal. How: ::selection green-on-black and scrollbar-color declarations inside the night block.
- [x] **T6.3.9 - Unit-test nightPalette** - What: The JS mirror pinned by its single test. How: One Vitest test asserting required keys and hex format, run via vitest run -t nightPalette.
- [x] **T6.3.10 - Merge night branch** - What: The dark identity live on main. How: Visual pass over header, grid and ticker in Vite dev, then merge feature/theme-night.

### F6.4 - Day palette tokens

**What:** A bright, low-glare daytime look that keeps the green/orange identity fully readable.
**How:** A :root[data-theme="day"] token set with deepened brand colors, identical property names to night, and a dayPalette() JS mirror.

- [x] **T6.4.1 - Branch day palette** - What: Day tokens developed beside a stable night set. How: git checkout -b feature/theme-day off main.
- [x] **T6.4.2 - Create day.css** - What: A dedicated stylesheet for the light mode. How: src/theme/day.css with a :root[data-theme="day"] block imported next to night.css.
- [x] **T6.4.3 - Set light core tokens** - What: A calm paper-like base for daylight use. How: --bg off-white #f4f6f4, --fg near-black ink #101410, panels a shade darker than --bg.
- [x] **T6.4.4 - Deepen brand colors** - What: Green and orange stay on-brand yet legible on light. How: --accent-green #0a7d4f and --accent hot orange #c65a11 chosen for light-background contrast.
- [x] **T6.4.5 - Keep token name parity** - What: Zero component code branches on theme. How: Define exactly the same custom-property names as night.css, values only differing.
- [x] **T6.4.6 - Soften glows for day** - What: No neon smear on white backgrounds. How: Replace drop-shadow glows with subtle box-shadow elevation values in the day block.
- [x] **T6.4.7 - Mirror day palette in JS** - What: Charts get day colors from the same source pattern. How: dayPalette() added to src/theme/palettes.js matching day.css hex for hex.
- [x] **T6.4.8 - Check token parity** - What: A missing day token can never fall through to night. How: checkTokenParity(a, b) comparing key sets of both palettes and returning the diff.
- [x] **T6.4.9 - Unit-test day functions** - What: dayPalette and checkTokenParity each locked by one test. How: One Vitest test per function, run via vitest run -t dayPalette and -t checkTokenParity.
- [x] **T6.4.10 - Merge day branch** - What: Both looks complete on main. How: Flip themes in Vite dev checking every header element, then merge feature/theme-day.

### F6.5 - OS preference first-boot default

**What:** First visit already looks right: the app opens matching the OS dark or light preference.
**How:** matchMedia('(prefers-color-scheme: dark)') resolved through pure functions, applied only when no persisted choice exists, with an auto mode.

- [x] **T6.5.1 - Branch OS default work** - What: Preference logic isolated from the stores. How: git checkout -b feature/theme-os-default from main.
- [x] **T6.5.2 - Write detect function** - What: OS preference read through one testable seam. How: detectPreferredTheme(mqlDark) in src/theme/os.js mapping matches true to 'night', false to 'day'.
- [x] **T6.5.3 - Write resolve function** - What: One precedence rule: stored choice beats OS beats night. How: resolveBootTheme(stored, prefersDark) returning the effective theme for boot.
- [x] **T6.5.4 - Apply on first boot** - What: Fresh browsers land on the right side automatically. How: Call resolveBootTheme during state init, only writing ui.theme when persist had no value.
- [x] **T6.5.5 - Implement auto mode** - What: 'auto' keeps following the OS as it changes at dusk. How: matchMedia change listener re-running setTheme resolution while ui.theme is 'auto'.
- [x] **T6.5.6 - Exit auto on manual flip** - What: A deliberate toggle always wins over the OS. How: onToggleTheme sets an explicit 'day'/'night', which persist stores and auto logic then skips.
- [x] **T6.5.7 - Expose auto in settings** - What: Users can hand control back to the OS later. How: Register an 'auto' choice in the phase 7 settings model options for theme.
- [x] **T6.5.8 - Fallback without matchMedia** - What: Ancient or headless environments still boot cleanly. How: Guard for undefined window.matchMedia defaulting straight to 'night'.
- [x] **T6.5.9 - Unit-test preference functions** - What: detectPreferredTheme and resolveBootTheme each with one test. How: One Vitest test per function with stubbed mql objects, run per name via vitest run -t.
- [x] **T6.5.10 - Merge OS default branch** - What: Smart first-boot behavior on main. How: Test with cleared localStorage in both OS modes, then merge feature/theme-os-default.

### F6.6 - No-flash theme boot

**What:** Never a white flash at night or a black flash by day: the correct palette is set before the first paint.
**How:** A tiny inline script in the index.html head reading localStorage and prefers-color-scheme synchronously before any stylesheet applies.

- [x] **T6.6.1 - Branch no-flash work** - What: Boot path changes reviewed on their own. How: git checkout -b feature/theme-noflash off main.
- [x] **T6.6.2 - Add inline head script** - What: Theme decided before CSS even loads. How: Place a small inline script tag in index.html above the stylesheet links.
- [x] **T6.6.3 - Read storage safely** - What: Boot never crashes on blocked or corrupt storage. How: try/catch around localStorage.getItem('stockz.settings') with JSON.parse inside the snippet.
- [x] **T6.6.4 - Fall back to OS query** - What: First-time visitors get the no-flash treatment too. How: Inline matchMedia('(prefers-color-scheme: dark)') check when no stored theme is found.
- [x] **T6.6.5 - Stamp theme pre-paint** - What: CSS selectors match from the very first frame. How: Set document.documentElement.dataset.theme synchronously at the end of the snippet.
- [x] **T6.6.6 - Keep snippet CSP-safe** - What: The script survives a strict spektrum/compile CSP build. How: Plain statements only, no eval or Function, and record the script hash in a code comment.
- [x] **T6.6.7 - Share pure boot logic** - What: App and snippet agree on one resolution algorithm. How: readBootTheme(raw, prefersDark) in src/theme/boot.js with a sync-with-snippet comment on both sides.
- [x] **T6.6.8 - Verify zero flash** - What: Proof the flash is gone on slow connections. How: Chrome DevTools 3G throttled reloads in both themes watching the first rendered frame.
- [x] **T6.6.9 - Unit-test readBootTheme** - What: Boot resolution pinned by its single test. How: One Vitest test over stored, empty and corrupt inputs, run via vitest run -t readBootTheme.
- [x] **T6.6.10 - Merge no-flash branch** - What: Flicker-free boots for everyone on main. How: Merge feature/theme-noflash after the targeted test and throttled checks pass.

### F6.7 - 150ms theme crossfade

**What:** Theme switches feel silky: colors glide over in a deliberate 150ms instead of snapping harshly.
**How:** A temporary .theme-xfade class transitioning color properties, attached around the flip and removed on transitionend.

- [x] **T6.7.1 - Branch crossfade work** - What: Transition polish built without risk to switching. How: git checkout -b feature/theme-xfade from main.
- [x] **T6.7.2 - Define fade token** - What: One tunable dial for transition speed. How: --theme-fade-ms: 150ms custom property in the shared theme tokens file.
- [x] **T6.7.3 - Write crossfade class** - What: Only color-ish properties animate, nothing moves. How: .theme-xfade * { transition: background-color, color, border-color, fill, stroke var(--theme-fade-ms) }.
- [x] **T6.7.4 - Orchestrate the flip** - What: The class exists exactly as long as the fade. How: applyThemeTransition(fn) adding the class, invoking the setTheme flip, removing on transitionend.
- [x] **T6.7.5 - Add timeout fallback** - What: A missed transitionend can never freeze the class on. How: setTimeout at fade duration plus 50ms buffer as a guaranteed removal path.
- [x] **T6.7.6 - Guard first paint** - What: Boot renders instantly with no ghost fade. How: Never attach .theme-xfade during the no-flash boot path, only on user-driven flips.
- [x] **T6.7.7 - Respect reduced motion** - What: Motion-sensitive users get instant clean switches. How: Skip applyThemeTransition entirely when prefers-reduced-motion: reduce matches.
- [x] **T6.7.8 - Exclude canvas surfaces** - What: Charts never double-fade against their repaint. How: A .no-xfade escape class on chart containers excluded from the transition selector.
- [x] **T6.7.9 - Unit-test applyThemeTransition** - What: Class lifecycle pinned by one test. How: Single Vitest test with fake timers asserting add, flip and removal, run via vitest run -t applyThemeTransition.
- [x] **T6.7.10 - Merge crossfade branch** - What: Buttery switching live on main. How: Hammer the toggle rapidly in Vite dev confirming no stuck class, then merge feature/theme-xfade.

### F6.8 - Canvas re-palette on switch

**What:** Sparklines, micro-charts and the order book repaint in the new palette the instant the theme flips.
**How:** A Spektrum watch on ui.theme driving a chart registry of repaint callbacks fed by a memoized getChartPalette resolver.

- [x] **T6.8.1 - Branch canvas repaint** - What: Chart integration isolated from theme core. How: git checkout -b feature/theme-canvas off main.
- [x] **T6.8.2 - Build palette resolver** - What: Any renderer asks one function for its colors. How: getChartPalette(theme) in palettes.js returning nightPalette() or dayPalette() by name.
- [x] **T6.8.3 - Memoize palette objects** - What: Zero per-frame allocation in hot render loops. How: Cache the two palette objects at module scope so getChartPalette returns stable references.
- [x] **T6.8.4 - Create chart registry** - What: Every canvas can opt into theme repaints. How: registerChart(repaintFn) and unregisterChart(repaintFn) managing a Set in src/theme/charts.js.
- [x] **T6.8.5 - Repaint on late register** - What: A chart mounted mid-session paints correctly at once. How: registerChart immediately invokes the callback with the current palette.
- [x] **T6.8.6 - Watch and repaint** - What: One theme flip repaints every chart in a single frame. How: watch('ui.theme') scheduling one requestAnimationFrame that runs all registered callbacks.
- [x] **T6.8.7 - Notify chart workers** - What: Worker-driven renderers recolor too. How: postMessage({type:'theme', palette}) to the feed-parsing Workers from the same watch handler.
- [x] **T6.8.8 - Verify live recolor** - What: Confidence the pipeline works end to end. How: Flip themes in Vite dev with a phase 13 sparkline and phase 14 book mounted, checking both repaint.
- [x] **T6.8.9 - Unit-test repaint functions** - What: getChartPalette, registerChart and unregisterChart each with one test. How: One Vitest test per function, run per name with vitest run -t.
- [x] **T6.8.10 - Merge canvas branch** - What: Theme-aware charts on main. How: Merge feature/theme-canvas after the three targeted tests pass green.

### F6.9 - Browser chrome per theme

**What:** The browser itself joins the theme: tab favicon and mobile UI bars match day or night.
**How:** applyBrowserChrome swapping meta theme-color content and the link rel=icon href between two favicon SVGs on every theme change.

- [x] **T6.9.1 - Branch chrome work** - What: Browser-facing polish built separately. How: git checkout -b feature/theme-chrome from main.
- [x] **T6.9.2 - Add theme-color meta** - What: Android and Safari UI bars tint to match the app. How: meta name="theme-color" element in index.html updated to the active --bg hex.
- [x] **T6.9.3 - Draw favicon variants** - What: The tab icon reads well against any tab-bar shade. How: public/favicon-night.svg green-on-black and public/favicon-day.svg green-on-white STOCKZ marks.
- [x] **T6.9.4 - Implement chrome swapper** - What: One function retargets all browser chrome. How: applyBrowserChrome(theme) in src/theme/chrome.js setting link[rel="icon"] href and meta content.
- [x] **T6.9.5 - Hook the change trigger** - What: Chrome follows every flip automatically. How: Subscribe applyBrowserChrome to the trigger('theme:changed') event from F6.1.
- [x] **T6.9.6 - Cover iOS standalone** - What: Home-screen installs get a matching status bar. How: apple-mobile-web-app-status-bar-style meta set alongside theme-color.
- [x] **T6.9.7 - Add ico fallback** - What: Legacy browsers without SVG favicon support still show a mark. How: public/favicon.ico referenced as a sized fallback link element.
- [x] **T6.9.8 - Verify build assets** - What: Favicons guaranteed present on GitHub Pages. How: Run vite build and confirm both SVGs and the ico land in dist/ from public/.
- [x] **T6.9.9 - Unit-test applyBrowserChrome** - What: The swap logic pinned by its single test. How: One Vitest test with jsdom asserting href and content per theme, run via vitest run -t applyBrowserChrome.
- [x] **T6.9.10 - Merge chrome branch** - What: Fully themed browser presence on main. How: Eyeball tab and meta in both themes in Vite dev, then merge feature/theme-chrome.

### F6.10 - Contrast validation pass

**What:** Guaranteed readability: every text and signal color in both palettes proven against WCAG contrast ratios.
**How:** A contrastRatio utility plus an auditPalette sweep over critical token pairs, runnable as npm run audit:contrast, with failing tokens tuned.

- [x] **T6.10.1 - Branch contrast work** - What: Audit tooling and fixes tracked together. How: git checkout -b feature/theme-contrast off main.
- [x] **T6.10.2 - Write ratio utility** - What: A correct, reusable WCAG measurement. How: contrastRatio(fgHex, bgHex) in src/theme/contrast.js implementing relative luminance per WCAG 2.1.
- [x] **T6.10.3 - Write audit function** - What: Whole palettes checked in one call. How: auditPalette(palette, pairs) returning an array of pairs falling below their threshold.
- [x] **T6.10.4 - Define critical pairs** - What: The checks cover what traders actually read. How: Pair list for fg/bg, accent/bg, up and down on panel, muted/bg and button label tokens.
- [x] **T6.10.5 - Set thresholds** - What: Standards-backed pass bars, not guesses. How: 4.5:1 for body-size text pairs and 3:1 for large text and UI glyph pairs in the pair definitions.
- [x] **T6.10.6 - Add audit script** - What: One command reports both palettes before any release. How: scripts/audit-contrast.mjs run by npm run audit:contrast printing a pass/fail table via Node 22.
- [x] **T6.10.7 - Tune failing night tokens** - What: Night mode passes every check. How: Adjust phosphor green and muted luminance in night.css until auditPalette returns empty.
- [x] **T6.10.8 - Tune failing day tokens** - What: Day mode passes every check. How: Deepen the day orange and muted ink in day.css until all pairs clear their thresholds.
- [x] **T6.10.9 - Unit-test audit functions** - What: contrastRatio and auditPalette each locked by one test. How: One Vitest test per function with known ratio fixtures, run via vitest run -t per name.
- [x] **T6.10.10 - Merge contrast branch** - What: Provably readable palettes on main. How: Run npm run audit:contrast clean on both palettes, then merge feature/theme-contrast.

---

## Phase 7 - User Settings & Persistence

**What:** The desk remembers you: every preference cached locally and restored instantly on load.
**How:** spektrum/persist syncing a settings.* namespace to localStorage with versioned migrations.

### F7.1 - Settings Schema & Defaults Namespace

**What:** Every module reads the same typed settings.* tree, so theme, layout, sizes, hotkeys, sounds and favorites behave identically everywhere.
**How:** Define a defaults object in src/settings/schema.js and seed Spektrum state with setValue during boot.

- [x] **T7.1.1 - Cut schema feature branch** - What: Schema work stays off main until green. How: git checkout -b feature/settings-schema and stub src/settings/schema.js in the Vite tree.
- [x] **T7.1.2 - Author SETTINGS_DEFAULTS object** - What: Sane out-of-box prefs (night theme, grid layout, qty presets, sounds on). How: Export a literal covering theme, layout, defaultSizes, hotkeys, sounds, favoriteInstruments.
- [x] **T7.1.3 - Implement defineSettingsDefaults()** - What: Callers get an immutable copy so defaults never drift at runtime. How: Return Object.freeze(structuredClone(SETTINGS_DEFAULTS)) from schema.js.
- [x] **T7.1.4 - Implement seedSettings()** - What: First-run users get a complete settings tree instantly. How: setValue each missing settings.* key into Spektrum state from the defaults copy.
- [x] **T7.1.5 - Implement validateSettingsPatch()** - What: Bad values can never corrupt the desk config. How: Check keys against an allowlist and per-field types, return {ok, errors} without throwing.
- [x] **T7.1.6 - Register derived settings selectors** - What: UI reads ready-made values like effective grid dimensions. How: Add Spektrum computed() entries such as settings.gridArea and settings.soundEnabled.
- [x] **T7.1.7 - Wire seeding into boot** - What: Settings exist before any dashboard block renders. How: Call seedSettings() in src/main.js ahead of bindDOM() and run().
- [x] **T7.1.8 - Expose schema to devtools** - What: Devs inspect the live settings tree while debugging. How: Surface the namespace via Spektrum describe() and spektrum/inspect behind import.meta.env.DEV.
- [x] **T7.1.9 - Write single unit tests for schema functions** - What: Each schema function is locked by exactly one test. How: One Vitest test per function in schema.test.js, executed via vitest run -t "<fnName>".
- [x] **T7.1.10 - Green-gate and merge schema branch** - What: Schema lands on main ready for dependents. How: Run ESLint plus the targeted Vitest runs, then merge feature/settings-schema into main.

### F7.2 - spektrum/persist Wiring & Allowlist

**What:** Preferences survive reloads automatically without any save button, keeping the desk instant.
**How:** Wire spektrum/persist from the unpkg importmap to mirror an allowlisted set of settings.* keys into localStorage.

- [x] **T7.2.1 - Open persist wiring branch** - What: Persistence plumbing develops in isolation. How: git checkout -b feature/settings-persist from a fresh main pull.
- [x] **T7.2.2 - Add spektrum/persist importmap entry** - What: The persistence companion loads without a bundler dependency. How: Extend index.html importmap with https://unpkg.com/spektrum/persist and smoke-load it in Vite dev.
- [x] **T7.2.3 - Define PERSIST_ALLOWLIST constant** - What: Only intended keys ever touch localStorage, nothing sensitive. How: Export an array of settings.* paths in src/settings/persist.js reviewed against the schema.
- [x] **T7.2.4 - Implement initSettingsPersist()** - What: Any allowlisted change is stored the moment it happens. How: Call persist(state, {keys: PERSIST_ALLOWLIST, storageKey: 'stockz.settings'}).
- [x] **T7.2.5 - Namespace the storage payload** - What: Future schema versions can coexist with old ones on device. How: Prefix the localStorage entry as stockz.settings.v1 and centralize the name in one constant.
- [x] **T7.2.6 - Verify write-through with watch()** - What: Users trust that a toggled pref is already saved. How: Add a dev-only Spektrum watch() logging persisted paths and confirm localStorage updates on setValue.
- [x] **T7.2.7 - Implement assertPersistSafe()** - What: Secrets and vault data can never leak into localStorage via config drift. How: Guard function failing fast if a non-settings.* path appears in the allowlist.
- [x] **T7.2.8 - Handle storage quota errors** - What: A full localStorage never crashes the trading session. How: Catch QuotaExceededError around persist writes and post a one-line console warning.
- [x] **T7.2.9 - Write single unit tests for persist functions** - What: initSettingsPersist and assertPersistSafe each locked by one test. How: One Vitest test per function with a stubbed localStorage, run via vitest run -t.
- [x] **T7.2.10 - Lint, test and merge persist branch** - What: Reliable persistence ships to main. How: Pass ESLint and the targeted Vitest runs, then merge feature/settings-persist.

### F7.3 - Settings Drawer UI

**What:** One slide-in drawer edits every preference live, with changes applying the instant a field moves.
**How:** Build a drawer partial using Spektrum data-model two-way bindings, data-action toggles and data-cloak.

- [x] **T7.3.1 - Start drawer UI branch** - What: Drawer work does not disturb the dashboard shell. How: git checkout -b feature/settings-drawer and scaffold src/ui/settings-drawer.html.
- [x] **T7.3.2 - Build drawer markup skeleton** - What: A structured panel with sections for theme, sizes, sounds, favorites. How: Author the partial with data-ref="settingsDrawer" and data-cloak until state binds.
- [x] **T7.3.3 - Bind fields with data-model** - What: Editing a field updates the desk immediately, no save step. How: Attach data-model="settings.theme", settings.sounds.enabled, settings.defaultSizes.qty to inputs.
- [x] **T7.3.4 - Implement toggleSettingsDrawer()** - What: The drawer opens and closes from the header gear in one click. How: data-action calling a function that flips ui.drawerOpen via setValue and trigger.
- [x] **T7.3.5 - Build hotkey capture field** - What: Users rebind hotkeys by pressing the combo, not typing strings. How: keydown listener on a focused input writing a normalized combo string through formatHotkeyCombo().
- [x] **T7.3.6 - Build favorites editor list** - What: Favorite instruments are added and removed inline. How: data-each over settings.favoriteInstruments with add/remove data-action handlers.
- [x] **T7.3.7 - Style drawer in money-hacker theme** - What: The drawer matches the green/orange terminal look in day and night. How: CSS custom properties from the Phase 3 design tokens, monospace labels, scanline accents.
- [x] **T7.3.8 - Add slide-in animation** - What: The drawer feels snappy and never shifts the grid. How: Fixed-position overlay with a 120ms transform transition, zero layout reflow.
- [x] **T7.3.9 - Write single unit tests for drawer functions** - What: toggleSettingsDrawer and formatHotkeyCombo each pinned by one test. How: One Vitest test per function using happy-dom, run via vitest run -t.
- [x] **T7.3.10 - Verify and merge drawer branch** - What: A working live-editing drawer reaches main. How: Manual pass in Vite dev on both themes, ESLint plus targeted tests, merge feature/settings-drawer.

### F7.4 - Layout Presets

**What:** Traders snapshot and recall named grid arrangements, switching desk setups in one action.
**How:** Store preset objects under settings.layouts and apply them with setValue plus a Spektrum refresh().

- [x] **T7.4.1 - Branch for layout presets** - What: Preset logic evolves without touching the live grid code. How: git checkout -b feature/layout-presets and add src/settings/presets.js.
- [x] **T7.4.2 - Define preset data shape** - What: Presets capture exactly what a block arrangement needs. How: Document {name, createdAt, blocks: [{id, slot}]} and add it to the schema under settings.layouts.
- [x] **T7.4.3 - Implement saveLayoutPreset(name)** - What: The current grid is frozen into a named preset instantly. How: Read the grid block state, clone it into settings.layouts via setValue and validateSettingsPatch.
- [x] **T7.4.4 - Implement applyLayoutPreset(name)** - What: One click restores a full desk arrangement. How: setValue the stored blocks into the grid state and call refresh() for an immediate repaint.
- [x] **T7.4.5 - Implement deletePreset() and renamePreset()** - What: The preset list stays curated and current. How: Two small functions mutating settings.layouts with duplicate-name rejection.
- [x] **T7.4.6 - Build preset picker UI** - What: Presets are visible and switchable from the drawer. How: data-each pill row with data-action apply, plus a name input and save button.
- [x] **T7.4.7 - Ship default presets** - What: New users start with Scalp, Monitor and Minimal desks. How: Seed three presets in SETTINGS_DEFAULTS aligned to the Phase 4 grid slots.
- [x] **T7.4.8 - Persist layouts across reloads** - What: Custom presets survive a browser restart. How: Add settings.layouts to PERSIST_ALLOWLIST and confirm the localStorage payload round-trips.
- [x] **T7.4.9 - Write single unit tests for preset functions** - What: Each of the four preset functions has exactly one test. How: Vitest tests in presets.test.js run individually via vitest run -t.
- [x] **T7.4.10 - Merge presets when green** - What: Preset switching becomes part of the shipped desk. How: ESLint plus targeted Vitest runs pass, merge feature/layout-presets into main.

### F7.5 - Per-Instrument Overrides

**What:** Each instrument can carry its own default quantity and price step, so BTC and a small-cap never share sizing.
**How:** Keep an overrides map under settings.instruments and merge it over globals with a resolver function.

- [x] **T7.5.1 - Branch for instrument overrides** - What: Override logic is developed and reviewed in isolation. How: git checkout -b feature/instrument-overrides with src/settings/instruments.js.
- [x] **T7.5.2 - Model the overrides map** - What: Overrides are stored predictably per symbol. How: Schema entry settings.instruments as {SYMBOL: {defaultQty, priceStep}} validated by validateSettingsPatch.
- [x] **T7.5.3 - Implement getInstrumentDefaults(symbol)** - What: Any module asks once and gets merged, ready-to-use sizing. How: Shallow-merge global defaultSizes with the symbol override, returning a frozen result.
- [x] **T7.5.4 - Implement setInstrumentOverride(symbol, patch)** - What: Adjusting one instrument takes a single call. How: Validate the patch then setValue into settings.instruments[symbol].
- [x] **T7.5.5 - Implement clearInstrumentOverride(symbol)** - What: An instrument can revert to globals in one action. How: Delete the symbol entry via setValue and confirm getInstrumentDefaults falls back.
- [x] **T7.5.6 - Build overrides editor table** - What: All custom-sized instruments are visible and editable in the drawer. How: data-each table with data-model inputs for qty and price step per row.
- [x] **T7.5.7 - Add computed active-symbol sizing** - What: Order entry always shows the right qty for the focused instrument. How: computed('trade.effectiveQty') combining ui.activeSymbol and getInstrumentDefaults.
- [x] **T7.5.8 - Persist the overrides map** - What: Per-instrument tuning survives reloads. How: Append settings.instruments to PERSIST_ALLOWLIST and verify with the watch() logger.
- [x] **T7.5.9 - Write single unit tests for override functions** - What: Resolver, setter and clearer each locked by one test. How: One Vitest test per function in instruments.test.js via vitest run -t.
- [x] **T7.5.10 - Merge overrides branch** - What: Instrument-aware sizing lands on main. How: ESLint and targeted tests green, merge feature/instrument-overrides.

### F7.6 - Settings Versioning & Migrations

**What:** Schema changes never wipe a trader's saved preferences; old payloads upgrade silently on load.
**How:** Stamp settings.version into the persisted payload and fold stored data through a migrations registry before seeding.

- [x] **T7.6.1 - Branch for migrations** - What: Migration machinery is built without risking live persistence. How: git checkout -b feature/settings-migrations and add src/settings/migrations.js.
- [x] **T7.6.2 - Stamp SETTINGS_VERSION into payloads** - What: Every stored blob declares which schema wrote it. How: Export SETTINGS_VERSION and include it in the persisted stockz.settings.v1 object.
- [x] **T7.6.3 - Create migrations registry** - What: Each schema change ships with an explicit upgrade path. How: Ordered array of {from, to, migrate} entries exported from migrations.js.
- [x] **T7.6.4 - Implement migrateSettings(raw)** - What: Any old payload arrives at the current version deterministically. How: Fold raw through registry entries from its version upward, returning {settings, applied}.
- [x] **T7.6.5 - Write the first real migration** - What: The pipeline is proven with an actual v1-to-v2 change. How: Migration renaming defaultSizes.qty to defaultSizes.baseQty as the worked example.
- [x] **T7.6.6 - Back up before migrating** - What: A failed migration never destroys the only copy of prefs. How: Copy the raw payload to stockz.settings.bak in localStorage before folding.
- [x] **T7.6.7 - Guard against corrupt payloads** - What: Malformed JSON in storage still boots the desk with defaults. How: try/catch around JSON.parse, fall back to defineSettingsDefaults with a console warning.
- [x] **T7.6.8 - Wire migration into the load path** - What: Users on old versions are upgraded before anything reads settings. How: Run migrateSettings between the localStorage read and seedSettings in boot.
- [x] **T7.6.9 - Write single unit tests for migration functions** - What: migrateSettings and each registry migrate fn have one test apiece. How: Vitest tests with fixture payloads per version, run via vitest run -t.
- [x] **T7.6.10 - Merge migrations branch** - What: Forward-compatible persistence is live. How: ESLint plus targeted Vitest runs pass, merge feature/settings-migrations.

### F7.7 - Export & Import Settings as JSON

**What:** A whole desk configuration moves between machines as a single downloadable JSON file.
**How:** Serialize settings.* with Spektrum serialize() to a Blob download and import via a validated, migrated file read.

- [x] **T7.7.1 - Branch for settings transfer** - What: Import/export is isolated from persistence internals. How: git checkout -b feature/settings-transfer and add src/settings/transfer.js.
- [x] **T7.7.2 - Implement exportSettings()** - What: The full current config becomes one portable object. How: Use Spektrum serialize() scoped to settings.*, attach SETTINGS_VERSION, pretty-print JSON.
- [x] **T7.7.3 - Implement downloadSettingsFile()** - What: One click hands the user stockz-settings.json. How: Blob plus URL.createObjectURL on a temporary anchor with the download attribute, then revoke.
- [x] **T7.7.4 - Implement importSettingsFile(file)** - What: A dropped file restores a desk in seconds. How: file.text() then JSON.parse, migrateSettings, validateSettingsPatch, setValue the result.
- [x] **T7.7.5 - Strip non-allowlisted keys on import** - What: Imported files can never smuggle secrets or junk into state. How: Filter the parsed object against PERSIST_ALLOWLIST before applying.
- [x] **T7.7.6 - Build import/export controls in drawer** - What: Both actions live beside the other settings, no hidden menus. How: Terminal-styled buttons plus a hidden file input wired with data-action and data-ref.
- [x] **T7.7.7 - Show inline import errors** - What: A bad file is explained in one line without a blocking dialog. How: Write the validator's first error to an ui.importError line rendered with data-if.
- [x] **T7.7.8 - Implement verifyRoundTrip()** - What: Users can trust export and import to be lossless. How: Function exporting, re-importing into a scratch object and deep-equal checking the trees.
- [x] **T7.7.9 - Write single unit tests for transfer functions** - What: Export, download, import and round-trip each get exactly one test. How: Vitest with fixture JSON and a stubbed anchor, per-function vitest run -t.
- [x] **T7.7.10 - Merge transfer branch** - What: Portable configs ship to main. How: ESLint and targeted tests pass, merge feature/settings-transfer.

### F7.8 - Reset to Defaults with Single Undo

**What:** A wiped config is one keypress away from recovery: reset instantly, undo instantly, no confirm dialogs.
**How:** Capture a Spektrum checkpoint() before reset and restore it through replay() on a short-lived undo affordance.

- [x] **T7.8.1 - Branch for reset flow** - What: The destructive path is built and reviewed separately. How: git checkout -b feature/settings-reset and add src/settings/reset.js.
- [x] **T7.8.2 - Implement resetSettings()** - What: The whole settings tree returns to factory state in one call. How: setValue defineSettingsDefaults() over settings.* and let persist mirror it out.
- [x] **T7.8.3 - Capture pre-reset checkpoint** - What: The exact prior state is recoverable, not an approximation. How: Call Spektrum checkpoint() scoped to settings.* inside resetSettings before overwriting.
- [x] **T7.8.4 - Implement undoReset()** - What: One action restores everything the reset removed. How: replay() the stored checkpoint back into state and drop the checkpoint reference.
- [x] **T7.8.5 - Enforce the single-undo window** - What: Undo is predictable: available once, until the next change. How: Clear the checkpoint on any subsequent settings mutation via a watch() hook or a 30s timeout.
- [x] **T7.8.6 - Add RESET control to drawer** - What: Reset is reachable but visually distinct from routine toggles. How: Orange data-action button in its own drawer section, styled as a hazard control.
- [x] **T7.8.7 - Show inline UNDO toast** - What: The undo path appears exactly when it is usable. How: data-if toast bound to ui.undoAvailable with a data-action calling undoReset, no modal.
- [x] **T7.8.8 - Sync persistence after reset and undo** - What: Storage always matches what the user sees post-action. How: Assert the stockz.settings.v1 payload reflects state after each path in Vite dev.
- [x] **T7.8.9 - Write single unit tests for reset functions** - What: resetSettings and undoReset each verified by one test. How: Vitest tests asserting checkpoint capture and replay restore, run via vitest run -t.
- [x] **T7.8.10 - Merge reset branch** - What: Safe, instant reset ships. How: ESLint plus targeted Vitest runs green, merge feature/settings-reset into main.

### F7.9 - Boot Order: Restore Before First Render

**What:** The desk opens already personalized - correct theme, layout and sizes on the very first painted frame.
**How:** Sequence localStorage read, migration and seeding ahead of bindDOM()/run() with addAsync and data-cloak.

- [x] **T7.9.1 - Branch for boot sequencing** - What: Boot-order changes are testable before touching main. How: git checkout -b feature/settings-boot and open src/main.js for the sequence work.
- [x] **T7.9.2 - Codify the boot sequence** - What: The load order is explicit, not accidental. How: BOOT_STEPS constant listing read -> migrate -> seed -> persist-init -> bindDOM -> run in main.js.
- [x] **T7.9.3 - Implement restoreSettings()** - What: All persisted prefs are in state before any render logic runs. How: addAsync task performing the localStorage read, migrateSettings and seedSettings in order.
- [x] **T7.9.4 - Cloak the shell until settings apply** - What: No flash of wrong theme or default layout, ever. How: data-cloak on the app root removed only after restoreSettings resolves.
- [x] **T7.9.5 - Add performance marks around restore** - What: Boot cost of personalization is measurable, keeping startup snappy. How: performance.mark/measure pairs logged in dev as settings-restore-ms.
- [x] **T7.9.6 - Add a restore time budget** - What: A slow or blocked storage read never delays trading. How: Promise.race with a 50ms timeout falling back to defaults, reconciling when the read lands.
- [x] **T7.9.7 - Reorder main.js call sites** - What: Every downstream module boots against restored settings. How: Move bindDOM() and run() after the restoreSettings await, fixing any early readers.
- [x] **T7.9.8 - Verify zero-FOUC reloads** - What: Night-theme users never see a white flash on refresh. How: Repeated hard reloads in Vite dev on both themes plus a throttled-storage check in devtools.
- [x] **T7.9.9 - Write single unit tests for boot functions** - What: restoreSettings and the timeout fallback each locked by one test. How: Vitest with fake timers and stubbed storage, run via vitest run -t.
- [x] **T7.9.10 - Merge boot branch** - What: Instant personalized startup is the shipped behavior. How: ESLint and targeted tests pass, merge feature/settings-boot.

### F7.10 - Settings Test Harness & Quality Gate

**What:** Every settings function stays covered by exactly one fast test, so refactors here never silently break the desk.
**How:** Add Vitest project config, targeted npm scripts, a one-test-per-function audit and ESLint storage-access rules.

- [x] **T7.10.1 - Branch for the settings gate** - What: Tooling changes are reviewed apart from feature code. How: git checkout -b feature/settings-quality-gate.
- [x] **T7.10.2 - Add a settings Vitest project** - What: Settings tests run in isolation from the rest of the suite. How: vitest.config.js project entry scoped to src/settings/**/*.test.js with happy-dom.
- [x] **T7.10.3 - Add targeted test npm scripts** - What: A single function's test runs in under a second. How: package.json script test:settings passing -t patterns through to vitest run.
- [x] **T7.10.4 - Build shared localStorage stub helper** - What: All settings tests use one honest storage fake. How: test/helpers/storage-stub.js implementing the Storage interface with an in-memory Map.
- [x] **T7.10.5 - Implement auditSettingsTests()** - What: Missing or duplicated tests are caught mechanically. How: Node script diffing exported function names in src/settings against Vitest test titles.
- [x] **T7.10.6 - Wire the audit as an npm script** - What: The one-test-per-function rule is checkable on demand. How: package.json script audit:settings running the audit and exiting non-zero on gaps.
- [x] **T7.10.7 - Add ESLint storage restriction** - What: Direct localStorage use outside persist.js is impossible to merge. How: no-restricted-globals/properties override in eslint.config.js scoped to src/settings.
- [x] **T7.10.8 - Close audit gaps** - What: Phase 7 exits with full single-test coverage. How: Run audit:settings and add or dedupe tests until it exits clean.
- [x] **T7.10.9 - Write single unit tests for harness helpers** - What: The storage stub and audit function are themselves each tested once. How: One Vitest test per helper function, run via vitest run -t.
- [x] **T7.10.10 - Merge the quality gate** - What: The guardrails protect all future settings work on main. How: ESLint, audit and targeted Vitest runs green, merge feature/settings-quality-gate.

---

## Phase 8 - API Key Access Layer

**What:** Trade within seconds: open the URL with your key or paste it once in a modal.
**How:** Read keys from URL params with a key-modal fallback, hold them in an in-memory vault, scrub the URL after read.

### F8.1 - URL Param Key Intake

**What:** Opening a prepared link puts a trader's OKX and EToro keys in place before the dashboard finishes painting.
**How:** Parse okxKey/okxSecret/okxPass/etoroKey/etoroUser from location.search with URLSearchParams during boot.

- [x] **T8.1.1 - Branch for URL key intake** - What: Key parsing develops behind a branch until proven. How: git checkout -b feature/url-key-intake and add src/keys/params.js.
- [x] **T8.1.2 - Implement parseKeyParams(search)** - What: The five key params become a plain object in one pass. How: URLSearchParams lookup of okxKey, okxSecret, okxPass, etoroKey, etoroUser returning nulls for absentees.
- [x] **T8.1.3 - Handle encoded characters** - What: Keys containing +, / or = survive the URL intact. How: Rely on URLSearchParams decoding and add fixture cases with percent-encoded values.
- [x] **T8.1.4 - Implement normalizeVenueKeys(raw)** - What: Downstream code sees per-venue objects, not flat params. How: Map to {okx: {apiKey, secret, passphrase}, etoro: {apiKey, userKey}} with trimmed values.
- [x] **T8.1.5 - Implement hasCompleteKeys(venue)** - What: The app knows instantly whether a venue is tradeable. How: Predicate checking all required fields per venue against the normalized shape.
- [x] **T8.1.6 - Ignore unknown params safely** - What: Marketing or share params never break key intake. How: Parse only the five known names and leave every other query param untouched.
- [x] **T8.1.7 - Implement redactKey(value)** - What: Logs and errors can mention a key without exposing it. How: Return the first 4 characters plus asterisks, used by every log line in the key layer.
- [x] **T8.1.8 - Wire parsing into boot** - What: Keys are available before any venue socket connects. How: Call parseKeyParams in src/main.js directly after settings restore, ahead of Phase 9/10 connectors.
- [x] **T8.1.9 - Write single unit tests for parse functions** - What: Each of the four functions locked by exactly one Vitest test. How: Tests in params.test.js with fixture query strings, run via vitest run -t "<fnName>".
- [x] **T8.1.10 - Merge intake branch** - What: Link-based key delivery lands on main. How: ESLint plus targeted Vitest runs green, merge feature/url-key-intake.

### F8.2 - Address Bar Scrub

**What:** Seconds after load the URL is clean - no key ever lingers in the address bar, history or a copied link.
**How:** Rebuild the URL without key params and swap it in with history.replaceState in the same boot tick as parsing.

- [x] **T8.2.1 - Branch for URL scrubbing** - What: The scrub path is isolated for careful review. How: git checkout -b feature/url-scrub and add src/keys/scrub.js.
- [x] **T8.2.2 - Implement buildCleanUrl(href)** - What: A key-free URL that keeps every legitimate param and the hash. How: URL object surgery deleting only the five key names from searchParams.
- [x] **T8.2.3 - Implement scrubKeyParams()** - What: The visible address updates without a reload or history entry. How: history.replaceState(null, '', buildCleanUrl(location.href)).
- [x] **T8.2.4 - Scrub hash-carried keys too** - What: Keys passed after # are removed just as thoroughly. How: Extend buildCleanUrl to filter the same five names out of a query-style hash fragment.
- [x] **T8.2.5 - Implement safeReplaceState()** - What: A history API failure degrades gracefully instead of crashing boot. How: try/catch wrapper logging a redacted warning and continuing.
- [x] **T8.2.6 - Call scrub immediately after parse** - What: The exposure window is a single synchronous tick. How: Invoke scrubKeyParams on the line after parseKeyParams in main.js, before any await.
- [x] **T8.2.7 - Verify no residual history entry** - What: The back button never resurrects a keyed URL. How: Manual check in Vite dev that history.length is unchanged and back navigation shows clean URLs.
- [x] **T8.2.8 - Add dev fixture link for QA** - What: The scrub is demonstrable on demand with fake keys. How: DEV-only console.info printing a localhost URL with dummy params to exercise the flow.
- [x] **T8.2.9 - Write single unit tests for scrub functions** - What: buildCleanUrl, scrubKeyParams and safeReplaceState each get one test. How: Vitest with happy-dom location/history doubles, run via vitest run -t.
- [x] **T8.2.10 - Merge scrub branch** - What: Clean-address guarantee ships to main. How: ESLint and targeted tests pass, merge feature/url-scrub.

### F8.3 - Key Entry Modal

**What:** With no keys in the URL, a trader pastes them once into a focused modal and is trading seconds later.
**How:** Spektrum modal partial gated by data-if on vault status, with data-model password fields per venue.

- [x] **T8.3.1 - Branch for the key modal** - What: Modal UI work stays off main until polished. How: git checkout -b feature/key-modal and scaffold src/ui/key-modal.html.
- [x] **T8.3.2 - Build gated modal markup** - What: The modal appears exactly when keys are missing, never otherwise. How: Partial wrapped in data-if="!vault.hasAnyKeys" with data-cloak against flicker.
- [x] **T8.3.3 - Add five venue input fields** - What: OKX and EToro credentials each have a clear, masked home. How: type=password inputs bound with data-model to a transient keyEntry.* draft namespace.
- [x] **T8.3.4 - Implement parseCombinedPaste(text)** - What: A whole colon-separated credential string fills all fields in one paste. How: Split key:secret:passphrase patterns and distribute into the draft fields.
- [x] **T8.3.5 - Wire submit to the vault** - What: One Enter press arms both venues. How: data-action submitKeys validating with hasCompleteKeys then handing normalized keys to vault.setKeys.
- [x] **T8.3.6 - Add browse-only skip** - What: Users without keys still explore charts and watchlists. How: Skip link closing the modal and setting ui.browseOnly for downstream data-if guards.
- [x] **T8.3.7 - Style in terminal aesthetic** - What: The first screen a trader sees already feels like the money-hacker desk. How: Green-on-black card, orange accents, monospace labels, both theme variants.
- [x] **T8.3.8 - Tune keyboard flow** - What: The modal is operable without touching the mouse. How: Autofocus first field, Enter submits, Escape triggers skip, tab order across the five inputs.
- [x] **T8.3.9 - Write single unit tests for modal functions** - What: parseCombinedPaste and submitKeys each pinned by one Vitest test. How: happy-dom tests dispatching paste and submit, run via vitest run -t.
- [x] **T8.3.10 - Merge modal branch** - What: The paste-once entry path reaches main. How: Manual dev pass plus ESLint and targeted tests, merge feature/key-modal.

### F8.4 - In-Memory Vault Module

**What:** Credentials live only in RAM for the session - no snapshot, serializer or storage sync can ever capture them.
**How:** Closure-scoped store in src/keys/vault.js kept outside Spektrum state, exposing only status booleans to the UI.

- [x] **T8.4.1 - Branch for the vault** - What: The most sensitive module gets a dedicated review lane. How: git checkout -b feature/key-vault and add src/keys/vault.js.
- [x] **T8.4.2 - Build the closure store** - What: No other module can reach raw keys by import or inspection. How: Module-private Map inside an IIFE-style closure with no export of the container.
- [x] **T8.4.3 - Implement setKeys(venue, creds)** - What: Arming a venue is one validated call. How: Check the shape with hasCompleteKeys, write into the closure Map, trigger('vault:changed').
- [x] **T8.4.4 - Implement getSigningMaterial(venue)** - What: The OKX HMAC signer and EToro client fetch creds without copies leaking. How: Return the live object for signing use only, documented as do-not-store.
- [x] **T8.4.5 - Mirror status booleans into state** - What: The UI reacts to vault changes without ever holding keys. How: setValue vault.hasAnyKeys and vault.okxReady/etoroReady flags on every vault change.
- [x] **T8.4.6 - Keep the vault out of time travel** - What: checkpoint(), serialize() and replay() stay key-free by construction. How: Store nothing key-shaped in Spektrum state; assert flags-only via a describe() review.
- [x] **T8.4.7 - Implement clearVault()** - What: Every credential is droppable in a single call. How: Map.clear(), null the draft namespace, flip status booleans false, trigger('vault:cleared').
- [x] **T8.4.8 - Freeze the vault API surface** - What: The exported contract cannot be monkey-patched at runtime. How: Object.freeze the exported API object and lint against default exports in the module.
- [x] **T8.4.9 - Write single unit tests for vault functions** - What: setKeys, getSigningMaterial and clearVault each get exactly one test. How: Vitest tests in vault.test.js asserting isolation, run via vitest run -t.
- [x] **T8.4.10 - Merge vault branch** - What: The RAM-only credential core ships. How: ESLint plus targeted Vitest runs green, merge feature/key-vault.

### F8.5 - Remember On This Device

**What:** Regulars skip re-pasting keys: an explicit opt-in stores an obfuscated copy locally, with the risk stated plainly.
**How:** XOR-plus-base64 obfuscation with a random device salt in localStorage under stockz.keys.remembered, loaded at boot.

- [x] **T8.5.1 - Branch for remember-me** - What: The only storage-touching key path is built in isolation. How: git checkout -b feature/remember-keys and add src/keys/remember.js.
- [x] **T8.5.2 - Add opt-in checkbox with warning** - What: Users choose storage knowingly, never by default. How: Unchecked data-model checkbox in the key modal beside plain copy: obfuscated, not encrypted.
- [x] **T8.5.3 - Implement obfuscate()/deobfuscate()** - What: Stored keys are not casual-glance readable in devtools. How: XOR bytes with a crypto.getRandomValues salt then base64, salt kept beside the blob.
- [x] **T8.5.4 - Implement saveRemembered(keys)** - What: One call persists the opted-in credential copy. How: Serialize normalized venue keys, obfuscate, write stockz.keys.remembered to localStorage.
- [x] **T8.5.5 - Implement loadRemembered()** - What: Returning traders are armed before the modal can even appear. How: Read, deobfuscate and vault.setKeys during boot, before the modal's data-if evaluates.
- [x] **T8.5.6 - Implement forgetRemembered()** - What: The stored copy is removable in one action from the modal. How: localStorage.removeItem plus salt cleanup, wired to a data-action forget button.
- [x] **T8.5.7 - Exclude the blob from settings export** - What: Sharing a settings file never ships credentials. How: Assert stockz.keys.remembered is outside PERSIST_ALLOWLIST and untouched by Phase 7 exportSettings.
- [x] **T8.5.8 - Style the warning state** - What: The risk trade-off is impossible to miss. How: Orange hazard styling on the checkbox row and a persistent remembered badge in the modal.
- [x] **T8.5.9 - Write single unit tests for remember functions** - What: All five remember functions locked by one test each. How: Vitest with the shared storage stub, round-tripping fixtures, run via vitest run -t.
- [x] **T8.5.10 - Merge remember branch** - What: Opt-in convenience ships with its guardrails. How: ESLint and targeted tests pass, merge feature/remember-keys.

### F8.6 - Key Validation Ping & LEDs

**What:** Within a second of arming, per-venue LEDs show green for valid keys, red for rejected ones - no guessing.
**How:** Lightweight authenticated pings to OKX v5 REST and EToro REST driving a computed LED state per venue.

- [x] **T8.6.1 - Branch for key validation** - What: Venue ping logic is developed against fixtures first. How: git checkout -b feature/key-validation and add src/keys/validate.js.
- [x] **T8.6.2 - Implement validateOkxKeys()** - What: OKX credentials are proven against the real venue. How: HMAC-SHA256 signed GET /api/v5/account/config with vault signing material, mapping 200 to valid.
- [x] **T8.6.3 - Implement validateEtoroKeys()** - What: EToro credentials get the same instant verdict. How: Authenticated EToro REST metadata request with the api and user keys in headers.
- [x] **T8.6.4 - Implement classifyValidationError(err)** - What: A wrong key and a down network light differently. How: Map 401 to invalid, timeout/abort to unreachable, other statuses to warning.
- [x] **T8.6.5 - Add abort and timeout control** - What: A hung venue can never stall the boot path. How: AbortController with a 3 second cap on both validators, resolving to unreachable.
- [x] **T8.6.6 - Build the LED component** - What: Venue readiness is glanceable from the header at all times. How: Small block bound to computed('vault.okxLed') styles - gray, amber pulse, green, red.
- [x] **T8.6.7 - Auto-validate on vault change** - What: Feedback starts the moment keys arrive from URL, modal or storage. How: watch() on vault:changed events firing both validators as addAsync jobs.
- [x] **T8.6.8 - Show latency next to each LED** - What: Scalpers see venue round-trip cost before their first order. How: performance.now() deltas around each ping rendered as ms in the LED tooltip line.
- [x] **T8.6.9 - Write single unit tests for validation functions** - What: Both validators and the classifier each get exactly one test. How: Vitest with mocked fetch responses per status, run via vitest run -t.
- [x] **T8.6.10 - Merge validation branch** - What: Trustworthy key feedback lands on main. How: ESLint plus targeted Vitest runs green, merge feature/key-validation.

### F8.7 - Instant Lock Action

**What:** One keystroke wipes every credential from memory - walking away from the desk is always safe.
**How:** A lockVault() action clearing the vault and flipping the UI back to the modal, bound to a configurable hotkey.

- [x] **T8.7.1 - Branch for the lock action** - What: The panic path gets focused implementation and review. How: git checkout -b feature/vault-lock and add src/keys/lock.js.
- [x] **T8.7.2 - Implement lockVault(options)** - What: Locking is one synchronous call with no async gap. How: Call clearVault(), optionally forgetRemembered() when options.forget, trigger('vault:locked').
- [x] **T8.7.3 - Abort in-flight signed requests** - What: No authenticated call outlives the lock. How: Registry of active AbortControllers in the key layer, all aborted inside lockVault.
- [x] **T8.7.4 - Flip the UI on lock** - What: The desk visibly disarms the instant the action fires. How: vault status booleans go false so the key modal data-if reopens and LEDs drop to gray.
- [x] **T8.7.5 - Register the lock hotkey** - What: Lock works without reaching for the mouse, mid-trade. How: Default Ctrl+Shift+L read from settings.hotkeys.lockVault through the Phase 16 hotkey registry contract.
- [x] **T8.7.6 - Add header lock button** - What: A visible always-present escape hatch beside the LEDs. How: Padlock glyph button with data-action lockVault in the header strip, both themes.
- [x] **T8.7.7 - Keep lock dialog-free** - What: Zero confirmations - lock is instant by design, matching desk speed. How: Verify the full path has no confirm() or modal gate; re-arming is the only recovery.
- [x] **T8.7.8 - Emit a lock audit event** - What: The trade journal can show when the desk was disarmed. How: trigger('audit:vault-locked') with a timestamp only, no credential data, for Phase 25 consumption.
- [x] **T8.7.9 - Write single unit tests for lock functions** - What: lockVault and the abort-registry helper each locked by one test. How: Vitest asserting cleared state and aborted controllers, run via vitest run -t.
- [x] **T8.7.10 - Merge lock branch** - What: The instant kill-switch for credentials ships. How: ESLint and targeted tests pass, merge feature/vault-lock.

### F8.8 - Multi-Account Slots & Quick Switch

**What:** Traders juggle several venue accounts and jump between them in one action without re-entering keys.
**How:** Named slots inside the vault closure, each holding a full venue key set, with a cycle hotkey and header pills.

- [x] **T8.8.1 - Branch for account slots** - What: Multi-account plumbing is built without risking single-account flow. How: git checkout -b feature/account-slots and add src/keys/slots.js.
- [x] **T8.8.2 - Model slots in the vault** - What: Each account is a named, isolated credential set. How: Extend the vault closure to a Map of slotName to venue-key sets with an activeSlot pointer.
- [x] **T8.8.3 - Implement addSlot() and removeSlot()** - What: Accounts are added and retired without touching others. How: Two functions guarding duplicate names and refusing removal of the active slot.
- [x] **T8.8.4 - Implement switchSlot(name)** - What: The whole desk re-arms onto another account instantly. How: Move activeSlot, re-mirror status booleans, re-run both validators for the new slot.
- [x] **T8.8.5 - Build slot pills in the header** - What: The active account is always visible and one click away. How: data-each pill row over vault.slotNames with the active pill highlighted orange.
- [x] **T8.8.6 - Add the cycle hotkey** - What: Keyboard-first traders rotate accounts mid-session. How: settings.hotkeys.cycleSlot binding calling switchSlot with the next name in order.
- [x] **T8.8.7 - Track per-slot LED state** - What: Every account's validity is known before switching into it. How: Keyed validation results per slot feeding the LED computed for the active slot.
- [x] **T8.8.8 - Extend remember-me per slot** - What: Opted-in users get all their accounts back on reload. How: Namespace stockz.keys.remembered blobs by slot name in save/load/forget functions.
- [x] **T8.8.9 - Write single unit tests for slot functions** - What: addSlot, removeSlot and switchSlot each pinned by one test. How: Vitest tests in slots.test.js covering guards and switching, run via vitest run -t.
- [x] **T8.8.10 - Merge slots branch** - What: Multi-account trading lands on main. How: ESLint plus targeted Vitest runs green, merge feature/account-slots.

### F8.9 - Dev Environment Key Fallback

**What:** Developers boot a fully armed desk from a local .env file - no pasting keys a hundred times a day.
**How:** Read import.meta.env STOCKZ_* variables in Vite dev mode as the lowest-priority key source.

- [x] **T8.9.1 - Branch for env fallback** - What: Dev-only conveniences are fenced off from production code paths. How: git checkout -b feature/env-keys and add src/keys/env.js.
- [x] **T8.9.2 - Configure the STOCKZ_ env prefix** - What: Vite exposes exactly the intended variables and nothing else. How: Set envPrefix 'STOCKZ_' in vite.config.js so import.meta.env carries the five keys.
- [x] **T8.9.3 - Implement readEnvKeys()** - What: Env credentials arrive in the same shape as URL ones. How: Read STOCKZ_OKX_API_KEY, STOCKZ_OKX_SECRET_KEY, STOCKZ_OKX_PASSPHRASE, STOCKZ_ETORO_API_KEY, STOCKZ_ETORO_USER_KEY into normalizeVenueKeys.
- [x] **T8.9.4 - Gate on dev mode only** - What: Production bundles contain no env key logic at all. How: Wrap the call site in import.meta.env.DEV so Vite tree-shakes it from the build.
- [x] **T8.9.5 - Ship .env.local.example** - What: New contributors see exactly which names to set, valueless. How: Commit the example file with blank STOCKZ_* entries and confirm .env.local is gitignored.
- [x] **T8.9.6 - Implement resolveKeySource()** - What: Key precedence is deterministic: URL, then remembered, then env, then modal. How: Ordered resolver returning the first complete source with its origin label.
- [x] **T8.9.7 - Log the source without values** - What: Devs know where their session's keys came from at a glance. How: DEV console.info printing the origin label and redactKey previews only.
- [x] **T8.9.8 - Audit the production bundle** - What: Proof, not hope, that no env keys reach GitHub Pages output. How: Run vite build and grep dist/ for STOCKZ_ occurrences, expecting zero.
- [x] **T8.9.9 - Write single unit tests for env functions** - What: readEnvKeys and resolveKeySource each verified by one test. How: Vitest with stubbed import.meta.env objects, run via vitest run -t.
- [x] **T8.9.10 - Merge env branch** - What: Frictionless dev arming ships safely. How: ESLint, bundle audit and targeted tests pass, merge feature/env-keys.

### F8.10 - Key Layer Test Harness & Leak Gate

**What:** The key layer stays provably tight: every function has its one test and no code path can leak a credential.
**How:** Shared DOM doubles, a one-test-per-function audit, ESLint storage bans and a snapshot secret-scan wired into npm scripts.

- [x] **T8.10.1 - Branch for the key gate** - What: Security tooling is reviewed apart from feature logic. How: git checkout -b feature/key-quality-gate.
- [x] **T8.10.2 - Build location and history doubles** - What: All key tests share one honest browser fake. How: test/helpers/nav-stub.js faking location, history.replaceState and URLSearchParams behavior.
- [x] **T8.10.3 - Create dummy-key fixtures** - What: Tests exercise realistic shapes with obviously fake values. How: fixtures/keys.js exporting DUMMY_ prefixed key sets and prebuilt keyed URLs.
- [x] **T8.10.4 - Extend the test audit to src/keys** - What: Every exported key function is mechanically confirmed to have one test. How: Point the Phase 7 audit script at src/keys and add npm script audit:keys.
- [x] **T8.10.5 - Ban storage access outside remember.js** - What: A future patch cannot quietly persist credentials. How: ESLint no-restricted-globals/properties override for localStorage and sessionStorage in src/keys.
- [x] **T8.10.6 - Add a repo secret scan script** - What: Real key values can never sit in the git history. How: npm script scan:secrets grepping tracked files for live-looking OKX/EToro credential patterns, failing on hits.
- [x] **T8.10.7 - Implement assertNoKeysInSnapshot()** - What: Time-travel output is certified credential-free. How: Function running serialize() and checkpoint() with an armed vault and asserting no fixture values appear.
- [x] **T8.10.8 - Close the audit gaps** - What: Phase 8 exits at exactly one test per function. How: Run audit:keys, add or dedupe Vitest tests until the script exits clean.
- [x] **T8.10.9 - Write single unit tests for gate helpers** - What: The nav stub factory and assertNoKeysInSnapshot each get one test. How: One Vitest test per helper, run via vitest run -t "<fnName>".
- [x] **T8.10.10 - Merge the key gate** - What: Leak-proofing guards all future key work on main. How: ESLint, audits, secret scan and targeted tests green, merge feature/key-quality-gate.

---

## Phase 9 - OKX Connectivity

**What:** A direct line to OKX: live crypto prices and order execution on the desk.
**How:** OKX v5 public+private WebSockets with Web Crypto HMAC-SHA256 login plus signed REST via fetch, built as vanilla ES modules under src/venues/okx.

### F9.1 - Resilient WebSocket Core

**What:** An OKX link that reconnects itself, so the price stream never dies mid-scalp.
**How:** Wrap native browser WebSocket in src/venues/okx/ws.js with a connection state machine, exponential backoff with jitter, and auto-resubscribe on reopen.

- [x] **T9.1.1 - Branch and socket scaffold** - What: A clean isolated workspace for the OKX socket layer. How: git checkout -b feature/okx-ws-core from main; create src/venues/okx/ws.js and tests/okx/.
- [x] **T9.1.2 - createOkxSocket factory** - What: One call opens wss://ws.okx.com:8443/ws/v5/public reliably. How: Implement createOkxSocket(url) wrapping native WebSocket with connect/send/close helpers.
- [x] **T9.1.3 - Connection state machine** - What: The desk always knows if the OKX link is up. How: Implement transitions idle/connecting/open/backoff, published via Spektrum setValue('okx.ws.state', s).
- [x] **T9.1.4 - Backoff scheduler** - What: Fast recovery after drops without hammering OKX. How: Implement reconnectDelay(attempt) exponential from 500ms capped at 30s with 20% jitter; call it in onclose.
- [x] **T9.1.5 - Auto-resubscribe queue** - What: Subscribed channels come back on their own after a reconnect. How: Keep active subscription args in a Map and replay their subscribe frames on socket reopen.
- [x] **T9.1.6 - Frame dispatcher** - What: Every OKX message reaches the right handler instantly. How: Implement parseOkxFrame(raw) with guarded JSON.parse, routing by arg.channel to registered callbacks.
- [x] **T9.1.7 - Wire connection LED block** - What: At-a-glance OKX link health on the dashboard grid. How: bindDOM a status block rendering {{okx.ws.state}} with data-if variants per state.
- [x] **T9.1.8 - Style LED states** - What: Instant color read of link status in day and night themes. How: CSS classes on money-hacker tokens: green for open, orange for backoff, dim for idle.
- [x] **T9.1.9 - Single unit tests for socket fns** - What: reconnectDelay and parseOkxFrame provably correct. How: One Vitest test each; run vitest run tests/okx/ws.test.js -t reconnectDelay, then -t parseOkxFrame.
- [x] **T9.1.10 - Merge socket core when green** - What: The reconnecting socket lands on main. How: Run ESLint and the two targeted Vitest runs, then merge feature/okx-ws-core into main.

### F9.2 - Tickers and Trades Channels

**What:** Live last price, bid/ask and prints for every instrument the scalper watches.
**How:** Subscribe OKX tickers and trades public channels and stream parsed updates into Spektrum state for downstream blocks.

- [x] **T9.2.1 - Branch public feeds** - What: Isolated work on market data channels. How: git checkout -b feature/okx-public-feeds from main; add src/venues/okx/channels.js.
- [x] **T9.2.2 - buildSubscribeMsg helper** - What: Correct frames for any channel/instId pair. How: Implement buildSubscribeMsg(op, channel, instId) emitting the OKX v5 {op, args} JSON envelope.
- [x] **T9.2.3 - Ticker parser** - What: Clean price objects instead of raw venue payloads. How: Implement parseTickerMsg(msg) mapping data[0] to {instId, last, bid, ask, ts} numbers.
- [x] **T9.2.4 - Trades parser** - What: A readable stream of executed prints for the tape. How: Implement parseTradeMsg(msg) mapping each fill to {instId, side, px, sz, ts}.
- [x] **T9.2.5 - Publish ticks to Spektrum** - What: Any block can react to fresh prices instantly. How: Push parsed objects with addValue('okx.ticks', tick) and watch() consumers can subscribe.
- [x] **T9.2.6 - Unsubscribe lifecycle** - What: No wasted bandwidth on instruments nobody watches. How: Send unsubscribe frames from a data-action teardown hook when a grid block closes.
- [x] **T9.2.7 - Staleness guard** - What: Out-of-order frames never paint a wrong price. How: Compare incoming ts against last stored tick per instId and drop older frames before publishing.
- [x] **T9.2.8 - Live feed smoke page** - What: Proof real BTC-USDT frames flow end to end. How: A Vite dev-only page subscribing tickers/trades and inspecting the stream with spektrum/devtools.
- [x] **T9.2.9 - Single unit tests for channel fns** - What: buildSubscribeMsg, parseTickerMsg, parseTradeMsg each verified. How: One Vitest test per function, run individually via vitest -t name.
- [x] **T9.2.10 - Merge public feeds** - What: Live tickers and trades available on main. How: ESLint clean plus the three targeted tests green, then merge feature/okx-public-feeds to main.

### F9.3 - Order Book Streams and Checksum

**What:** A trustworthy live order book: depth that provably matches what OKX holds.
**How:** Subscribe books5 and books-l2-tbt, merge deltas in place, validate the OKX CRC32 checksum, and resync automatically on mismatch.

- [x] **T9.3.1 - Branch book streams** - What: Isolated depth-feed work. How: git checkout -b feature/okx-books from main; add src/venues/okx/book.js with bid/ask array structures.
- [x] **T9.3.2 - books5 subscription** - What: A light 5-level book for compact grid blocks. How: Subscribe books5 via buildSubscribeMsg and store snapshots keyed by instId.
- [x] **T9.3.3 - books-l2-tbt handler** - What: Tick-by-tick full depth for the order book block. How: Branch on action snapshot vs update in the frame and route to seed or merge paths.
- [x] **T9.3.4 - applyBookUpdate merge fn** - What: Deltas fold into the book correctly at tbt speed. How: Implement applyBookUpdate(book, delta) with sorted insert, size replace, and zero-size delete.
- [x] **T9.3.5 - CRC32 checksum fn** - What: Cryptographic-style proof the local book matches OKX. How: Implement computeBookChecksum(book) joining top 25 bid:ask px:sz per spec, CRC32 to signed int32.
- [x] **T9.3.6 - Resync on mismatch** - What: A corrupted book heals itself in one round trip. How: On checksum fail, mark okx.books stale via setValue, unsubscribe and resubscribe the channel.
- [x] **T9.3.7 - Expose book state** - What: Phase 14 order book blocks get a ready data source. How: Publish per-instrument books under setValue('okx.book.' + instId) with a seq counter.
- [x] **T9.3.8 - Allocation-free merge pass** - What: No GC stutter during depth bursts. How: Refactor applyBookUpdate to mutate preallocated arrays in place, verified with a 10k-delta timing loop.
- [x] **T9.3.9 - Single unit tests for book fns** - What: applyBookUpdate and computeBookChecksum locked in. How: One Vitest test each using an OKX doc example book; targeted vitest -t runs only.
- [x] **T9.3.10 - Merge book streams** - What: Verified depth data lands on main. How: Run ESLint and both targeted tests, then merge feature/okx-books into main.

### F9.4 - Private WebSocket Login

**What:** An authenticated OKX session so fills and balances stream in real time.
**How:** Sign the OKX login payload with Web Crypto HMAC-SHA256 using key/secret/passphrase and authenticate the private WebSocket endpoint.

- [x] **T9.4.1 - Branch private login** - What: Isolated auth work away from public feeds. How: git checkout -b feature/okx-private-login from main; add src/venues/okx/auth.js.
- [x] **T9.4.2 - hmacSha256Base64 fn** - What: A reusable browser-native signer with no crypto dependency. How: Implement hmacSha256Base64(secret, msg) via crypto.subtle.importKey and crypto.subtle.sign.
- [x] **T9.4.3 - buildLoginArgs fn** - What: A correct OKX login frame every time. How: Implement buildLoginArgs(key, secret, passphrase, ts) signing ts + 'GET' + '/users/self/verify'.
- [x] **T9.4.4 - Credential source wiring** - What: Keys flow from the phase 8 access layer, never hardcoded. How: getOkxCreds() reads the URL-param/modal key store with import.meta.env.STOCKZ_OKX_* dev fallback.
- [x] **T9.4.5 - Login handshake flow** - What: A confirmed authenticated private socket. How: Connect wss://ws.okx.com:8443/ws/v5/private, send the login op, await event login with code 0.
- [x] **T9.4.6 - Login failure path** - What: Bad keys surface instantly without freezing the desk. How: Map codes like 60009 to a toast and fire trigger('keys.open') to reopen the key modal.
- [x] **T9.4.7 - Private channel subscriptions** - What: Orders and account updates stream live after auth. How: Subscribe orders and account channels post-login and route frames via the F9.1 dispatcher.
- [x] **T9.4.8 - Re-login on reconnect** - What: Auth survives every network blip unattended. How: Hook the F9.1 reopen event to re-run the login handshake before replaying private subscriptions.
- [x] **T9.4.9 - Single unit tests for auth fns** - What: hmacSha256Base64 and buildLoginArgs verified against a known vector. How: One Vitest test each with a fixed secret/timestamp; run each via vitest -t.
- [x] **T9.4.10 - Merge private login** - What: Authenticated streaming lands on main. How: ESLint plus both targeted tests green, then merge feature/okx-private-login into main.

### F9.5 - Signed REST Client

**What:** Trusted access to OKX account and trade endpoints straight from the browser.
**How:** A fetch-based client that builds OKX v5 prehash strings and attaches OK-ACCESS-KEY/SIGN/TIMESTAMP/PASSPHRASE headers per request.

- [x] **T9.5.1 - Branch REST client** - What: Isolated signed-HTTP work. How: git checkout -b feature/okx-rest from main; add src/venues/okx/rest.js.
- [x] **T9.5.2 - isoTimestamp fn** - What: Millisecond-precision timestamps OKX accepts. How: Implement isoTimestamp() returning new Date().toISOString() shaped per OKX signing docs.
- [x] **T9.5.3 - signOkxRequest fn** - What: Every REST call is provably from this desk. How: Implement signOkxRequest(ts, method, path, body, secret) building the prehash and reusing hmacSha256Base64.
- [x] **T9.5.4 - okxFetch wrapper** - What: One-line signed calls to https://www.okx.com. How: Implement okxFetch(method, path, body) attaching the four OK-ACCESS-* headers to a fetch request.
- [x] **T9.5.5 - unwrapOkxResponse fn** - What: Venue envelopes never leak into desk code. How: Implement unwrapOkxResponse(json) returning data when code is 0 and throwing a typed OkxError otherwise.
- [x] **T9.5.6 - Balance endpoint helper** - What: Real account equity visible for the HUD. How: Add getBalance() calling GET /api/v5/account/balance and publishing via setValue('okx.balance').
- [x] **T9.5.7 - Abort on slow calls** - What: A stalled request can never block the desk. How: Wire an AbortController with a 5s timeout into okxFetch, converting aborts into OkxError timeouts.
- [x] **T9.5.8 - Dev credential hygiene** - What: Local dev works without ever committing secrets. How: Read STOCKZ_OKX_API_KEY/SECRET_KEY/PASSPHRASE via import.meta.env; assert .env stays in .gitignore.
- [x] **T9.5.9 - Single unit tests for REST fns** - What: signOkxRequest and unwrapOkxResponse locked to spec. How: One Vitest test each with fixture payloads; run only via vitest -t per function.
- [x] **T9.5.10 - Merge REST client** - What: Signed REST access lands on main. How: ESLint clean plus targeted tests green, then merge feature/okx-rest into main.

### F9.6 - Order Place, Cancel and Amend

**What:** Orders fired, pulled and reshaped at OKX in a single keystroke's worth of code.
**How:** Wrap OKX v5 trade REST endpoints with client order IDs and normalize acks into the internal order shape used by the execution engine.

- [x] **T9.6.1 - Branch order calls** - What: Isolated trading-endpoint work. How: git checkout -b feature/okx-orders from main; add src/venues/okx/orders.js.
- [x] **T9.6.2 - makeClOrdId fn** - What: Every order is traceable back to this desk. How: Implement makeClOrdId() producing a stockz-prefixed alphanumeric id within the OKX 32-char limit.
- [x] **T9.6.3 - buildOrderBody fn** - What: Internal order intent translates exactly to OKX fields. How: Implement buildOrderBody(intent) mapping side/type/px/sz to instId, tdMode, ordType, px, sz.
- [x] **T9.6.4 - placeOkxOrder call** - What: Live order entry to the venue. How: POST /api/v5/trade/order via okxFetch with buildOrderBody output plus makeClOrdId.
- [x] **T9.6.5 - cancelOkxOrder call** - What: Instant pull of a working order by desk id. How: POST /api/v5/trade/cancel-order via okxFetch addressed by clOrdId and instId.
- [x] **T9.6.6 - amendOkxOrder call** - What: Reprice without cancel/replace latency. How: POST /api/v5/trade/amend-order via okxFetch carrying newPx/newSz keyed by clOrdId.
- [x] **T9.6.7 - normalizeOrderAck fn** - What: One ack shape for phase 17 regardless of venue. How: Implement normalizeOrderAck(res) mapping ordId/clOrdId/sCode into {id, clOrdId, status, reason}.
- [x] **T9.6.8 - Live order event wiring** - What: Fills appear the moment OKX reports them. How: Route private orders-channel frames through normalizeOrderAck into trigger('okx.orderUpdate', o).
- [x] **T9.6.9 - Single unit tests for order fns** - What: makeClOrdId, buildOrderBody, normalizeOrderAck each proven. How: One Vitest test per function with doc-sample payloads; vitest -t per run.
- [x] **T9.6.10 - Merge order calls** - What: Full order lifecycle lands on main. How: ESLint plus the three targeted tests green, then merge feature/okx-orders into main.

### F9.7 - Heartbeat and Latency Meter

**What:** A live round-trip latency number so the scalper knows exactly how fast the wire is.
**How:** OKX ping/pong keepalive on a timer with a pong watchdog and a rolling latency ring buffer computed into p50/p95 stats.

- [x] **T9.7.1 - Branch heartbeat** - What: Isolated keepalive work. How: git checkout -b feature/okx-heartbeat from main; add src/venues/okx/heartbeat.js.
- [x] **T9.7.2 - Ping timer** - What: The socket never dies from OKX's 30s idle cutoff. How: Send the literal ping string every 25s of send-inactivity, tracking the send timestamp.
- [x] **T9.7.3 - Pong watchdog** - What: A dead link is detected in seconds, not minutes. How: If no pong arrives within 5s, force-close the socket so the F9.1 backoff path takes over.
- [x] **T9.7.4 - computeLatency fn** - What: An honest round-trip measure per heartbeat. How: Implement computeLatency(sentTs, recvTs) returning ms delta from performance.now() stamps.
- [x] **T9.7.5 - pushLatencySample fn** - What: Stable stats instead of a jumpy single number. How: Implement pushLatencySample(ring, ms) as a fixed 60-slot ring buffer with overwrite semantics.
- [x] **T9.7.6 - Percentile computeds** - What: p50 and p95 latency always current with zero polling. How: Define Spektrum computed('okx.latency.p50'/'p95') over the ring buffer state.
- [x] **T9.7.7 - Server clock offset check** - What: Signing never fails from local clock drift. How: Compare GET /api/v5/public/time against Date.now() on boot and store the offset for isoTimestamp.
- [x] **T9.7.8 - HUD latency readout** - What: Wire speed visible in the corner of the eye. How: Bind {{okx.latency.p50}}ms into the status block, green under 150ms and orange above via tokens.
- [x] **T9.7.9 - Single unit tests for latency fns** - What: computeLatency and pushLatencySample verified. How: One Vitest test each covering wraparound and delta math; targeted vitest -t runs.
- [x] **T9.7.10 - Merge heartbeat** - What: Self-monitoring keepalive lands on main. How: ESLint clean plus both targeted tests green, then merge feature/okx-heartbeat into main.

### F9.8 - Rate-Limit Budget Tracker

**What:** The desk never trips OKX rate limits, so orders are never rejected for pace.
**How:** Per-endpoint token buckets sized from OKX v5 documented limits, with deferred flush of queued calls and a visible remaining-budget gauge.

- [x] **T9.8.1 - Branch rate limits** - What: Isolated throttling work. How: git checkout -b feature/okx-ratelimit from main; add src/venues/okx/budget.js.
- [x] **T9.8.2 - Endpoint limit table** - What: Real OKX ceilings encoded, not guessed. How: Encode documented limits (e.g. 60 req/2s trade order, 10 req/2s balance) as a static module map.
- [x] **T9.8.3 - createBudget factory** - What: A reusable bucket for any endpoint. How: Implement createBudget(limit, windowMs) returning a token bucket with monotonic-clock refill.
- [x] **T9.8.4 - takeBudget fn** - What: Callers learn instantly whether to send or wait. How: Implement takeBudget(endpoint) consuming a token or returning the ms until the next refill.
- [x] **T9.8.5 - Deferred call queue** - What: Bursts smooth out instead of erroring. How: Queue okxFetch calls when takeBudget declines and flush them on a refill setTimeout, FIFO order.
- [x] **T9.8.6 - Subscribe frame budgeting** - What: Mass watchlist loads never trip the WS conn limit. How: Route subscribe frames through their own bucket so channel bursts are paced.
- [x] **T9.8.7 - Budget gauge block** - What: Remaining headroom visible before it matters. How: bindDOM a bar in the OKX status block driven by a computed percent of tokens left.
- [x] **T9.8.8 - Low-budget warning** - What: An early nudge before throttling bites. How: Fire a non-blocking orange toast via trigger('toast.push') when any bucket drops under 20%.
- [x] **T9.8.9 - Single unit tests for budget fns** - What: createBudget and takeBudget proven under fake timers. How: One Vitest test each using vi.useFakeTimers(); run via vitest -t only.
- [x] **T9.8.10 - Merge rate limits** - What: Throttle-proof calling lands on main. How: ESLint plus targeted tests green, then merge feature/okx-ratelimit into main.

### F9.9 - Instrument Catalog

**What:** Every OKX pair with its exact tick and lot sizes, ready for instant order math.
**How:** Fetch /api/v5/public/instruments for SPOT and SWAP, normalize to the internal schema, and cache with a TTL via spektrum/persist.

- [x] **T9.9.1 - Branch instrument catalog** - What: Isolated reference-data work. How: git checkout -b feature/okx-instruments from main; add src/venues/okx/instruments.js.
- [x] **T9.9.2 - fetchInstruments call** - What: The full tradable universe pulled from the venue. How: GET /api/v5/public/instruments?instType= for SPOT and SWAP via plain fetch (public, unsigned).
- [x] **T9.9.3 - normalizeOkxInstrument fn** - What: One instrument shape shared with phase 12. How: Map instId/tickSz/lotSz/minSz/ctVal into {venue:'okx', id, symbol, tick, lot, min} numbers.
- [x] **T9.9.4 - Catalog cache with TTL** - What: Instant boot without refetching thousands of rows. How: Persist the normalized catalog through spektrum/persist to localStorage with a fetchedAt stamp.
- [x] **T9.9.5 - Background refresh** - What: Listings stay current without blocking the UI. How: Use Spektrum addAsync to refetch when the 24h TTL lapses and swap the catalog atomically.
- [x] **T9.9.6 - getInstrument lookup** - What: O(1) access on the hot order-entry path. How: Build a Map index by instId at load and expose getInstrument(instId) from the module.
- [x] **T9.9.7 - roundToTick helper** - What: Prices always land on a valid venue increment. How: Implement roundToTick(px, tickSz) with decimal-safe integer math to avoid float drift.
- [x] **T9.9.8 - Catalog readiness gate** - What: Dependent blocks never render against an empty catalog. How: setValue('okx.catalog.ready', true) after load and gate consumers with data-if.
- [x] **T9.9.9 - Single unit tests for catalog fns** - What: normalizeOkxInstrument and roundToTick verified. How: One Vitest test each with edge-case tick sizes like 0.001; vitest -t per function.
- [x] **T9.9.10 - Merge instrument catalog** - What: Reference data lands on main. How: ESLint clean plus both targeted tests green, then merge feature/okx-instruments into main.

### F9.10 - Venue Error Mapping and Toasts

**What:** OKX rejections explained in plain words the instant they happen, never a modal in the way.
**How:** A curated OKX v5 error-code table mapped through mapOkxError into lean auto-dismissing toasts styled in the money-hacker palette.

- [x] **T9.10.1 - Branch error mapping** - What: Isolated failure-surface work. How: git checkout -b feature/okx-errors from main; add src/venues/okx/errors.js and a toast module stub.
- [x] **T9.10.2 - Error code table** - What: The codes scalpers actually hit, pre-translated. How: Curate OKX v5 codes (51008 insufficient balance, 50011 rate limited, 51400 cancel failed, etc.) to short texts.
- [x] **T9.10.3 - mapOkxError fn** - What: Any sCode becomes an actionable message. How: Implement mapOkxError(code) returning {severity, text} with an unknown-code fallback including the raw code.
- [x] **T9.10.4 - Lean toast component** - What: Feedback that never steals focus or blocks a trade. How: A stacked corner container rendered with data-each over toast state, auto-dismiss after 4s.
- [x] **T9.10.5 - dedupeToast fn** - What: A burst of identical rejections reads as one message. How: Implement dedupeToast(list, next) collapsing same-code toasts within a 2s window into a count badge.
- [x] **T9.10.6 - REST error wiring** - What: Every failed signed call self-reports. How: Catch OkxError from unwrapOkxResponse and push mapped toasts via trigger('toast.push', t).
- [x] **T9.10.7 - WS error wiring** - What: Socket-level rejects surface identically. How: Route event error frames from the F9.1 dispatcher through mapOkxError into the same toast path.
- [x] **T9.10.8 - Toast styling** - What: Severity readable at a glance in both themes. How: Green info and orange error styles from design tokens, with day/night CSS custom properties.
- [x] **T9.10.9 - Single unit tests for error fns** - What: mapOkxError and dedupeToast pinned down. How: One Vitest test each covering known, unknown and burst cases; run via vitest -t per function.
- [x] **T9.10.10 - Merge error mapping** - What: Human-readable venue errors land on main. How: ESLint plus both targeted tests green, then merge feature/okx-errors into main.

---

## Phase 10 - EToro Connectivity

**What:** Your EToro account on the same desk: stocks and CFDs beside crypto.
**How:** A fetch-based EToro REST client with API-key plus user-key headers and adaptive polling where no stream exists, in vanilla ES modules under src/venues/etoro.

### F10.1 - EToro REST Client Core

**What:** A working authenticated line to EToro from the browser with zero dependencies.
**How:** Build src/venues/etoro/rest.js around fetch with key headers from the phase 8 store and STOCKZ_ETORO_* env fallback for local dev.

- [x] **T10.1.1 - Branch REST core** - What: A clean start for the EToro layer. How: git checkout -b feature/etoro-rest-core from main; scaffold src/venues/etoro/ and tests/etoro/.
- [x] **T10.1.2 - buildEtoroHeaders fn** - What: Every call carries both required keys correctly. How: Implement buildEtoroHeaders(apiKey, userKey) returning the subscription-key and user-key header pair.
- [x] **T10.1.3 - etoroFetch wrapper** - What: One-line JSON calls against the EToro base URL. How: Implement etoroFetch(path, opts) over fetch, merging headers and parsing JSON with content-type checks.
- [x] **T10.1.4 - Credential wiring** - What: Keys come from URL params or the key modal, never source code. How: getEtoroCreds() reads the phase 8 store with import.meta.env.STOCKZ_ETORO_API_KEY/USER_KEY dev fallback.
- [x] **T10.1.5 - parseEtoroError fn** - What: Failures arrive as typed objects, not raw bodies. How: Implement parseEtoroError(status, body) producing an EtoroError with code, message and retryable flag.
- [x] **T10.1.6 - Slow-call abort** - What: A hung EToro request can never freeze the desk. How: Wire an AbortController with a 6s timeout into etoroFetch, mapping aborts to retryable EtoroError.
- [x] **T10.1.7 - Dev request log** - What: Every call inspectable while building. How: In Vite dev mode only, mirror request/response summaries into a ring visible in spektrum/devtools.
- [x] **T10.1.8 - Venue status flag** - What: The dashboard shows EToro reachability next to OKX. How: Ping a cheap metadata endpoint on boot and setValue('etoro.status', 'up'/'down'/'auth').
- [x] **T10.1.9 - Single unit tests for client fns** - What: buildEtoroHeaders and parseEtoroError verified. How: One Vitest test each with fixture responses; run via vitest run tests/etoro/rest.test.js -t name.
- [x] **T10.1.10 - Merge REST core** - What: The EToro client lands on main. How: ESLint clean plus both targeted tests green, then merge feature/etoro-rest-core into main.

### F10.2 - Instrument Metadata and Search

**What:** Find any EToro stock or CFD by name in a keystroke and get its exact trading specs.
**How:** Fetch the EToro instrument metadata endpoint, normalize to the shared internal schema, and index it for instant client-side search.

- [x] **T10.2.1 - Branch instruments** - What: Isolated reference-data work. How: git checkout -b feature/etoro-instruments from main; add src/venues/etoro/instruments.js.
- [x] **T10.2.2 - fetchEtoroInstruments call** - What: The tradable universe pulled once per session. How: GET the instruments metadata endpoint via etoroFetch and store the raw list.
- [x] **T10.2.3 - normalizeEtoroInstrument fn** - What: EToro rows fit the same schema as OKX pairs. How: Map instrumentId/symbol/displayName/precision to {venue:'etoro', id, symbol, name, tick, lot}.
- [x] **T10.2.4 - buildSearchIndex fn** - What: Sub-millisecond symbol lookup while typing. How: Implement buildSearchIndex(list) as a lowercase prefix map over symbol and display name.
- [x] **T10.2.5 - searchInstruments fn** - What: Ranked matches as the scalper types. How: Implement searchInstruments(index, query) returning exact-symbol hits first, then prefix, then substring.
- [x] **T10.2.6 - Metadata cache** - What: Instant boot on repeat visits. How: Persist the normalized list via spektrum/persist to localStorage with a 24h fetchedAt TTL and lazy refresh.
- [x] **T10.2.7 - Asset-class tagging** - What: Stocks, CFDs and crypto distinguishable at a glance. How: Carry the EToro asset-class field through normalization and expose it for badge rendering.
- [x] **T10.2.8 - Watchlist hookup** - What: Search results add straight to the phase 12 watchlist. How: Fire trigger('watchlist.add', instrument) from a data-action on each search result row.
- [x] **T10.2.9 - Single unit tests for metadata fns** - What: normalizeEtoroInstrument, buildSearchIndex, searchInstruments each proven. How: One Vitest test per function via targeted vitest -t runs.
- [x] **T10.2.10 - Merge instruments** - What: Searchable EToro universe lands on main. How: ESLint plus the three targeted tests green, then merge feature/etoro-instruments into main.

### F10.3 - Adaptive Quotes Polling

**What:** EToro prices that feel live: fast when you are watching, gentle on quota when you are not.
**How:** A setTimeout-chained polling loop whose interval adapts to Page Visibility and market hours, batching all watched instruments per request.

- [x] **T10.3.1 - Branch polling** - What: Isolated quote-loop work. How: git checkout -b feature/etoro-polling from main; add src/venues/etoro/poll.js.
- [x] **T10.3.2 - createPollLoop fn** - What: A drift-free loop that can never stack requests. How: Implement createPollLoop(fn, intervalFn) chaining setTimeout after each completion, with start/stop handles.
- [x] **T10.3.3 - computePollInterval fn** - What: The right cadence for every situation. How: Implement computePollInterval(focused, marketOpen) returning 1s focused, 5s blurred, 30s when closed.
- [x] **T10.3.4 - Visibility hookup** - What: Full speed the instant the tab regains focus. How: Listen to document visibilitychange, refresh the interval and fire one immediate poll on focus.
- [x] **T10.3.5 - Batched quote fetch** - What: All watched symbols in one request, not N. How: Collect watched EToro instrumentIds from state and pass them as one comma-joined quotes call.
- [x] **T10.3.6 - quotesChanged fn** - What: Zero wasted renders on unchanged prices. How: Implement quotesChanged(prev, next) comparing bid/ask/last so identical quotes skip Spektrum writes.
- [x] **T10.3.7 - Interval jitter** - What: No synchronized request storms across open tabs. How: Add a random 0-150ms offset to each scheduled poll inside createPollLoop.
- [x] **T10.3.8 - Poll health indicator** - What: Confidence the feed is alive despite being poll-based. How: Show last-poll age in the EToro block via a computed over a lastPollTs value, orange past 3 intervals.
- [x] **T10.3.9 - Single unit tests for poll fns** - What: createPollLoop, computePollInterval, quotesChanged verified. How: One Vitest test per function using vi.useFakeTimers(); vitest -t per run.
- [x] **T10.3.10 - Merge polling** - What: Adaptive live quotes land on main. How: ESLint plus the three targeted tests green, then merge feature/etoro-polling into main.

### F10.4 - Portfolio and Positions Mapping

**What:** Real EToro holdings on the desk, shaped exactly like every other position.
**How:** Fetch the EToro portfolio endpoint and map positions and equity through pure mapper functions into the internal schema phase 18 consumes.

- [x] **T10.4.1 - Branch portfolio** - What: Isolated account-data work. How: git checkout -b feature/etoro-portfolio from main; add src/venues/etoro/portfolio.js.
- [x] **T10.4.2 - fetchPortfolio call** - What: The full account snapshot on demand. How: GET the portfolio/positions endpoint via etoroFetch with the credentialed headers.
- [x] **T10.4.3 - mapEtoroPosition fn** - What: Each holding fits the internal position shape. How: Implement mapEtoroPosition(raw) producing {venue:'etoro', instrumentId, side, qty, avgPx, upl, openTs}.
- [x] **T10.4.4 - mapEtoroEquity fn** - What: Cash, equity and margin as one clean summary. How: Implement mapEtoroEquity(raw) mapping account totals into {cash, equity, marginUsed} numbers.
- [x] **T10.4.5 - Slow-lane refresh** - What: Positions stay fresh without burning quote budget. How: Register a portfolio fetch on the F10.3 loop at a 10x multiple of the quote interval.
- [x] **T10.4.6 - Positions state publish** - What: Any block can list EToro holdings reactively. How: setValue('etoro.positions', mapped) and render rows with data-each in the positions block.
- [x] **T10.4.7 - Venue badge on rows** - What: EToro rows unmistakable beside OKX rows. How: Add a small venue tag styled with money-hacker tokens to each rendered position row.
- [x] **T10.4.8 - Post-trade reconcile** - What: The book is correct seconds after any fill. How: Watch('etoro.orderUpdate') and schedule one immediate portfolio refetch on each fill event.
- [x] **T10.4.9 - Single unit tests for mapper fns** - What: mapEtoroPosition and mapEtoroEquity locked in. How: One Vitest test each against captured fixture JSON; targeted vitest -t runs only.
- [x] **T10.4.10 - Merge portfolio** - What: Live EToro holdings land on main. How: ESLint plus both targeted tests green, then merge feature/etoro-portfolio into main.

### F10.5 - Orders and Trades Wrappers

**What:** Open and close EToro positions from the desk with the same acks as every other venue.
**How:** Wrap EToro order and trade endpoints in etoroFetch calls with pure builders and normalizers unifying results with the phase 17 engine shape.

- [x] **T10.5.1 - Branch order wrappers** - What: Isolated trading-endpoint work. How: git checkout -b feature/etoro-orders from main; add src/venues/etoro/orders.js.
- [x] **T10.5.2 - buildEtoroOrderBody fn** - What: Internal intent translates exactly to EToro fields. How: Implement buildEtoroOrderBody(intent) mapping side/qty/leverage/stops onto the EToro payload.
- [x] **T10.5.3 - placeEtoroOrder call** - What: Real order entry to EToro. How: POST the order endpoint via etoroFetch with buildEtoroOrderBody output and return the raw ack.
- [x] **T10.5.4 - closeEtoroPosition call** - What: One-shot flatten of any holding. How: Wrap the close-position endpoint keyed by positionId, since EToro closes by position not order.
- [x] **T10.5.5 - normalizeEtoroOrderResult fn** - What: One ack shape across venues for phase 17. How: Implement normalizeEtoroOrderResult(res) into {id, clOrdId, status, reason} matching the OKX shape.
- [x] **T10.5.6 - fetchEtoroTrades call** - What: Executed trade history ready for the phase 25 journal. How: GET the trades endpoint and map rows through a mapEtoroTrade fn with ts/px/qty/fees.
- [x] **T10.5.7 - Ack event wiring** - What: The desk reacts to fills the moment they confirm. How: Push normalized results through trigger('etoro.orderUpdate', o) for engine and portfolio listeners.
- [x] **T10.5.8 - Rejection surface** - What: Failed orders explain themselves without blocking. How: Route EtoroError rejections into the shared toast pipeline with the venue name prefixed.
- [x] **T10.5.9 - Single unit tests for order fns** - What: buildEtoroOrderBody, normalizeEtoroOrderResult, mapEtoroTrade each proven. How: One Vitest test per function; vitest -t per run.
- [x] **T10.5.10 - Merge order wrappers** - What: EToro trading lands on main. How: ESLint plus the three targeted tests green, then merge feature/etoro-orders into main.

### F10.6 - CORS Strategy and Dev Relay

**What:** EToro calls that actually work from a static browser app, in dev and in production.
**How:** A Vite dev-server proxy for local work plus a configurable relay base URL for production, with CORS failures detected and explained.

- [x] **T10.6.1 - Branch relay strategy** - What: Isolated transport-path work. How: git checkout -b feature/etoro-relay from main; add src/venues/etoro/relay.js and docs/etoro-cors.md.
- [x] **T10.6.2 - CORS probe and writeup** - What: Certainty about which endpoints the browser can reach. How: Probe each EToro endpoint from a Vite dev page and record allow/block results in docs/etoro-cors.md.
- [x] **T10.6.3 - Vite dev proxy** - What: Frictionless local dev with no CORS errors. How: Configure server.proxy in vite.config.js routing /etoro/* to the EToro API host with changeOrigin.
- [x] **T10.6.4 - relayUrl fn** - What: Every call picks the right path automatically. How: Implement relayUrl(path) returning the /etoro proxy prefix in import.meta.env.DEV else the configured relay base.
- [x] **T10.6.5 - Relay base setting** - What: Power users can point the desk at their own relay. How: Add a relay URL field to the phase 7 settings store, persisted client-side via spektrum/persist.
- [x] **T10.6.6 - detectCorsFailure fn** - What: Opaque network errors get a real explanation. How: Implement detectCorsFailure(err) distinguishing TypeError CORS blocks from timeouts and HTTP errors.
- [x] **T10.6.7 - Guided failure toast** - What: A blocked call tells the user exactly what to configure. How: On detected CORS failure, toast a pointer to the relay setting instead of a generic error.
- [x] **T10.6.8 - Prod relay documentation** - What: A copy-paste path to production EToro access. How: Document a minimal self-hosted pass-through relay recipe in docs/etoro-cors.md, since GitHub Pages is static-only.
- [x] **T10.6.9 - Single unit tests for relay fns** - What: relayUrl and detectCorsFailure verified. How: One Vitest test each covering dev/prod modes and error classes; vitest -t per function.
- [x] **T10.6.10 - Merge relay strategy** - What: A working transport path lands on main. How: ESLint plus both targeted tests green, then merge feature/etoro-relay into main.

### F10.7 - Unified Tick Normalization

**What:** EToro quotes flow into the exact same tick stream as OKX, so every chart and block just works.
**How:** Pure normalizers convert polled quotes into the unified tick format inside the feed Worker and publish onto the shared Spektrum tick stream.

- [x] **T10.7.1 - Branch tick normalization** - What: Isolated feed-unification work. How: git checkout -b feature/etoro-ticks from main; add src/venues/etoro/ticks.js.
- [x] **T10.7.2 - toUnifiedTick fn** - What: One tick shape regardless of venue. How: Implement toUnifiedTick(quote) mapping to {venue:'etoro', instId, bid, ask, last, ts} with numeric coercion.
- [x] **T10.7.3 - Poll-time stamping** - What: Honest timestamps for a poll-based feed. How: Stamp ts from the poll completion time and carry the instrument's server quote time when present.
- [x] **T10.7.4 - isStaleTick fn** - What: Old prices are visibly old, never silently trusted. How: Implement isStaleTick(tick, intervalMs) flagging ticks older than two poll intervals.
- [x] **T10.7.5 - computeSpreadBps fn** - What: Spread cost visible per instrument before entry. How: Implement computeSpreadBps(bid, ask) returning basis points with divide-by-zero guards.
- [x] **T10.7.6 - Worker offload** - What: Quote parsing never steals a frame from rendering. How: Move payload parsing and toUnifiedTick mapping into the phase 11 feed Worker via postMessage.
- [x] **T10.7.7 - Shared stream publish** - What: Downstream consumers cannot tell venues apart. How: addValue('ticks', tick) onto the same stream OKX uses, keyed by venue-qualified instId.
- [x] **T10.7.8 - Blended stream check** - What: Proof crypto and stocks interleave correctly. How: A Vite dev page rendering the merged stream with venue badges and stale styling via data-if.
- [x] **T10.7.9 - Single unit tests for tick fns** - What: toUnifiedTick, isStaleTick, computeSpreadBps each proven. How: One Vitest test per function with edge quotes; vitest -t per run.
- [x] **T10.7.10 - Merge tick normalization** - What: A unified two-venue feed lands on main. How: ESLint plus the three targeted tests green, then merge feature/etoro-ticks into main.

### F10.8 - Rate Limits and Error Backoff

**What:** EToro throttling never breaks the desk: polling bends, recovers and keeps going alone.
**How:** Classify failures, honor Retry-After on 429s, stretch the poll interval under pressure and cap concurrent requests with a small semaphore.

- [x] **T10.8.1 - Branch backoff** - What: Isolated resilience work. How: git checkout -b feature/etoro-backoff from main; add src/venues/etoro/backoff.js.
- [x] **T10.8.2 - classifyEtoroFailure fn** - What: Transient and fatal errors take different paths. How: Implement classifyEtoroFailure(status) mapping 429/5xx to transient and 401/403 to auth-fatal.
- [x] **T10.8.3 - computeBackoff fn** - What: Recovery pacing that respects the venue. How: Implement computeBackoff(attempt, retryAfterMs) preferring the Retry-After header else doubling from 2s to 60s.
- [x] **T10.8.4 - Poll loop integration** - What: Throttling slows the feed instead of killing it. How: Feed computeBackoff output into the F10.3 intervalFn and decay back to normal over 5 clean polls.
- [x] **T10.8.5 - Concurrency semaphore** - What: The desk never floods EToro with parallel calls. How: Implement acquireSlot() capping in-flight etoroFetch requests at 2 with a FIFO waiter queue.
- [x] **T10.8.6 - Auth failure path** - What: Expired keys reopen the key modal, the desk keeps running. How: On auth-fatal class, pause EToro polling and fire trigger('keys.open') with an etoro hint.
- [x] **T10.8.7 - Throttled state chip** - What: Degraded mode is visible, not mysterious. How: Show an orange throttled chip on the EToro block bound to a backoff-active Spektrum value.
- [x] **T10.8.8 - Recovery logging** - What: Postmortems know when and why the feed bent. How: Record backoff enter/exit events with timestamps into a small ring readable via spektrum/inspect.
- [x] **T10.8.9 - Single unit tests for backoff fns** - What: classifyEtoroFailure, computeBackoff, acquireSlot verified. How: One Vitest test per function with fake timers; vitest -t per run.
- [x] **T10.8.10 - Merge backoff** - What: Self-healing EToro calls land on main. How: ESLint plus the three targeted tests green, then merge feature/etoro-backoff into main.

### F10.9 - EToro Feature Flag

**What:** EToro switches off in one click, leaving a pure-crypto desk with zero dead weight.
**How:** A persisted settings flag plus URL param override gating bootstrap, polling and UI blocks, with clean teardown and no-reload re-enable.

- [x] **T10.9.1 - Branch feature flag** - What: Isolated kill-switch work. How: git checkout -b feature/etoro-flag from main; add src/venues/etoro/flag.js.
- [x] **T10.9.2 - Flag in settings state** - What: The choice survives reloads. How: Store settings.etoro.enabled (default true) synced to localStorage via spektrum/persist.
- [x] **T10.9.3 - parseEtoroFlagParam fn** - What: Instant disable from a shared URL. How: Implement parseEtoroFlagParam(search) reading ?etoro=off/on and overriding the stored setting for the session.
- [x] **T10.9.4 - isEtoroEnabled fn** - What: One authoritative answer for every module. How: Implement isEtoroEnabled(state) combining the setting and URL override, used at each entry point.
- [x] **T10.9.5 - Guarded bootstrap** - What: A disabled venue costs zero requests and zero memory. How: Make initEtoro() a no-op when isEtoroEnabled is false, skipping client, polling and catalog loads.
- [x] **T10.9.6 - UI gating** - What: No ghost EToro blocks on a crypto-only desk. How: Wrap EToro grid blocks, badges and settings rows in data-if on the enabled state.
- [x] **T10.9.7 - Live teardown** - What: Toggling off stops traffic immediately, not on next reload. How: Watch the flag, stop the F10.3 loop, and abort in-flight fetches via their AbortControllers.
- [x] **T10.9.8 - No-reload re-enable** - What: Turning EToro back on takes one click, not a refresh. How: On flag true, fire trigger('etoro.init') to rerun bootstrap and resume polling in place.
- [x] **T10.9.9 - Single unit tests for flag fns** - What: parseEtoroFlagParam and isEtoroEnabled verified. How: One Vitest test each over param/setting combinations; vitest -t per function.
- [x] **T10.9.10 - Merge feature flag** - What: A clean venue kill-switch lands on main. How: ESLint plus both targeted tests green, then merge feature/etoro-flag into main.

### F10.10 - Mock Mode with Canned Data

**What:** The full EToro experience offline: build, demo and test with no keys and no network.
**How:** A swappable mock transport serving canned JSON fixtures with random-walk quotes and simulated fills, activated by ?etoro=mock.

- [x] **T10.10.1 - Branch mock mode** - What: Isolated offline-dev work. How: git checkout -b feature/etoro-mock from main; add src/venues/etoro/mock/ with a fixtures folder.
- [x] **T10.10.2 - Canned fixtures** - What: Realistic data for every EToro endpoint. How: Author JSON fixtures for instruments, quotes, portfolio and order acks from sanitized real captures.
- [x] **T10.10.3 - matchMockRoute fn** - What: Any request path finds its fixture deterministically. How: Implement matchMockRoute(path) mapping path patterns to fixture keys with a 404 fallback.
- [x] **T10.10.4 - mockEtoroFetch transport** - What: The whole client runs against fixtures unchanged. How: Implement mockEtoroFetch(path, opts) resolving matched fixtures after a simulated 80-200ms delay.
- [x] **T10.10.5 - Transport injection** - What: One switch flips real to mock with no code edits. How: Make etoroFetch delegate to mockEtoroFetch when ?etoro=mock or import.meta.env dev flag is set.
- [x] **T10.10.6 - nextMockQuote fn** - What: Offline charts still move like a market. How: Implement nextMockQuote(prev) applying a small bounded random walk to bid/ask/last per poll.
- [x] **T10.10.7 - Simulated fills** - What: The whole order flow testable offline. How: Make mock order posts return normalized acks and mutate the fixture portfolio so positions update.
- [x] **T10.10.8 - MOCK badge** - What: Nobody ever mistakes fixture prices for real money. How: Render a persistent orange MOCK tag on every EToro block via data-if on the mock flag.
- [x] **T10.10.9 - Single unit tests for mock fns** - What: matchMockRoute and nextMockQuote verified. How: One Vitest test each covering route misses and walk bounds; vitest -t per function.
- [x] **T10.10.10 - Merge mock mode** - What: Keyless offline dev lands on main. How: ESLint plus both targeted tests green, document usage in README, then merge feature/etoro-mock into main.

---

## Phase 11 - Real-Time Market Data Pipeline

**What:** One fast normalized stream feeding every block without jank at hundreds of ticks per second.
**How:** Normalize venue feeds into a tick bus, buffer in ring buffers and flush into Spektrum state on rAF batches.

### F11.1 - Unified Market Data Schema

**What:** Every block reads ticks, candles and book updates in one identical shape, no matter which venue produced them.
**How:** Create src/data/schema.js as a vanilla ES module with factory and mapper functions converting OKX v5 and EToro payloads to normalized objects.

- [x] **T11.1.1 - Cut schema branch** - What: Isolated workspace so schema work only lands on main when green. How: git checkout -b feature/f11-1-market-schema from main per the feature-cycle skill.
- [x] **T11.1.2 - Define typedefs** - What: One documented contract every later phase codes against. How: Write JSDoc typedef blocks for Tick, Candle and BookDelta at the top of src/data/schema.js.
- [x] **T11.1.3 - Build makeTick** - What: A canonical trade object with epoch-ms ts, instId, price, size, side. How: Implement makeTick returning a frozen plain object, numbers coerced with Number().
- [x] **T11.1.4 - Build makeCandle and makeBookDelta** - What: Canonical OHLCV and bid/ask delta shapes for charts and books. How: Add both factories to schema.js with tf tag and sorted [price,size] level arrays.
- [x] **T11.1.5 - Map OKX payloads** - What: OKX v5 trades and books arrive already normalized. How: Write mapOkxTrade and mapOkxBook parsing v5 WS arg/data frames, converting px/sz/side strings to numbers.
- [x] **T11.1.6 - Map EToro quotes** - What: EToro REST quotes join the same stream as OKX ticks. How: Write mapEtoroQuote turning EToro quote JSON into a synthetic Tick tagged with its venue.
- [x] **T11.1.7 - Canonical instrument ids** - What: One key per instrument usable as bus topic and state path. How: Implement canonId producing 'okx:BTC-USDT' / 'etoro:AAPL' style ids plus a parseId inverse.
- [x] **T11.1.8 - Guard invalid data** - What: Garbage payloads never reach buffers or the UI. How: Implement isValidTick rejecting NaN, zero/negative size and backwards ts; mappers return null on failure.
- [x] **T11.1.9 - Single unit tests** - What: Each new schema function proven by exactly one Vitest test. How: Per the single-test skill, add tests/schema.test.js and run npx vitest run -t per function name.
- [x] **T11.1.10 - Lint and merge** - What: Schema contract available to all parallel feature branches. How: Run npx eslint src/data/schema.js, then merge feature/f11-1-market-schema into main.

### F11.2 - Tick Bus Event Module

**What:** Blocks subscribe to instruments without ever touching sockets, so feeds and UI evolve independently.
**How:** Build src/data/bus.js, a dependency-free pub/sub keyed by 'channel:instId' topics using a Map of listener Sets.

- [x] **T11.2.1 - Open bus branch** - What: Bus work isolated until proven green. How: Create feature/f11-2-tick-bus off main following the feature-cycle skill.
- [x] **T11.2.2 - createBus factory** - What: A zero-dependency event hub the whole pipeline shares. How: Implement createBus in src/data/bus.js holding a Map from topic string to Set of handlers.
- [x] **T11.2.3 - subscribe with disposer** - What: Blocks clean up with one function call, no leak bookkeeping. How: subscribe(topic, fn) adds to the Set and returns an unsubscribe closure that deletes it.
- [x] **T11.2.4 - Isolated publish** - What: One broken block can never stall the tick stream. How: publish(topic, payload) iterates handlers inside try/catch, logging failures via console.error without rethrow.
- [x] **T11.2.5 - Wildcard topics** - What: HUD and counters tap every tick with one subscription. How: Support 'tick:*' handlers via a second Map matched by channel prefix during publish.
- [x] **T11.2.6 - once helper** - What: Warmup logic awaits the first tick without manual unsubscribe. How: Implement once(topic) returning a Promise that resolves on first publish and self-disposes.
- [x] **T11.2.7 - Bus introspection** - What: Live listener counts visible while debugging feed issues. How: Add topicCount/listenerCount getters and surface them through spektrum/inspect in dev.
- [x] **T11.2.8 - Publish from mappers** - What: Normalized OKX and EToro data actually flows on the bus. How: Wire the feed worker output through F11.1 mappers to bus.publish('tick:<canonId>', tick).
- [x] **T11.2.9 - Single unit tests** - What: subscribe, publish, once and wildcard each proven once. How: tests/bus.test.js with one Vitest test per function, executed individually via npx vitest run -t.
- [x] **T11.2.10 - Green merge** - What: Stable bus API for every downstream phase. How: ESLint the module, confirm targeted tests pass, merge feature/f11-2-tick-bus to main.

### F11.3 - Fixed-Memory Ring Buffers

**What:** Hundreds of ticks per second stored with zero GC churn and a hard memory ceiling per instrument.
**How:** Implement src/data/ring.js with preallocated Float64Array columns and head/length indices, overwrite-oldest semantics.

- [x] **T11.3.1 - Start ring branch** - What: Buffer internals developed without touching main. How: Branch feature/f11-3-ring-buffers from main per feature-cycle.
- [x] **T11.3.2 - createRing core** - What: A fixed-capacity structure allocated once at startup. How: createRing(capacity, fields) building one Float64Array per field plus head and length counters.
- [x] **T11.3.3 - O(1) push** - What: Every tick stored in constant time under burst load. How: push writes at head modulo capacity, overwriting the oldest slot and bumping an overwrite counter.
- [x] **T11.3.4 - latest reader** - What: Renderers read the newest n entries in chronological order. How: Implement latest(n, field) walking backwards from head with modulo wraparound.
- [x] **T11.3.5 - Allocation-free snapshot** - What: Chart repaints copy data without creating garbage. How: snapshotInto(targetArray, field) filling a caller-owned reusable Float64Array.
- [x] **T11.3.6 - Trade ring registry** - What: Each subscribed instrument gets its own 4096-slot trade ring. How: Map keyed by canonId, rings created lazily on first tick and dropped on unsubscribe.
- [x] **T11.3.7 - Candle rings** - What: 512 recent candles per timeframe kept hot for sparklines and charts. How: Per-instrument rings for 1s/5s/1m with ts/o/h/l/c/v fields, filled by F11.7.
- [x] **T11.3.8 - Overflow accounting** - What: Silent data loss becomes a visible number. How: Expose overwrittenUnread counts per ring for the F11.9 counters to sample.
- [x] **T11.3.9 - Single unit tests** - What: push, latest and snapshotInto each verified by one test including wraparound. How: tests/ring.test.js run per function with npx vitest run -t.
- [x] **T11.3.10 - Merge buffers** - What: Fixed-memory storage available pipeline-wide. How: Lint with ESLint, verify the three targeted tests, merge feature/f11-3-ring-buffers into main.

### F11.4 - rAF-Batched State Flushes

**What:** The UI paints at a steady 60fps while tick bursts coalesce into one Spektrum update per frame.
**How:** Build src/data/flusher.js staging latest-wins values in a dirty Map and applying setValue once per requestAnimationFrame.

- [x] **T11.4.1 - Branch the flusher** - What: Frame batching built in isolation. How: git checkout -b feature/f11-4-raf-flusher from main.
- [x] **T11.4.2 - Dirty map staging** - What: A thousand ticks on one path collapse to a single write. How: createFlusher with a Map path->value; stage(path, value) overwrites so latest always wins.
- [x] **T11.4.3 - Self-stopping rAF loop** - What: Zero CPU spent when the market is quiet. How: Schedule requestAnimationFrame only when the dirty Map is non-empty; loop exits after an empty flush.
- [x] **T11.4.4 - Frame flush** - What: All staged paths hit Spektrum state exactly once per paint. How: flush() iterates the dirty Map calling Spektrum setValue per path, then clears it.
- [x] **T11.4.5 - Hidden-tab fallback** - What: State stays warm while the tab is backgrounded and rAF is throttled. How: On visibilitychange swap the rAF loop for a 250ms setInterval and back.
- [x] **T11.4.6 - Frame budget guard** - What: A monster batch can never blow a frame. How: Cap flush work at 4ms via performance.now() and spill remaining paths to the next frame.
- [x] **T11.4.7 - Route bus into flusher** - What: Every feed update reaches the UI through the batch path. How: Rewire bus tick/book subscribers to stage('md.<id>.*') instead of calling setValue directly.
- [x] **T11.4.8 - Devtools frame trace** - What: Flush timing observable during tuning. How: In dev builds, log per-flush path counts and durations into spektrum/devtools timeline entries.
- [x] **T11.4.9 - Single unit tests** - What: stage, flush and the budget guard each proven once. How: tests/flusher.test.js using vi.useFakeTimers plus a stubbed rAF, one test per function.
- [x] **T11.4.10 - Merge flusher** - What: Jank-free updates become the default write path. How: ESLint pass, targeted Vitest runs green, merge feature/f11-4-raf-flusher into main.

### F11.5 - Subscription Manager with Refcounts

**What:** Sockets carry only instruments a block actually shows; channels close the moment the last viewer leaves.
**How:** Build src/data/subs.js refcounting acquire/release per instId+channel, driving OKX WS subscribe frames and the EToro poll roster.

- [x] **T11.5.1 - Subs branch** - What: Subscription logic isolated from live feeds until proven. How: Branch feature/f11-5-subscription-manager off main.
- [x] **T11.5.2 - Refcount acquire** - What: Ten blocks watching BTC cost exactly one venue subscription. How: acquire(instId, channel) bumps a Map count and opens the venue channel only at 0 to 1.
- [x] **T11.5.3 - Release and teardown** - What: Bandwidth freed automatically when views close. How: release decrements and calls the venue close hook when the count hits zero, deleting the ring.
- [x] **T11.5.4 - Venue adapter interface** - What: Subs stays venue-agnostic forever. How: Define an {open(ids, channel), close(ids, channel)} adapter contract that phase 9/10 clients implement.
- [x] **T11.5.5 - OKX adapter wiring** - What: Real OKX v5 channels follow refcounts. How: Adapter sends op:subscribe/op:unsubscribe JSON frames on the public WS from the phase 9 client.
- [x] **T11.5.6 - EToro adapter wiring** - What: EToro polling stays as small as the visible set. How: Adapter adds/removes instrument ids from the phase 10 REST poller roster.
- [x] **T11.5.7 - In-flight dedupe** - What: No duplicate subscribe frames while a socket is still connecting. How: Track a pending Set per venue and coalesce requests until the ack arrives.
- [x] **T11.5.8 - Resubscribe on reconnect** - What: A dropped socket recovers every watched instrument automatically. How: resubscribeAll() replays the full refcounted set through the adapter after reconnect events.
- [x] **T11.5.9 - Single unit tests** - What: acquire, release and resubscribeAll each proven once with a mock adapter. How: tests/subs.test.js, one Vitest test per function via npx vitest run -t.
- [x] **T11.5.10 - Merge subs** - What: Demand-driven feeds live on main. How: ESLint clean, targeted tests green, merge feature/f11-5-subscription-manager into main.

### F11.6 - Derived Metrics via Computed

**What:** Mid, spread, VWAP and tick velocity are ready-made state every block reads with zero extra wiring.
**How:** Pure calc functions in src/data/metrics.js registered as Spektrum computed() keys per subscribed instrument.

- [x] **T11.6.1 - Metrics branch** - What: Derived-value work sandboxed from main. How: Create feature/f11-6-derived-metrics from main per feature-cycle.
- [x] **T11.6.2 - calcMid** - What: A fair midpoint price for HUD and order entry defaults. How: Pure calcMid(bid, ask) in src/data/metrics.js returning (bid+ask)/2, null when either side is missing.
- [x] **T11.6.3 - calcSpreadBps** - What: Spread in basis points, the scalper's cost-of-entry number. How: calcSpreadBps(bid, ask) = (ask-bid)/mid*10000 rounded to one decimal.
- [x] **T11.6.4 - calcVwap** - What: Rolling volume-weighted average price for drift detection. How: calcVwap(ring, windowMs) summing price*size over the trade ring window without allocations.
- [x] **T11.6.5 - calcTickVelocity** - What: Ticks-per-second momentum reading that flags heating instruments. How: calcTickVelocity(ring, now) counting ring entries inside a sliding 1s window.
- [x] **T11.6.6 - Register computeds** - What: Metrics appear as md.<id>.mid/spread/vwap/velocity state. How: On subs acquire, register Spektrum computed() keys wrapping the calc fns over book and ring inputs.
- [x] **T11.6.7 - Lifecycle teardown** - What: No orphaned computeds after an instrument is dropped. How: Store disposers per canonId and remove the computed registrations on subs release.
- [x] **T11.6.8 - Frame-aligned refresh** - What: Derived values update once per frame, not once per tick. How: Trigger computed re-evaluation from the F11.4 flush step via Spektrum refresh on touched ids.
- [x] **T11.6.9 - Single unit tests** - What: All four calc functions each verified by exactly one test. How: tests/metrics.test.js with edge cases (empty ring, crossed book), run per function via -t.
- [x] **T11.6.10 - Merge metrics** - What: Instant analytics for phases 13-21 on main. How: ESLint the module, confirm the four targeted tests, merge feature/f11-6-derived-metrics.

### F11.7 - Candle Aggregator

**What:** Live 1s/5s/1m candles built straight from raw trades, available before venues publish their own bars.
**How:** Bucketing aggregator in src/data/candles.js folding ticks into OHLCV keyed by floor(ts/interval), publishing closes on the bus.

- [x] **T11.7.1 - Aggregator branch** - What: Candle logic developed off main. How: Branch feature/f11-7-candle-aggregator from main.
- [x] **T11.7.2 - bucketStart fn** - What: Deterministic bucket boundaries shared by live and replay code. How: Pure bucketStart(ts, intervalMs) = Math.floor(ts/intervalMs)*intervalMs in src/data/candles.js.
- [x] **T11.7.3 - foldTick fn** - What: Each trade updates its bucket in constant time. How: foldTick(bucket, tick) mutating open/high/low/close/volume, initializing OHLC from the first trade.
- [x] **T11.7.4 - createAggregator** - What: One object tracks open 1s/5s/1m buckets per instrument. How: Factory holding three current buckets per canonId and routing each tick through foldTick.
- [x] **T11.7.5 - Boundary close** - What: Finished candles reach charts the instant their interval ends. How: When a tick crosses bucketStart, close the old bucket and bus.publish('candle:<id>:<tf>').
- [x] **T11.7.6 - Gap fill** - What: Quiet instruments still render continuous candle series. How: gapFill emitting flat candles (carry close, zero volume) for every skipped interval.
- [x] **T11.7.7 - Idle sweeper** - What: Candles close on time even when no trade crosses the boundary. How: A 250ms setInterval sweep closing any bucket whose interval has elapsed.
- [x] **T11.7.8 - Ring persistence and wiring** - What: Closed candles stored hot for sparklines and micro-charts. How: Subscribe aggregator to 'tick:*' and append closed candles into the F11.3 candle rings.
- [x] **T11.7.9 - Single unit tests** - What: bucketStart, foldTick and gapFill each proven by one test. How: tests/candles.test.js with fixed timestamps, run individually via npx vitest run -t.
- [x] **T11.7.10 - Merge aggregator** - What: Homegrown candles feeding phases 13 and 27. How: ESLint pass, targeted tests green, merge feature/f11-7-candle-aggregator into main.

### F11.8 - Stale-Feed Detector and Status LEDs

**What:** A dead or lagging feed is visible in one glance via a red/amber LED on every block - no silent staleness.
**How:** Per-instrument last-tick watchdog in src/data/staleness.js writing feed.<id>.status into Spektrum state for :class LED bindings.

- [x] **T11.8.1 - Watchdog branch** - What: Staleness logic isolated until green. How: Create feature/f11-8-stale-detector from main.
- [x] **T11.8.2 - touch recorder** - What: Cheap per-instrument freshness tracking on the hot path. How: touch(canonId) storing performance.now() in a plain Map, called from the bus tick handler.
- [x] **T11.8.3 - classify fn** - What: One deterministic rule for live/lagging/stale. How: Pure classify(now, lastTouch) returning 'live' under 2s, 'lagging' under 10s, else 'stale'.
- [x] **T11.8.4 - Sweep loop** - What: Statuses refresh every second without per-tick cost. How: 1s setInterval sweeping the touch Map and staging feed.<id>.status through the F11.4 flusher.
- [x] **T11.8.5 - LED markup** - What: Every data block header shows its feed light. How: Add a span with :class="feed.<id>.status" and data-cloak to the shared block header template.
- [x] **T11.8.6 - LED styling** - What: Instant color language - solid green, pulsing amber, steady red. How: CSS classes with a keyframe pulse in the money-hacker palette, day/night tokens from phase 6.
- [x] **T11.8.7 - Venue-level staleness** - What: A closed socket flags all its instruments at once. How: Listen to OKX WS close and missed ping/pong from phase 9 and force-mark that venue's ids stale.
- [x] **T11.8.8 - Recovery flash** - What: Reconnection is as visible as failure. How: Spektrum watch on status flipping stale->live adds a one-shot bright-green blink class removed on animationend.
- [x] **T11.8.9 - Single unit tests** - What: touch and classify each proven by one test with fake clocks. How: tests/staleness.test.js using vi.useFakeTimers, run per function via -t.
- [x] **T11.8.10 - Merge watchdog** - What: Trust-at-a-glance feed health on main. How: ESLint the module, verify targeted tests, merge feature/f11-8-stale-detector into main.

### F11.9 - Throughput and Drop Counters

**What:** The HUD shows real ticks/sec, flush rate and drop counts, so pipeline health is measured, never guessed.
**How:** Zero-allocation counter module src/data/pipestats.js incremented in hot paths and sampled to Spektrum state at 1Hz.

- [x] **T11.9.1 - Counters branch** - What: Instrumentation built without touching main. How: Branch feature/f11-9-pipeline-counters from main.
- [x] **T11.9.2 - createCounters** - What: Nanosecond-cheap counting safe inside the hot path. How: Factory exposing plain integer increments for ticksIn, published, flushed, dropped and overflow.
- [x] **T11.9.3 - Ring overflow hook** - What: Overwritten-unread buffer slots become countable loss. How: Wire the F11.3 overwrittenUnread deltas into counters.overflow during the sample pass.
- [x] **T11.9.4 - Bus and flusher hooks** - What: Every publish and every frame flush is accounted for. How: Increment counters inside bus.publish and the F11.4 flush step behind a single boolean guard.
- [x] **T11.9.5 - 1Hz sampler** - What: Raw counters become per-second rates. How: A 1s setInterval computing deltas since last sample, deriving ticks/sec and flushes/sec, then resetting the window.
- [x] **T11.9.6 - Publish stats state** - What: Phase 19 HUD reads pipeline.stats like any other state. How: Stage the sampled rates via the flusher into setValue('pipeline.stats', snapshot).
- [x] **T11.9.7 - Rolling history** - What: A 60s throughput sparkline for the HUD. How: Maintain a 60-slot circular array of ticks/sec samples exposed at pipeline.stats.history.
- [x] **T11.9.8 - Peaks and inspect** - What: Session-high load visible when tuning backpressure. How: Track maxTicksPerSec and register the stats object with Spektrum describe() for spektrum/inspect.
- [x] **T11.9.9 - Single unit tests** - What: createCounters and the sampler math each proven once. How: tests/pipestats.test.js with fake timers, one Vitest test per function via -t.
- [x] **T11.9.10 - Merge counters** - What: Honest pipeline telemetry on main. How: ESLint pass, targeted tests green, merge feature/f11-9-pipeline-counters into main.

### F11.10 - Backpressure Drop Policy

**What:** Under insane bursts the app degrades gracefully - old ticks are shed, the latest price always wins, the UI never freezes.
**How:** Queue-depth thresholds in src/data/backpressure.js escalating from pass-through to conflation to shedding, with drops counted.

- [x] **T11.10.1 - Backpressure branch** - What: Overload logic proven before it guards production flow. How: Create feature/f11-10-backpressure from main.
- [x] **T11.10.2 - Threshold config** - What: Tunable escalation points in one place. How: Export queue-depth thresholds for normal/conflate/shed modes from src/data/backpressure.js.
- [x] **T11.10.3 - conflate fn** - What: Bursts collapse to one latest tick per instrument. How: Pure conflate(entries) reducing an array to last-per-canonId using a Map, preserving arrival order.
- [x] **T11.10.4 - shedOldest fn** - What: A hard cap on queue depth with honest loss reporting. How: shedOldest(queue, cap) trimming from the front and returning the number dropped.
- [x] **T11.10.5 - Worker batching** - What: Main thread receives one message per frame, not one per tick. How: The feed-parse Worker accumulates ticks and posts a single ArrayBuffer batch every 16ms.
- [x] **T11.10.6 - Escalation machine** - What: The pipeline shifts modes automatically as load climbs. How: Evaluate staged-queue depth each flush and step normal->conflate->shed against the thresholds.
- [x] **T11.10.7 - Recovery hysteresis** - What: No mode flapping at the boundary. How: De-escalate one level only after depth stays below threshold for 2s of consecutive samples.
- [x] **T11.10.8 - Count and expose drops** - What: Shedding is visible in the HUD, never silent. How: Route shedOldest return values into F11.9 counters.dropped and a pipeline.stats.mode field.
- [x] **T11.10.9 - Single unit tests** - What: conflate and shedOldest each verified by one test. How: tests/backpressure.test.js with synthetic burst arrays, run per function via npx vitest run -t.
- [x] **T11.10.10 - Merge backpressure** - What: Burst-proof pipeline complete on main. How: ESLint clean, targeted tests green, merge feature/f11-10-backpressure into main.

---

## Phase 12 - Watchlists & Instruments

**What:** Curated lists of fast movers with one-click focus switching.
**How:** Watchlist blocks bound with data-each to instrument state, persisted lists and a fuzzy search modal.

### F12.1 - Watchlist State and CRUD

**What:** Users create, rename and delete personal symbol lists that survive reloads without any account backend.
**How:** Pure list-operation functions over a watchlists array in Spektrum state, synced to localStorage via spektrum/persist.

- [x] **T12.1.1 - Cut CRUD branch** - What: List operations land on main only when green. How: git checkout -b feature/f12-1-watchlist-crud from main per the feature-cycle skill.
- [x] **T12.1.2 - Model shape** - What: A predictable structure every watchlist feature builds on. How: Seed Spektrum state with watchlists [{id, name, symbols[]}] and activeListId in src/lists/state.js.
- [x] **T12.1.3 - createList fn** - What: New empty lists with collision-free ids. How: Pure createList(lists, name) appending {id: crypto.randomUUID(), name, symbols: []} in src/lists/ops.js.
- [x] **T12.1.4 - renameList fn** - What: Lists renamed inline without dialogs. How: Pure renameList(lists, id, name) returning a new array, trimmed and capped at 24 chars.
- [x] **T12.1.5 - deleteList fn** - What: Deletion that is instantly reversible. How: deleteList(lists, id) returning {lists, removed} so the removed list can be restored by undo.
- [x] **T12.1.6 - Undo toast** - What: Speed-first deletes - no confirm dialog, just a 5s escape hatch. How: Toast markup with data-if and data-action="undoDelete" reinserting the stashed list via setValue.
- [x] **T12.1.7 - Symbol add/remove fns** - What: Symbols managed per list with no duplicates. How: addSymbol deduping by canonId and removeSymbol filtering, both pure in src/lists/ops.js.
- [x] **T12.1.8 - Persist wiring** - What: Lists identical after every reload. How: Register the watchlists path with spektrum/persist under localStorage key 'stockz.watchlists'.
- [x] **T12.1.9 - Single unit tests** - What: Every list op proven by exactly one Vitest test. How: Per the single-test skill, tests/lists-ops.test.js run per function with npx vitest run -t.
- [x] **T12.1.10 - Lint and merge** - What: A stable CRUD core for the rest of the phase. How: npx eslint src/lists, targeted tests green, merge feature/f12-1-watchlist-crud into main.

### F12.2 - Default Starter Lists

**What:** First-run users see OKX majors and EToro populars immediately instead of an empty desk.
**How:** Seed constants in src/lists/defaults.js written into state on boot only when the persisted store is empty.

- [x] **T12.2.1 - Defaults branch** - What: Seed data isolated until verified. How: Branch feature/f12-2-default-lists off main.
- [x] **T12.2.2 - OKX majors constant** - What: The liquid crypto pairs scalpers actually trade, ready on day one. How: Export OKX_MAJORS with okx:BTC-USDT, ETH-USDT, SOL-USDT, XRP-USDT, DOGE-USDT ids.
- [x] **T12.2.3 - EToro populars constant** - What: A stocks list covering the fast movers. How: Export ETORO_POPULARS with etoro:AAPL, TSLA, NVDA, AMZN, META style canonIds in src/lists/defaults.js.
- [x] **T12.2.4 - seedDefaults fn** - What: Defaults appear once and never clobber user edits. How: Pure seedDefaults(persisted) returning both lists only when the persisted watchlists array is empty.
- [x] **T12.2.5 - Version stamp** - What: Future default upgrades migrate cleanly. How: Store watchlistsVersion alongside the lists and branch seeding logic on it.
- [x] **T12.2.6 - Boot integration** - What: Starter lists exist before the first paint. How: Call seedDefaults during Spektrum run() setup, before bindDOM mounts the watchlist block.
- [x] **T12.2.7 - Restore action** - What: One click brings seed lists back after deletion. How: data-action="restoreDefaults" re-adding OKX_MAJORS/ETORO_POPULARS without touching custom lists.
- [x] **T12.2.8 - Venue badges** - What: Instant visual split between crypto and stock rows. How: Tiny OKX/EToro glyph per row derived from the canonId prefix, styled green vs orange.
- [x] **T12.2.9 - Single unit tests** - What: seedDefaults and the version branch each proven once. How: tests/defaults.test.js covering empty and populated stores, run via npx vitest run -t.
- [x] **T12.2.10 - Merge defaults** - What: A never-empty first launch on main. How: ESLint pass, targeted tests green, merge feature/f12-2-default-lists into main.

### F12.3 - Watchlist Block UI

**What:** A dense terminal-style watchlist block in the dashboard grid, rows tracking list edits live.
**How:** Block template rendered with Spektrum data-each over the active list's symbols, mounted via bindDOM in the phase 4 grid shell.

- [x] **T12.3.1 - Block branch** - What: UI scaffolding kept off main until it renders clean. How: Create feature/f12-3-watchlist-block from main.
- [x] **T12.3.2 - Block template** - What: The watchlist occupies a uniform grid slot like every other block. How: Add block markup with header (list name) and row container to the phase 4 grid shell HTML.
- [x] **T12.3.3 - data-each rows** - What: Rows appear and vanish in sync with list edits. How: Row template bound with data-each over the active list symbols, data-ref="row" per instrument.
- [x] **T12.3.4 - buildRowModel fn** - What: One tidy view object per row instead of scattered lookups. How: Pure buildRowModel(canonId, mdState) assembling symbol, venue and metric paths in src/lists/rows.js.
- [x] **T12.3.5 - Empty state** - What: An empty list invites action instead of showing a void. How: data-if placeholder reading 'no symbols - hit search' with dim styling and a search-opening data-action.
- [x] **T12.3.6 - Scroll region** - What: Long lists scroll inside the fixed block without breaking the grid. How: Fixed block height with overflow-y auto and a thin themed scrollbar via CSS scrollbar-width.
- [x] **T12.3.7 - Terminal styling** - What: The money-hacker look - dense monospace rows, green data, orange accents. How: Apply phase 3 design tokens and phase 6 day/night variables to cells and hover states.
- [x] **T12.3.8 - Mount and verify** - What: Live proof the block tracks add/remove instantly. How: Wire the block through bindDOM, run npm run dev (Vite) and exercise add/remove from the console.
- [x] **T12.3.9 - Single unit test** - What: buildRowModel proven by one test. How: tests/rows.test.js asserting the assembled shape, run with npx vitest run -t buildRowModel.
- [x] **T12.3.10 - Merge block** - What: A visible, styled watchlist on main. How: ESLint the module, confirm the targeted test, merge feature/f12-3-watchlist-block into main.

### F12.4 - Fuzzy Symbol Search Modal

**What:** Any instrument on either venue found and added in under a second with a few keystrokes.
**How:** Catalog merged from OKX and EToro instrument endpoints, ranked by a hand-rolled subsequence scorer, rendered in a data-if modal.

- [x] **T12.4.1 - Search branch** - What: Search shipped independently of list UI. How: Branch feature/f12-4-fuzzy-search from main.
- [x] **T12.4.2 - Catalog build** - What: One searchable universe across both venues. How: buildCatalog merging OKX GET /api/v5/public/instruments and the EToro instrument list into an array cached in state.
- [x] **T12.4.3 - fuzzyScore fn** - What: Typo-tolerant matching that still ranks BTC above obscure pairs. How: Pure fuzzyScore(query, symbol) subsequence scorer rewarding prefix hits and contiguous runs.
- [x] **T12.4.4 - rankMatches fn** - What: The best 20 candidates, best first, every keystroke. How: rankMatches(query, catalog) scoring, filtering zeros and sorting descending in src/lists/search.js.
- [x] **T12.4.5 - Modal markup** - What: A keyboard-first overlay that never blocks the desk. How: data-if="ui.searchOpen" overlay with input bound data-model="ui.searchQuery" and results via data-each.
- [x] **T12.4.6 - Debounced ranking** - What: Smooth typing even against a 5000-entry catalog. How: 50ms debounce recomputing ranked results into state from the input's Spektrum action.
- [x] **T12.4.7 - Keyboard flow** - What: Add a symbol without touching the mouse. How: ArrowUp/Down move selection, Enter calls addSymbol on the active list and closes, Escape closes.
- [x] **T12.4.8 - Result presentation** - What: Matches readable at a glance with venue context. How: Wrap matched characters in b tags and show an okx/etoro badge plus instrument type per result row.
- [x] **T12.4.9 - Single unit tests** - What: fuzzyScore and rankMatches each proven by one test. How: tests/search.test.js with typo and prefix cases, run per function via npx vitest run -t.
- [x] **T12.4.10 - Merge search** - What: Instant instrument discovery on main. How: ESLint pass, targeted tests green, merge feature/f12-4-fuzzy-search into main.

### F12.5 - Active-Instrument Focus

**What:** Clicking a row makes that instrument the desk-wide subject - charts, order entry and HUD follow instantly.
**How:** A focus.instId Spektrum state key set by row data-action, watched to drive subscriptions and a focus:changed trigger.

- [x] **T12.5.1 - Focus branch** - What: Focus plumbing isolated until stable. How: Create feature/f12-5-instrument-focus from main.
- [x] **T12.5.2 - Focus state and action** - What: One authoritative 'current instrument' the whole app agrees on. How: Add focus.instId to state plus a setFocus(instId) action fn in src/lists/focus.js.
- [x] **T12.5.3 - Row click wiring** - What: Single click switches focus - no double-click, no confirm. How: data-action="setFocus" on the row root passing the row's canonId from data-each scope.
- [x] **T12.5.4 - Focused row style** - What: The active row unmistakable in peripheral vision. How: Orange left bar and brightened text via a :class binding comparing row id to focus.instId.
- [x] **T12.5.5 - Feed follow** - What: Focused instruments always stream at full depth. How: Spektrum watch('focus.instId') acquiring book+trade channels on the F11.5 subs manager, releasing the previous.
- [x] **T12.5.6 - Broadcast contract** - What: Trade, chart and HUD blocks react to focus without coupling to lists. How: Fire Spektrum trigger('focus:changed', instId) that phases 13-19 subscribe to.
- [x] **T12.5.7 - Persist last focus** - What: The desk reopens on yesterday's instrument. How: Register focus.instId with spektrum/persist and restore it during boot after seeding.
- [x] **T12.5.8 - Removal fallback fn** - What: Deleting the focused symbol never leaves a dead desk. How: Pure nextFocusAfterRemoval(lists, removedId) picking the nearest remaining symbol.
- [x] **T12.5.9 - Single unit tests** - What: setFocus and nextFocusAfterRemoval each proven once. How: tests/focus.test.js, one Vitest test per function run via npx vitest run -t.
- [x] **T12.5.10 - Merge focus** - What: One-click desk-wide context switching on main. How: ESLint clean, targeted tests green, merge feature/f12-5-instrument-focus into main.

### F12.6 - Live Row Cells with Tick Pulse

**What:** Last price, % change, spread and volume update live per row, flashing green/orange on every up/down tick.
**How:** Cells bound to md.<id> paths fed by the phase 11 flusher, with a watch-driven flash class cleaned up on animationend.

- [x] **T12.6.1 - Cells branch** - What: Live-cell work merged only when it renders right. How: Branch feature/f12-6-live-cells from main.
- [x] **T12.6.2 - Cell bindings** - What: Four live numbers per row straight from pipeline state. How: Bind last, pct, spread and vol cells with {{md.<id>.*}} expressions inside the data-each row template.
- [x] **T12.6.3 - pctChange computed** - What: Percent move since session open, the scalper's context number. How: Spektrum computed per instrument from sessionOpen price captured at first tick of the day.
- [x] **T12.6.4 - formatPrice fn** - What: Prices shown at true instrument precision, no ragged decimals. How: Pure formatPrice(price, tickSize) deriving decimals from tickSize in src/lists/format.js.
- [x] **T12.6.5 - formatCompactVol fn** - What: Volume readable at a glance in tight cells. How: formatCompactVol producing 12.4K/1.2M/3.4B strings with one decimal.
- [x] **T12.6.6 - Tick pulse logic** - What: Direction of every tick visible as a flash. How: watch on the last-price path comparing values and toggling .up/.down classes, removed on animationend.
- [x] **T12.6.7 - Pulse styling** - What: A 120ms flash that reads clearly in both themes. How: Green/orange background keyframes using phase 6 theme variables, respecting prefers-reduced-motion.
- [x] **T12.6.8 - Spread cell wiring** - What: Entry cost in bps directly in the list. How: Bind the spread cell to the F11.6 calcSpreadBps computed with a 'bps' suffix and wide-spread orange tint.
- [x] **T12.6.9 - Single unit tests** - What: formatPrice and formatCompactVol each proven by one test. How: tests/format.test.js with edge precisions, run per function via npx vitest run -t.
- [x] **T12.6.10 - Merge cells** - What: A living, pulsing watchlist on main. How: ESLint pass, targeted tests green, merge feature/f12-6-live-cells into main.

### F12.7 - Inline Row Sparklines

**What:** Each row carries a tiny price trace so trend direction is visible without opening a chart.
**How:** A 64x18 canvas per row painted by a hand-rolled polyline renderer from the 5s candle ring, repainted on candle close.

- [x] **T12.7.1 - Sparkline branch** - What: Canvas work isolated from the row layout. How: Create feature/f12-7-row-sparklines from main.
- [x] **T12.7.2 - Canvas cell** - What: A dedicated drawing surface inside every row. How: Add a 64x18 canvas with data-ref="spark" to the row template between symbol and last-price cells.
- [x] **T12.7.3 - downsampleCloses fn** - What: Ring data reduced to at most 60 plot points. How: Pure downsampleCloses(ring, 60) striding over the F11.3 5s candle ring closes in src/charts/spark.js.
- [x] **T12.7.4 - drawSparkline fn** - What: A crisp min/max-scaled polyline in one pass. How: drawSparkline(ctx, values, color) clearing and stroking a single path with 1px lines on the 2d context.
- [x] **T12.7.5 - DPR sharpness** - What: No blurry lines on retina displays. How: Scale canvas backing store by devicePixelRatio and ctx.scale accordingly before drawing.
- [x] **T12.7.6 - Direction color** - What: Trend readable from color alone. How: Stroke green when last close >= first, orange otherwise, using phase 3 palette variables.
- [x] **T12.7.7 - Close-driven repaint** - What: Sparklines cost nothing between candles. How: Subscribe to 'candle:<id>:5s' bus topics and schedule repaints through the F11.4 rAF flusher.
- [x] **T12.7.8 - Offscreen skip** - What: Scrolled-out rows burn zero draw time. How: IntersectionObserver on rows pausing sparkline repaints while not intersecting the scroll region.
- [x] **T12.7.9 - Single unit tests** - What: downsampleCloses and drawSparkline each proven once. How: tests/spark.test.js with a stubbed 2d context recording calls, run per function via -t.
- [x] **T12.7.10 - Merge sparklines** - What: Trend-at-a-glance rows on main. How: ESLint pass, targeted tests green, merge feature/f12-7-row-sparklines into main.

### F12.8 - Drag-to-Reorder Rows

**What:** Rows arranged by personal priority with a quick drag, and the order sticks across sessions.
**How:** Native HTML5 drag events computing insertion index, a pure moveSymbol fn committed via setValue so spektrum/persist saves it.

- [x] **T12.8.1 - Reorder branch** - What: Drag mechanics developed without risking the block. How: Branch feature/f12-8-drag-reorder from main.
- [x] **T12.8.2 - Drag handles** - What: An obvious grip that starts a drag without hijacking row clicks. How: Add a draggable=true grip cell with grab cursor, leaving the rest of the row click-focusable.
- [x] **T12.8.3 - moveSymbol fn** - What: One pure reorder operation shared by mouse and keyboard. How: moveSymbol(symbols, from, to) splicing immutably in src/lists/ops.js.
- [x] **T12.8.4 - Drag listeners** - What: Drops land exactly where the user aims. How: dragstart/dragover/drop handlers resolving the target index from the hovered row's data-ref and midpoint.
- [x] **T12.8.5 - Drop indicator** - What: The insertion point visible while dragging. How: A 2px orange line element positioned above or below the hovered row during dragover.
- [x] **T12.8.6 - Commit and persist** - What: New order saved the moment the row lands. How: Drop applies moveSymbol via setValue on the list path, letting spektrum/persist write localStorage.
- [x] **T12.8.7 - Keyboard fallback** - What: Reordering without a mouse for keyboard-first scalpers. How: Alt+ArrowUp/Down on the focused row calling moveSymbol one step.
- [x] **T12.8.8 - Custom drag ghost** - What: A slim styled ghost instead of the default row screenshot. How: setDragImage with a cloned, styled single-cell element on dragstart.
- [x] **T12.8.9 - Single unit test** - What: moveSymbol proven by one test covering edges and no-ops. How: tests/move-symbol.test.js run with npx vitest run -t moveSymbol.
- [x] **T12.8.10 - Merge reorder** - What: Personal row order that sticks, on main. How: ESLint pass, targeted test green, merge feature/f12-8-drag-reorder into main.

### F12.9 - Multi-List Tabs

**What:** Several watchlists live in one block as tabs - crypto, stocks and session-specific lists one click apart.
**How:** A tab bar rendered with data-each over the watchlists array, activeListId switching which list the rows below render.

- [x] **T12.9.1 - Tabs branch** - What: Tab UI merged only once switching is solid. How: Create feature/f12-9-list-tabs from main.
- [x] **T12.9.2 - Tab bar markup** - What: Every list reachable in one click from the block header. How: data-each over watchlists rendering name plus symbol-count badge per tab above the rows.
- [x] **T12.9.3 - switchList action** - What: Instant tab switching with zero flicker. How: data-action="switchList" setting activeListId; the row data-each re-renders from the new list.
- [x] **T12.9.4 - New-list tab** - What: Creating a list without leaving the block. How: A '+' tab revealing an inline input bound data-model, Enter calling the F12.1 createList op.
- [x] **T12.9.5 - Close affordance** - What: Lists removed as fast as they are made, still undoable. How: An x on tab hover calling deleteList and surfacing the F12.1 undo toast.
- [x] **T12.9.6 - nextActiveAfterDelete fn** - What: Deleting the active tab lands on a sane neighbor. How: Pure nextActiveAfterDelete(lists, deletedId) preferring the left neighbor in src/lists/tabs.js.
- [x] **T12.9.7 - Tab overflow** - What: Ten lists still fit a single block width. How: Horizontal scroll on the tab strip with CSS mask-image fade edges signaling more tabs.
- [x] **T12.9.8 - Active styling and persistence** - What: The desk reopens on the tab you left. How: Underline the active tab with the orange accent and persist activeListId via spektrum/persist.
- [x] **T12.9.9 - Single unit test** - What: nextActiveAfterDelete proven by one test including last-tab deletion. How: tests/tabs.test.js run via npx vitest run -t nextActiveAfterDelete.
- [x] **T12.9.10 - Merge tabs** - What: Multi-list organization live on main. How: ESLint pass, targeted test green, merge feature/f12-9-list-tabs into main.

### F12.10 - Row Context Actions

**What:** Trade, chart or alert on any symbol straight from its row - two clicks from list to order ticket.
**How:** Hover icon cluster plus a right-click popover firing Spektrum triggers consumed by the order-entry, chart and alert phases.

- [x] **T12.10.1 - Actions branch** - What: Cross-block wiring isolated until contracts hold. How: Branch feature/f12-10-row-actions from main.
- [x] **T12.10.2 - Hover cluster** - What: The three actions visible the moment a row is hovered. How: Right-aligned trade/chart/alert icon buttons in the row template revealed via a hover class.
- [x] **T12.10.3 - Context popover** - What: The same actions on right-click at the cursor. How: contextmenu handler with preventDefault opening a data-if popover positioned at clientX/clientY.
- [x] **T12.10.4 - clampMenuPos fn** - What: The popover never clips off screen near edges. How: Pure clampMenuPos(x, y, w, h, viewport) shifting coordinates inside bounds in src/lists/menu.js.
- [x] **T12.10.5 - Trade action** - What: List to armed order ticket in one gesture. How: Action calls setFocus then Spektrum trigger('orderEntry:open', instId) for the phase 15 rapid entry block.
- [x] **T12.10.6 - Chart action** - What: Any row's chart loaded without hunting. How: Fire trigger('chart:load', instId), the contract the phase 13 micro-chart block subscribes to.
- [x] **T12.10.7 - Alert action** - What: A price alert drafted with the symbol pre-filled. How: Fire trigger('alert:draft', instId) feeding the phase 22 alert composer with current last price.
- [x] **T12.10.8 - Fast dismissal** - What: The popover vanishes the instant attention moves - no confirms. How: Close on outside pointerdown, Escape, or any action fire via a document-level listener.
- [x] **T12.10.9 - Single unit test** - What: clampMenuPos proven by one test across all four edges. How: tests/menu.test.js run with npx vitest run -t clampMenuPos.
- [x] **T12.10.10 - Merge actions** - What: Row-level command launch on main, closing the phase. How: ESLint pass, targeted test green, merge feature/f12-10-row-actions into main.

---

## Phase 13 - Micro-Charts & Sparklines

**What:** Price action at tick resolution in every grid block: the scalper sees the exact wiggle they are trading, live and smooth.
**How:** Hand-rolled canvas renderers (tick line, 1s/5s micro-candles, sparklines) fed from ring buffers on a shared dirty-flag rAF loop, themed via Spektrum watch.

### F13.1 - Canvas Surface Core

**What:** Crisp chart canvases that stay pixel-sharp on any display and follow grid-block resizes instantly.
**How:** Build src/charts/surface.js with devicePixelRatio-scaled 2D contexts and one shared ResizeObserver, mounted through Spektrum data-ref.

- [x] **T13.1.1 - Branch canvas surface work** - What: Isolated delivery line for the chart foundation. How: git checkout -b feature/13-1-canvas-surface from main per the feature-branch flow.
- [x] **T13.1.2 - Scaffold ChartSurface module** - What: One reusable canvas host for every chart type. How: Create src/charts/surface.js exporting createChartSurface(el) that appends a canvas and returns canvas, ctx, and dispose.
- [x] **T13.1.3 - Implement DPR backing-store sizing** - What: Razor-sharp lines on retina and 4K screens. How: Write computeBackingSize(cssW, cssH, dpr) and apply it to canvas.width/height while CSS size stays in layout px.
- [x] **T13.1.4 - Apply DPR context transform** - What: Renderers draw in CSS pixels without DPR bookkeeping. How: Write applyDprTransform(ctx, dpr) using ctx.setTransform(dpr,0,0,dpr,0,0) after every resize.
- [x] **T13.1.5 - Wire shared ResizeObserver** - What: Charts reflow the instant a grid block is resized. How: One module-level ResizeObserver dispatching per-surface callbacks, coalesced to the next animation frame.
- [x] **T13.1.6 - React to devicePixelRatio changes** - What: Charts stay sharp when dragged between monitors. How: Re-run the sizing routine on a matchMedia resolution change listener re-armed after each fire.
- [x] **T13.1.7 - Mount surfaces via data-ref** - What: Declarative chart hosting inside dashboard blocks. How: Add data-ref="chartHost" to the phase 4 block template and call createChartSurface from the block setup under Spektrum run.
- [x] **T13.1.8 - Style the canvas host** - What: Canvas fills its block edge-to-edge inside the money-hacker frame. How: Add .chart-surface with position absolute, inset 0, display block using phase 3 spacing tokens.
- [x] **T13.1.9 - Write single unit tests for surface fns** - What: Sizing math locked against regressions. How: One Vitest test each for computeBackingSize and applyDprTransform, run individually via vitest run -t.
- [x] **T13.1.10 - Verify and merge canvas surface** - What: A green foundation available to every later chart feature. How: Run ESLint plus the two targeted surface tests, then merge feature/13-1-canvas-surface into main.

### F13.2 - Scale & Transform Math

**What:** Exact price/time-to-pixel mapping so every tick lands where it actually traded.
**How:** Pure functions in src/charts/scales.js (linear scales, nice ticks, auto-range, pan/zoom transforms), each locked by its single Vitest test.

- [x] **T13.2.1 - Branch scale math work** - What: Geometry work sealed off from renderer churn. How: git checkout -b feature/13-2-chart-scales from main.
- [x] **T13.2.2 - Implement priceToY and yToPrice** - What: Vertical placement of every tick and level. How: Pure linear fns over a min/max price domain and pixel range in src/charts/scales.js.
- [x] **T13.2.3 - Implement timeToX and xToTime** - What: Horizontal placement over a sliding window. How: Linear fns over a windowMs domain with configurable msPerPixel, newest tick pinned at the right edge.
- [x] **T13.2.4 - Implement niceTicks** - What: Readable round-number axis labels. How: 1-2-5 stepping fn returning tick values for a given domain and target label count.
- [x] **T13.2.5 - Implement autoRange** - What: The chart auto-frames the recent action. How: Fn scanning a ring-buffer slice for min/max plus percentage padding, snapped to instrument tickSize.
- [x] **T13.2.6 - Implement formatPrice** - What: Venue-correct decimals everywhere prices render. How: Fn deriving decimal places from the tickSize supplied by the phase 12 instrument store.
- [x] **T13.2.7 - Add pan and zoom transforms** - What: The scalper can drag back to inspect a recent wiggle. How: Pure composeTransform and applyTransform fns for x offset and scale factor.
- [x] **T13.2.8 - Render a debug axis grid** - What: Visual proof the mapping math is right. How: Draw niceTicks gridlines on a scratch surface behind a Spektrum data-if debugCharts flag.
- [x] **T13.2.9 - Write single unit tests for scale fns** - What: Every mapping fn guarded by exactly one test. How: One Vitest test per exported fn in scales.test.js, each run with vitest run -t on its name.
- [x] **T13.2.10 - Verify and merge scale math** - What: Trustworthy geometry for all renderers downstream. How: Green targeted test runs plus ESLint, then merge feature/13-2-chart-scales into main.

### F13.3 - Tick Line Chart

**What:** A live tick-by-tick price line with a pulsing last-price dot - the raw wiggle itself.
**How:** Canvas polyline drawn from the phase 11 tick ring buffer with min/max column downsampling, dirty-marked on every tick.

- [x] **T13.3.1 - Branch tick chart work** - What: The headline renderer ships on its own line. How: git checkout -b feature/13-3-tick-chart from main.
- [x] **T13.3.2 - Build drawTickLine renderer** - What: The core price polyline on screen. How: Renderer in src/charts/tickline.js walking the ring buffer through timeToX/priceToY into a single ctx.stroke path.
- [x] **T13.3.3 - Implement downsampleColumn** - What: Thousands of ticks per pixel without mush or lag. How: Min/max-per-pixel-column reducer so each x column draws at most one vertical segment.
- [x] **T13.3.4 - Draw the last-price pulse dot** - What: The living heartbeat of the market on screen. How: Dot at the newest tick with radius eased from performance.now(), re-pulsed on each arriving tick.
- [x] **T13.3.5 - Break the line on stale gaps** - What: Honest gaps instead of fake flat lines during feed stalls. How: gapSplit fn cutting the path where tick spacing exceeds a staleness threshold.
- [x] **T13.3.6 - Draw right-axis price labels** - What: A current price scale always beside the line. How: Render formatPrice labels at niceTicks positions along the right edge each frame.
- [x] **T13.3.7 - Wire ticks to the dirty flag** - What: The chart moves the instant a tick lands. How: Spektrum watch on the instrument tick store calling markDirty for the tick surface per update.
- [x] **T13.3.8 - Style the phosphor line glow** - What: Signature money-hacker terminal look. How: Stroke with the palette line color plus a low-alpha shadowBlur pass tuned for day and night.
- [x] **T13.3.9 - Write single unit tests for tick fns** - What: Downsampling and gap logic locked. How: One Vitest test each for downsampleColumn and gapSplit, run individually via vitest run -t.
- [x] **T13.3.10 - Verify and merge tick chart** - What: The main scalping view live on the dashboard. How: Targeted tests green plus a visual pass against live OKX ticks, then merge feature/13-3-tick-chart into main.

### F13.4 - Micro-Candle Renderer

**What:** 1s and 5s candles with volume bars - micro-structure for timing entries and exits.
**How:** Bucket ticks into OHLCV aggregates and draw candle bodies, wicks, and a volume histogram on the shared canvas surface.

- [x] **T13.4.1 - Branch micro-candle work** - What: Candle rendering isolated from the tick line. How: git checkout -b feature/13-4-micro-candles from main.
- [x] **T13.4.2 - Implement bucketTicks** - What: Ticks rolled into exact 1s/5s OHLCV buckets. How: Pure fn flooring timestamps via intervalStart and folding open/high/low/close/volume.
- [x] **T13.4.3 - Build the rolling candle store** - What: Bounded candle history that never leaks memory. How: Fixed-length circular array per interval updated in place, exposed as a Spektrum value.
- [x] **T13.4.4 - Build drawCandles renderer** - What: The classic candle read at micro scale. How: Bodies and wicks via fillRect and stroke, green up and orange down from the chart palette.
- [x] **T13.4.5 - Draw the volume histogram band** - What: The size behind every move visible at a glance. How: Scaled volume bars in a bottom band sharing the candle time scale.
- [x] **T13.4.6 - Animate the live forming candle** - What: The current second breathing in real time. How: Update the open bucket in place per tick, mark dirty, and close it exactly on interval rollover.
- [x] **T13.4.7 - Add the interval toggle** - What: Flip 1s/5s instantly mid-trade. How: data-action buttons calling setValue on candleInterval with a computed re-bucketing from the ring buffer.
- [x] **T13.4.8 - Style candle metrics** - What: Candles match the design system in both themes. How: Wick width, body inset, and volume alpha read from phase 3 CSS custom properties at palette load.
- [x] **T13.4.9 - Write single unit tests for candle fns** - What: Aggregation boundaries proven correct. How: One Vitest test each for bucketTicks and intervalStart, run individually via vitest run -t.
- [x] **T13.4.10 - Verify and merge micro-candles** - What: A second lens on price live for every instrument. How: Targeted tests plus ESLint green, then merge feature/13-4-micro-candles into main.

### F13.5 - Crosshair & Readout

**What:** Hover anywhere and read exact price and time, snapped to the nearest real traded tick.
**How:** A second overlay canvas driven by pointer events, using xToTime/yToPrice plus a binary-search tick snap.

- [x] **T13.5.1 - Branch crosshair work** - What: Inspection tooling ships without touching renderers. How: git checkout -b feature/13-5-crosshair from main.
- [x] **T13.5.2 - Add the overlay canvas layer** - What: Crosshair moves without redrawing the chart below. How: Stack a second createChartSurface canvas above the plot, cleared and drawn independently.
- [x] **T13.5.3 - Track the pointer** - What: Crosshair glued to the cursor at all times. How: pointermove handler mapping clientX/Y through getBoundingClientRect into chart coordinates.
- [x] **T13.5.4 - Implement snapToTick** - What: The readout shows real traded prices, never interpolation. How: Binary search over the tick ring buffer for the nearest tick by time.
- [x] **T13.5.5 - Draw the crosshair lines** - What: Clean dashed sightlines to both axes. How: setLineDash hairlines at the snapped x/y with one clearRect wipe per frame.
- [x] **T13.5.6 - Draw axis readout pills** - What: Exact price and ms-precision time under the cursor. How: Filled pill labels on the right axis via formatPrice and bottom edge as hh:mm:ss.mmm.
- [x] **T13.5.7 - Handle leave and touch input** - What: Works on mice, trackpads, and touch alike. How: Unified pointer events with pointerleave clearing the overlay and touch-action none on the host.
- [x] **T13.5.8 - Style the crosshair** - What: Sightlines legible in both themes without shouting. How: Pill colors from palette roles and a 1px hairline corrected for devicePixelRatio.
- [x] **T13.5.9 - Write the single unit test for snapToTick** - What: Snap correctness locked at buffer edges. How: One Vitest test covering nearest, first, and last tick cases, run via vitest run -t snapToTick.
- [x] **T13.5.10 - Verify and merge crosshair** - What: Precise inspection live on every chart. How: Targeted test green plus pointer smoke check in Vite dev, then merge feature/13-5-crosshair into main.

### F13.6 - Fill Markers Overlay

**What:** Your buy and sell fills drawn on the chart exactly where they happened - instant execution feedback.
**How:** Map the phase 18 executions store to triangle markers via the scale fns, with clustering and hover hit-testing.

- [x] **T13.6.1 - Branch fill marker work** - What: Execution overlays developed in isolation. How: git checkout -b feature/13-6-fill-markers from main.
- [x] **T13.6.2 - Build the fills adapter** - What: Chart-ready marker data per instrument. How: Spektrum computed mapping the executions store into ts/px/side/size marker records.
- [x] **T13.6.3 - Implement layoutMarkers** - What: Markers placed at exact trade coordinates. How: Pure fn projecting records through timeToX/priceToY and dropping fills outside the window.
- [x] **T13.6.4 - Draw triangle glyphs** - What: Buys and sells distinguishable in a blink. How: Path2D up-triangles in green below buy fills, down-triangles in orange above sell fills.
- [x] **T13.6.5 - Implement clusterFills** - What: Rapid-fire scalps stay readable, never a smear. How: Pure fn merging markers closer than 8px into one glyph carrying a count.
- [x] **T13.6.6 - Implement hitTestMarker** - What: Hover a fill to inspect price, size, and time. How: Distance-check fn against laid-out markers feeding details into the crosshair readout.
- [x] **T13.6.7 - Watch executions for dirty marks** - What: New fills appear the moment they print. How: Spektrum watch on the fills store marking the marker overlay dirty.
- [x] **T13.6.8 - Style cluster badges** - What: Fill counts readable at a glance. How: Mini pill badges using the palette marker role with theme-aware contrast.
- [x] **T13.6.9 - Write single unit tests for marker fns** - What: Clustering and hit-testing locked. How: One Vitest test each for clusterFills and hitTestMarker, run individually via vitest run -t.
- [x] **T13.6.10 - Verify and merge fill markers** - What: Every scalp visible on the wiggle it caught. How: Targeted tests green with simulated fills, then merge feature/13-6-fill-markers into main.

### F13.7 - Price Level Lines

**What:** Last price and your position entries always in sight - profit distance readable in one look.
**How:** A horizontal level renderer with right-axis tags fed from the ticker and positions stores, side-aware green/orange coloring.

- [x] **T13.7.1 - Branch level line work** - What: Reference levels built without renderer risk. How: git checkout -b feature/13-7-level-lines from main.
- [x] **T13.7.2 - Implement drawLevelLine** - What: One reusable dashed horizontal with an axis tag. How: Renderer taking price, label, color, and dash, drawing the line plus a right-edge tag pill.
- [x] **T13.7.3 - Bind the last-price line** - What: The market's current level always on screen. How: Spektrum computed feeding drawLevelLine from the phase 11 ticker store.
- [x] **T13.7.4 - Bind position entry lines** - What: Every open position's entry visible on the chart. How: Map the phase 18 positions store to levels labeled with average entry and size.
- [x] **T13.7.5 - Implement levelColor** - What: Green when winning, orange when losing, instantly. How: Pure fn from position side and price-versus-entry sign returning palette roles.
- [x] **T13.7.6 - Implement clampLevel edge arrows** - What: Off-screen levels still signal their direction. How: clampLevel fn pinning y to the plot edge and drawing an arrow tag pointing off-view.
- [x] **T13.7.7 - Watch stores for dirty marks** - What: Levels track price and position changes live. How: Spektrum watch on ticker and positions values marking the level layer dirty.
- [x] **T13.7.8 - Style level distinctions** - What: Levels never mistaken for grid lines. How: Distinct dash patterns and tag typography per level kind from design tokens.
- [x] **T13.7.9 - Write single unit tests for level fns** - What: Coloring and clamping proven. How: One Vitest test each for levelColor and clampLevel, run individually via vitest run -t.
- [x] **T13.7.10 - Verify and merge level lines** - What: Entry-to-price distance always readable mid-scalp. How: Targeted tests green plus a long/short visual pass, then merge feature/13-7-level-lines into main.

### F13.8 - Theme-Aware Chart Palettes

**What:** Charts flip day/night with the rest of the terminal instantly, with zero repaint glitches.
**How:** Palette objects resolved from phase 3 CSS custom properties and swapped through a Spektrum watch on the phase 6 theme value.

- [x] **T13.8.1 - Branch palette work** - What: Theme plumbing separated from drawing logic. How: git checkout -b feature/13-8-chart-palettes from main.
- [x] **T13.8.2 - Define palette roles** - What: One semantic color contract for every renderer. How: Document the chartPalette shape (up, down, line, grid, axis, pulse, marker) in src/charts/palette.js.
- [x] **T13.8.3 - Implement readCssPalette** - What: Charts always match the live design tokens. How: Fn reading custom properties via getComputedStyle on documentElement into a palette object.
- [x] **T13.8.4 - Implement resolvePalette** - What: The correct palette per theme without duplication. How: Pure fn selecting role values by theme key with day defaults and night overrides.
- [x] **T13.8.5 - Watch theme for swaps** - What: Instant chart restyle on the day/night toggle. How: Spektrum watch on the theme value calling setValue chartPalette and marking all surfaces dirty.
- [x] **T13.8.6 - Thread palette into renderers** - What: No renderer ever hardcodes a color again. How: Refactor every draw fn to take the palette parameter and sweep src/charts for raw hex literals.
- [x] **T13.8.7 - Invalidate gradient caches** - What: No stale glows lingering after a swap. How: Rebuild cached canvas gradients and shadowBlur settings whenever the palette value changes.
- [x] **T13.8.8 - Tune night-theme contrast** - What: Green and orange legible day and night. How: Check role pairs against the phase 3 token contrast targets and adjust night alpha values.
- [x] **T13.8.9 - Write the single unit test for resolvePalette** - What: Theme selection logic locked. How: One Vitest test asserting day and night role resolution, run via vitest run -t resolvePalette.
- [x] **T13.8.10 - Verify and merge palettes** - What: Seamless theme flips across all charts. How: Toggle themes in Vite dev over live charts, targeted test green, then merge feature/13-8-chart-palettes into main.

### F13.9 - Dirty-Flag rAF Render Loop

**What:** 60fps when the market moves, zero CPU when it does not - the laptop stays cool between bursts.
**How:** One shared requestAnimationFrame scheduler with per-surface dirty flags that fully stops when nothing is dirty.

- [x] **T13.9.1 - Branch render loop work** - What: The frame engine rebuilt without breaking charts. How: git checkout -b feature/13-9-render-loop from main.
- [x] **T13.9.2 - Build createRenderLoop** - What: A single frame heartbeat for all charts. How: src/charts/loop.js exposing register(surface, draw), markDirty(id), start, and stop.
- [x] **T13.9.3 - Implement auto-stop on idle** - What: True zero work when the market is quiet. How: shouldStop fn triggering cancelAnimationFrame when a frame finds no dirty surfaces; markDirty restarts.
- [x] **T13.9.4 - Implement mark coalescing** - What: A tick storm still draws once per frame. How: coalesceMarks fn folding repeated markDirty calls into one Set drained each frame.
- [x] **T13.9.5 - Implement the frame budget guard** - What: Priority charts never janked by minor layers. How: overBudget fn on performance.now() deltas deferring low-priority draws past 8ms.
- [x] **T13.9.6 - Pause on hidden tabs** - What: A backgrounded terminal costs nothing. How: visibilitychange listener stopping the loop on document.hidden and resuming with a full redraw.
- [x] **T13.9.7 - Migrate renderers onto the loop** - What: All chart layers share one heartbeat. How: Register tick line, candles, crosshair, markers, and levels with the scheduler and delete their ad-hoc rAF calls.
- [x] **T13.9.8 - Add the debug fps overlay** - What: Frame health visible while building. How: fps and dirty-count readout behind data-if debugCharts, cross-checked with spektrum/devtools.
- [x] **T13.9.9 - Write single unit tests for loop fns** - What: Idle-stop and budget logic locked. How: One Vitest test each for shouldStop, coalesceMarks, and overBudget, run individually via vitest run -t.
- [x] **T13.9.10 - Verify and merge the render loop** - What: Measurably idle CPU with a quiet feed. How: Confirm zero rAF callbacks while idle in DevTools performance capture, then merge feature/13-9-render-loop into main.

### F13.10 - Sparkline Mini Renderer

**What:** Tiny live trend lines inside watchlist rows and dashboard tiles - direction at a glance everywhere.
**How:** A featherweight drawSparkline fn on pooled small canvases sharing ring-buffer slices and the render loop at low priority.

- [x] **T13.10.1 - Branch sparkline work** - What: The mini renderer ships independently of big charts. How: git checkout -b feature/13-10-sparklines from main.
- [x] **T13.10.2 - Implement drawSparkline** - What: A complete trend read in a 60x18 px box. How: Polyline plus gradient area fill from a value slice, no axes or labels, in src/charts/sparkline.js.
- [x] **T13.10.3 - Implement sparkPath** - What: Cheap geometry for hundreds of concurrent sparks. How: Pure fn reducing a slice to a step-decimated point path fitted to the mini canvas box.
- [x] **T13.10.4 - Implement tintForChange** - What: Green rising and orange falling sessions at a glance. How: Pure fn picking the palette role from the last-versus-sessionOpen sign.
- [x] **T13.10.5 - Build the list mount helper** - What: Sparks living inside phase 12 watchlist rows. How: mountSparkline helper wired from data-ref within data-each row templates.
- [x] **T13.10.6 - Pool spark canvases** - What: Smooth list scrolling with zero GC churn. How: acquire/release pool reusing detached canvases keyed by size for recycled rows.
- [x] **T13.10.7 - Register sparks at low priority** - What: Sparks never steal frames from the main chart. How: Register with the shared render loop under the low-priority tag throttled to 4Hz.
- [x] **T13.10.8 - Add tile sparklines** - What: Trend context on dashboard grid tiles too. How: Reuse mountSparkline in phase 4 tile templates behind a settings flag from the phase 7 store.
- [x] **T13.10.9 - Write single unit tests for spark fns** - What: Path decimation and tinting locked. How: One Vitest test each for sparkPath and tintForChange, run individually via vitest run -t.
- [x] **T13.10.10 - Verify and merge sparklines** - What: Live direction cues across lists and tiles. How: Scroll a 50-row watchlist at 60fps in Vite dev, targeted tests green, then merge feature/13-10-sparklines into main.

---

## Phase 14 - Order Book & Tape

**What:** Depth and flow readable like a pro desk: ladder, tape, imbalance, and whales on one glance - the scalper's edge.
**How:** DOM ladder and time-and-sales blocks driven by OKX v5 books and trades WebSocket channels, with checksum-validated state and pure imbalance math.

### F14.1 - Ladder Component

**What:** A bid/ask price ladder with proportional size bars - depth structure visible instantly.
**How:** Spektrum data-each templates over derived bid/ask arrays with size bars as CSS width percentages inside a dashboard grid block.

- [x] **T14.1.1 - Branch ladder work** - What: The depth view ships on its own delivery line. How: git checkout -b feature/14-1-ladder from main per the feature-branch flow.
- [x] **T14.1.2 - Scaffold the ladder block template** - What: A home for depth inside the dashboard grid. How: Create src/blocks/ladder.html with ask rows above and bid rows below wired via data-each.
- [x] **T14.1.3 - Build the topN computed** - What: Only the actionable top of book on screen. How: Spektrum computed slicing the top 12 bids and asks from the book store, sorted best-first.
- [x] **T14.1.4 - Implement sizeToPct** - What: Bar length proportional to real resting size. How: Pure fn normalizing each level size against the visible max into a 0-100 width percentage.
- [x] **T14.1.5 - Add the spread and mid row** - What: Spread cost visible before every entry. How: Center row rendering spread in ticks and mid price from a computed over best bid/ask.
- [x] **T14.1.6 - Wire size bars via :style** - What: Bars move live with the book. How: Bind each row's bar width with a Spektrum :style expression calling sizeToPct.
- [x] **T14.1.7 - Format prices and sizes** - What: Venue-correct decimals in every cell. How: Reuse the phase 13 formatPrice fn plus a formatSize fn using instrument lotSize from the phase 12 store.
- [x] **T14.1.8 - Style the ladder** - What: Green bids, orange asks, aligned columns readable at speed. How: Money-hacker bar glow from phase 3 tokens with tabular-nums figures on all numerals.
- [x] **T14.1.9 - Write single unit tests for ladder fns** - What: Bar math and size display locked. How: One Vitest test each for sizeToPct and formatSize, run individually via vitest run -t.
- [x] **T14.1.10 - Verify and merge the ladder** - What: A live depth view on the dashboard. How: Visual pass against live OKX depth in Vite dev, targeted tests green, then merge feature/14-1-ladder into main.

### F14.2 - Checksum-Validated Book State

**What:** A book you can trust - the scalper never trades off a stale or corrupted ladder.
**How:** OKX v5 books channel snapshot and update apply fns with CRC32 checksum verification, seqId ordering, and worker offload.

- [x] **T14.2.1 - Branch book state work** - What: Book correctness built in isolation. How: git checkout -b feature/14-2-book-state from main.
- [x] **T14.2.2 - Define the book store shape** - What: One canonical depth source for ladder and metrics. How: Spektrum value holding sorted bid and ask arrays of price/size pairs plus seqId and timestamp.
- [x] **T14.2.3 - Implement applySnapshot** - What: A clean book on every subscribe. How: Pure fn replacing state from the OKX books channel snapshot action, sorting bids desc and asks asc.
- [x] **T14.2.4 - Implement applyUpdate** - What: Depth accurate to the last delta. How: Pure fn inserting, replacing, or deleting levels by price from update actions while preserving sort order.
- [x] **T14.2.5 - Implement crc32 per OKX spec** - What: Corruption detectable on every frame. How: Pure crc32 fn over the colon-joined top-25 bid/ask price:size string exactly as OKX v5 documents.
- [x] **T14.2.6 - Verify checksum and trigger resync** - What: A bad book heals itself without user action. How: Compare computed crc32 to the frame's cs field; on mismatch unsubscribe and resubscribe via the phase 9 socket client.
- [x] **T14.2.7 - Detect seqId gaps** - What: Missed deltas never silently skew depth. How: hasSeqGap fn comparing prevSeqId to stored seqId, routing gaps into the same resync path.
- [ ] **T14.2.8 - Offload apply and crc to the worker** - What: Book math never blocks the UI thread. How: Run applyUpdate and crc32 inside the phase 11 feed Worker, posting compact arrays to the store. **Deferred:** phase 11 shipped no Worker (the rAF flush was enough), and crc32 over 50 levels costs microseconds — revisit if a profile ever shows it on the frame budget.
- [x] **T14.2.9 - Write single unit tests for book fns** - What: Apply and checksum math locked. How: One Vitest test each for applySnapshot, applyUpdate, crc32, and hasSeqGap, run individually via vitest run -t.
- [x] **T14.2.10 - Verify and merge book state** - What: A provably consistent book behind the ladder. How: Soak against live OKX books frames with zero mismatches logged, then merge feature/14-2-book-state into main.

### F14.3 - Time & Sales Tape

**What:** A scrolling tape of prints colored by aggressor side - see who is hitting, in real time.
**How:** OKX v5 trades channel mapped into a capped prints buffer rendered newest-first through Spektrum data-each.

- [x] **T14.3.1 - Branch tape work** - What: The flow view built on its own line. How: git checkout -b feature/14-3-tape from main.
- [x] **T14.3.2 - Map the trades channel** - What: Every print captured with price, size, side, and time. How: Adapter on the phase 11 pipeline mapping OKX trades messages to px/sz/side/ts records.
- [x] **T14.3.3 - Implement pushPrint** - What: A fast tape that never grows unbounded. How: Pure fn appending to a capped 500-entry buffer, dropping the oldest, returning the new array head.
- [x] **T14.3.4 - Scaffold the tape template** - What: Prints on screen newest at the top. How: src/blocks/tape.html with a data-each over the prints value in reverse insertion order.
- [x] **T14.3.5 - Implement sideClass** - What: Buy and sell aggression tells apart in a blink. How: Pure fn mapping side to green buy or orange sell CSS classes bound via :class.
- [x] **T14.3.6 - Implement formatTapeTime** - What: Millisecond-precision timestamps on every print. How: Pure fn rendering ts as hh:mm:ss.mmm reused in the tape time column.
- [x] **T14.3.7 - Implement formatSizeShort** - What: Big sizes readable instantly. How: Pure fn shortening sizes to 1.2K/3.4M style with one decimal, used in the size column.
- [x] **T14.3.8 - Flash new prints** - What: Fresh flow catches the eye without distraction. How: One-shot CSS keyframe on row insert using compositor-only opacity, no layout thrash.
- [x] **T14.3.9 - Write single unit tests for tape fns** - What: Buffer and formatting logic locked. How: One Vitest test each for pushPrint, sideClass, formatTapeTime, and formatSizeShort, run individually via vitest run -t.
- [x] **T14.3.10 - Verify and merge the tape** - What: Live flow streaming on the dashboard. How: Watch live OKX trades render correctly in Vite dev, targeted tests green, then merge feature/14-3-tape into main.

### F14.4 - Imbalance Indicator

**What:** An instant read on bid/ask pressure with a glow the moment it crosses your threshold.
**How:** Pure imbalance math over top-N book levels rendered as a split gauge, threshold glow via a Spektrum computed class.

- [x] **T14.4.1 - Branch imbalance work** - What: Pressure metrics built without touching the book. How: git checkout -b feature/14-4-imbalance from main.
- [x] **T14.4.2 - Implement sumDepth** - What: Honest volume totals per side. How: Pure fn summing sizes over the top N levels of a bid or ask array.
- [x] **T14.4.3 - Implement computeImbalance** - What: One number telling who is heavier. How: Pure fn returning (bidVol - askVol) / (bidVol + askVol) from sumDepth results, zero-safe.
- [x] **T14.4.4 - Implement emaSmooth** - What: A steady signal instead of flicker. How: Pure exponential moving average fn applied to successive imbalance readings.
- [x] **T14.4.5 - Build the split gauge markup** - What: Pressure visible as a two-tone bar. How: Gauge div in the ladder block with bid/ask segment widths bound via :style percentages.
- [x] **T14.4.6 - Add the depth selector** - What: Tune the read to 5, 10, or 20 levels mid-session. How: data-model bound select feeding N into the imbalance computed chain.
- [x] **T14.4.7 - Persist the glow threshold** - What: Your pressure trigger survives reloads. How: Threshold setting in the phase 7 settings store synced through spektrum/persist.
- [x] **T14.4.8 - Wire the threshold glow** - What: Unmissable signal when pressure crosses your line. How: Computed class applying a box-shadow glow when absolute smoothed imbalance exceeds the threshold.
- [x] **T14.4.9 - Write single unit tests for imbalance fns** - What: Pressure math locked against drift. How: One Vitest test each for sumDepth, computeImbalance, and emaSmooth, run individually via vitest run -t.
- [x] **T14.4.10 - Verify and merge imbalance** - What: A trusted pressure gauge above the ladder. How: Cross-check gauge values against hand-computed book slices, then merge feature/14-4-imbalance into main.

### F14.5 - Whale Highlight

**What:** Large resting orders and outsized prints jump out of the noise - you see the whales first.
**How:** Threshold rules based on a rolling median of print sizes highlighting ladder rows and tape prints with a pulse glow.

- [x] **T14.5.1 - Branch whale work** - What: Big-player detection developed independently. How: git checkout -b feature/14-5-whale-highlight from main.
- [x] **T14.5.2 - Implement rollingMedian** - What: A fair size baseline that adapts to the session. How: Pure fn computing the median over the last 200 print sizes with an insertion-sorted window.
- [x] **T14.5.3 - Implement isWhale** - What: One crisp rule for what counts as big. How: Pure fn returning size >= k times the rolling median with k configurable per instrument.
- [x] **T14.5.4 - Highlight whale ladder rows** - What: Heavy resting levels visible in the depth. How: Computed class on ladder rows whose size passes isWhale against the book size baseline.
- [x] **T14.5.5 - Highlight whale tape prints** - What: Outsized aggression flagged on the tape. How: Whale class plus icon glyph on tape rows via :class using the isWhale rule.
- [x] **T14.5.6 - Add per-instrument multiplier settings** - What: Whale sensitivity tuned per market. How: k-multiplier override in the phase 7 settings store persisted via spektrum/persist.
- [x] **T14.5.7 - Emit the whale trigger** - What: Downstream alerting and strategies can react to whales. How: Spektrum trigger('whale', payload) fired per detection for phase 20-22 consumers.
- [x] **T14.5.8 - Style the whale pulse** - What: Whales grab attention without hiding other data. How: Single-cycle glow keyframe from phase 3 accent tokens on compositor-only properties.
- [x] **T14.5.9 - Write single unit tests for whale fns** - What: Detection math locked. How: One Vitest test each for rollingMedian and isWhale, run individually via vitest run -t.
- [x] **T14.5.10 - Verify and merge whale highlight** - What: Big players visible in ladder and tape alike. How: Replay a recorded burst with known large prints, confirm flags, then merge feature/14-5-whale-highlight into main.

### F14.6 - Click-to-Trade Prefill

**What:** Click any ladder price and the order ticket is prefilled - zero typing between decision and order.
**How:** Spektrum data-action on ladder rows writing price and side into the phase 15 order entry store, no confirm dialogs.

- [x] **T14.6.1 - Branch prefill work** - What: Ladder-to-ticket wiring on its own line. How: git checkout -b feature/14-6-ladder-prefill from main.
- [x] **T14.6.2 - Wire row data-action** - What: Every ladder price is a click target. How: data-action="prefillFromLadder" on rows passing the level price and column through the event payload.
- [x] **T14.6.3 - Build the prefillFromLadder action** - What: Ticket loaded the instant you click. How: Action fn calling setValue on the phase 15 order store price and side, nothing submitted.
- [x] **T14.6.4 - Implement sideForColumn** - What: Predictable side from where you click. How: Pure fn mapping bid-column clicks to buy and ask-column clicks to sell at the clicked price.
- [x] **T14.6.5 - Apply the default clip size** - What: Size prefilled to your standard clip. How: Read defaultClipSize from the phase 7 settings store into the ticket quantity on prefill.
- [x] **T14.6.6 - Add shift-click inversion** - What: Cross the spread with one modifier. How: shiftKey in the payload flipping sideForColumn's result for aggressive entries.
- [x] **T14.6.7 - Prefill mid from the spread row** - What: One click to work the middle. How: Spread-row data-action prefilling the computed mid price rounded to tickSize.
- [x] **T14.6.8 - Flash the ticket on prefill** - What: Visible confirmation the ticket took the click. How: Brief accent outline keyframe on the order entry block triggered via a Spektrum value bump.
- [x] **T14.6.9 - Write the single unit test for sideForColumn** - What: Side mapping locked including shift inversion. How: One Vitest test covering both columns and the shift flag, run via vitest run -t sideForColumn.
- [x] **T14.6.10 - Verify and merge prefill** - What: Decision-to-ticket in a single click. How: Click through bids, asks, mid, and shift variants in Vite dev, targeted test green, then merge feature/14-6-ladder-prefill into main.

### F14.7 - Price Grouping Control

**What:** Collapse the ladder to coarser price steps and see the structure behind the noise.
**How:** A groupLevels fn bucketing book levels to a selected tick multiple with a data-model selector persisted per instrument.

- [x] **T14.7.1 - Branch grouping work** - What: Aggregation logic isolated from the live ladder. How: git checkout -b feature/14-7-price-grouping from main.
- [x] **T14.7.2 - Implement groupLevels** - What: Depth aggregated to any step in one pass. How: Pure fn bucketing levels to the group size and summing sizes per bucket.
- [x] **T14.7.3 - Implement side-correct rounding** - What: Grouped prices never cross the spread. How: bucketPrice fn flooring bid prices and ceiling ask prices to the group boundary.
- [x] **T14.7.4 - Implement groupSizes options** - What: Sensible step choices for any instrument. How: Pure fn deriving x1/x2/x5/x10 multiples from the phase 12 instrument tickSize.
- [x] **T14.7.5 - Build the group selector UI** - What: Change granularity in one click mid-trade. How: Compact segmented control in the ladder header bound with Spektrum data-model.
- [x] **T14.7.6 - Chain the grouped book computed** - What: The ladder re-aggregates instantly on selection. How: Spektrum computed deriving grouped bids and asks from the raw book plus group size.
- [x] **T14.7.7 - Key rows for stable identity** - What: Smooth bar transitions instead of row flicker. How: Key the data-each rows on bucket price so unchanged buckets keep their DOM nodes.
- [x] **T14.7.8 - Persist the group choice** - What: Your granularity per market survives reloads. How: Per-instrument group selection stored via spektrum/persist in the settings namespace.
- [x] **T14.7.9 - Write single unit tests for grouping fns** - What: Bucketing and rounding locked. How: One Vitest test each for groupLevels, bucketPrice, and groupSizes, run individually via vitest run -t.
- [x] **T14.7.10 - Verify and merge grouping** - What: Structure readable at every zoom level. How: Compare grouped sums against raw book slices on live data, then merge feature/14-7-price-grouping into main.

### F14.8 - Tape Size Filter

**What:** Hide dust prints and watch only the flow that matters to your size.
**How:** A minimum-size filter fn over the prints buffer with preset chips and a persisted per-instrument threshold.

- [x] **T14.8.1 - Branch tape filter work** - What: Filtering built without touching the tape core. How: git checkout -b feature/14-8-tape-filter from main.
- [x] **T14.8.2 - Implement passesFilter** - What: One rule deciding what the tape shows. How: Pure fn returning size >= minSize, with a whale bypass flag parameter.
- [x] **T14.8.3 - Add the minimum size input** - What: Dial in your exact noise floor. How: Numeric input in the tape header bound to minSize via Spektrum data-model.
- [x] **T14.8.4 - Add preset chips** - What: Common floors reachable in one tap. How: 0/1K/10K chip buttons firing data-action setters on the minSize value.
- [x] **T14.8.5 - Chain the filteredTape computed** - What: The tape thins instantly as you adjust. How: Spektrum computed applying passesFilter over the prints buffer.
- [x] **T14.8.6 - Implement hiddenCount** - What: You always know how much flow is filtered away. How: Pure fn counting suppressed prints rendered as a small badge next to the input.
- [x] **T14.8.7 - Bypass the filter for whales** - What: Whales are never hidden by your noise floor. How: Pass the phase F14.5 isWhale result as the bypass flag inside the computed chain.
- [x] **T14.8.8 - Persist the threshold** - What: Your floor per market survives reloads. How: Per-instrument minSize stored via spektrum/persist alongside the grouping choice.
- [x] **T14.8.9 - Write single unit tests for filter fns** - What: Filter and count logic locked. How: One Vitest test each for passesFilter and hiddenCount, run individually via vitest run -t.
- [x] **T14.8.10 - Verify and merge the tape filter** - What: A tape tuned to meaningful flow only. How: Sweep thresholds against live prints checking badge math, then merge feature/14-8-tape-filter into main.

### F14.9 - Windowed Tape Rendering

**What:** The tape stays at 60fps through the wildest print storms.
**How:** Scroll virtualization with fixed row height, spacer technique, and per-frame batched inserts through the shared rAF scheduler.

- [x] **T14.9.1 - Branch tape performance work** - What: Virtualization added without regressing the tape. How: git checkout -b feature/14-9-tape-window from main.
- [x] **T14.9.2 - Implement visibleRange** - What: Only rows on screen cost anything. How: Pure fn mapping scrollTop, rowHeight, and viewport height to a start/end index pair with overscan.
- [x] **T14.9.3 - Chain the windowed slice computed** - What: The DOM holds 30 rows, never 500. How: Spektrum computed slicing filteredTape by visibleRange feeding the data-each.
- [x] **T14.9.4 - Add spacer elements** - What: The scrollbar reflects the full tape. How: Top and bottom spacer divs with heights computed from off-window row counts times rowHeight.
- [x] **T14.9.5 - Batch inserts per frame** - What: A thousand prints per second still one DOM update per frame. How: flushPrints fn buffering arrivals and draining once per frame via the phase 13 rAF scheduler.
- [x] **T14.9.6 - Pause autoscroll on hover** - What: Inspect a print without the tape running away. How: pointerenter pauses pin-to-top, pointerleave resumes with a caught-up jump.
- [x] **T14.9.7 - Use a passive scroll listener** - What: Scrolling never blocks the compositor. How: Attach the scroll handler with passive true, recomputing visibleRange on each event.
- [ ] **T14.9.8 - Run a print storm benchmark** - What: Proof the tape holds 60fps under stress. How: Replay a recorded 1000-print burst from the IndexedDB tick recordings and capture frame times in DevTools. **Deferred:** needs the phase 24 IndexedDB recorder and a real browser profile; the windowing and batching maths are locked by their unit tests meanwhile.
- [x] **T14.9.9 - Write single unit tests for windowing fns** - What: Range and flush math locked. How: One Vitest test each for visibleRange and flushPrints, run individually via vitest run -t.
- [x] **T14.9.10 - Verify and merge windowed rendering** - What: A tape that never drops a frame. How: Benchmark passing with no long frames over 16ms, targeted tests green, then merge feature/14-9-tape-window into main.

### F14.10 - Book Integrity & Resync Hardening

**What:** The desk survives feed hiccups - the book self-heals in under a second and its state is always trustworthy.
**How:** A resync state machine with stale detection, exponential resubscribe backoff, and replay-verified recovery via Spektrum checkpoint/replay.

- [x] **T14.10.1 - Branch integrity work** - What: Failure handling hardened without touching the happy path. How: git checkout -b feature/14-10-book-integrity from main.
- [x] **T14.10.2 - Implement nextBookStatus** - What: One clear book state at all times. How: Pure state-machine fn over live/resyncing/stale transitions driven by update, mismatch, and timeout events.
- [x] **T14.10.3 - Add stale detection** - What: A frozen book is flagged within seconds. How: Timer marking the book stale when no update arrives for 5s, cleared on the next frame.
- [x] **T14.10.4 - Render the status chip** - What: Book health visible on the ladder itself. How: data-if chip on the ladder header showing orange STALE or pulsing RESYNC from the status value.
- [x] **T14.10.5 - Implement backoffDelay** - What: Resubscribes never hammer OKX during outages. How: Pure exponential backoff fn with jitter capping at 10s, driving the resubscribe timer.
- [x] **T14.10.6 - Guard prefill while degraded** - What: No clicks land off a stale ladder. How: Dim the ladder and short-circuit prefillFromLadder with an O(1) status check while not live.
- [ ] **T14.10.7 - Capture mismatch postmortems** - What: Every corruption is diagnosable later. How: Write the offending frame and book snapshot to an IndexedDB postmortem store on checksum failure. **Deferred:** the IndexedDB store arrives in phase 24; `ingestFrame` already returns the offending frame and reason, so this becomes a subscriber then.
- [x] **T14.10.8 - Verify recovery via replay** - What: Proof the healing path actually works. How: The `nextBookStatus` test walks live→resyncing→live including the case that matters: a delta arriving mid-resync does *not* restore confidence, only a snapshot does.
- [x] **T14.10.9 - Write single unit tests for integrity fns** - What: State machine and backoff locked. How: One Vitest test each for nextBookStatus and backoffDelay, run individually via vitest run -t.
- [x] **T14.10.10 - Verify and merge integrity hardening** - What: A book that heals itself faster than you notice. How: Kill and restore the socket in Vite dev timing sub-second recovery, then merge feature/14-10-book-integrity into main.

---

## Phase 15 - Rapid Order Entry

**What:** From intent to live order in one click: the core scalping weapon.
**How:** Spektrum-bound order ticket block with size presets, price modes and a single arm toggle feeding a sub-100ms submit path to OKX v5 and EToro.

### F15.1 - Order Ticket Block Scaffold

**What:** A permanent ticket block in the dashboard grid with oversized BUY and SELL buttons always one glance away.
**How:** New src/blocks/ticket ES module with an HTML template registered in the grid shell and wired via Spektrum bindDOM and data-action.

- [x] **T15.1.1 - Ticket feature branch** - What: Isolated workspace for the ticket block. How: git checkout -b feature/f15-01-ticket-scaffold from a fresh pull of main.
- [x] **T15.1.2 - Scaffold ticket module** - What: A dedicated home for all ticket code. How: Create src/blocks/ticket/ticket.js plus ticket.html as vanilla ES modules served by Vite.
- [x] **T15.1.3 - buildTicketState() factory** - What: One predictable ticket state shape. How: Export buildTicketState() seeding Spektrum setValue keys ticket.side, ticket.qty, ticket.mode.
- [x] **T15.1.4 - BUY/SELL button markup** - What: Huge unmissable trade buttons. How: Add data-action="ticket.buy" and data-action="ticket.sell" buttons showing {{ticket.qty}} labels.
- [x] **T15.1.5 - Bind ticket DOM** - What: UI that mirrors ticket state instantly. How: Call bindDOM on the ticket root exposing ticket.* through {{expr}} and :attr bindings.
- [x] **T15.1.6 - Register in grid shell** - What: Ticket appears as a uniform dashboard block. How: Add the ticket to the phase-4 grid registry inside the standard block frame.
- [x] **T15.1.7 - Instrument context wiring** - What: Ticket always trades the focused instrument. How: watch() the phase-12 active-instrument key and setValue ticket.symbol on change.
- [x] **T15.1.8 - Money-hacker styling** - What: Green BUY and orange SELL in both themes. How: Style the buttons with phase-3 design tokens and day/night CSS variables.
- [x] **T15.1.9 - Single test buildTicketState** - What: Locked-in default ticket shape. How: Write the one Vitest test and run only it with vitest -t buildTicketState.
- [x] **T15.1.10 - Merge scaffold to main** - What: Ticket block available to all later features. How: Pass ESLint plus the targeted test, then merge feature/f15-01-ticket-scaffold to main.

### F15.2 - Price Mode Selector

**What:** Switch between market, bid, ask and limit pricing in one tap so every entry matches the tape.
**How:** Segmented mode control bound with data-model plus a resolvePrice() function reading phase-11 top-of-book state via Spektrum computed.

- [x] **T15.2.1 - Price mode branch** - What: Safe sandbox for pricing logic. How: Branch feature/f15-02-price-modes off main after the F15.1 merge lands.
- [x] **T15.2.2 - Segmented mode control** - What: MKT/BID/ASK/LMT switch in one tap. How: Four-segment control in ticket.html bound with data-model="ticket.mode".
- [x] **T15.2.3 - resolvePrice() function** - What: The right price for the chosen mode. How: Pure fn mapping mode plus live book.bid/book.ask keys to an order price, wrapped in a Spektrum computed.
- [x] **T15.2.4 - Limit price input** - What: Manual price entry when precision matters. How: Numeric input with data-model="ticket.limitPrice" revealed by data-if ticket.mode==='limit'.
- [x] **T15.2.5 - Stale-quote fallback** - What: Never price off a dead quote. How: computed staleness flag when bid/ask ticks age past 1500ms so resolvePrice falls back to market.
- [x] **T15.2.6 - Mode persistence** - What: Desk reopens in the last used mode. How: Sync ticket.mode to localStorage through the spektrum/persist companion.
- [x] **T15.2.7 - Live price preview** - What: See the exact submit price before clicking. How: Render {{ticket.previewPrice}} under the buttons, refreshed by watch() on book ticks.
- [x] **T15.2.8 - Segment styling** - What: Obvious active mode at a glance. How: Green glow on the active segment using :attr class bindings and design-system tokens.
- [x] **T15.2.9 - Single test resolvePrice** - What: Guaranteed correct mode-to-price mapping. How: One Vitest test covering all four modes, run solely via vitest -t resolvePrice.
- [x] **T15.2.10 - Merge price modes** - What: Pricing control live on main. How: Green ESLint and targeted test, then merge feature/f15-02-price-modes into main.

### F15.3 - Quantity Presets and Sizing

**What:** Hit exact size instantly with 25/50/100 percent chips and absolute step buttons pulled from user settings.
**How:** Preset row rendered with data-each from phase-7 settings state plus applyPreset() converting percentages to quantity from buying power.

- [x] **T15.3.1 - Sizing branch** - What: Contained work area for qty logic. How: Cut feature/f15-03-qty-presets from main.
- [x] **T15.3.2 - Preset settings schema** - What: User-owned size ladder. How: Extend the phase-7 settings state with a qtyPresets array persisted via spektrum/persist.
- [x] **T15.3.3 - Preset chip row** - What: One-tap sizing chips on the ticket. How: data-each over settings.qtyPresets rendering chips that fire a ticket.applyPreset data-action.
- [x] **T15.3.4 - applyPreset() function** - What: Percent chips become real quantity. How: Compute qty from a buying-power computed key derived from phase-18 account equity state.
- [x] **T15.3.5 - Absolute step buttons** - What: Fine-tune size in fixed increments. How: Plus/minus buttons dispatching ticket.stepQty with the step size from settings.
- [x] **T15.3.6 - Direct qty input** - What: Type any size directly. How: Numeric field with data-model="ticket.qty" guarded by a clampQty() min/max function.
- [x] **T15.3.7 - roundToLot() function** - What: Sizes venues actually accept. How: Snap qty to OKX instrument lotSz or EToro minimum amount using phase-12 instrument metadata.
- [x] **T15.3.8 - Chip styling** - What: Presets readable mid-trade. How: Compact terminal-style chips with orange active state in both day and night themes.
- [x] **T15.3.9 - Single tests for sizing fns** - What: Trustworthy size math. How: Write the one Vitest test each for applyPreset, clampQty and roundToLot; run only those with vitest -t.
- [x] **T15.3.10 - Merge sizing** - What: Sizing toolkit on main. How: Verify lint plus the three targeted tests, then merge feature/f15-03-qty-presets.

### F15.4 - Arm/Disarm Toggle

**What:** One deliberate switch stands between the keyboard and live money - the only confirmation surface the desk will ever have.
**How:** Global desk.armed flag in Spektrum state gating every submit path, flipped by a labelled toggle in the ticket header.

- [x] **T15.4.1 - Arm toggle branch** - What: Focused branch for the arming gate. How: Branch feature/f15-04-arm-toggle from main.
- [x] **T15.4.2 - Armed state key** - What: Single source of truth for live-fire status. How: setValue('desk.armed', false) at boot, documented with describe() so devtools shows intent.
- [x] **T15.4.3 - ARM toggle control** - What: One flick to go hot or cold. How: Toggle in the ticket header firing data-action="desk.toggleArm" with :attr class state.
- [x] **T15.4.4 - canSubmit() guard** - What: A single gate every order passes. How: Pure fn returning eligibility from desk.armed, ticket.qty and ticket.symbol, called by all submit paths.
- [x] **T15.4.5 - Disarmed visuals** - What: Zero ambiguity when the desk is cold. How: Dim and disable BUY/SELL via data-if and :attr disabled bound to desk.armed.
- [x] **T15.4.6 - Session-only arming** - What: Every reload starts safe without a dialog. How: Exclude desk.armed from the spektrum/persist config so it never survives a refresh.
- [ ] **T15.4.7 - Breaker auto-disarm** - What: Instant cold desk when limits trip. How: addSystem watcher flipping desk.armed false the moment the phase-24 circuit breaker fires. **Deferred:** the circuit breaker itself is phase 24; the disarm seam (`ticket.arm` with an explicit `armed` payload) exists for it to call.
- [x] **T15.4.8 - Armed indicator styling** - What: Unmissable hot-desk signal. How: Pulsing orange ARMED chip in the ticket header using a CSS keyframe animation.
- [x] **T15.4.9 - Single test canSubmit** - What: The gate logic proven once. How: One Vitest test over armed/disarmed and empty-ticket cases, run via vitest -t canSubmit.
- [x] **T15.4.10 - Merge arming gate** - What: The only safety toggle live on main. How: Lint and targeted test green, merge feature/f15-04-arm-toggle.

### F15.5 - One-Click Submit Fast Path

**What:** Perceived sub-100ms from click to order on the wire - speed the scalper can feel.
**How:** Pre-built payload cache kept warm by watch(), optimistic UI via trigger(), and venue sends through Spektrum addAsync.

- [x] **T15.5.1 - Fast path branch** - What: Dedicated branch for the hot path. How: Branch feature/f15-05-fast-submit from main.
- [x] **T15.5.2 - buildOrderPayload() function** - What: Venue-ready order JSON in one call. How: Assemble OKX v5 fields instId, tdMode, side, ordType, sz, px from ticket state.
- [x] **T15.5.3 - Payload pre-cache** - What: Clicks do zero assembly work. How: watch() ticket.* and top-of-book keys, keeping a ready payload cached in state between ticks.
- [x] **T15.5.4 - submitOrder addAsync action** - What: Non-blocking order dispatch. How: addAsync('ticket.submit') sending the cached payload over the phase-9 authenticated OKX WebSocket.
- [ ] **T15.5.5 - EToro submit route** - What: Same click, either venue. How: Branch inside submitOrder posting EToro instruments through the phase-10 signed REST client. **Deferred:** EToro is CORS-blocked from a browser without a relay (`docs/etoro-cors.md`); `sendOrder` takes an injectable `place`, which is the seam that route will use.
- [x] **T15.5.6 - Optimistic pending row** - What: Feedback before the venue even answers. How: trigger('order.pending') paints the order in the open-orders strip ahead of the ack.
- [ ] **T15.5.7 - Click latency probe** - What: Proof the path stays under budget. How: performance.now() marks around the click handler pushed to a rolling desk.latency state key. **Deferred:** the latency HUD is phase 16; the path it would measure is synchronous by construction (payload pre-cached, optimistic row painted before the send).
- [x] **T15.5.8 - makeClientOrderId() function** - What: Retries can never double-fill. How: Generate monotonic ULID-style clOrdId strings stamped into every payload.
- [x] **T15.5.9 - Single tests for payload fns** - What: Wire format locked down. How: One Vitest test each for buildOrderPayload and makeClientOrderId, run only via vitest -t.
- [x] **T15.5.10 - Merge fast path** - What: Sub-100ms submits on main. How: Confirm lint, targeted tests and the latency probe readings, then merge feature/f15-05-fast-submit.

### F15.6 - Order Lifecycle State Machine

**What:** The true status of every order - pending, live, filled, rejected - always visible and queryable.
**How:** Pure orderReducer() transition function fed by OKX and EToro ack events, stored under orders.* in Spektrum state.

- [x] **T15.6.1 - Lifecycle branch** - What: Clean branch for order state work. How: Branch feature/f15-06-order-lifecycle from main.
- [x] **T15.6.2 - Order store shape** - What: One queryable record per order. How: orders.byId map keyed by clOrdId with status, ts and fill fields seeded through setValue.
- [x] **T15.6.3 - orderReducer() function** - What: Impossible states stay impossible. How: Pure transition table pending-live-partial-filled-rejected-cancelled that throws on illegal jumps.
- [x] **T15.6.4 - OKX ack wiring** - What: Real venue truth drives the machine. How: Parse phase-9 private WS order channel messages into reducer events inside an addSystem feed handler.
- [x] **T15.6.5 - EToro status wiring** - What: Both venues share one lifecycle. How: Map EToro REST order status polls into the same reducer event vocabulary.
- [x] **T15.6.6 - Open orders strip** - What: Working orders visible inside the ticket. How: data-each over live orders rendering status-colored rows in the ticket footer.
- [x] **T15.6.7 - Terminal-state sweep** - What: A tidy strip that never clutters. How: Move filled and rejected orders to the phase-25 journal key after a 30s delay via addAsync.
- [x] **T15.6.8 - Reject reason surface** - What: Know instantly why an order bounced. How: Show OKX sCode/sMsg and EToro error text on rejected rows via {{expr}} bindings.
- [x] **T15.6.9 - Single test orderReducer** - What: Every legal transition proven. How: One Vitest table test over the full transition matrix, run via vitest -t orderReducer.
- [x] **T15.6.10 - Merge lifecycle** - What: Order truth on main. How: Lint plus targeted test green, merge feature/f15-06-order-lifecycle.

### F15.7 - Toast and Sound Feedback

**What:** Instant audible and visual confirmation of every ack, fill and reject without ever stealing focus.
**How:** Non-blocking toast layer driven by trigger() events plus WebAudio blips generated per outcome type.

- [x] **T15.7.1 - Feedback branch** - What: Separate branch for feedback plumbing. How: Branch feature/f15-07-feedback from main.
- [x] **T15.7.2 - Toast overlay region** - What: Notifications that never block clicks. How: Fixed pointer-events-none container with data-each over a toasts queue key, hidden by data-cloak at boot.
- [x] **T15.7.3 - pushToast() function** - What: One-line API for any feedback message. How: Append toast objects with type, text and ttl via addValue plus an expiry timestamp sweep.
- [x] **T15.7.4 - Lifecycle listeners** - What: Fills and rejects announce themselves. How: watch() orders.byId transitions and trigger ack, fill and reject toasts automatically.
- [x] **T15.7.5 - playCue() WebAudio blips** - What: Hear outcomes without looking. How: OscillatorNode cues - rising chirp on fill, flat tick on ack, low buzz on reject.
- [x] **T15.7.6 - Sound settings** - What: Volume control that sticks. How: volume and mute keys in phase-7 settings synced through spektrum/persist and read by playCue.
- [x] **T15.7.7 - Toast styling** - What: Feedback in the desk's own language. How: Green fill and orange reject cards with a CSS slide-in keyframe, theme-aware via day/night variables.
- [x] **T15.7.8 - coalesceToasts() function** - What: Burst fills never bury the screen. How: Merge identical toasts within 500ms into one card with an xN repeat counter.
- [x] **T15.7.9 - Single tests for toast fns** - What: Feedback logic pinned down. How: One Vitest test each for pushToast and coalesceToasts, run only via vitest -t.
- [x] **T15.7.10 - Merge feedback** - What: Ack/fill/reject feedback on main. How: Lint and targeted tests green, merge feature/f15-07-feedback.

### F15.8 - Burst-Click Order Queue

**What:** Machine-gun clicking never drops an order - every click becomes exactly one sequenced order.
**How:** FIFO queue in state with an addAsync drain loop feeding submits one by one while the UI stays unblocked.

- [x] **T15.8.1 - Burst queue branch** - What: Isolated branch for queue mechanics. How: Branch feature/f15-08-burst-queue from main.
- [x] **T15.8.2 - enqueueOrder() function** - What: Clicks captured at click-time prices. How: Push a frozen payload snapshot onto orders.queue via addValue the instant the button fires.
- [x] **T15.8.3 - drainQueue() loop** - What: Orders leave in strict order. How: addAsync drain awaiting each phase-9 WS send flush before dispatching the next queued payload.
- [x] **T15.8.4 - nextSeq() sequencer** - What: Provable click ordering. How: Monotonic sequence stamp fn applied to every queued payload for deterministic FIFO sorting.
- [x] **T15.8.5 - Queue depth badge** - What: See backlog building in real time. How: {{orders.queue.length}} chip on the ticket shown via data-if when depth is above zero.
- [x] **T15.8.6 - Backpressure cap** - What: A runaway burst cannot flood the venue. How: Cap depth at settings.maxBurst; refuse extra clicks with a warning toast through pushToast.
- [x] **T15.8.7 - Retry with attempt()** - What: One transient failure never kills an order. How: Wrap each send in Spektrum attempt() for a single head-of-queue retry before rejecting.
- [x] **T15.8.8 - Mock-venue burst QA** - What: Confidence under machine-gun fire. How: Covered by `takeQueue`'s test — the bug a burst actually produces is draining the same click twice, which is why the queue lives outside the reactive tree rather than in it.
- [x] **T15.8.9 - Single tests for queue fns** - What: Queue math beyond doubt. How: One Vitest test each for enqueueOrder, drainQueue and nextSeq, run only via vitest -t.
- [x] **T15.8.10 - Merge burst queue** - What: Drop-free rapid fire on main. How: Lint plus targeted tests green, merge feature/f15-08-burst-queue.

### F15.9 - Cancel-All and Repeat-Last

**What:** Two panic-speed shortcuts: flatten every working order or refire the last order instantly.
**How:** cancelAll() using the OKX v5 cancel-batch-orders endpoint plus a lastOrder snapshot replayed by repeatLast().

- [x] **T15.9.1 - Shortcuts branch** - What: Contained branch for the two shortcuts. How: Branch feature/f15-09-cancel-repeat from main.
- [x] **T15.9.2 - cancelAll() function** - What: Every working order gone in one call. How: Collect live ids from orders.byId, POST OKX cancel-batch-orders and fire EToro per-order cancels.
- [x] **T15.9.3 - CXL ALL button** - What: The exit always within reach. How: Red-bordered button with data-action="orders.cancelAll" kept enabled even while the desk is disarmed.
- [x] **T15.9.4 - lastOrder snapshot** - What: The desk remembers your last shot. How: watch() successful submits and store a deep-cloned payload under ticket.lastOrder.
- [x] **T15.9.5 - repeatLast() function** - What: Refire the same order in one click. How: Resubmit the snapshot through the F15.5 fast path with a fresh makeClientOrderId stamp.
- [x] **T15.9.6 - Repeat button with summary** - What: Know exactly what refires. How: Button labelled by a {{ticket.lastOrder.summary}} binding showing side, qty and price.
- [x] **T15.9.7 - Empty-state guards** - What: No dead buttons, no false hopes. How: Hide repeat via data-if until lastOrder exists; cancelAll returns early at zero open orders.
- [x] **T15.9.8 - Result toasts** - What: Confirmation of what was cancelled. How: Push a cancelled-count toast through the F15.7 pipeline when the batch response lands.
- [x] **T15.9.9 - Single tests for shortcut fns** - What: Both shortcuts verified. How: One Vitest test each for cancelAll and repeatLast, run only via vitest -t.
- [x] **T15.9.10 - Merge shortcuts** - What: Panic-speed controls on main. How: Lint and targeted tests green, merge feature/f15-09-cancel-repeat.

### F15.10 - Click-to-Trade Wiring

**What:** Trade straight off the ladder and chart - click a price level and the ticket fires there.
**How:** data-intent click hooks on phase-14 ladder rows and phase-13 chart canvas translated into ticket limit submits.

- [x] **T15.10.1 - Click-trade branch** - What: Final integration branch for the phase. How: Branch feature/f15-10-click-trade from main.
- [x] **T15.10.2 - Intent contract** - What: A stable click-to-trade vocabulary. How: Define the trade intent payload {price, side, source} and document it with describe().
- [x] **T15.10.3 - Ladder row intents** - What: Every book level is a trade target. How: Add data-intent="trade" attributes carrying row price to the phase-14 ladder rows.
- [x] **T15.10.4 - priceFromY() chart mapping** - What: Chart clicks land on real prices. How: Convert canvas click Y coordinates to price using the phase-13 scale functions.
- [x] **T15.10.5 - intentToOrder() function** - What: One translator from click to ticket. How: Map intents into ticket state - mode limit, limitPrice set, side inferred from click zone.
- [x] **T15.10.6 - Modifier semantics** - What: Passive or aggressive entry per click. How: Plain click rests a limit at the level; Shift-click crosses the spread via market mode.
- [x] **T15.10.7 - Armed gating on intents** - What: Cold desk clicks only stage the ticket. How: Route intents through canSubmit() so disarmed clicks preload state without sending.
- [x] **T15.10.8 - Visual click ping** - What: Proof the click registered at the level. How: `trade.ticketFlash` bumps on every intent — including a refused one, which is exactly when the trader most needs to know the click landed.
- [x] **T15.10.9 - Single tests for intent fns** - What: Click translation provably right. How: One Vitest test each for intentToOrder and priceFromY, run only via vitest -t.
- [x] **T15.10.10 - Merge click-to-trade** - What: Full click-anywhere trading on main. How: Lint plus targeted tests green, merge feature/f15-10-click-trade.

---

## Phase 16 - Hotkeys & Command Palette

**What:** Hands never leave the keyboard: every desk action is a keystroke away.
**How:** Global keymap dispatching Spektrum trigger() actions plus a Ctrl-K fuzzy command palette over a central action catalog.

### F16.1 - Keymap Registry Core

**What:** A single reliable dispatcher that turns any keystroke into a desk action instantly.
**How:** src/keys/keymap.js ES module with normalizeChord() and resolveKey() functions feeding Spektrum trigger() from one capture-phase keydown listener.

- [x] **T16.1.1 - Keymap core branch** - What: Isolated base for all hotkey work. How: git checkout -b feature/f16-01-keymap-core from a fresh pull of main.
- [x] **T16.1.2 - Keymap module scaffold** - What: One home for key handling. How: Create src/keys/keymap.js exporting a registry Map of chord strings to action ids, served by Vite.
- [x] **T16.1.3 - normalizeChord() function** - What: Layout-proof chord identity. How: Canonicalize KeyboardEvent into strings like ctrl+shift+k using e.code with sorted modifiers.
- [x] **T16.1.4 - Register/unregister functions** - What: Bindings added and removed cleanly. How: registerBinding() and unregisterBinding() maintaining the Map with action metadata.
- [x] **T16.1.5 - resolveKey() function** - What: Deterministic chord-to-action lookup. How: Pure fn returning the action id for a chord, honoring per-binding enabled flags.
- [x] **T16.1.6 - Global keydown listener** - What: Keys work anywhere on the desk. How: Single capture-phase window listener piping resolveKey hits into Spektrum trigger().
- [x] **T16.1.7 - Input-field suppression** - What: Typing in fields never fires trades. How: Skip dispatch when the event target is a text input or data-model field, excepting Escape.
- [x] **T16.1.8 - Action catalog module** - What: One list every surface shares. How: src/keys/actions.js mapping action ids to trigger names and labels for palette and overlay reuse.
- [x] **T16.1.9 - Single tests for keymap fns** - What: Core lookup logic proven. How: One Vitest test each for normalizeChord and resolveKey, run only via vitest -t.
- [x] **T16.1.10 - Merge keymap core** - What: Dispatcher available to every feature. How: ESLint plus targeted tests green, merge feature/f16-01-keymap-core to main.

### F16.2 - Default Desk Bindings

**What:** The classic scalper layout out of the box: B buys, S sells, F flattens, 1-4 pick size, arrows nudge price.
**How:** DEFAULT_BINDINGS table in src/keys/defaults.js registered at boot, mapping chords onto phase-15 ticket triggers.

- [x] **T16.2.1 - Defaults branch** - What: Clean branch for the shipped layout. How: Branch feature/f16-02-default-bindings from main.
- [x] **T16.2.2 - Defaults table** - What: A reviewable list of stock keys. How: DEFAULT_BINDINGS array of chord, action and label rows exported from src/keys/defaults.js.
- [x] **T16.2.3 - B and S trade keys** - What: Buy or sell without touching the mouse. How: Bind KeyB and KeyS to the ticket.buy and ticket.sell triggers from the F15.5 fast path.
- [x] **T16.2.4 - F flatten key** - What: One key to exit everything. How: Bind KeyF to the positions.flatten trigger targeting the phase-18 flatten action.
- [x] **T16.2.5 - Number size keys** - What: Size changes at a keystroke. How: Bind Digit1 through Digit4 to apply the first four phase-15 qty presets via applyPreset.
- [x] **T16.2.6 - Arrow nudge keys** - What: Walk the limit price tick by tick. How: Bind ArrowUp/ArrowDown to ticket.nudgePrice using tickSz from phase-12 metadata.
- [x] **T16.2.7 - Boot registration** - What: Keys live from the first frame. How: loadDefaultBindings() invoked via addSystem at startup before user overrides are merged.
- [x] **T16.2.8 - Armed-state respect** - What: Cold desk keys stage, never send. How: Route B, S and F dispatches through the phase-15 canSubmit() gate.
- [x] **T16.2.9 - Single test loadDefaultBindings** - What: The stock layout can never regress. How: One Vitest test asserting the registered map, run via vitest -t loadDefaultBindings.
- [x] **T16.2.10 - Merge defaults** - What: Instant productivity on main. How: Lint and targeted test green, merge feature/f16-02-default-bindings.

### F16.3 - User Remapping and Persistence

**What:** Make every key yours - rebind any action and keep the layout across sessions.
**How:** keys.overrides map in phase-7 settings synced with spektrum/persist and merged over the defaults at load time.

- [x] **T16.3.1 - Remapping branch** - What: Safe space for override plumbing. How: Branch feature/f16-03-remapping from main.
- [x] **T16.3.2 - Overrides settings schema** - What: Custom keys that survive reloads. How: Add keys.overrides to the phase-7 settings state wired into spektrum/persist localStorage sync.
- [x] **T16.3.3 - mergeBindings() function** - What: One effective map from two sources. How: Pure fn layering overrides atop DEFAULT_BINDINGS where a null override unbinds a chord.
- [x] **T16.3.4 - applyOverride() function** - What: Rebinds take effect immediately. How: Validate then setValue the override and re-register the live chord in the registry Map.
- [x] **T16.3.5 - Reset actions** - What: Escape hatch back to stock keys. How: Per-binding and reset-all data-action handlers clearing overrides and restoring defaults.
- [x] **T16.3.6 - Settings bindings list** - What: All keys reviewable in one screen. How: data-each list of effective bindings inside the phase-5 settings surface.
- [x] **T16.3.7 - migrateBindings() function** - What: Old saved layouts never break. How: Versioned overrides schema upgraded on load by a migration fn before merging.
- [x] **T16.3.8 - Live re-registration** - What: Rebinds work without a reload. How: watch() keys.overrides and rebuild the registry Map on every change.
- [x] **T16.3.9 - Single tests for override fns** - What: Merge and migrate logic pinned. How: One Vitest test each for mergeBindings, applyOverride and migrateBindings via vitest -t.
- [x] **T16.3.10 - Merge remapping** - What: Personal layouts on main. How: Lint plus targeted tests green, merge feature/f16-03-remapping.

### F16.4 - Conflict Detection

**What:** Never silently lose a shortcut - clashing bindings are flagged before they bite.
**How:** findConflicts() cross-checks candidate chords against the effective map per scope, surfacing warnings in the rebind flow.

- [x] **T16.4.1 - Conflicts branch** - What: Focused branch for clash logic. How: Branch feature/f16-04-conflicts from main.
- [x] **T16.4.2 - findConflicts() function** - What: Every clash caught up front. How: Pure fn returning conflicting action ids for a candidate chord and scope pair.
- [x] **T16.4.3 - Scope-aware rules** - What: Only real collisions block a rebind. How: Conflict matrix where same-scope clashes are hard errors and cross-scope overlaps are warnings.
- [x] **T16.4.4 - validateChord() with reserved list** - What: System keys stay untouchable. How: RESERVED_CHORDS (ctrl+k, shift+slash, escape) rejected before registration.
- [x] **T16.4.5 - Inline conflict banner** - What: See the clash while rebinding. How: Warning row in the capture component shown via data-if on a conflicts state key.
- [x] **T16.4.6 - Swap and overwrite resolution** - What: Fix a clash in one click. How: data-action handlers that swap the two chords or unbind the older action safely.
- [x] **T16.4.7 - Conflict badges in settings** - What: Clashes visible without hunting. How: Orange badge on double-booked rows in the F16.3 bindings list via :attr class.
- [x] **T16.4.8 - auditBindings() boot check** - What: A corrupt layout cannot boot silently. How: Load-time audit disabling duplicate chords deterministically and logging the result.
- [x] **T16.4.9 - Single tests for conflict fns** - What: Clash rules beyond doubt. How: One Vitest test each for findConflicts and validateChord, run only via vitest -t.
- [x] **T16.4.10 - Merge conflicts feature** - What: Guarded rebinding on main. How: Lint and targeted tests green, merge feature/f16-04-conflicts.

### F16.5 - Ctrl-K Command Palette

**What:** Any desk action in two keystrokes - Ctrl-K, type, Enter.
**How:** Overlay palette ranking the action catalog with a fuzzyScore() subsequence matcher and dispatching the selection via trigger().

- [x] **T16.5.1 - Palette branch** - What: Dedicated branch for the palette. How: Branch feature/f16-05-palette from main.
- [x] **T16.5.2 - Palette overlay markup** - What: A launcher that appears instantly. How: Overlay template with search input and data-each results list, hidden by data-cloak until boot.
- [x] **T16.5.3 - Open/close wiring** - What: Summon and dismiss without thought. How: Ctrl-K toggle through the registry, Escape closes, focus trapped in the search input.
- [x] **T16.5.4 - fuzzyScore() function** - What: Sloppy typing still finds the action. How: Subsequence scorer with start-of-word bonuses ranking catalog labels.
- [x] **T16.5.5 - searchActions() computed** - What: Results update as you type. How: Spektrum computed re-ranking the catalog from palette.query on every keystroke.
- [x] **T16.5.6 - Keyboard result navigation** - What: Select and fire without the mouse. How: ArrowUp/ArrowDown move the selection; Enter dispatches the trigger and closes.
- [x] **T16.5.7 - Chord hints in rows** - What: Learn hotkeys while searching. How: Render each action's current chord from the effective map beside its label via {{expr}}.
- [x] **T16.5.8 - Palette styling** - What: Launcher in the desk aesthetic. How: Green-on-black terminal panel with an orange selection bar, theme-aware for day/night.
- [x] **T16.5.9 - Single tests for search fns** - What: Ranking quality locked in. How: One Vitest test each for fuzzyScore and searchActions, run only via vitest -t.
- [x] **T16.5.10 - Merge palette** - What: Ctrl-K launcher on main. How: Lint plus targeted tests green, merge feature/f16-05-palette.

### F16.6 - Bindings Cheat-Sheet Overlay

**What:** Press ? and see every live shortcut at a glance, grouped by scope and searchable.
**How:** Full-screen overlay rendering the effective binding map through groupBindings() with data-each groups, toggled by the ? chord.

- [x] **T16.6.1 - Cheat-sheet branch** - What: Contained branch for the overlay. How: Branch feature/f16-06-cheatsheet from main.
- [x] **T16.6.2 - groupBindings() function** - What: Shortcuts organized, not dumped. How: Pure fn transforming the effective map into scope and category groups for display.
- [x] **T16.6.3 - Overlay template** - What: The whole layout on one screen. How: Full-screen grid of data-each groups rendering kbd-styled chord caps next to action labels.
- [x] **T16.6.4 - Question-mark toggle** - What: Help is one key away. How: Register shift+slash as a reserved chord opening the overlay; Escape or ? again closes it.
- [x] **T16.6.5 - Live remap accuracy** - What: The sheet never lies. How: watch() keys.overrides so an open overlay re-renders the instant a binding changes.
- [x] **T16.6.6 - Type-to-filter** - What: Find one shortcut in a crowded sheet. How: Filter box narrowing groups by reusing the F16.5 fuzzyScore matcher.
- [x] **T16.6.7 - Unbound and clash annotations** - What: Gaps and problems self-report. How: Dim unbound catalog actions and mark conflicts inline using findConflicts output.
- [x] **T16.6.8 - Cheat-sheet styling** - What: Readable at a glance mid-session. How: Day/night kbd cap styling from phase-3 tokens with green group headers.
- [x] **T16.6.9 - Single test groupBindings** - What: Grouping logic can never drift. How: One Vitest test over a fixture map, run via vitest -t groupBindings.
- [x] **T16.6.10 - Merge cheat-sheet** - What: Self-documenting keys on main. How: Lint and targeted test green, merge feature/f16-06-cheatsheet.

### F16.7 - Scoped Key Contexts

**What:** Keys mean the right thing in the right place - block-focused shortcuts never fight global ones.
**How:** Scope stack in Spektrum state (global, focused block, overlay) consulted by resolveKey through an activeScope() chain walk.

- [x] **T16.7.1 - Scopes branch** - What: Isolated branch for context logic. How: Branch feature/f16-07-scopes from main.
- [x] **T16.7.2 - Scope stack state** - What: The desk knows where attention is. How: keys.scopeStack array in state with pushScope() and popScope() helper functions.
- [x] **T16.7.3 - Block focus tracking** - What: Focus follows the trader automatically. How: focusin/focusout listeners on data-ref block roots pushing the focused-block scope.
- [x] **T16.7.4 - activeScope() function** - What: One authoritative resolution order. How: Pure fn returning the priority chain overlay, focused block, then global.
- [x] **T16.7.5 - Scoped resolveKey upgrade** - What: Nearest context wins every keypress. How: Extend resolveKey to walk the activeScope chain and stop at the first match.
- [x] **T16.7.6 - Modal overlay scope** - What: Palette input never fires trades. How: Palette and cheat-sheet push a modal scope swallowing all chords except their own.
- [x] **T16.7.7 - Scope indicator styling** - What: Always know which block owns keys. How: Focus ring plus a small scope label chip on the focused block via :attr class.
- [x] **T16.7.8 - Reference block binding** - What: A worked example for future blocks. How: Register ladder-scoped PageUp/PageDown depth scrolling against the phase-14 book block.
- [x] **T16.7.9 - Single tests for scope fns** - What: Priority rules proven. How: One Vitest test each for pushScope and activeScope, run only via vitest -t.
- [x] **T16.7.10 - Merge scopes** - What: Context-aware keys on main. How: Lint plus targeted tests green, merge feature/f16-07-scopes.

### F16.8 - Hold-to-Repeat Price Nudge

**What:** Hold an arrow and the price walks tick by tick, accelerating - no click spamming.
**How:** keydown/keyup repeat engine with startRepeat() and stopRepeat() timers driving ticket.nudgePrice triggers on an easing curve.

- [x] **T16.8.1 - Repeat engine branch** - What: Focused branch for hold mechanics. How: Branch feature/f16-08-hold-repeat from main.
- [x] **T16.8.2 - Repeat engine module** - What: Reusable hold-to-repeat machinery. How: src/keys/repeat.js with startRepeat(actionId) and stopRepeat() built on setInterval.
- [x] **T16.8.3 - nextRepeatDelay() curve** - What: Nudges accelerate naturally under hold. How: Easing fn stepping the interval from 350ms down to 40ms after eight repeats.
- [x] **T16.8.4 - Release and blur safety** - What: A nudge can never run away. How: Stop timers on keyup, window blur and visibilitychange events.
- [x] **T16.8.5 - Nudge action integration** - What: Arrows walk the live limit price. How: Route arrow chords through the engine into ticket.nudgePrice with phase-12 tickSz steps.
- [x] **T16.8.6 - Repeatable catalog flag** - What: Only safe actions may auto-repeat. How: repeatable:true marker in actions.js; the engine refuses unmarked action ids.
- [x] **T16.8.7 - getNudgeStep() modifiers** - What: Coarse jumps when the move is big. How: Shift-arrow multiplies the step to ten ticks via a pure step-resolution fn.
- [x] **T16.8.8 - Repeat visual feedback** - What: Each tick of the walk is visible. How: Pulse the limit price field per repeat via an :attr class binding animation.
- [x] **T16.8.9 - Single tests for repeat fns** - What: Timing and step math verified. How: One Vitest test each for nextRepeatDelay and getNudgeStep via vitest -t.
- [x] **T16.8.10 - Merge hold-repeat** - What: Fluid price walking on main. How: Lint plus targeted tests green, merge feature/f16-08-hold-repeat.

### F16.9 - Double-ESC Panic Cancel

**What:** Two taps of Escape and every working order is gone - the fastest exit in the room.
**How:** isDoubleTap() detector on Escape chaining into the phase-15 cancelAll() path with a distinct panic flash and cue.

- [x] **T16.9.1 - Panic branch** - What: Isolated branch for the panic path. How: Branch feature/f16-09-panic from main.
- [x] **T16.9.2 - isDoubleTap() function** - What: Reliable double-press detection. How: Pure fn detecting two Escapes within a 400ms window from event timestamps.
- [x] **T16.9.3 - Escape precedence wiring** - What: Panic wins over overlay closing. How: Handle Escape in the capture phase first; single taps still close palette and overlays.
- [x] **T16.9.4 - Panic action dispatch** - What: All working orders cancelled at once. How: keys.panic trigger invoking the F15.9 cancelAll() across OKX and EToro.
- [x] **T16.9.5 - Auto-disarm on panic** - What: The desk goes cold with the cancel. How: Panic handler also flips desk.armed to false through the F15.4 gate.
- [x] **T16.9.6 - Panic feedback** - What: Unmistakable confirmation of the exit. How: Full-width orange flash bar plus a distinct low WebAudio buzz from the F15.7 cue set.
- [x] **T16.9.7 - panicCooldown() guard** - What: No accidental double-panic loops. How: One-second lockout fn suppressing re-triggers immediately after a panic fires.
- [ ] **T16.9.8 - Journal panic record** - What: Every panic is auditable later. How: Write a panic event with timestamp and cancelled count to the phase-25 journal key. **Deferred:** the journal is phase 25; the panic handler already computes the timestamp and working-order count the entry needs.
- [x] **T16.9.9 - Single tests for panic fns** - What: Detector and lockout proven. How: One Vitest test each for isDoubleTap and panicCooldown, run only via vitest -t.
- [x] **T16.9.10 - Merge panic** - What: Double-ESC exit on main. How: Lint plus targeted tests green, merge feature/f16-09-panic.

### F16.10 - Hotkey Capture Component

**What:** Rebind by doing - click a field, press the keys, done.
**How:** Reusable capture element recording the next chord via normalizeChord() with live conflict checks and a save or cancel flow.

- [x] **T16.10.1 - Capture branch** - What: Final branch closing out the phase. How: Branch feature/f16-10-capture from main.
- [x] **T16.10.2 - Component scaffold** - What: A drop-in rebind control. How: src/keys/capture.js template with a data-ref field and a capture.recording state key.
- [x] **T16.10.3 - Recording mode** - What: Press the keys, see the chord. How: Click-to-record swallows the next keydown and previews it live via {{capture.preview}}.
- [x] **T16.10.4 - acceptChord() rules** - What: Only valid chords can be saved. How: Reject bare modifiers and RESERVED_CHORDS before the chord reaches applyOverride.
- [x] **T16.10.5 - Live conflict preview** - What: Clashes visible before saving. How: Run findConflicts() during recording and surface the F16.4 banner inline.
- [x] **T16.10.6 - Save and cancel flow** - What: Commit or back out cleanly. How: Enter saves through applyOverride(); Escape aborts and restores the previous chord.
- [x] **T16.10.7 - Settings row integration** - What: Rebinding lives where keys are listed. How: Mount one capture component per row of the F16.3 bindings list.
- [x] **T16.10.8 - Capture styling** - What: Recording state impossible to miss. How: Orange glow on the armed field and kbd-chip rendering of the saved chord.
- [x] **T16.10.9 - Single test acceptChord** - What: Validation rules pinned down. How: One Vitest test over modifier-only and reserved cases via vitest -t acceptChord.
- [x] **T16.10.10 - Merge capture** - What: Complete rebinding UX on main. How: Lint plus targeted test green, merge feature/f16-10-capture.

---

## Phase 17 - Order Types & Execution Engine

**What:** The right order for the microstructure - IOC, post-only, brackets - fired instantly without thinking about venue quirks.
**How:** ES-module execution engine wrapping OKX v5 WS/REST and EToro REST with order-type composition, client-side bracket/OCO automation and a Spektrum order store.

### F17.1 - Execution engine scaffold & order lifecycle store

**What:** One execution core every ticket, hotkey and bot talks to, tracking each order from intent to fill.
**How:** src/exec/engine.js ES module with a Spektrum-registered orders store and a venue adapter contract implemented by OKX and EToro adapters.

- [x] **T17.1.1 - Branch and scaffold exec module** - What: A clean home for all execution code. How: Create feature/exec-engine-core off main; scaffold src/exec/ with engine.js, types.js and adapters/ as ES modules under Vite.
- [x] **T17.1.2 - Order intent shape** - What: One normalized order object for every venue. How: Write makeIntent() in types.js producing {venue, instrument, side, size, price, tif, flags} with input validation.
- [x] **T17.1.3 - Order state machine** - What: Predictable order lifecycle with no impossible states. How: defineFn advanceOrderState() covering pending->submitted->acked->partial->filled/rejected/canceled transitions as a pure table lookup.
- [x] **T17.1.4 - Orders store registration** - What: Live order book state any block can bind to. How: addSystem('exec') registering an orders map keyed by clientOrderId, mutated only via setValue commits.
- [x] **T17.1.5 - Venue adapter contract** - What: Venue quirks isolated behind one interface. How: Define adapter shape {submit, cancel, amend, capabilities} in adapters/contract.js that OKX and EToro adapters implement.
- [x] **T17.1.6 - Execution event bus** - What: Downstream phases (HUD, positions, journal) hear every order change. How: trigger('exec:update', {id, prev, next}) on each state transition so consumers use watch() instead of polling.
- [x] **T17.1.7 - Rejection normalizer** - What: One readable reject reason instead of raw venue codes. How: Write normalizeReject() mapping OKX sCode values and EToro error bodies to a single reason enum plus original payload.
- [x] **T17.1.8 - Engine bootstrap wiring** - What: Engine alive from app start with zero manual init. How: Import and start the engine in main.js during the Spektrum run() boot sequence loaded via the unpkg importmap.
- [x] **T17.1.9 - Single unit tests for core fns** - What: Each new function locked by its one test. How: One Vitest test each for makeIntent, advanceOrderState and normalizeReject; run only those test files with vitest run path filters.
- [x] **T17.1.10 - Verify and merge** - What: Feature lands on main only when green. How: Run ESLint plus this feature's Vitest tests, then merge feature/exec-engine-core into main.

### F17.2 - Market & limit order submission

**What:** Instant market hits and precise limit placement from one call, with zero venue-specific code in the UI.
**How:** submitMarket()/submitLimit() composing intents into OKX v5 trade endpoints and EToro REST orders through the adapter layer.

- [x] **T17.2.1 - Branch and stub submit API** - What: Stable public functions the ticket can code against today. How: Create feature/exec-market-limit; stub submitMarket() and submitLimit() in engine.js delegating to the adapter contract.
- [x] **T17.2.2 - OKX order payload builder** - What: Correct OKX orders on the first try. How: Write buildOkxOrder() mapping an intent to OKX v5 POST /api/v5/trade/order fields (instId, tdMode, ordType, sz, px).
- [x] **T17.2.3 - EToro order payload builder** - What: The same intent works on EToro untouched. How: Write buildEtoroOrder() mapping the intent to the EToro REST order body with direction and units fields.
- [x] **T17.2.4 - Signed REST submission path** - What: Orders authenticated without keys ever touching the repo. How: Route REST submits through the phase-9 HMAC-signed fetch using keys from the phase-8 access layer (STOCKZ_OKX_* via import.meta.env in dev).
- [ ] **T17.2.5 - WS-first submission for OKX** - What: Lower submit latency on the fast venue. How: Send OKX orders over the private WebSocket 'order' op with automatic REST fallback when the socket is down. **Deferred:** the private (authenticated) socket is not yet connected — `buildLoginFrame` exists from phase 9 but nothing logs in. The adapter's `place` is injectable, which is the seam the WS path will use.
- [x] **T17.2.6 - Lot and tick rounding** - What: No rejects from off-grid sizes or prices. How: Write roundToLotTick() clamping size to lotSz and price to tickSz from instrument metadata before any submit.
- [x] **T17.2.7 - Ack ingestion** - What: The store reflects venue acceptance within milliseconds. How: Parse OKX and EToro acks into a submitted->acked transition attaching the venue orderId to the store record.
- [x] **T17.2.8 - Ticket wiring** - What: The Rapid Order Entry ticket fires real orders. How: Bind the phase-15 ticket's data-action="submitOrder" handler to submitMarket/submitLimit picking by ticket mode.
- [x] **T17.2.9 - Single unit tests for builders** - What: Payload math provably correct per venue. How: One Vitest test each for buildOkxOrder, buildEtoroOrder and roundToLotTick, each run targeting only its own file.
- [x] **T17.2.10 - Verify and merge** - What: Submission path proven before landing. How: ESLint plus the feature's tests green, then merge feature/exec-market-limit into main.

### F17.3 - IOC, FOK & post-only time-in-force

**What:** Scalper TIFs on tap - take-what's-there IOC, all-or-nothing FOK, maker-only post-only - selectable per ticket.
**How:** TIF composer mapping to OKX ordType ioc/fok/post_only with graceful client-side downgrade where EToro lacks native support.

- [x] **T17.3.1 - Branch and TIF constants** - What: A single source of truth for TIF values. How: Create feature/exec-tif; add TIF enum {GTC, IOC, FOK, POST_ONLY} to types.js with per-venue support notes.
- [x] **T17.3.2 - TIF composer function** - What: TIF merged into any intent without special cases. How: defineFn applyTif(intent, tif) validating price presence for post-only and returning a new intent object.
- [x] **T17.3.3 - OKX TIF mapping** - What: Native venue TIF used wherever it exists. How: Extend buildOkxOrder() to emit ordType ioc, fok or post_only from the intent's tif field.
- [x] **T17.3.4 - EToro TIF downgrade** - What: TIF semantics preserved even where EToro has no native flag. How: Write downgradeTif() converting IOC/FOK to limit-plus-cancel-timer emulation and marking the ack as emulated.
- [x] **T17.3.5 - IOC remainder handling** - What: Unfilled IOC remainders vanish from the working list instantly. How: Parse the OKX ack's filled/canceled split into partial-then-canceled store transitions with one exec:update.
- [x] **T17.3.6 - Post-only reject path** - What: A crossing post-only fails loud and fast, not silently. How: Map the OKX post-only reject sCode to a 'would-cross' reason and flash the ticket price field via a CSS class toggle.
- [x] **T17.3.7 - TIF selector control** - What: TIF switched in one click mid-flow. How: Segmented control in the ticket bound with data-model="ticket.tif", active segment styled with the orange accent token.
- [x] **T17.3.8 - Capability-gated TIF buttons** - What: Only TIFs the venue supports are ever shown. How: Wrap each segment in data-if bindings against the F17.4 capability computed so dead options never render.
- [x] **T17.3.9 - Single unit tests for TIF fns** - What: TIF logic pinned by one test per function. How: One Vitest test each for applyTif and downgradeTif, executed with per-file test targeting only.
- [x] **T17.3.10 - Verify and merge** - What: TIF feature lands green. How: Run ESLint and the feature's Vitest tests, then merge feature/exec-tif into main.

### F17.4 - Venue capability map

**What:** The ticket only ever offers what the venue can actually do - zero dead buttons, zero venue trivia to memorize.
**How:** Static capability records for OKX v5 and EToro exposed as a Spektrum computed feeding data-if bindings in ticket and settings.

- [x] **T17.4.1 - Branch and capabilities module** - What: One file that answers 'can this venue do X'. How: Create feature/exec-capability-map; add src/exec/capabilities.js exporting per-venue capability records.
- [x] **T17.4.2 - OKX capability record** - What: Accurate OKX feature coverage. How: Declare supported order types, TIFs, amend, attachAlgoOrds brackets and algo trailing per the OKX v5 API docs.
- [x] **T17.4.3 - EToro capability record** - What: Honest EToro coverage including emulations. How: Declare the EToro REST supported set with explicit emulated:true flags for IOC/FOK/OCO/trailing.
- [x] **T17.4.4 - Capability lookup function** - What: One O(1) call resolves venue plus instrument quirks. How: defineFn capabilityFor(venue, instrument) merging the venue record with per-instrument overrides (e.g. spot vs swap).
- [x] **T17.4.5 - Reactive caps computed** - What: The UI re-gates itself the instant venue or instrument changes. How: computed('exec.caps') deriving from the ticket's selected venue/instrument state values.
- [x] **T17.4.6 - data-if gating in the ticket** - What: Unsupported controls never render at all. How: Wrap TIF, bracket and trailing controls in data-if="caps.postOnly"-style bindings across the ticket template.
- [x] **T17.4.7 - Emulation badges** - What: Instant awareness when the engine, not the venue, runs a feature. How: Render a small 'EMU' tag via {{caps.oco.emulated}} interpolation styled with the orange token.
- [x] **T17.4.8 - Capability matrix in settings** - What: Full venue comparison available on demand. How: Read-only matrix grid in the settings modal iterating both records with data-each rows.
- [x] **T17.4.9 - Single unit test for capabilityFor** - What: The lookup's merge logic locked down. How: One Vitest test for capabilityFor covering venue defaults plus an instrument override, run against only that file.
- [x] **T17.4.10 - Verify and merge** - What: Capability map lands proven. How: ESLint plus the feature's test green, merge feature/exec-capability-map into main.

### F17.5 - Bracket intent: entry + TP + SL in one action

**What:** One click arms entry, take-profit and stop-loss together - the full scalp expressed in a single gesture.
**How:** makeBracket() expanding one intent into three linked orders; native OKX attachAlgoOrds where possible, client-managed legs on EToro.

- [x] **T17.5.1 - Branch and bracket types** - What: Linked-order data model ready for expansion logic. How: Create feature/exec-bracket; add bracket record with parentId/legIds linkage fields to types.js.
- [x] **T17.5.2 - Bracket expansion function** - What: Entry plus offsets becomes three consistent orders. How: defineFn makeBracket(intent, tpTicks, slTicks) returning entry, TP and SL intents sharing a bracket id.
- [x] **T17.5.3 - Tick offset pricing** - What: TP/SL prices exact to the instrument grid. How: Write offsetsFromTicks() converting tick offsets to absolute prices using instrument tickSz, side-aware for shorts.
- [x] **T17.5.4 - OKX native bracket path** - What: Venue-held TP/SL that survives a dropped browser tab. How: Attach TP and SL via attachAlgoOrds on the entry order inside buildOkxOrder when caps allow.
- [x] **T17.5.5 - Client-leg path for EToro** - What: Brackets work identically where the venue has none. How: Submit TP and SL legs from the engine on the entry's fill event, flagged emulated in the store.
- [x] **T17.5.6 - Linkage in the orders store** - What: Cancel the parent, the legs die too. How: Record parent/leg relations in exec.orders and cascade cancels through the adapter on parent cancel.
- [x] **T17.5.7 - Ticket bracket controls** - What: TP/SL set in ticks without leaving the keyboard flow. How: Tick stepper inputs bound with data-model="ticket.tpTicks"/"ticket.slTicks", armed state styled green.
- [x] **T17.5.8 - Fill-triggered leg arming** - What: Client legs live within one event of the entry fill. How: watch() the entry order's fill transition and submit both legs inside the same callback, no timers.
- [x] **T17.5.9 - Single unit tests for bracket fns** - What: Expansion and pricing math pinned. How: One Vitest test each for makeBracket and offsetsFromTicks, run individually via path targeting.
- [x] **T17.5.10 - Verify and merge** - What: Brackets land only when green. How: ESLint plus feature tests pass, merge feature/exec-bracket into main.

### F17.6 - Client-side OCO emulation

**What:** TP and SL both work the market, and the instant one fills the other dies - no orphaned stops eating the account.
**How:** OCO watcher on fill events cancelling the sibling through the venue cancel API within the same event tick.

- [x] **T17.6.1 - Branch and OCO pair model** - What: Sibling linkage the engine can resolve in O(1). How: Create feature/exec-oco; add an OCO pair record {aId, bId, status} plus a sibling lookup Map in src/exec/oco.js.
- [x] **T17.6.2 - Pair registration function** - What: Any two working orders become an OCO pair in one call. How: defineFn linkOco(idA, idB) validating both are acked and writing both directions into the sibling Map.
- [x] **T17.6.3 - Fill listener** - What: The engine reacts the moment either member fills. How: watch() exec:update for filled transitions on OCO members and resolve the sibling id via the Map, no scans.
- [x] **T17.6.4 - Sibling cancel dispatch** - What: The losing leg is dead before the next tick lands. How: Fire OKX POST /api/v5/trade/cancel-order or the EToro cancel endpoint immediately from the listener, no confirm dialog.
- [x] **T17.6.5 - Race resolution** - What: Simultaneous double-fill never produces a phantom error state. How: Write resolveOcoRace() treating a cancel-reject-because-filled as a clean pair close with both fills booked.
- [x] **T17.6.6 - Partial fill policy** - What: Sibling size always mirrors what is left to protect. How: On partial fills shrink the sibling via the F17.9 amend flow instead of cancelling it outright.
- [x] **T17.6.7 - Pair badge in orders block** - What: Linked orders visibly linked. How: Render a chain glyph on both rows in the working-orders data-each template when a sibling id is present.
- [x] **T17.6.8 - Reconnect resync** - What: OCO protection survives a dropped WebSocket. How: Rebuild the sibling Map from the open-orders snapshot plus stored pair records after private WS reconnect.
- [x] **T17.6.9 - Single unit tests for OCO fns** - What: Linking and race logic each pinned by one test. How: One Vitest test each for linkOco and resolveOcoRace, run with only those files targeted.
- [x] **T17.6.10 - Verify and merge** - What: OCO lands proven safe. How: ESLint plus the feature's tests green, merge feature/exec-oco into main.

### F17.7 - Trailing stop loop

**What:** Stops that chase price tick by tick, locking in scalp profit without manual dragging.
**How:** Trailing loop subscribed to the phase-11 tick stream ratcheting stop prices through amend calls, native OKX algo where supported.

- [x] **T17.7.1 - Branch and trail config model** - What: Trailing behavior expressed as data. How: Create feature/exec-trailing; add trail config {distanceTicks, stepTicks, side} to types.js with defaults.
- [x] **T17.7.2 - Trail registration function** - What: Any order or position gains a trail in one call. How: defineFn startTrail(targetId, config) seeding the initial stop from the current mark and storing the trail record.
- [x] **T17.7.3 - Ratchet math** - What: A stop that only ever tightens. How: Write pure nextTrailStop(best, current, config) returning a new stop only when price improves by >= stepTicks, never loosening.
- [x] **T17.7.4 - Tick stream subscription** - What: Trails advance on real market movement, batch-efficient. How: Hook the trail loop into the feed worker's tick batches via addAsync, one ratchet pass per batch.
- [x] **T17.7.5 - Amend throttle** - What: Venue rate limits never tripped by a fast tape. How: Push a venue amend only when the computed stop moved >= stepTicks since the last pushed value, tracked per trail.
- [x] **T17.7.6 - OKX native algo path** - What: Server-side trailing when the venue offers it. How: Use the OKX move_order_stop algo order when capabilityFor reports native trailing, skipping the client loop.
- [x] **T17.7.7 - Client-side trigger fire** - What: Breach converts to exit instantly even in emulated mode. How: On stop breach submit a single reduce-only market order via submitMarket and close the trail record.
- [x] **T17.7.8 - Trail HUD readout** - What: Live distance-to-stop visible per trailing order. How: Show remaining ticks in the order row via {{trail.remaining}}, switching to the orange token within 2 ticks.
- [x] **T17.7.9 - Single unit tests for trail fns** - What: Ratchet and registration logic pinned. How: One Vitest test each for nextTrailStop and startTrail, each executed via its own file filter.
- [x] **T17.7.10 - Verify and merge** - What: Trailing lands green. How: ESLint plus feature tests pass, merge feature/exec-trailing into main.

### F17.8 - Slippage guard

**What:** One instant sanity check blocks orders too far from mid - fat fingers die before they cost money, speed untouched.
**How:** O(1) max-deviation check comparing intent price to the cached live mid at submit time, threshold from user settings.

- [x] **T17.8.1 - Branch and guard setting** - What: A user-tunable deviation ceiling. How: Create feature/exec-slippage-guard; add maxDeviationBps to the phase-7 settings defaults with a sane initial value.
- [x] **T17.8.2 - Deviation check function** - What: Pass/block decided in microseconds. How: Write pure defineFn checkSlippage(intent, mid, maxBps) returning {ok, bps} with zero async and zero allocation in the hot path.
- [x] **T17.8.3 - Cached mid source** - What: The guard never waits on the network. How: Read best bid/ask straight from the phase-11 market data store values already held in memory.
- [x] **T17.8.4 - Submit pipeline interception** - What: Every order passes the guard exactly once. How: Call checkSlippage inside the engine submit path before the adapter; a block emits an instant exec:rejected event.
- [x] **T17.8.5 - Market order variant** - What: Market orders guarded too, against a moving tape. How: For market intents compare top-of-book to the last trade and block when drift exceeds the same bps ceiling.
- [x] **T17.8.6 - One-shot override** - What: Deliberate outsized orders still possible at full speed. How: Shift-held submit bypasses the guard once and logs an override event into the exec journal stream.
- [x] **T17.8.7 - Blocked-order feedback** - What: A block is felt immediately without a dialog. How: Flash the ticket border orange for 300ms via a CSS class toggle showing the measured bps inline.
- [x] **T17.8.8 - Settings slider** - What: Threshold adjustable mid-session and remembered. How: Range input in the settings modal bound with data-model and persisted through spektrum/persist to localStorage.
- [x] **T17.8.9 - Single unit test for checkSlippage** - What: The guard's math beyond doubt. How: One Vitest test for checkSlippage covering pass, block and exact-threshold cases, run on that file only.
- [x] **T17.8.10 - Verify and merge** - What: Guard lands proven fast and correct. How: ESLint plus the feature's test green, merge feature/exec-slippage-guard into main.

### F17.9 - Amend/replace flow for working orders

**What:** Move a working order's price or size in one action instead of cancel-and-retype - queue position kept where the venue allows.
**How:** amendOrder() using OKX POST /api/v5/trade/amend-order natively and cancel/replace emulation on EToro, wired to row nudge actions.

- [x] **T17.9.1 - Branch and amend request shape** - What: A minimal, explicit amend contract. How: Create feature/exec-amend; add amend request {orderId, newPx, newSz} with a no-op detector to types.js.
- [x] **T17.9.2 - Amend router function** - What: The right mechanism chosen automatically per venue. How: defineFn amendOrder(req) diffing current vs requested and routing to native amend or cancelReplace via capabilityFor.
- [x] **T17.9.3 - OKX native amend call** - What: Price moves without losing the order. How: Map the request to OKX POST /api/v5/trade/amend-order with a reqId echoed back for ack correlation.
- [x] **T17.9.4 - EToro cancel/replace** - What: Amend semantics preserved on the REST-only venue. How: Write cancelReplace() submitting the replacement only after the cancel ack, carrying the clientOrderId lineage forward.
- [x] **T17.9.5 - Optimistic store update** - What: The UI shows the new price the instant you act. How: Apply pending px/sz to the store record immediately, marked inflight, reconciled on the venue ack.
- [x] **T17.9.6 - Reject rollback** - What: A failed amend leaves the truth on screen. How: Restore prior px/sz from the stored snapshot when the venue rejects, emitting one exec:update with the reject reason.
- [x] **T17.9.7 - Row nudge actions** - What: Price nudged a tick from the working-orders row. How: Bind +tick/-tick data-action buttons per row calling amendOrder; phase 16 later maps hotkeys onto the same intents.
- [x] **T17.9.8 - Inflight lock per order** - What: No interleaved replaces corrupting an order. How: Per-orderId inflight flag queuing at most one follow-up amend, applied when the current ack lands.
- [x] **T17.9.9 - Single unit tests for amend fns** - What: Routing and replace logic pinned. How: One Vitest test each for amendOrder and cancelReplace, each run targeting only its own test file.
- [x] **T17.9.10 - Verify and merge** - What: Amend flow lands green. How: ESLint plus feature tests pass, merge feature/exec-amend into main.

### F17.10 - Client order IDs, reconnect dedupe & latency stamps

**What:** Every order traceable end to end with submit->ack->fill timings - and never a doubled order after a reconnect.
**How:** Monotonic clOrdId generator, idempotent resubmit dedupe on WS reconnect, performance.now() stamping aggregated into a latency computed.

- [x] **T17.10.1 - Branch and id/latency modules** - What: Dedicated homes for identity and timing code. How: Create feature/exec-ids-latency; scaffold src/exec/ids.js and src/exec/latency.js as ES modules.
- [x] **T17.10.2 - Client order id generator** - What: Sortable, collision-free ids on every submit. How: Write makeClientOrderId() combining a session prefix with a base36 counter, kept within the OKX clOrdId charset and length limits.
- [x] **T17.10.3 - Id registry** - What: A duplicate submission is impossible by construction. How: Set-backed registry consulted in the submit pipeline, rejecting reused ids in O(1) before any network call.
- [x] **T17.10.4 - Reconnect dedupe** - What: Reconnects never re-fire orders already working at the venue. How: Write dedupeOnReconnect() diffing the OKX open-orders snapshot against the registry and suppressing matched resubmits.
- [x] **T17.10.5 - Latency stamping** - What: Exact timing captured on every transition. How: Write stampLatency() recording submitAt/ackAt/fillAt with performance.now() onto the store record at each state change.
- [x] **T17.10.6 - Latency summary function** - What: Honest p50/p95 numbers for the desk. How: Write latencySummary() computing submit->ack and ack->fill percentiles over a rolling window of the last 100 orders.
- [x] **T17.10.7 - Latency computed for the HUD** - What: Live latency stats other phases can bind without coupling. How: Expose computed('exec.latency') from latencySummary output for the phase-19 HUD to consume.
- [x] **T17.10.8 - Slow-venue tint** - What: Degrading venue latency visible peripherally. How: Class binding turning the latency readout orange when p95 submit->ack exceeds the user's threshold setting.
- [x] **T17.10.9 - Single unit tests for id/latency fns** - What: All four new functions locked by one test each. How: One Vitest test each for makeClientOrderId, dedupeOnReconnect, stampLatency and latencySummary, run per file.
- [x] **T17.10.10 - Verify and merge** - What: The execution phase closes green. How: Run ESLint plus this feature's Vitest tests, then merge feature/exec-ids-latency into main.

---

## Phase 18 - Positions & Live PnL

**What:** Exact exposure and profit live to the tick - never guess where you stand.
**How:** Spektrum positions store fed by execution fills and live marks, computed unrealized/realized PnL, and one-tap flatten actions.

### F18.1 - Positions store core

**What:** One authoritative in-memory book of every open position across OKX and EToro.
**How:** src/positions/store.js registering a positions map keyed venue:instrument in Spektrum via addSystem, with persist-backed reload continuity.

- [x] **T18.1.1 - Branch and positions scaffold** - What: A dedicated module tree for position state and math. How: Create feature/pos-store off main; scaffold src/positions/ with store.js and math.js as ES modules under Vite.
- [x] **T18.1.2 - Position key scheme** - What: Every venue+instrument pair resolves to exactly one slot. How: Write defineFn positionKey(venue, instrument) producing 'okx:BTC-USDT' style keys with input normalization.
- [x] **T18.1.3 - Position record shape** - What: A complete, minimal record per position. How: Define {qty, side, avgPx, realized, fees, openedAt, mark} in a types module with a makePosition() factory.
- [x] **T18.1.4 - Upsert and auto-prune** - What: The map holds open positions only, never zombie zeros. How: Write upsertPosition() committing via setValue and deleting the key when qty reaches exactly 0.
- [x] **T18.1.5 - Spektrum system registration** - What: Any block can react to position changes without polling. How: addSystem('positions') wiring the map into Spektrum state with trigger('positions:changed') on each commit.
- [x] **T18.1.6 - Store selectors** - What: Ready-made exposure answers for other phases. How: computed openPositions() list and grossExposure() sum derived from the map for HUD and circuit-breaker consumers.
- [ ] **T18.1.7 - Reload continuity** - What: A browser refresh never blanks the book. How: Mirror the positions map through spektrum/persist to localStorage, rehydrating before first render and marking records stale until reconciled. **Deferred:** only `settings.*` is persisted by design, and a *stale* position rehydrated from storage is a risk number that may be wrong — the honest source is the venue's own positions endpoint (`fetchPositions`, phase 9), which F18.3 reconciles against.
- [x] **T18.1.8 - Devtools visibility** - What: Position state inspectable and time-travelable while debugging. How: Register the store with spektrum/devtools and spektrum/inspect so checkpoint/replay cover position mutations.
- [x] **T18.1.9 - Single unit tests for store fns** - What: Key, upsert and exposure logic each pinned by one test. How: One Vitest test each for positionKey, upsertPosition and grossExposure, run per file only.
- [x] **T18.1.10 - Verify and merge** - What: Store core lands only when green. How: Run ESLint plus this feature's Vitest tests, then merge feature/pos-store into main.

### F18.2 - Fill ingestion & average entry math

**What:** Every fill instantly reshapes quantity and average entry - adds, reduces and flips all priced correctly.
**How:** Fill consumer on the phase-17 exec:update events applying weighted-average math through pure functions.

- [x] **T18.2.1 - Branch and fill consumer** - What: Fills flow into positions with no manual step. How: Create feature/pos-fills; subscribe a consumer to exec:update fill transitions via watch() in store.js.
- [x] **T18.2.2 - Pure fill application** - What: Deterministic position math with no hidden mutation. How: Write defineFn applyFill(position, fill) returning a fresh record, dispatching to add/reduce/flip branches.
- [x] **T18.2.3 - Weighted average entry** - What: Adds always price the position exactly. How: Write avgEntryAfterAdd() computing (oldQty*avgPx + fillQty*fillPx) / newQty with float guarding at qty boundaries.
- [x] **T18.2.4 - Reduce branch** - What: Scaling out keeps entry honest while booking the difference. How: Keep avgPx unchanged on reduces and hand the closed quantity delta to the F18.4 realization function.
- [x] **T18.2.5 - Flip handling** - What: Trading through zero yields a clean new position, not garbage math. How: Write splitFlipFill() dividing a through-zero fill into a closing part and an opening part with a fresh avgPx.
- [x] **T18.2.6 - Fill dedupe** - What: Replayed fills after a reconnect never double the book. How: Seen-set keyed on venue fillId consulted O(1) before applying, persisted for the session.
- [x] **T18.2.7 - Burst batching** - What: A 20-fill sweep costs one render, not twenty. How: Coalesce fill applications into a single store commit per animation frame using a queued flush.
- [x] **T18.2.8 - Side normalization** - What: OKX and EToro fills speak one signed-quantity language. How: Write normalizeFillSide() mapping OKX side/posSide and EToro direction into signed qty before applyFill.
- [x] **T18.2.9 - Single unit tests for fill fns** - What: Add, flip and normalization math each locked by one test. How: One Vitest test each for applyFill, avgEntryAfterAdd, splitFlipFill and normalizeFillSide, run per file.
- [x] **T18.2.10 - Verify and merge** - What: Fill ingestion lands proven. How: ESLint plus the feature's tests green, then merge feature/pos-fills into main.

### F18.3 - Unrealized PnL live to the tick

**What:** Floating profit per position updates on every tick, exact against the live mid.
**How:** Spektrum computed joining position records with best bid/ask mids from the phase-11 market data store.

- [x] **T18.3.1 - Branch and mark contract** - What: A defined source of truth for marks. How: Create feature/pos-upnl; document and import the quotes store's best bid/ask values as the mark source in math.js.
- [x] **T18.3.2 - Mid price function** - What: A usable mark even on a one-sided book. How: Write defineFn midFor(instrumentKey) returning (bid+ask)/2 with last-trade fallback when either side is missing.
- [x] **T18.3.3 - Unrealized PnL function** - What: Exact floating PnL for longs and shorts alike. How: Write pure unrealizedPnl(position, mark) as qty*(mark-avgPx)*multiplier, sign-aware via signed qty.
- [x] **T18.3.4 - Reactive uPnL computed** - What: PnL recalculates only where price actually moved. How: computed('positions.upnl') keyed per position, invalidated only for instruments present in the current tick batch.
- [x] **T18.3.5 - Contract multipliers** - What: Derivative sizing never silently wrong. How: Resolve ctVal for OKX swaps and unit size for EToro CFDs from instrument metadata into the multiplier argument.
- [x] **T18.3.6 - Account currency conversion** - What: All PnL readable in one currency. How: Write toAccountCcy() converting quote-currency PnL through the cached FX mid from the market data store, no network on the hot path.
- [x] **T18.3.7 - Recompute throttle** - What: A 100-tick burst costs one paint. How: Gate the computed's downstream DOM refresh to one requestAnimationFrame flush per burst.
- [x] **T18.3.8 - Row PnL binding** - What: Live uPnL readable at a glance in the positions rows. How: Bind {{fmtPnl(p.upnl)}} with a sign-aware fmtPnl() formatter and pos/neg class switching on the cell.
- [x] **T18.3.9 - Single unit tests for uPnL fns** - What: Mid, PnL, conversion and formatting each pinned. How: One Vitest test each for midFor, unrealizedPnl, toAccountCcy and fmtPnl, run individually.
- [x] **T18.3.10 - Verify and merge** - What: Live uPnL lands green. How: ESLint plus feature tests pass, merge feature/pos-upnl into main.

### F18.4 - Realized PnL & fees

**What:** Booked profit and paid fees accumulate exactly on every close - the honest scoreboard of the session.
**How:** Realization functions run on reducing fills with fee fields parsed from OKX and EToro fill payloads into a persisted day ledger.

- [x] **T18.4.1 - Branch and accumulators** - What: Realized and fee totals tracked per position and per day. How: Create feature/pos-realized; add realized/fees fields to position records plus a session-level day ledger structure.
- [x] **T18.4.2 - Realization function** - What: Every close books exactly the right amount. How: Write pure defineFn realizeOnReduce(position, fill) returning closedQty*(fillPx-avgPx) with side sign applied.
- [x] **T18.4.3 - Fee parser** - What: Fees from both venues land in one currency and sign convention. How: Write parseFee() normalizing OKX fillFee/fillFeeCcy and EToro fee fields into account-currency amounts.
- [x] **T18.4.4 - Day ledger append** - What: A complete ordered record of the day's realizations. How: Append {t, instrument, amount, fee} events to the ledger array on each realization, feeding the F18.9 equity curve.
- [x] **T18.4.5 - Net realized function** - What: The number that matters after costs. How: Write netRealized() summing gross realized minus accumulated fees over the ledger in one pass.
- [ ] **T18.4.6 - Ledger persistence** - What: A mid-day reload keeps the score. How: Persist the day ledger via spektrum/persist keyed by UTC session date in localStorage. **Deferred:** only `settings.*` persists by design, and a ledger restored from storage can disagree with the venue's fills — phase 25's journal owns durable history, and reconciling against `fetchPositions` is the honest source.
- [x] **T18.4.7 - Session rollover** - What: A fresh scoreboard exactly when the user's day starts. How: Write rolloverIfNewSession() clearing accumulators when the configured session start time from phase-7 settings is crossed.
- [x] **T18.4.8 - Closed-trades footer** - What: The last closes reviewable without leaving the block. How: Render the most recent 20 realizations in the positions block footer via data-each with green/orange result chips.
- [x] **T18.4.9 - Single unit tests for realized fns** - What: Booking, fees, netting and rollover each locked. How: One Vitest test each for realizeOnReduce, parseFee, netRealized and rolloverIfNewSession, run per file.
- [x] **T18.4.10 - Verify and merge** - What: Realized PnL lands proven. How: ESLint plus the feature's tests green, merge feature/pos-realized into main.

### F18.5 - Positions block with per-row flatten

**What:** All open positions in one grid block - instrument, side, qty, avg, uPnL - each with an instant one-click flatten.
**How:** Dashboard grid block rendering data-each rows over the store with a data-action flatten firing a reduce-only market close via the exec engine.

- [x] **T18.5.1 - Branch and block scaffold** - What: A positions block slotted into the dashboard. How: Create feature/pos-block; add the block template into the phase-4 uniform grid shell with its standard block chrome.
- [x] **T18.5.2 - Row template** - What: Dense, scannable position rows. How: data-each over openPositions rendering instrument, side chip, qty, avgPx and uPnL cells in monospace columns.
- [x] **T18.5.3 - Flatten function** - What: Full-size close expressed as one safe intent. How: Write defineFn flattenPosition(key) building a reduce-only market intent for the full qty and submitting via the phase-17 engine.
- [x] **T18.5.4 - Flatten button wiring** - What: One click closes the position, zero dialogs. How: data-action="flatten" per row invoking flattenPosition with the row's key from data-ref context.
- [x] **T18.5.5 - Reduce-only mapping** - What: A flatten can never accidentally flip the position. How: Set the OKX reduceOnly flag and use the EToro close-position endpoint inside the flatten intent path.
- [x] **T18.5.6 - Inflight row state** - What: No double-fires while a close works. How: Per-key inflight flag disabling the button and swapping in a spinner glyph until the fill or reject event lands.
- [x] **T18.5.7 - Row sorting** - What: The biggest live risk always sits on top. How: Write sortByAbsUpnl() ordering rows by absolute uPnL descending inside the openPositions computed.
- [x] **T18.5.8 - Terminal styling** - What: The block reads like the rest of the money-hacker desk. How: Apply phase-3 design tokens - green/orange side chips, grid-aligned monospace digits - in both day and night themes.
- [x] **T18.5.9 - Single unit tests for block fns** - What: Flatten intent and sorting pinned by one test each. How: One Vitest test each for flattenPosition and sortByAbsUpnl, run against only their files.
- [x] **T18.5.10 - Verify and merge** - What: The positions block lands green. How: ESLint plus feature tests pass, merge feature/pos-block into main.

### F18.6 - Flatten-all

**What:** One action closes everything everywhere - the desk's eject handle, also on hotkey F.
**How:** flattenAll() closing open positions **serially** (not in parallel — a venue that rate-limits mid-flatten strands the tail, which is exactly the exposure being shed) as reduce-only market orders, registered with the phase-16 keymap under intent 'flatten-all'.

- [x] **T18.6.1 - Branch and header control** - What: Flatten-all reachable from the positions block itself. How: Create feature/pos-flatten-all; add a flatten-all button to the block header bound via data-action.
- [x] **T18.6.2 - Flatten-all function** - What: Every open position closed in one sweep. How: Write defineFn flattenAll() mapping openPositions to flatten intents and submitting them with Promise.all through the engine.
- [x] **T18.6.3 - Order sweep first** - What: No working order re-opens risk mid-flatten. How: Call the engine's cancelAll for open orders before submitting closes, sequenced inside flattenAll.
- [x] **T18.6.4 - Hotkey F registration** - What: The eject handle under one finger. How: Register key F with the phase-16 keymap API mapped to the 'flatten-all' data-intent, active outside text inputs.
- [x] **T18.6.5 - Venue fan-out ordering** - What: The fastest venue clears first. How: Submit OKX closes via the private WS batch-orders op before iterating EToro REST closes.
- [x] **T18.6.6 - Partial failure summary** - What: One glance shows what closed and what did not. How: Write summarizeFlattenResults() collecting per-position outcomes into a compact toast line, never halting the sweep.
- [x] **T18.6.7 - Retry-only-failures idempotence** - What: Mashing F never duplicates closes. How: Inflight key set makes a second invocation retry only failed positions while submissions are pending.
- [x] **T18.6.8 - Armed styling** - What: The button reads as consequential without slowing anyone down. How: Orange accent with a subtle border pulse from the design tokens - still a single click, no confirm dialog.
- [x] **T18.6.9 - Single unit tests for flatten-all fns** - What: Sweep and summary logic pinned. How: One Vitest test each for flattenAll and summarizeFlattenResults, run per file only.
- [x] **T18.6.10 - Verify and merge** - What: Flatten-all lands proven. How: ESLint plus the feature's tests green, merge feature/pos-flatten-all into main.

### F18.7 - Day PnL header widget

**What:** Today's net PnL always in view in the header, ticking live next to the nav.
**How:** Header widget bound to a dayPnl computed combining the realized ledger total with live unrealized sum, compact-formatted.

- [x] **T18.7.1 - Branch and header slot** - What: A reserved home for the day number in the header. How: Create feature/pos-day-widget; add a widget slot between nav and settings in the phase-5 header template.
- [x] **T18.7.2 - Day PnL computed** - What: One number that is always the whole truth of today. How: Write dayPnlOf(ledgerTotal, upnlSum) and wire computed('pnl.day') from netRealized plus the live unrealized sum.
- [x] **T18.7.3 - Compact formatter** - What: Readable at a glance at any magnitude. How: Write fmtCompactPnl() rendering +1.2K / -340 style output with explicit sign and the account currency code.
- [x] **T18.7.4 - Widget binding** - What: The header number moves with every tick batch. How: Bind {{fmtCompactPnl(pnl.day)}} with pos/neg class switching between the green and orange tokens.
- [x] **T18.7.5 - Percent mode toggle** - What: PnL as percent of starting equity on demand. How: data-action click toggle switching absolute vs percent display, choice persisted via spektrum/persist.
- [x] **T18.7.6 - Session baseline capture** - What: A stable denominator for the percent view. How: Write captureBaselineEquity() storing start-of-day equity once per session date at rollover time.
- [x] **T18.7.7 - Breakdown popover** - What: Realized vs unrealized vs fees inspectable without clicks elsewhere. How: Pure CSS hover popover under the widget listing the three components from the same computeds.
- [x] **T18.7.8 - Stale-data guard** - What: A frozen feed never masquerades as flat PnL. How: Dim the widget via a class bound to the market data heartbeat when the last tick is older than 5 seconds.
- [x] **T18.7.9 - Single unit tests for widget fns** - What: Assembly, formatting and baseline each pinned. How: One Vitest test each for dayPnlOf, fmtCompactPnl and captureBaselineEquity, run per file.
- [x] **T18.7.10 - Verify and merge** - What: The day widget lands green. How: ESLint plus feature tests pass, merge feature/pos-day-widget into main.

### F18.8 - PnL pulse animation

**What:** PnL changes felt peripherally - green pulse up, orange pulse down - without reading a single digit.
**How:** Direction-classifying watcher toggling short-lived CSS classes driving GPU-friendly keyframe pulses in both day and night themes.

- [x] **T18.8.1 - Branch and pulse keyframes** - What: The visual language of a PnL move defined once. How: Create feature/pos-pulse; add pulse-up/pulse-down keyframes to the phase-3 stylesheet animating only opacity and background-color.
- [x] **T18.8.2 - Direction classifier** - What: Every change maps to up, down or ignore. How: Write pure defineFn pulseClassFor(prev, next, epsilon) returning 'pulse-up', 'pulse-down' or null below the epsilon threshold.
- [x] **T18.8.3 - Watcher wiring** - What: Pulses fire automatically on real PnL movement. How: watch() the uPnL and dayPnl values, toggling the class and removing it on the animationend event.
- [x] **T18.8.4 - Frame batching** - What: A tick storm never causes layout thrash. How: Queue class flips and apply at most one per element per requestAnimationFrame flush.
- [x] **T18.8.5 - Theme-tuned tones** - What: Pulses legible on both day and night backgrounds. How: Map pulse colors to green/orange CSS custom properties overridden by the phase-6 theme engine.
- [x] **T18.8.6 - Coverage across surfaces** - What: The same pulse language everywhere PnL lives. How: Apply the watcher to position rows, the day header widget and the F18.9 equity curve endpoint dot.
- [x] **T18.8.7 - Reduced-motion mode** - What: Pulse-free operation for users who want stillness. How: Settings toggle swapping animations for instant color steps, honoring prefers-reduced-motion as the default and persisted via spektrum/persist.
- [x] **T18.8.8 - Intensity scaling** - What: Big moves feel bigger than small ones. How: Write pulseIntensity() mapping move size in ticks to one of three opacity steps set as an inline CSS variable.
- [x] **T18.8.9 - Single unit tests for pulse fns** - What: Classifier and intensity math pinned. How: One Vitest test each for pulseClassFor and pulseIntensity, run against only those files.
- [x] **T18.8.10 - Verify and merge** - What: Pulse feedback lands green. How: ESLint plus the feature's tests pass, merge feature/pos-pulse into main.

### F18.9 - Intraday equity mini-curve

**What:** The day's equity path drawn live as a sparkline - the shape of the session at a glance.
**How:** PnL sampler feeding a ring buffer rendered by a hand-rolled canvas sparkline inside the positions block, samples held in a ring buffer (**not** persisted — IndexedDB history is phase 24's, and a curve restored from storage can disagree with the venue).

- [x] **T18.9.1 - Branch and canvas scaffold** - What: A rendering surface ready inside the block. How: Create feature/pos-equity-curve; add a canvas element to the positions block plus src/positions/equityCurve.js renderer module.
- [x] **T18.9.2 - Equity sampler** - What: A faithful time series of the session's equity. How: Write sampleEquity() appending {t, equity} at most every 2 seconds plus immediately on every realization event.
- [x] **T18.9.3 - Ring buffer** - What: Bounded memory no matter how long the session runs. How: Write ringAppend() over paired 2048-slot Float64Arrays with an O(1) head index and overwrite-oldest semantics.
- [x] **T18.9.4 - Curve renderer** - What: The equity path visible as a clean line with a zero reference. How: Write drawEquityCurve() painting a canvas polyline with min/max autoscale and a dashed zero line, no chart library.
- [x] **T18.9.5 - Realization markers** - What: Each closed trade visible as a point on the path. How: Plot a dot per ledger event on the curve, filled green or orange by the realization's sign.
- [x] **T18.9.6 - Hi-DPI sharpness** - What: A crisp line on retina and 4K monitors. How: Scale canvas backing store by devicePixelRatio and normalize the context transform before each draw.
- [x] **T18.9.7 - Sample persistence** - What: The curve survives tab reloads mid-session. How: Flush the ring buffer to an IndexedDB object store on visibilitychange and rehydrate it on boot for today's session date.
- [x] **T18.9.8 - Hover readout** - What: Exact time and equity under the pointer. How: pointermove handler snapping to the nearest sample and rendering a small readout, throttled to one update per frame.
- [x] **T18.9.9 - Single unit tests for curve fns** - What: Sampling and buffer math each pinned by one test. How: One Vitest test each for sampleEquity and ringAppend, run per file only.
- [x] **T18.9.10 - Verify and merge** - What: The equity curve lands green. How: ESLint plus feature tests pass, merge feature/pos-equity-curve into main.

### F18.10 - Venue position reconciliation

**What:** The local book provably matches the venue - drift detected and corrected within seconds, never guessed away.
**How:** Periodic snapshots from OKX GET /api/v5/account/positions and the EToro portfolio REST endpoint diffed against the store.

- [x] **T18.10.1 - Branch and reconcile module** - What: A dedicated verifier for book-vs-venue truth. How: Create feature/pos-reconcile; scaffold src/positions/reconcile.js with a snapshot fetcher interface per venue.
- [x] **T18.10.2 - OKX snapshot fetch** - What: The venue's own view of positions on demand. How: Signed GET /api/v5/account/positions via the phase-9 REST client, normalized by normalizeOkxSnapshot() into position records.
- [x] **T18.10.3 - EToro snapshot fetch** - What: The second venue held to the same standard. How: Fetch the EToro portfolio REST endpoint and map it through normalizeEtoroSnapshot() into the shared record shape.
- [x] **T18.10.4 - Diff function** - What: Every qty or price drift named precisely. How: Write pure defineFn diffPositions(local, snapshot) listing per-key qty and avgPx deltas plus missing/extra keys.
- [x] **T18.10.5 - Correction policy** - What: Drift resolved by a fixed rule, not judgment calls. How: Write applyCorrections() where venue qty always wins and local avgPx survives only within a configured tolerance.
- [x] **T18.10.6 - Reconcile cadence** - What: Fresh verification every 30 seconds and after every reconnect. How: addAsync loop on a 30s interval plus an immediate run subscribed to the WS reconnect event.
- [x] **T18.10.7 - Drift indicator** - What: Ongoing correction visible but unobtrusive. How: Small sync glyph in the block header switching to the orange token while a correction is in flight, green when clean.
- [x] **T18.10.8 - Audit trail emission** - What: Every correction accountable later. How: Emit each reconcile result as an event on the exec journal stream consumed by the phase-25 audit log.
- [x] **T18.10.9 - Single unit tests for reconcile fns** - What: Diffing and both normalizers pinned by one test each. How: One Vitest test each for diffPositions, normalizeOkxSnapshot and normalizeEtoroSnapshot, run per file.
- [x] **T18.10.10 - Verify and merge** - What: Reconciliation closes the phase green. How: Run ESLint plus this feature's Vitest tests, then merge feature/pos-reconcile into main.

---

## Phase 19 - Scalper HUD & Session Stats

**What:** Your vital signs: latency, spread, fill quality and session pace always visible.
**How:** HUD block computing live metrics from pipeline timestamps and execution stamps.

### F19.1 - HUD metrics core and rolling math

**What:** A dependable numeric backbone so every HUD readout updates instantly and accurately.
**How:** Pure ES module of ring-buffer and rolling-window math wired into a hud.* Spektrum state slice driven by a 250ms clock system.

- [x] **T19.1.1 - Cut feature branch** - What: Isolated workspace for the metrics core. How: git checkout -b feature/f19.1-hud-metrics-core from a freshly pulled main.
- [x] **T19.1.2 - Scaffold metrics module** - What: One home for all HUD math. How: Create src/hud/metrics-core.js as a vanilla ES module exporting createRing(capacity) with push/toArray/size.
- [x] **T19.1.3 - Rolling mean and EWMA fns** - What: Smooth readouts instead of jumpy numbers. How: Implement rollingMean(ring) and ewma(prev, x, alpha) as pure allocation-free fns.
- [x] **T19.1.4 - Percentile fn** - What: p50/p95 tail views for latency tiles. How: Implement percentile(ring, p) over a sorted copy, returning NaN on an empty buffer.
- [x] **T19.1.5 - Display formatter fns** - What: Readable ms, bps and compact numbers across the HUD. How: Implement formatMs, formatBps and formatCompact returning fixed-width strings for terminal alignment.
- [x] **T19.1.6 - Register hud state slice** - What: A single reactive source every tile reads from. How: setValue('hud', defaults) in src/hud/hud-state.js and export slice key constants for other features.
- [x] **T19.1.7 - HUD clock system** - What: A steady heartbeat all session metrics derive from. How: addSystem hudClock using addAsync to fire trigger('hud:tick') every 250ms and store hud.now from performance.now().
- [x] **T19.1.8 - HUD block shell markup** - What: The HUD appears as a standard same-size block in the dashboard grid. How: Add hud-block partial with a {{hud.now}} smoke binding plus data-cloak and mount it via the grid shell.
- [x] **T19.1.9 - Single unit tests for core fns** - What: Proof each math fn is correct in isolation. How: One Vitest test per fn in metrics-core.test.js, each run via npx vitest run -t "<fnName>".
- [x] **T19.1.10 - Merge core to main** - What: Metrics backbone available to every later HUD feature. How: Run ESLint and the targeted Vitest filters, then merge feature/f19.1 into main.

### F19.2 - Venue ping RTT monitor

**What:** Per-venue heartbeat lag on screen so you always know which venue is fast right now.
**How:** OKX v5 WS ping/pong frames and a timed EToro REST probe stamped with performance.now(), tiered and published into hud state.

- [x] **T19.2.1 - Open the RTT branch** - What: Clean line of work for venue probing. How: Branch feature/f19.2-ping-rtt off main and push the tracking branch.
- [x] **T19.2.2 - pingOkx fn** - What: Real RTT numbers from the venue you scalp on. How: Send a 'ping' text frame on the OKX v5 public WS and resolve the performance.now() delta when 'pong' returns.
- [x] **T19.2.3 - probeEtoro fn** - What: Comparable lag reading for the EToro leg. How: Time a lightweight GET against an EToro REST status endpoint using the key layer's stored STOCKZ_ETORO_API_KEY.
- [x] **T19.2.4 - Probe scheduler** - What: Continuous readings without probe bursts. How: addAsync loop per venue every 5s with random jitter so OKX and EToro probes never align.
- [x] **T19.2.5 - classifyRtt fn** - What: Instant good/warn/bad read without parsing numbers. How: Pure fn mapping ms to ok/warn/bad tiers at 80ms and 250ms cut lines.
- [x] **T19.2.6 - Publish RTT state** - What: Other blocks can react to venue slowness. How: setValue hud.rtt.okx and hud.rtt.etoro per probe plus a computed hud.rtt.worst.
- [x] **T19.2.7 - RTT tile markup** - What: Both venues visible at a glance inside the HUD. How: Two venue rows bound with {{}} values and :class tier bindings in the HUD block.
- [x] **T19.2.8 - LED tier styling** - What: Color tells the story before the number does. How: Green/orange/red LED dots from design-system tokens, correct in both day and night themes.
- [x] **T19.2.9 - Single tests per probe fn** - What: Each probe and classifier proven alone. How: One Vitest test each for pingOkx (fake WS), probeEtoro (mocked fetch) and classifyRtt, run with -t name filters.
- [x] **T19.2.10 - Land RTT on main** - What: Venue lag monitoring live for everyone. How: Verify lint plus the three targeted test runs, then merge the branch to main.

### F19.3 - Order roundtrip latency tracker

**What:** Exact submit-to-ack timing so you know how stale your entries are before you click.
**How:** Stamp order submits with performance.now(), match venue acks by clientOrderId, and roll avg/p95 through metrics-core rings.

- [x] **T19.3.1 - Branch off main** - What: Dedicated space for latency plumbing. How: Create feature/f19.3-order-roundtrip from main before touching code.
- [x] **T19.3.2 - stampSubmit fn** - What: Every order carries a birth certificate. How: Record clientOrderId to t0 in a Map at the moment the order entry layer fires a submit.
- [x] **T19.3.3 - ackDeltaOkx fn** - What: True roundtrip for OKX orders. How: On the OKX v5 private orders channel ack, look up t0 by clientOrderId and return the performance.now() delta.
- [x] **T19.3.4 - ackDeltaEtoro fn** - What: True roundtrip for EToro orders. How: Compute the delta when the EToro REST order POST resolves, reusing the same Map and eviction rules.
- [x] **T19.3.5 - Stale entry eviction fn** - What: The Map never leaks on lost acks. How: evictStale(map, maxAgeMs) sweep called from the hud:tick system, dropping entries older than 30s.
- [x] **T19.3.6 - Rolling latency stats** - What: Stable avg and p95 instead of one noisy number. How: Push deltas into a 100-slot ring and compute rollingMean plus percentile(0.95) as computed hud values.
- [x] **T19.3.7 - Latency sparkline** - What: Shape of the last 30 roundtrips at a glance. How: Hand-rolled canvas mini-renderer drawing the ring as a stepped line inside the HUD tile.
- [x] **T19.3.8 - Roundtrip tile markup** - What: avg, p95 and last roundtrip readable in one row. How: Bind formatted values with {{}} in the HUD block and flash the row via :class on each new ack.
- [x] **T19.3.9 - Single tests per latency fn** - What: Stamping, matching and eviction proven independently. How: One Vitest test each for stampSubmit, ackDeltaOkx, ackDeltaEtoro and evictStale using an injected clock, run via -t.
- [x] **T19.3.10 - Merge latency tracker** - What: Roundtrip timing feeding the HUD for good. How: Green lint and targeted tests, then merge feature/f19.3 into main.

### F19.4 - Live spread monitor with alert threshold

**What:** The live bid/ask spread in bps, flagged the instant it widens past your personal limit.
**How:** Computed spreadBps from pipeline best bid/ask, a persisted threshold setting, and a Spektrum watch that trips a HUD alert flag.

- [x] **T19.4.1 - Start spread branch** - What: Contained work on spread math and alerts. How: git checkout -b feature/f19.4-spread-monitor from main.
- [x] **T19.4.2 - spreadBps fn** - What: One canonical spread number in basis points. How: Pure fn (ask - bid) / mid * 10000 with NaN guards for one-sided books.
- [x] **T19.4.3 - Computed live spread** - What: Spread updates with zero manual wiring. How: Spektrum computed hud.spread reading the active instrument's best bid/ask from the market data pipeline state.
- [x] **T19.4.4 - Threshold setting** - What: Your own widen limit, remembered across sessions. How: hud.spreadLimitBps setting synced through spektrum/persist to localStorage with a sane default of 5.
- [x] **T19.4.5 - Breach watcher** - What: Detection happens the tick the spread crosses your line. How: watch() on hud.spread flipping hud.spreadAlert when the value exceeds hud.spreadLimitBps.
- [x] **T19.4.6 - Breach event emit** - What: Downstream blocks can react to a wide spread. How: trigger('hud:spreadBreach') with instrument and bps payload when the watcher flips to true.
- [x] **T19.4.7 - Spread tile markup** - What: Live bps figure with its limit beside it. How: {{formatBps(hud.spread)}} and the limit rendered in the HUD block, alert state bound with :class.
- [x] **T19.4.8 - Alert flash styling** - What: A breach is impossible to miss peripherally. How: CSS keyframe orange flash on the tile scoped to the alert class, tuned for day and night palettes.
- [x] **T19.4.9 - Single tests for spread fns** - What: Math and breach logic proven in isolation. How: One Vitest test each for spreadBps and the watcher predicate fn, run with npx vitest run -t per name.
- [x] **T19.4.10 - Merge spread monitor** - What: Spread vigilance on for every session. How: Lint plus targeted test filters green, then merge to main.

### F19.5 - Slippage per fill

**What:** Signed bps cost of every fill versus your intended price, plus your session average and worst offender.
**How:** Capture intent price at submit, compare against fill price per side, aggregate through metrics-core rings into hud state.

- [x] **T19.5.1 - Spin up slippage branch** - What: Focused branch for fill-quality math. How: Create feature/f19.5-slippage from main and commit the empty module skeleton.
- [x] **T19.5.2 - captureIntent fn** - What: The price you meant to get is never lost. How: Store intended price and side keyed by clientOrderId when the order entry layer submits.
- [x] **T19.5.3 - slippageBps fn** - What: One signed number says how much the fill cost you. How: Pure fn returning side-adjusted (fill - intent) / intent * 10000 so positive always means worse.
- [x] **T19.5.4 - Per-fill compute hook** - What: Every fill is scored the moment it lands. How: Subscribe to the execution fills stream and run slippageBps against the captured intent for each fill.
- [x] **T19.5.5 - Session aggregate** - What: Your average execution quality for the day. How: Push per-fill bps into a ring and expose rollingMean as computed hud.slipAvg.
- [x] **T19.5.6 - worstFill tracker fn** - What: The single most expensive fill called out. How: trackWorst(prev, fill) pure reducer keeping the max bps fill with instrument and time.
- [x] **T19.5.7 - Publish slippage state** - What: Slippage visible to HUD and future analytics. How: setValue hud.slip.last, hud.slip.avg and hud.slip.worst on every scored fill.
- [x] **T19.5.8 - Slippage tile markup and color** - What: Last, average and worst readable in one glance. How: Bind the three values in the HUD block with green/orange :class coloring by sign and size.
- [x] **T19.5.9 - Single tests per slippage fn** - What: Intent capture, bps math and worst tracking each proven. How: One Vitest test per fn with buy and sell fixtures, executed via -t name filters only.
- [x] **T19.5.10 - Merge slippage meter** - What: Fill quality feedback shipping to main. How: Confirm lint and the targeted runs, merge feature/f19.5 into main.

### F19.6 - Trades-per-hour pace counter

**What:** A live pace figure against your target clip so you know if you are grinding or drifting.
**How:** Sliding 60-minute window over execution timestamps with an extrapolated hourly rate and a persisted target.

- [x] **T19.6.1 - Create pace branch** - What: Room to build the pace math alone. How: git checkout -b feature/f19.6-trade-pace from an updated main.
- [x] **T19.6.2 - recordTrade fn** - What: Every fill counts toward pace instantly. How: Append the fill timestamp into a dedicated ring on each execution stream event.
- [x] **T19.6.3 - pruneWindow fn** - What: Only the last hour ever counts. How: Pure fn evicting timestamps older than 60 minutes, invoked from the hud:tick system.
- [x] **T19.6.4 - pacePerHour fn** - What: The honest trades-per-hour figure. How: Pure fn extrapolating window count over elapsed window span, clamping the first minutes of a session.
- [x] **T19.6.5 - Pace target setting** - What: Your desired clip survives reloads. How: hud.paceTarget persisted through spektrum/persist with a default of 20 trades per hour.
- [x] **T19.6.6 - paceRatio computed** - What: One ratio drives color and meter width. How: Spektrum computed dividing live pace by target, exposed as hud.paceRatio.
- [x] **T19.6.7 - Pace tile markup** - What: Current pace and target side by side. How: Bind {{pace}} of {{target}} in the HUD block with a data-ref hook for the meter element.
- [x] **T19.6.8 - CSS pace meter** - What: A filling bar shows clip at peripheral-vision speed. How: Width-bound gradient bar styled via :style from hud.paceRatio, capped and colored past 100 percent.
- [x] **T19.6.9 - Single tests per pace fn** - What: Recording, pruning and extrapolation proven separately. How: One Vitest test per fn using fixed timestamp fixtures, each run with its own -t filter.
- [x] **T19.6.10 - Merge pace counter** - What: Session tempo tracking live on main. How: Lint plus targeted Vitest filters, then merge the branch.

### F19.7 - Win/loss streak indicator

**What:** An instant hot/cold read on your current streak so you know when you are in sync or tilting.
**How:** Classify each closed trade from realized PnL, run a streak reducer, and tier the result into flame/ice HUD states.

- [x] **T19.7.1 - Fork streak branch** - What: Isolated build of the streak logic. How: Branch feature/f19.7-streak from main and outline the module in the first commit.
- [x] **T19.7.2 - classifyTrade fn** - What: Every closed trade becomes win, loss or scratch. How: Pure fn mapping realized PnL to 1, -1 or 0 with a configurable scratch band in bps.
- [x] **T19.7.3 - updateStreak reducer fn** - What: The running streak is always current. How: Pure reducer extending the streak on same-sign results and resetting on flips, ignoring scratches.
- [x] **T19.7.4 - streakTier fn** - What: Hot and cold states without reading numbers. How: Pure fn mapping streak to cold/cool/neutral/warm/hot at -3, -1, +1 and +3 boundaries.
- [x] **T19.7.5 - Session tally fn** - What: Day totals of wins and losses beside the streak. How: tallyResult(prev, r) reducer keeping win/loss/scratch counts since session start.
- [x] **T19.7.6 - Wire closed-trade feed** - What: Streak updates the moment a position closes. How: Subscribe to the positions layer close events and pipe realized PnL through the classify and reduce chain into hud state.
- [x] **T19.7.7 - Streak tile markup** - What: Streak count, tier glyph and W/L record in one tile. How: Bind values in the HUD block with data-if switching flame and ice glyphs per tier.
- [x] **T19.7.8 - Tier change pulse** - What: Going hot or cold announces itself. How: watch() on the tier value adding a one-shot CSS pulse animation class on transitions.
- [x] **T19.7.9 - Single tests per streak fn** - What: Classifier, reducer, tiering and tally each proven alone. How: One Vitest test per fn with mixed PnL sequences, run individually via -t.
- [x] **T19.7.10 - Merge streak indicator** - What: Hot/cold awareness shipped. How: Green lint and per-fn test runs, then merge feature/f19.7 to main.

### F19.8 - Volume and turnover today

**What:** Running contracts traded and notional turnover since midnight so your day's size is never a guess.
**How:** Accumulate fill qty and qty*price with a local-midnight day-roll reset, persisted via spektrum/persist across reloads.

- [x] **T19.8.1 - Begin volume branch** - What: Clean slate for the accumulators. How: git checkout -b feature/f19.8-volume-turnover from main.
- [x] **T19.8.2 - notional fn** - What: Consistent money value per fill. How: Pure fn qty * price with contract multiplier support for OKX swap instruments.
- [x] **T19.8.3 - accumulateFill fn** - What: Totals grow with every execution. How: Pure reducer adding qty and notional into the session accumulator object per fill event.
- [x] **T19.8.4 - dayKey fn** - What: A stable identifier for the local trading day. How: Pure fn deriving YYYY-MM-DD from a timestamp in the user's local timezone.
- [x] **T19.8.5 - resetIfNewDay fn** - What: Totals restart cleanly at midnight, even mid-session. How: Compare stored dayKey against dayKey(hud.now) on each hud:tick and zero the accumulators on roll.
- [x] **T19.8.6 - Persist accumulators** - What: A page refresh never erases your day. How: Sync the accumulator slice through spektrum/persist to localStorage keyed by dayKey.
- [x] **T19.8.7 - Wire fills stream** - What: Both venues feed the same totals. How: Subscribe OKX fills channel and EToro execution responses into accumulateFill via a shared adapter.
- [x] **T19.8.8 - Volume tile markup and style** - What: Contracts and turnover in compact notation. How: Bind formatCompact values in the HUD block styled with the terminal monospace tokens.
- [x] **T19.8.9 - Single tests per volume fn** - What: Notional, accumulation, day keying and reset proven separately. How: One Vitest test per fn including a midnight-roll fixture, each run via its -t filter.
- [x] **T19.8.10 - Merge volume totals** - What: Daily size tracking on main. How: Lint and targeted tests green, then merge the branch.

### F19.9 - Fee burn meter

**What:** Fees eating your PnL shown live, so overtrading cost is never invisible.
**How:** Per-fill fee from venue schedules, session sum, burn rate per hour and a fees-vs-PnL ratio in a HUD meter.

- [x] **T19.9.1 - Open fee branch** - What: Dedicated branch for fee accounting. How: Create feature/f19.9-fee-burn from main before writing the schedule module.
- [x] **T19.9.2 - Fee schedule module** - What: Accurate venue rates in one place. How: src/hud/fee-schedule.js exporting OKX maker/taker bps and EToro markup constants with source comments.
- [x] **T19.9.3 - feeForFill fn** - What: The exact fee of each fill, venue-aware. How: Pure fn picking maker or taker bps by liquidity flag and multiplying against fill notional.
- [x] **T19.9.4 - sessionFees accumulator fn** - What: Total fees paid today always current. How: addFee(prev, fee) reducer feeding a hud.fees.total value on every scored fill.
- [x] **T19.9.5 - burnRate fn** - What: Fees per hour reveals overtrading pace. How: Pure fn dividing session fees by elapsed session hours from the hud clock, guarded under 5 minutes.
- [x] **T19.9.6 - feesVsPnl fn** - What: The ratio that shows fees devouring your edge. How: Pure fn fees / max(abs(realizedPnl), epsilon) exposed as computed hud.fees.ratio.
- [x] **T19.9.7 - Publish fee state** - What: Fee figures readable by HUD and analytics. How: setValue hud.fees.total, hud.fees.rate and hud.fees.ratio after each fill scoring pass.
- [x] **T19.9.8 - Burn meter markup and style** - What: A filling meter that shifts green to orange as fees mount. How: Gradient progress bar bound via :style with a warn class past a configurable ratio threshold.
- [x] **T19.9.9 - Single tests per fee fn** - What: Fee math, accumulation, rate and ratio proven alone. How: One Vitest test per fn with maker and taker fixtures, run only via -t name filters.
- [x] **T19.9.10 - Merge fee meter** - What: Fee awareness shipped to main. How: ESLint and targeted Vitest runs green, then merge feature/f19.9.

### F19.10 - Compact HUD row

**What:** All nine vitals squeezed into one grid-block row so metrics stay visible while every other block works.
**How:** A persisted compact flag switching the HUD via data-if into a severity-ordered abbreviated strip laid out as a single CSS grid row.

- [x] **T19.10.1 - Cut compact branch** - What: Safe space for the layout rework. How: git checkout -b feature/f19.10-compact-hud from main.
- [x] **T19.10.2 - Compact flag setting** - What: Your HUD density choice is remembered. How: hud.compact boolean synced through spektrum/persist with default false.
- [x] **T19.10.3 - severityRank fn** - What: Alerting metrics jump to the front of the strip. How: Pure fn scoring each metric from its alert and tier flags, returning a sortable rank.
- [x] **T19.10.4 - abbreviate fn** - What: Nine metrics fit one row without losing meaning. How: Pure fn mapping metric ids to 2-3 char labels and shortening values via formatCompact.
- [x] **T19.10.5 - Ordered metric list computed** - What: The strip reorders itself as alerts fire. How: Spektrum computed sorting the metric descriptors by severityRank on every hud change.
- [x] **T19.10.6 - Compact strip markup** - What: The one-row HUD renders from live data. How: data-each over the ordered list emitting label/value cells, gated by data-if on hud.compact.
- [x] **T19.10.7 - Full/compact switch** - What: Toggling never leaves stale DOM behind. How: Complementary data-if on the full tile grid so exactly one representation is mounted at a time.
- [x] **T19.10.8 - Single-row CSS layout** - What: The strip holds one uniform block row at any width. How: CSS grid with auto-fit minmax cells, ellipsis overflow and day/night token colors.
- [x] **T19.10.9 - Toggle action and tests** - What: One click flips density, and the fns are proven. How: data-action toggle in the HUD header plus one Vitest test each for severityRank and abbreviate via -t.
- [x] **T19.10.10 - Merge compact mode** - What: Space-saving HUD live for all users. How: Lint plus the two targeted test runs, then merge feature/f19.10 into main.

---

## Phase 20 - Strategy Engine Core

**What:** A pluggable brain computing signals on every tick, ready to advise or auto-trade.
**How:** Strategy framework as Spektrum systems: register strategies with params, emit signals into state.

### F20.1 - Strategy contract and factory

**What:** A crisp contract so any strategy plugs in with init/onTick/onCandle and just works.
**How:** defineStrategy factory in vanilla ES modules validating the hook shape and handing each strategy a controlled context object.

- [x] **T20.1.1 - Cut contract branch** - What: Isolated start for the engine's foundation. How: git checkout -b feature/f20.1-strategy-contract from a fresh main.
- [x] **T20.1.2 - Contract typedef module** - What: One documented shape every strategy author reads. How: src/strategy/contract.js with JSDoc typedefs for Strategy, Hooks and Signal plus exported hook name constants.
- [x] **T20.1.3 - validateStrategyShape fn** - What: Broken strategies fail loud at registration, not mid-session. How: Pure fn checking id, params schema and callable init/onTick/onCandle, throwing named errors per violation.
- [x] **T20.1.4 - defineStrategy factory fn** - What: Authors get a frozen, safe descriptor from plain objects. How: Factory running validateStrategyShape then Object.freeze on the descriptor with defaulted optional hooks.
- [x] **T20.1.5 - createStrategyContext fn** - What: Strategies see instrument data and params, nothing else. How: Pure fn building {instrument, params, ind, log, now} passed into every hook invocation.
- [x] **T20.1.6 - Noop reference strategy** - What: A living example proving the contract end to end. How: src/strategy/builtin/noop.js implementing all three hooks and returning a neutral signal.
- [x] **T20.1.7 - Engine entry module** - What: A single import point for all engine consumers. How: src/strategy/engine.js exporting the factory, context builder and registry seams for later features.
- [x] **T20.1.8 - Inspect exposure** - What: Registered contracts visible in devtools while building. How: Feed descriptor summaries through describe() so spektrum/inspect lists them under a strategies group.
- [x] **T20.1.9 - Single tests for contract fns** - What: Validation, factory and context proven in isolation. How: One Vitest test each for validateStrategyShape, defineStrategy and createStrategyContext, run via -t filters.
- [x] **T20.1.10 - Merge contract to main** - What: The plug-in surface every later feature builds on. How: ESLint plus the three targeted Vitest runs, then merge feature/f20.1.

### F20.2 - Registry and run lifecycle

**What:** Start and stop any strategy per instrument with one call and zero leftovers.
**How:** A Map-backed registry keyed strategyId:instrument managing addSystem tick subscriptions, init calls and full teardown.

- [x] **T20.2.1 - Open lifecycle branch** - What: Contained work on run management. How: Branch feature/f20.2-registry off main and commit the registry skeleton.
- [x] **T20.2.2 - makeRunKey fn** - What: Unambiguous identity for every running pair. How: Pure fn composing strategyId plus instrument into a canonical key with input validation.
- [x] **T20.2.3 - registerStrategy fn** - What: Strategies become known to the desk. How: Add validated descriptors into the registry Map, rejecting duplicate ids with a named error.
- [x] **T20.2.4 - startStrategy fn** - What: One call boots a strategy on an instrument. How: Call init with a fresh context, then addSystem subscribing onTick to that instrument's pipeline tick events.
- [x] **T20.2.5 - stopStrategy fn** - What: Stopping leaves no timers, systems or state behind. How: Remove the tick system, clear run-scoped state keys and delete the run entry from the Map.
- [x] **T20.2.6 - Double-start guard** - What: Repeated starts never duplicate systems. How: Make startStrategy idempotent by returning the existing run when the runKey is already live.
- [x] **T20.2.7 - Running-state publication** - What: The UI always knows what is running where. How: setValue strategies.running as an array of run summaries refreshed on every start and stop.
- [x] **T20.2.8 - Runs list block** - What: See and stop live runs from the dashboard. How: Grid block with data-each over strategies.running and a stop button wired via data-action to stopStrategy.
- [x] **T20.2.9 - Single tests for lifecycle fns** - What: Keying, registration, start and stop each proven alone. How: One Vitest test per fn using a fake tick source, each executed with its own -t filter.
- [x] **T20.2.10 - Merge registry** - What: Lifecycle control shipping on main. How: Lint and the targeted test runs green, then merge the branch.

### F20.3 - Param schema and auto settings UI

**What:** Tune any strategy from an auto-built settings form, no hand-made UI per strategy ever.
**How:** Param schema entries {name,type,min,max,step,default} rendered by data-each into inputs with data-model two-way binding and persisted values.

- [x] **T20.3.1 - Start params branch** - What: Clean slate for schema plumbing. How: git checkout -b feature/f20.3-param-schema from main.
- [x] **T20.3.2 - validateParamSchema fn** - What: Malformed schemas rejected before they reach the UI. How: Pure fn checking name uniqueness, type membership and min/max/step sanity, throwing per field.
- [x] **T20.3.3 - defaultsFromSchema fn** - What: Every strategy starts with sane values. How: Pure fn folding schema entries into a defaults object used at first start.
- [x] **T20.3.4 - coerceParam fn** - What: User input can never smuggle bad types into a strategy. How: Pure fn casting, clamping to min/max and snapping to step per schema entry.
- [x] **T20.3.5 - fieldDescriptor fn** - What: Schema entries become renderable field specs. How: Pure fn mapping each entry to input type, label and binding path for the form template.
- [x] **T20.3.6 - Settings form template** - What: A form appears for any strategy automatically. How: data-each over descriptors emitting number/select/checkbox inputs bound with data-model to strategy param paths.
- [x] **T20.3.7 - Param persistence** - What: Tuned values survive reloads per strategy. How: Sync strategy.params.<id> slices through spektrum/persist to localStorage.
- [x] **T20.3.8 - Live re-init on change** - What: Tweaks apply within one tick, no restart button. How: watch() on each running strategy's param slice re-running init with coerced values.
- [x] **T20.3.9 - Single tests for param fns** - What: Validation, defaults, coercion and mapping proven separately. How: One Vitest test per fn with edge-value fixtures, run via npx vitest run -t names.
- [x] **T20.3.10 - Merge param system** - What: Zero-effort strategy tuning live. How: Green lint plus targeted runs, merge feature/f20.3 into main.

### F20.4 - Signal shape and normalization

**What:** Every strategy speaks one signal dialect: direction, strength, ttl and a human-readable reason.
**How:** normalizeSignal producing {dir, strength, ttl, reason, ts} stored per instrument in Spektrum state with ttl-based expiry sweeping.

- [x] **T20.4.1 - Fork signal branch** - What: Dedicated space for the signal spine. How: Create feature/f20.4-signal-shape from main.
- [x] **T20.4.2 - Signal constants module** - What: Shared vocabulary for every producer and consumer. How: src/strategy/signal.js exporting DIR.LONG/SHORT/FLAT and default ttl constants.
- [x] **T20.4.3 - clampStrength fn** - What: Strength is always a trustworthy 0..1. How: Pure fn clamping numbers and mapping NaN or missing values to 0.
- [x] **T20.4.4 - normalizeSignal fn** - What: Sloppy strategy returns become canonical signals. How: Pure fn coercing dir to -1/0/1, clamping strength, defaulting ttl and stamping ts from the context clock.
- [x] **T20.4.5 - isExpired fn** - What: Stale signals are provably dead. How: Pure fn comparing ts + ttl against now, treating ttl 0 as never-expiring.
- [x] **T20.4.6 - publishSignal fn** - What: One write path for every strategy's output. How: setValue signals.<runKey> with the normalized signal after each hook return.
- [x] **T20.4.7 - Expiry sweeper system** - What: Dead signals disappear on their own. How: addAsync sweep every second flipping expired entries to a flat signal via isExpired.
- [x] **T20.4.8 - Signal chip UI** - What: Direction and strength readable at a glance per instrument. How: Small chip in the strategy block binding an arrow glyph, strength bar and reason tooltip via :attr.
- [x] **T20.4.9 - Single tests for signal fns** - What: Clamping, normalization, expiry and publish proven alone. How: One Vitest test per fn with boundary fixtures, run through -t filters only.
- [x] **T20.4.10 - Merge signal spine** - What: The common dialect shipped for all strategies. How: Lint and targeted tests green, then merge to main.

### F20.5 - Trend indicators: EMA and RSI

**What:** Battle-tested EMA and RSI as pure incremental functions any strategy calls on every tick.
**How:** O(1) update-state indicator fns in src/strategy/indicators/ with warmup flags and a crossover helper, allocation-free in the hot path.

- [x] **T20.5.1 - Branch trend indicators** - What: Focused branch for the first indicator pair. How: git checkout -b feature/f20.5-ema-rsi from main.
- [x] **T20.5.2 - createEma fn** - What: Smooth trend value updated in constant time. How: Closure holding alpha and last value, update(x) returning the new EMA without allocations.
- [x] **T20.5.3 - createRsi fn** - What: Overbought/oversold reading strategies rely on. How: Wilder-smoothed average gain/loss closure with update(x) returning 0..100.
- [x] **T20.5.4 - isWarm fn** - What: Strategies never act on half-baked indicator values. How: Pure fn comparing samples seen against period, exposed on both indicator states.
- [x] **T20.5.5 - crossed fn** - What: Clean crossover detection without per-strategy boilerplate. How: Pure fn comparing current and previous a/b pairs returning 1, -1 or 0.
- [x] **T20.5.6 - Reference-series verification** - What: Values provably match known-good math. How: Feed a recorded OKX tick fixture through both indicators and assert against precomputed expected series.
- [x] **T20.5.7 - Hot-path micro benchmark** - What: Indicators proven cheap enough for every tick. How: performance.now() loop over 100k updates in a Vitest bench-style check asserting a per-update ceiling.
- [x] **T20.5.8 - Indicator barrel and context wiring** - What: Strategies reach indicators as ctx.ind with zero imports. How: indicators/index.js barrel export injected into createStrategyContext.
- [x] **T20.5.9 - Single tests per indicator fn** - What: EMA, RSI, warmup and crossover each proven alone. How: One Vitest test per fn in separate -t runs with deterministic fixtures.
- [x] **T20.5.10 - Merge trend pair** - What: Core trend math available to every strategy. How: Lint plus targeted runs, merge feature/f20.5.

### F20.6 - Volatility indicators: VWAP, ATR and stddev

**What:** VWAP, ATR and rolling stddev give strategies volume and volatility context on every tick.
**How:** Session-anchored VWAP, Wilder ATR and Welford stddev as incremental pure fns matching the EMA closure API.

- [x] **T20.6.1 - Branch volatility pack** - What: Separate line for the second indicator set. How: Create feature/f20.6-vwap-atr-stddev from main.
- [x] **T20.6.2 - createVwap fn** - What: The day's fair price anchor for mean-reversion plays. How: Closure accumulating price*volume and volume with update(px, vol) and a reset() for session rolls.
- [x] **T20.6.3 - trueRange fn** - What: The honest per-candle range including gaps. How: Pure fn max of high-low, abs(high-prevClose), abs(low-prevClose).
- [x] **T20.6.4 - createAtr fn** - What: A live volatility yardstick for stops and sizing. How: Wilder-smoothed closure over trueRange values with update(candle) in constant time.
- [x] **T20.6.5 - createStddev fn** - What: Numerically stable dispersion for band logic. How: Welford online algorithm closure over a rolling window returning sample stddev.
- [x] **T20.6.6 - zscore fn** - What: One number saying how stretched price is. How: Pure fn (x - mean) / stddev with a zero-stddev guard returning 0.
- [x] **T20.6.7 - Session reset wiring** - What: VWAP restarts cleanly each trading day. How: Subscribe reset() to the engine's session-roll event fired from a dayKey comparison on candle close.
- [x] **T20.6.8 - Fixture verification and barrel** - What: Values match known series and ship in ctx.ind. How: Assert against a precomputed candle fixture, then add all three to the indicators barrel.
- [x] **T20.6.9 - Single tests per volatility fn** - What: VWAP, trueRange, ATR, stddev and zscore proven independently. How: One Vitest test per fn, each executed by its own -t filter.
- [x] **T20.6.10 - Merge volatility pack** - What: Full indicator library live for strategies. How: Green lint and targeted runs, merge to main.

### F20.7 - Per-strategy perf budget and throttling

**What:** Strategies stay snappy: each gets a per-tick time budget and slow ones get throttled, never the UI.
**How:** Wrap onTick with performance.now() measurement, EWMA the cost per run, and stride-gate over-budget strategies to every Nth tick.

- [x] **T20.7.1 - Open budget branch** - What: Contained work on the timing guardrail. How: git checkout -b feature/f20.7-perf-budget from main.
- [x] **T20.7.2 - measureTick wrapper fn** - What: Every hook call has a known cost. How: Higher-order fn timing the wrapped hook with performance.now() and returning {result, costMs}.
- [x] **T20.7.3 - costEwma tracker fn** - What: A stable cost estimate immune to single spikes. How: Reuse the ewma pure fn per run with alpha 0.2, stored on the run record.
- [x] **T20.7.4 - Budget schema entry** - What: Authors declare their own tick budget. How: Add budgetMs to the param schema defaults (2ms) so the settings UI exposes it per strategy.
- [x] **T20.7.5 - overBudget fn** - What: A crisp verdict on who is too slow. How: Pure fn comparing the EWMA cost against budgetMs with 20 percent hysteresis to avoid flapping.
- [x] **T20.7.6 - throttleStride fn** - What: Slow strategies degrade gracefully instead of dying. How: Pure fn mapping the overage ratio to a tick stride of 2, 4 or 8.
- [x] **T20.7.7 - Stride gate in dispatch** - What: The tick loop skips throttled runs cheaply. How: Modulo check on a per-run tick counter inside the engine dispatch before invoking onTick.
- [x] **T20.7.8 - Cost state and warn badge** - What: Slowness is visible before it hurts. How: Publish per-run costMs and stride into strategies.running and bind an orange badge via :class in the runs block.
- [x] **T20.7.9 - Single tests per budget fn** - What: Measurement, EWMA, verdict and stride proven alone. How: One Vitest test per fn with a fake clock, each run through its own -t filter.
- [x] **T20.7.10 - Merge perf guardrail** - What: A tick loop that stays fast under load. How: Lint plus targeted runs green, merge feature/f20.7.

### F20.8 - Sandboxed strategy errors

**What:** One crashing strategy can never take down the tick loop or its neighbors.
**How:** Hook calls wrapped in Spektrum attempt(), consecutive-error tallies, automatic quarantine and a visible resume path.

- [x] **T20.8.1 - Start sandbox branch** - What: Isolated hardening work. How: Branch feature/f20.8-error-sandbox off main.
- [x] **T20.8.2 - safeInvoke fn** - What: Hook exceptions become data instead of crashes. How: Wrap each hook call in attempt(), returning {ok, value, error} with the runKey attached.
- [x] **T20.8.3 - errorTally fn** - What: Repeat offenders are counted precisely. How: Pure reducer incrementing consecutive errors per run and resetting to zero on any success.
- [x] **T20.8.4 - quarantine fn** - What: A flapping strategy is benched automatically. How: Call stopStrategy and mark the run quarantined when the tally hits 3, preserving its last error.
- [x] **T20.8.5 - Error ring log** - What: Recent failures stay inspectable after the fact. How: Push {runKey, error, ts} into a 64-slot ring exposed to spektrum/inspect.
- [x] **T20.8.6 - Quarantine state publication** - What: The desk sees who is benched and why. How: setValue strategies.quarantined with run summaries and last error messages.
- [x] **T20.8.7 - Resume action** - What: One click puts a fixed strategy back to work. How: Resume button in the runs block wired via data-action to clear the tally and restart the run.
- [x] **T20.8.8 - Crash-fixture strategy** - What: Isolation proven against a genuinely hostile plugin. How: A builtin test strategy throwing on every 5th tick, verified to quarantine while a sibling keeps emitting.
- [x] **T20.8.9 - Single tests per sandbox fn** - What: Wrapping, tallying and quarantine each proven alone. How: One Vitest test per fn with throwing stubs, run via separate -t filters.
- [x] **T20.8.10 - Merge sandbox** - What: A tick loop that survives bad code. How: Green lint and targeted runs, merge to main.

### F20.9 - Signal history ring buffer

**What:** The last 512 signals per run kept in memory for the journal and instant context on any decision.
**How:** Fixed-size rings appended on every publish, checkpoint-tagged via Spektrum serialize and exported through a plain-array snapshot API.

- [x] **T20.9.1 - Branch history buffer** - What: Clean room for the memory layer. How: git checkout -b feature/f20.9-signal-history from main.
- [x] **T20.9.2 - createSignalRing fn** - What: Bounded memory per run, guaranteed. How: 512-slot ring closure with append and overwrite-on-full semantics built on the shared ring pattern.
- [x] **T20.9.3 - Append on publish** - What: Every emitted signal is remembered automatically. How: Hook createSignalRing.append into publishSignal keyed by runKey.
- [x] **T20.9.4 - snapshotRing fn** - What: Consumers get plain data, not internals. How: Pure fn unrolling the ring into a chronologically ordered array of signal objects.
- [x] **T20.9.5 - ringStats fn** - What: Instant counts of long/short/flat emissions per run. How: Pure fn folding a snapshot into direction tallies and a last-emission timestamp.
- [x] **T20.9.6 - Checkpoint integration** - What: Signal history rides along with state time-travel. How: Include ring snapshots in checkpoint() payloads via serialize so replay sessions restore them.
- [x] **T20.9.7 - exportSignals fn** - What: The journal (phase 25) can pull history through one stable call. How: Public engine fn returning snapshots filtered by runKey and time range.
- [x] **T20.9.8 - Recent signals mini list** - What: The last few calls visible under each running strategy. How: data-each over a 5-entry snapshot slice in the runs block with dir glyphs and reasons.
- [x] **T20.9.9 - Single tests per history fn** - What: Ring bounds, snapshots, stats and export proven alone. How: One Vitest test per fn including a wraparound fixture, run via -t names.
- [x] **T20.9.10 - Merge history buffer** - What: Every signal accountable after the fact. How: Lint plus targeted runs, merge feature/f20.9 into main.

### F20.10 - Weighted vote composition

**What:** Blend several strategies into one composite signal so the desk trades a consensus, not a cacophony.
**How:** composeSignals summing dir*strength*weight across member runs, normalized weights with a slider UI, published as a virtual run in the registry.

- [x] **T20.10.1 - Cut composition branch** - What: Final engine feature in its own lane. How: Create feature/f20.10-weighted-vote from main.
- [x] **T20.10.2 - normalizeWeights fn** - What: Weights always sum to one no matter what users type. How: Pure fn scaling a weight map proportionally with an equal-split fallback for all-zero input.
- [x] **T20.10.3 - composeSignals fn** - What: Many opinions become one directional score. How: Pure fn summing dir*strength*weight over live member signals, ignoring expired ones via isExpired.
- [x] **T20.10.4 - voteThreshold fn** - What: Weak consensus stays flat instead of flip-flopping. How: Pure fn mapping the composite score to -1/0/1 with a configurable dead zone from the param schema.
- [x] **T20.10.5 - compositeTtl fn** - What: The blend expires when its shakiest member does. How: Pure fn taking the minimum remaining ttl across contributing member signals.
- [x] **T20.10.6 - Virtual composite run** - What: The blend behaves like any other strategy. How: Register the composition as a defineStrategy descriptor whose onTick calls composeSignals and publishSignal.
- [x] **T20.10.7 - Weight persistence** - What: Your blend recipe survives reloads. How: Store the weight map under strategy.params.composite via spektrum/persist.
- [x] **T20.10.8 - Weights editor UI** - What: Tune member influence with live sliders. How: data-each over members emitting range inputs bound by data-model, re-normalized on input via the watch on the slice.
- [x] **T20.10.9 - Single tests per vote fn** - What: Normalization, composition, threshold and ttl proven alone. How: One Vitest test per fn with conflicting-signal fixtures, run via separate -t filters.
- [x] **T20.10.10 - Merge composition** - What: Consensus signals ready for the bot runner. How: Green lint and targeted runs, then merge feature/f20.10 to main.

---

## Phase 21 - Built-in Scalping Strategies

**What:** Battle-known scalps out of the box: momentum bursts, mean reversion, spread capture and more, armed and ready.
**How:** Implement classic micro-strategies as ES modules on the phase-20 Spektrum strategy engine with defineFn signals, tuned presets and Vitest coverage.

### F21.1 - Momentum Burst Breakout

**What:** Entries fire the instant tick velocity spikes, so the user rides momentum bursts before the move is obvious.
**How:** Rolling tick-velocity and baseline defineFns on the phase-20 strategy engine emitting entries via trigger().

- [x] **T21.1.1 - Branch and scaffold momentum module** - What: An isolated branch and file skeleton so the momentum strategy ships independently. How: git checkout -b feature/f21-1-momentum-burst; create src/strategies/momentumBurst.js exporting a strategy descriptor object.
- [x] **T21.1.2 - Build tickVelocity fn** - What: A raw speed metric: ticks per second over a rolling window. How: Implement pure tickVelocity(ticks, windowMs) on a timestamp ring buffer and register it with defineFn.
- [x] **T21.1.3 - Build velocityBaseline fn** - What: A calm-market reference so real spikes stand out from noise. How: Implement EMA velocityBaseline(prev, sample, alpha) updated per tick inside the strategy state slice.
- [x] **T21.1.4 - Build burstSignal fn** - What: The go/no-go call: velocity above N x baseline fires long or short. How: Implement burstSignal(velocity, baseline, multiple, priceDelta) returning null, long or short from the spike-window delta sign.
- [x] **T21.1.5 - Wire strategy into engine** - What: The strategy runs live on streaming ticks without manual steps. How: Register momentumBurst via addSystem() on the phase-11 tick channel and emit trigger('strategy:signal') on fire.
- [x] **T21.1.6 - Build decayExit fn** - What: Trades close fast on a time stop or when the burst dies. How: Implement decayExit(entryTs, velocity, baseline, timeStopMs) and hook it into the engine's exit evaluation.
- [x] **T21.1.7 - Expose tunable params** - What: windowMs, multiple and timeStopMs adjustable per user without code edits. How: Hold params under setValue('strat.momentum.params') and read them through computed() in the signal path.
- [x] **T21.1.8 - Add HUD status row** - What: Armed and fired state visible at a glance in the strategy list block. How: Add a row template with {{state}} binding and data-if fired flash using design-system green/orange tokens.
- [x] **T21.1.9 - Write single unit tests** - What: Proof each signal fn is correct in isolation. How: One Vitest test each for tickVelocity, velocityBaseline, burstSignal and decayExit, run with vitest -t per function only.
- [x] **T21.1.10 - Verify on replay and merge** - What: A proven strategy landing on main. How: Replay a recorded OKX tick session from IndexedDB, confirm expected fires, run ESLint, merge the branch into main.

### F21.2 - VWAP Mean Reversion Bands

**What:** The user fades overstretched moves: entries when price pierces VWAP deviation bands and snaps back.
**How:** Incremental session VWAP and Welford stdev defineFns feeding a band-touch reversion signal on the strategy engine.

- [x] **T21.2.1 - Branch and scaffold VWAP module** - What: A clean workspace for the reversion strategy. How: git checkout -b feature/f21-2-vwap-revert; create src/strategies/vwapRevert.js with the descriptor skeleton.
- [x] **T21.2.2 - Build sessionVwap fn** - What: A running fair-value anchor for the session. How: Implement incremental sessionVwap(state, price, size) accumulating price*size and volume; register via defineFn.
- [x] **T21.2.3 - Build vwapDeviation fn** - What: A live measure of how stretched price is from VWAP. How: Implement Welford-based incremental stdev of the price-VWAP distance in vwapDeviation(state, distance).
- [x] **T21.2.4 - Build bandTouch fn** - What: Detection of price piercing the k-sigma band, the fade setup. How: Implement bandTouch(price, vwap, sigma, k) returning fade-long, fade-short or null.
- [x] **T21.2.5 - Build revertConfirm fn** - What: No knife-catching: entry only after one tick back toward VWAP. How: Implement revertConfirm(lastTicks, side) requiring a confirming print before the signal passes.
- [x] **T21.2.6 - Wire strategy into engine** - What: Reversion signals flow live from ticks to the signal bus. How: addSystem() subscription on the tick channel chaining the four fns and emitting trigger('strategy:signal').
- [x] **T21.2.7 - Build vwapExit fn** - What: Exits at VWAP touch or a fixed tick target, stop beyond the band. How: Implement vwapExit(position, price, vwap, targetTicks, stopTicks) wired into the engine exit hook.
- [x] **T21.2.8 - Params and band readout** - What: sigmaK, minDeviationTicks and stopTicks user-tunable with live band values visible. How: Params via setValue('strat.vwap.params'); band edges shown in the strategy row through computed() bindings.
- [x] **T21.2.9 - Write single unit tests** - What: Each math fn locked in with exactly one test. How: One Vitest test each for sessionVwap, vwapDeviation, bandTouch, revertConfirm and vwapExit; targeted vitest -t runs.
- [x] **T21.2.10 - Verify on volatile replay and merge** - What: Behavior confirmed on rough data before shipping. How: Replay a volatile recorded session from IndexedDB, check band entries and exits, ESLint, merge to main.

### F21.3 - Post-Only Spread Capture

**What:** The user earns the spread passively: post-only quotes on both sides collect maker fills all session.
**How:** Quote-pricing and requote fns from phase-14 book tops emitting post-only order intents to the phase-17 execution engine.

- [x] **T21.3.1 - Branch and scaffold spread module** - What: Independent delivery of the market-making scalp. How: git checkout -b feature/f21-3-spread-capture; create src/strategies/spreadCapture.js.
- [x] **T21.3.2 - Build quotePrices fn** - What: Correct passive prices on both sides of the book. How: Implement quotePrices(bestBid, bestAsk, offsetTicks, tickSize) returning bid and ask quote prices.
- [x] **T21.3.3 - Build minSpreadGate fn** - What: Quotes go out only when the spread pays after fees. How: Implement minSpreadGate(spreadTicks, minTicks, makerFeeBps) using the OKX maker fee as input.
- [x] **T21.3.4 - Build shouldRequote fn** - What: Less churn: requotes only when the book moves beyond tolerance. How: Implement shouldRequote(currentQuotes, bookTop, toleranceTicks) returning a boolean per side.
- [x] **T21.3.5 - Build inventorySkew fn** - What: Position mean-reverts itself: quotes lean against open inventory. How: Implement inventorySkew(position, maxInventory, skewTicks) shifting both quote prices.
- [x] **T21.3.6 - Wire quoting loop** - What: Live two-sided quoting driven by the book feed. How: addSystem() on the phase-14 book-top channel emitting post-only order intents via trigger('order:intent') to phase-17.
- [x] **T21.3.7 - Wire cancel-replace flow** - What: Stale quotes replaced fast but throttled against rate limits. How: Emit cancel-replace intents on shouldRequote hits with a throttleMs param enforced via addAsync scheduling.
- [x] **T21.3.8 - Params and quote status row** - What: offsetTicks, minTicks and maxInventory tunable; live quotes and fill count visible. How: setValue-backed params plus a HUD row with {{bidQuote}} and {{askQuote}} bindings and a fill counter.
- [x] **T21.3.9 - Write single unit tests** - What: Quote math verified per function. How: One Vitest test each for quotePrices, minSpreadGate, shouldRequote and inventorySkew; run only those tests.
- [x] **T21.3.10 - Verify intent log and merge** - What: Correct intents proven without risking capital. How: Replay a book recording, assert emitted intents in a dry-run intent log, ESLint, merge to main.

### F21.4 - Order-Book Imbalance Signal

**What:** The user trades with the loaded side: entries when bid/ask depth imbalance tips hard and holds.
**How:** Depth-imbalance and microprice defineFns over top-N book levels with a persistence filter before trigger().

- [x] **T21.4.1 - Branch and scaffold imbalance module** - What: A dedicated branch for the depth-signal strategy. How: git checkout -b feature/f21-4-book-imbalance; create src/strategies/bookImbalance.js.
- [x] **T21.4.2 - Build depthImbalance fn** - What: One number for which side of the book is loaded. How: Implement depthImbalance(bids, asks, levelsN) computing (bidVol-askVol)/(bidVol+askVol) over top N levels.
- [x] **T21.4.3 - Build microPrice fn** - What: A volume-weighted mid that leads the last trade. How: Implement microPrice(bestBid, bestAsk, bidSize, askSize) as the size-weighted midpoint.
- [x] **T21.4.4 - Build imbalancePersist fn** - What: No flicker trades: the ratio must hold for M consecutive updates. How: Implement imbalancePersist(state, ratio, threshold, persistM) tracking a streak counter.
- [x] **T21.4.5 - Build imbalanceSignal fn** - What: The combined entry call: persistent imbalance plus microprice drift agreement. How: Implement imbalanceSignal(persistOk, ratio, microDrift) returning long, short or null.
- [x] **T21.4.6 - Wire into engine** - What: Signals stream live from every book update. How: addSystem() on the phase-14 depth channel chaining the fns and emitting trigger('strategy:signal').
- [x] **T21.4.7 - Build flipExit fn** - What: Positions close when the book turns or the tick target hits. How: Implement flipExit(position, ratio, targetTicks) wired into the engine exit hook.
- [x] **T21.4.8 - Params and ratio gauge** - What: levelsN, threshold and persistM tunable with the live ratio visible as a bar. How: setValue params plus a hand-rolled canvas mini-bar in the strategy row painting the ratio green/orange.
- [x] **T21.4.9 - Write single unit tests** - What: Depth math pinned down per fn. How: One Vitest test each for depthImbalance, microPrice, imbalancePersist, imbalanceSignal and flipExit; targeted runs.
- [x] **T21.4.10 - Verify on depth replay and merge** - What: Signal quality checked against recorded books. How: Replay an IndexedDB depth recording, compare fires against expected imbalance episodes, ESLint, merge.

### F21.5 - Tape Pressure Shift

**What:** The user reads the tape automatically: signals when the aggressor buy/sell ratio flips fast.
**How:** Aggressor classification and rolling-ratio fns over OKX trade prints from the phase-14 tape feed.

- [x] **T21.5.1 - Branch and scaffold tape module** - What: A separate branch for the tape-reading strategy. How: git checkout -b feature/f21-5-tape-pressure; create src/strategies/tapePressure.js.
- [x] **T21.5.2 - Build classifyAggressor fn** - What: Every print labeled buyer- or seller-initiated. How: Implement classifyAggressor(trade) using the OKX trades-channel side field with a tick-rule fallback.
- [x] **T21.5.3 - Build aggressorRatio fn** - What: A rolling share of buy volume over the window. How: Implement aggressorRatio(state, print, windowMs) with incremental add/expire on a deque.
- [x] **T21.5.4 - Build ratioShift fn** - What: Detection of a fast flip in pressure, not slow drift. How: Implement ratioShift(ratioNow, ratioPrev, shiftWindowMs) returning the signed shift rate.
- [x] **T21.5.5 - Build pressureSignal fn** - What: Entries only on hard shifts with enough prints behind them. How: Implement pressureSignal(shift, threshold, printCount, minPrints) returning long, short or null.
- [x] **T21.5.6 - Wire into engine** - What: The tape drives signals with no polling. How: addSystem() on the phase-14 trade-print channel with the chained fns emitting trigger('strategy:signal').
- [x] **T21.5.7 - Build normalizeExit fn** - What: Exits when pressure normalizes or the time stop lapses. How: Implement normalizeExit(position, ratio, neutralBand, timeStopMs) wired to the exit hook.
- [x] **T21.5.8 - Params and pressure meter** - What: windowMs, threshold and minPrints tunable with live pressure visible. How: setValue params plus a green/orange meter bar bound with :style width from a computed ratio.
- [x] **T21.5.9 - Write single unit tests** - What: One test per tape fn, no more. How: Vitest tests for classifyAggressor, aggressorRatio, ratioShift, pressureSignal and normalizeExit; vitest -t only.
- [x] **T21.5.10 - Verify on tape replay and merge** - What: Fires match visible pressure flips in a recording. How: Replay recorded prints, compare meter movement against fires, ESLint pass, merge branch to main.

### F21.6 - Micro Range Fade

**What:** The user fades micro range edges: entries at fresh support/resistance touches with tight stops.
**How:** Swing-point and level-cluster fns build micro S/R; a touch-reject fn fires fades via the strategy engine.

- [x] **T21.6.1 - Branch and scaffold range module** - What: An isolated branch for the range-fade strategy. How: git checkout -b feature/f21-6-range-fade; create src/strategies/rangeFade.js.
- [x] **T21.6.2 - Build swingPoints fn** - What: Fresh local highs and lows found as they form. How: Implement swingPoints(ticks, fractalWindow) detecting confirmed swing highs and lows over the lookback.
- [x] **T21.6.3 - Build levelCluster fn** - What: Nearby swings merged into tradable S/R levels with touch counts. How: Implement levelCluster(swings, mergeTicks) grouping levels and tracking touches per level.
- [x] **T21.6.4 - Build touchReject fn** - What: The setup: price touches a level and prints rejection. How: Implement touchReject(level, lastTicks, rejectTicks) confirming a reversal print off the level.
- [x] **T21.6.5 - Build fadeSignal fn** - What: The entry: fade the touch with a stop just beyond the level. How: Implement fadeSignal(level, side, stopBufferTicks) returning entry direction and stop price.
- [x] **T21.6.6 - Wire into engine** - What: Levels and fades update live from the tick stream. How: addSystem() on the tick channel maintaining levels in state and emitting trigger('strategy:signal') on setups.
- [x] **T21.6.7 - Build levelBreak fn** - What: Broken levels invalidate instantly so fades never fight breakouts. How: Implement levelBreak(level, price, breakTicks) pruning the level set and force-exiting open fades.
- [x] **T21.6.8 - Level overlay on micro-charts** - What: S/R lines drawn on the phase-13 sparkline for instant context. How: Push level prices into the chart overlay hook; the hand-rolled canvas draws dashed lines in theme colors.
- [x] **T21.6.9 - Write single unit tests** - What: Level logic verified fn by fn. How: One Vitest test each for swingPoints, levelCluster, touchReject, fadeSignal and levelBreak; targeted runs only.
- [x] **T21.6.10 - Verify on ranging replay and merge** - What: Fades fire at edges and stand down on breakouts. How: Replay a ranging session recording, check entries and invalidations, ESLint, merge to main.

### F21.7 - Session-Open Drive

**What:** The user captures the directional drive right after a session opens, when scalps pay fastest.
**How:** UTC session-clock gate plus opening-range fns; a range breakout inside the window fires with-trend entries.

- [x] **T21.7.1 - Branch and scaffold open-drive module** - What: A dedicated branch for the session-open play. How: git checkout -b feature/f21-7-open-drive; create src/strategies/openDrive.js.
- [x] **T21.7.2 - Build sessionClock fn** - What: The strategy knows exactly when tradable session opens occur. How: Implement sessionClock(nowUtc, sessionDefs) returning active window and secondsToOpen from configured UTC windows.
- [x] **T21.7.3 - Build openingRange fn** - What: The first-minutes high/low captured as the breakout box. How: Implement openingRange(state, tick, rangeSecs) accumulating high and low during the opening window.
- [x] **T21.7.4 - Build driveSignal fn** - What: With-trend entry the moment the box breaks with buffer. How: Implement driveSignal(price, range, bufferTicks, windowActive) returning long, short or null.
- [x] **T21.7.5 - Build oneShotGuard fn** - What: Discipline built in: a max entry count per session open. How: Implement oneShotGuard(state, sessionId, maxEntries) counting fires per open.
- [x] **T21.7.6 - Wire clocked system** - What: The strategy arms itself on schedule with no user action. How: addSystem() on ticks plus an addAsync 1s clock updating sessionClock state and arming the window.
- [x] **T21.7.7 - Build trailStop fn** - What: The drive is ridden with a trailing tick stop, not a fixed target. How: Implement trailStop(position, price, trailTicks) ratcheting the stop and signaling exit on hit.
- [x] **T21.7.8 - Params and countdown readout** - What: Sessions list, rangeSecs and bufferTicks tunable; countdown-to-open visible. How: setValue params; a computed() secondsToOpen label rendered in the strategy row via {{countdown}}.
- [x] **T21.7.9 - Write single unit tests** - What: Clock and range math each proven once. How: One Vitest test each for sessionClock, openingRange, driveSignal, oneShotGuard and trailStop; vitest -t runs.
- [x] **T21.7.10 - Verify on open replay and merge** - What: Correct arming and a clean breakout fire on record. How: Replay a session-open recording, verify the arm/fire/trail sequence, ESLint, merge to main.

### F21.8 - Volatility Squeeze Expansion

**What:** The user enters the moment compressed volatility expands, catching the first leg of a fresh move.
**How:** 1s-bucket micro-range, squeeze-percentile and expansion-trigger fns registered via defineFn on the engine.

- [x] **T21.8.1 - Branch and scaffold squeeze module** - What: A separate branch for the volatility play. How: git checkout -b feature/f21-8-vol-squeeze; create src/strategies/volSqueeze.js.
- [x] **T21.8.2 - Build microRange fn** - What: Volatility measured as 1-second bucket high-low ranges. How: Implement microRange(state, tick) bucketing ticks per second and emitting closed-bucket ranges.
- [x] **T21.8.3 - Build squeezeDetect fn** - What: Quiet markets flagged when the range percentile drops. How: Implement squeezeDetect(ranges, lookback, pctThreshold) comparing current range to its rolling percentile.
- [x] **T21.8.4 - Build expansionTrigger fn** - What: The entry moment: a bucket range explodes past the squeeze average. How: Implement expansionTrigger(bucket, squeezeAvg, k, closeDelta) returning direction from the delta sign.
- [x] **T21.8.5 - Build squeezeSignal fn** - What: One combined call: only expansions out of a confirmed squeeze fire. How: Implement squeezeSignal(squeezeActive, expansion) gating the trigger by squeeze state.
- [x] **T21.8.6 - Wire into engine** - What: Bucket ranges and signals update live every second. How: addSystem() on the tick channel driving the bucket pipeline and emitting trigger('strategy:signal').
- [x] **T21.8.7 - Build contractionExit fn** - What: Exits when the move stalls back into contraction or hits target. How: Implement contractionExit(position, bucket, squeezeAvg, targetTicks) wired into the exit hook.
- [x] **T21.8.8 - Params and squeeze lamp** - What: lookback, pctThreshold and k tunable; a pulsing lamp shows squeeze-on. How: setValue params plus a data-if lamp element pulsing via CSS animation in the strategy row.
- [x] **T21.8.9 - Write single unit tests** - What: Every squeeze fn covered by exactly one test. How: Vitest tests for microRange, squeezeDetect, expansionTrigger, squeezeSignal and contractionExit; targeted runs.
- [x] **T21.8.10 - Verify on squeeze replay and merge** - What: A recorded squeeze-then-break resolves into one clean fire. How: Replay the recording, verify lamp and fire timing, ESLint, merge to main.

### F21.9 - Scalper Preset Packs

**What:** The user picks conservative, standard or aggressive per strategy and trades tuned scalping defaults instantly.
**How:** Preset modules per strategy applied through batched setValue calls, custom packs saved via spektrum/persist.

- [x] **T21.9.1 - Branch and scaffold presets** - What: A branch and folder where all tuned defaults live. How: git checkout -b feature/f21-9-preset-packs; create src/strategies/presets/ with one module per strategy.
- [x] **T21.9.2 - Build validatePreset fn** - What: Bad preset shapes rejected before they touch live params. How: Implement validatePreset(preset, schema) checking keys, types and numeric ranges per strategy schema.
- [x] **T21.9.3 - Build applyPreset fn** - What: One click swaps a strategy's full param set atomically. How: Implement applyPreset(stratId, preset) issuing a batched setValue over the strategy's param keys.
- [x] **T21.9.4 - Author presets pack A** - What: Tuned conservative/standard/aggressive values for momentum, VWAP, spread and imbalance. How: Write the four preset modules with curated scalping values and inline rationale comments.
- [x] **T21.9.5 - Author presets pack B** - What: Tuned packs for tape pressure, range fade, open drive and squeeze. How: Write the remaining four preset modules with curated values matched to 1s-scale scalping.
- [x] **T21.9.6 - Preset picker UI** - What: Preset switching inside each strategy row, zero navigation. How: A select bound with data-model to the active preset and data-action calling applyPreset on change.
- [x] **T21.9.7 - Build savePreset fn** - What: The user's own tweaks saved as a named custom pack. How: Implement savePreset(stratId, name, params) diffing current state and persisting under stockz.presets via spektrum/persist.
- [x] **T21.9.8 - Dirty state and reset** - What: Visible drift from the active preset and a one-click reset. How: A computed() dirty flag comparing live params to the preset plus a reset data-action reapplying it.
- [x] **T21.9.9 - Write single unit tests** - What: Preset plumbing proven fn by fn. How: One Vitest test each for validatePreset, applyPreset and savePreset; run only those tests.
- [x] **T21.9.10 - Verify live switching and merge** - What: Presets swap mid-replay without breaking running strategies. How: Switch packs during an IndexedDB replay, confirm param pickup, ESLint, merge to main.

### F21.10 - Live Strategy Scoreboard

**What:** The user sees which strategy earns: fires, win rate, PnL and hold time per strategy updating live.
**How:** Incremental stats accumulator fns fed by watch() on signal and position-close events, rendered in a scoreboard grid block.

- [x] **T21.10.1 - Branch and scaffold stats module** - What: A dedicated branch for the scoreboard. How: git checkout -b feature/f21-10-scoreboard; create src/strategies/strategyStats.js.
- [x] **T21.10.2 - Build recordFire fn** - What: Every signal logged with strategy, side and timestamp. How: Implement recordFire(state, event) appending to a per-strategy fire list via addValue.
- [x] **T21.10.3 - Build recordOutcome fn** - What: Each fire linked to its fill and closed PnL. How: Implement recordOutcome(state, closeEvent) matching phase-18 position closes to fires by strategy and instrument.
- [x] **T21.10.4 - Build statsRollup fn** - What: Win rate, avg PnL, avg hold and fires/hour always current, never rescanned. How: Implement incremental statsRollup(prev, outcome) updating running aggregates in O(1).
- [x] **T21.10.5 - Wire event feeds** - What: Stats update themselves from live trading events. How: watch() on trigger('strategy:signal') and position-close events routing into recordFire and recordOutcome.
- [x] **T21.10.6 - Build scoreboard block** - What: A per-strategy stats table in the dashboard grid, sorted by PnL. How: Register a uniform grid block with data-each rows over a computed() sorted stats list.
- [x] **T21.10.7 - Style scoreboard with PnL sparklines** - What: Green/orange PnL coloring and a per-strategy equity sparkline. How: Theme-token classes plus a hand-rolled canvas sparkline of cumulative PnL per row.
- [x] **T21.10.8 - Session reset and persistence** - What: Day stats survive reload and reset on demand. How: Persist the stats slice via spektrum/persist under stockz.stratstats plus a reset data-action clearing it.
- [x] **T21.10.9 - Write single unit tests** - What: Accumulator math trusted, one test per fn. How: Vitest tests for recordFire, recordOutcome and statsRollup with targeted vitest -t runs.
- [x] **T21.10.10 - Verify on full replay and merge** - What: A replayed session yields a coherent scoreboard on main. How: Run all strategies over a recorded session, sanity-check totals against closes, ESLint, merge.

---

## Phase 22 - Alerts & Notifications

**What:** The desk taps your shoulder: price, signal and fill alerts you cannot miss.
**How:** Alert engine built on Spektrum watch() feeding a toast queue, WebAudio sound pack and the browser Notification API.

### F22.1 - Price-Cross Alert CRUD

**What:** The user sets, edits and deletes above/below price alerts per instrument in seconds.
**How:** Alert definitions in Spektrum state with a pure evalPriceCross fn run by watch() on each tick.

- [x] **T22.1.1 - Branch and scaffold price alerts** - What: An isolated branch and module for price alerting. How: git checkout -b feature/f22-1-price-alerts; create src/alerts/priceAlerts.js with the alert model shape.
- [x] **T22.1.2 - Build createAlert fn** - What: New above/below alerts created with a stable shape. How: Implement createAlert(instrument, direction, price, opts) generating an id and pushing into state via addValue.
- [x] **T22.1.3 - Build evalPriceCross fn** - What: Exact cross detection, including gap-throughs, in pure code. How: Implement evalPriceCross(alert, prevPrice, lastPrice) returning a fired boolean that covers gaps past the level.
- [x] **T22.1.4 - Wire tick evaluation** - What: Alerts fire live off every price update with no polling. How: watch() on per-instrument last-price keys running evalPriceCross and emitting trigger('alert:fired').
- [x] **T22.1.5 - Build updateAlert and removeAlert fns** - What: Alerts edited or deleted without recreating them. How: Implement updateAlert(id, patch) and removeAlert(id) mutating the alerts list via setValue.
- [x] **T22.1.6 - Build rearmAlert fn** - What: One-shot or repeating alerts with a cooldown between fires. How: Implement rearmAlert(alert, nowTs) honoring oneShot and cooldownMs fields after each fire.
- [x] **T22.1.7 - Alert form UI** - What: An alert set from an instrument block in under three seconds. How: Inputs bound with data-model, submit via data-action createAlert, inline range validation message via data-if.
- [x] **T22.1.8 - Armed alert chips** - What: Active alerts visible on watchlist rows with quick delete. How: data-each chip list per instrument with a data-action removeAlert on each chip's x button.
- [x] **T22.1.9 - Write single unit tests** - What: CRUD and cross logic each proven once. How: One Vitest test each for createAlert, evalPriceCross, updateAlert, removeAlert and rearmAlert; vitest -t only.
- [x] **T22.1.10 - Verify live cross and merge** - What: A real cross on live data fires exactly once. How: Set an alert near the live OKX ticker, watch it fire and re-arm correctly, ESLint, merge to main.

### F22.2 - Strategy Signal Alerts

**What:** The user never misses a strategy fire: every signal becomes an alert with strategy, side and instrument.
**How:** watch() on the strategy engine's trigger('strategy:signal') events mapped to alert payloads with per-strategy toggles.

- [x] **T22.2.1 - Branch and scaffold signal alerts** - What: A dedicated branch bridging strategies to alerts. How: git checkout -b feature/f22-2-signal-alerts; create src/alerts/signalAlerts.js.
- [x] **T22.2.2 - Build mapSignalToAlert fn** - What: Raw strategy events become readable alert payloads. How: Implement mapSignalToAlert(event) producing source, severity, text, instrument and ts with side and strategy name.
- [x] **T22.2.3 - Per-strategy toggle state** - What: Noisy strategies muted individually. How: Hold an alerts.signals.enabled map in Spektrum state keyed by strategy id, defaulting to on.
- [x] **T22.2.4 - Wire signal watch** - What: Every enabled strategy fire lands on the alert bus instantly. How: watch() on trigger('strategy:signal') filtering by the enabled map and emitting trigger('alert:fired').
- [x] **T22.2.5 - Build dedupeSignal fn** - What: Identical rapid-fire signals collapse into one alert. How: Implement dedupeSignal(state, alert, debounceMs) suppressing same-key alerts inside the window.
- [x] **T22.2.6 - Build signalSeverity fn** - What: Entries, exits and strategy errors ranked correctly for styling and sound. How: Implement signalSeverity(event) mapping entry and exit to info and strategy errors to warn.
- [x] **T22.2.7 - Toggle settings UI** - What: Per-strategy alert checkboxes in the settings panel. How: data-each rows over registered strategies with data-model bound checkboxes writing the enabled map.
- [x] **T22.2.8 - Route to output pipelines** - What: Signal alerts reach toasts, sounds and the log with one wire. How: Forward alert:fired payloads into the F22.5 toast queue and the F22.9 log append path.
- [x] **T22.2.9 - Write single unit tests** - What: Mapping, dedupe and severity each covered once. How: One Vitest test each for mapSignalToAlert, dedupeSignal and signalSeverity; targeted runs.
- [x] **T22.2.10 - Verify with replay fires and merge** - What: Replayed strategy fires appear as alerts exactly as toggled. How: Replay recorded IndexedDB ticks so strategies fire, confirm alert flow and toggles, ESLint, merge.

### F22.3 - Execution Event Notifications

**What:** The user gets instant certainty on orders: fills, partials, rejects and cancels announced as they land.
**How:** watch() on phase-17 order lifecycle events mapped to severity-tagged alerts, OKX reject codes translated to plain text.

- [x] **T22.3.1 - Branch and scaffold exec alerts** - What: A separate branch for order-event notifications. How: git checkout -b feature/f22-3-exec-alerts; create src/alerts/execAlerts.js.
- [x] **T22.3.2 - Build mapOrderEvent fn** - What: Order lifecycle events become concise readable alerts. How: Implement mapOrderEvent(event) formatting fill, partial, reject and cancel with instrument, side, qty and price.
- [x] **T22.3.3 - Build execSeverity fn** - What: Fills feel good, rejects scream: correct severity per event type. How: Implement execSeverity(type) mapping fill to success, partial and cancel to info, reject to error.
- [x] **T22.3.4 - Build parseRejectReason fn** - What: OKX reject codes translated into plain trader language. How: Implement parseRejectReason(sCode, sMsg) with a lookup table of common OKX v5 error codes.
- [x] **T22.3.5 - Wire order event watch** - What: Every execution event alerts within a frame of arrival. How: watch() on the phase-17 order lifecycle channel piping through the mappers into trigger('alert:fired').
- [x] **T22.3.6 - Build coalescePartials fn** - What: A burst of partial fills reads as one clean alert. How: Implement coalescePartials(state, event, windowMs) merging partials per order id inside the window.
- [x] **T22.3.7 - Route with per-type toggles** - What: Fill, reject and cancel alerts individually switchable per channel. How: Gate routing to toast, sound and native paths by an alerts.exec.enabled map read from state.
- [x] **T22.3.8 - Exec toggle settings UI** - What: Event-type switches next to the other alert settings. How: Checkbox rows bound via data-model writing the exec enabled map in state.
- [x] **T22.3.9 - Write single unit tests** - What: Each exec fn pinned by one test. How: One Vitest test each for mapOrderEvent, execSeverity, parseRejectReason and coalescePartials; vitest -t runs.
- [x] **T22.3.10 - Verify with simulated order and merge** - What: A test order's full lifecycle narrated correctly. How: Place an order with the OKX x-simulated-trading demo flag, watch fill and cancel alerts, ESLint, merge.

### F22.4 - Feed & Spread Health Warnings

**What:** The user is warned before conditions hurt: spread spikes, latency spikes and disconnects flagged instantly.
**How:** EMA baselines over spread and WebSocket heartbeat RTT from phases 11/14 with threshold-cross alert emits.

- [x] **T22.4.1 - Branch and scaffold health alerts** - What: A branch for market and feed health warnings. How: git checkout -b feature/f22-4-health-alerts; create src/alerts/healthAlerts.js.
- [x] **T22.4.2 - Build spreadBaseline fn** - What: A per-instrument notion of normal spread. How: Implement EMA spreadBaseline(prev, spreadTicks, alpha) updated on each book-top change.
- [x] **T22.4.3 - Build spreadSpike fn** - What: Warnings when the spread blows out versus normal. How: Implement spreadSpike(spread, baseline, k, streakM) requiring k x baseline for M consecutive updates.
- [x] **T22.4.4 - Build latencySpike fn** - What: A slow feed flagged before stale prices cost money. How: Implement latencySpike(rttSamples, thresholdMs) over WebSocket ping/pong RTTs from the phase-11 pipeline.
- [x] **T22.4.5 - Wire disconnect alerts** - What: A dropped venue connection announced with the venue name in red. How: watch() on phase-11 connection-state keys emitting error alerts on open-to-closed transitions per venue.
- [x] **T22.4.6 - Build formatDowntime fn and reconnect alert** - What: Reconnects confirmed with the exact downtime duration. How: Implement formatDowntime(downMs) and emit an info alert on reconnect including the formatted gap.
- [x] **T22.4.7 - Wire warning emits** - What: Spread and latency warnings flow into the shared alert bus. How: Chain the spike fns inside watch() handlers emitting trigger('alert:fired') with warn severity.
- [x] **T22.4.8 - Threshold settings UI** - What: k, thresholdMs and streak values tunable per desk taste. How: Numeric inputs bound via data-model writing alerts.health thresholds in state.
- [x] **T22.4.9 - Write single unit tests** - What: Health math proven once per fn. How: One Vitest test each for spreadBaseline, spreadSpike, latencySpike and formatDowntime; targeted runs.
- [x] **T22.4.10 - Verify with throttled network and merge** - What: Real degradation produces the right warnings. How: Throttle the connection in Chrome DevTools, observe latency and disconnect alerts, ESLint, merge.

### F22.5 - Severity Toast System

**What:** The user gets glanceable color-coded pop-ups that stack and queue without ever blocking the trading flow.
**How:** Toast queue in Spektrum state rendered by data-each in an overlay, auto-dismiss timers scheduled via addAsync.

- [x] **T22.5.1 - Branch and scaffold toast system** - What: A branch plus overlay container for pop-ups. How: git checkout -b feature/f22-5-toasts; create src/alerts/toast.js and a toast overlay element in index.html.
- [x] **T22.5.2 - Build enqueueToast fn** - What: Alerts become queued toasts with a hard cap, never a flood. How: Implement enqueueToast(state, toast) via addValue with a maxQueue cap and oldest-drop overflow policy.
- [x] **T22.5.3 - Build dismissToast fn and timers** - What: Toasts leave by click or on schedule. How: Implement dismissToast(id) and per-toast auto-dismiss timers scheduled through addAsync.
- [x] **T22.5.4 - Render toast stack** - What: Live stacking pop-ups in the corner of the dashboard. How: data-each over the queue with severity class via :class and data-action click-to-dismiss per toast.
- [x] **T22.5.5 - Style severity looks** - What: Info green, warn orange, error red in both day and night themes. How: Design-system tokens per severity, slide-in and fade-out CSS keyframes, monospace terminal typography.
- [x] **T22.5.6 - Pause-on-hover** - What: Reading a toast stops its clock. How: pointerenter and pointerleave handlers via data-action freezing and resuming the ttl countdown state.
- [x] **T22.5.7 - Build coalesceToast fn** - What: Repeats collapse into one toast with a counter badge. How: Implement coalesceToast(state, toast, windowMs) bumping a count field instead of enqueueing duplicates.
- [x] **T22.5.8 - Wire alert bus** - What: Every alert:fired shows up as a toast automatically. How: watch() on trigger('alert:fired') calling enqueueToast with the severity mapping, gated later by DND.
- [x] **T22.5.9 - Write single unit tests** - What: Queue behavior locked with one test per fn. How: One Vitest test each for enqueueToast, dismissToast and coalesceToast; run only those tests.
- [x] **T22.5.10 - Verify burst behavior and merge** - What: Twenty rapid alerts render smoothly with no jank or overflow. How: Fire a scripted burst, check cap, coalesce and FPS in DevTools, ESLint, merge to main.

### F22.6 - WebAudio Sound Pack

**What:** The user identifies buy, sell, alert and error events by ear without looking away from the tape.
**How:** WebAudio oscillator-plus-envelope synth fns per event, AudioContext unlocked on first gesture, volumes in settings.

- [x] **T22.6.1 - Branch and scaffold sound module** - What: A branch for the audio layer with a lazy context. How: git checkout -b feature/f22-6-sounds; create src/alerts/sounds.js with a getAudioCtx() lazy factory.
- [x] **T22.6.2 - Build unlockAudio wiring** - What: Sound works after the first user gesture, per browser policy. How: A once-listener on click and keydown calling AudioContext.resume() and flagging audio.ready in state.
- [x] **T22.6.3 - Build synthBuy fn** - What: A rising two-tone blip that unmistakably means buy fill. How: Implement synthBuy(ctx, gain) with two OscillatorNodes and a short GainNode envelope.
- [x] **T22.6.4 - Build synthSell fn** - What: A falling two-tone blip for sell fills, mirror of buy. How: Implement synthSell(ctx, gain) descending the same interval with matching envelope timing.
- [x] **T22.6.5 - Build synthAlert and synthError fns** - What: A double ping for alerts and a low buzz for errors, unmissably distinct. How: Implement synthAlert with two short sine pings and synthError with a sawtooth low buzz, both enveloped.
- [x] **T22.6.6 - Build playSound dispatcher fn** - What: One call routes any event type to the right sound at the right volume. How: Implement playSound(type) mapping to synth fns with per-type and master gain from settings state.
- [x] **T22.6.7 - Wire event sounds** - What: Fills, signals, alerts and errors each audible instantly. How: watch() on alert:fired and order events calling playSound(type), gated by the F22.8 silence check.
- [x] **T22.6.8 - Volume settings UI** - What: Master and per-sound volume sliders plus test buttons. How: Range inputs bound via data-model and data-action test buttons triggering each synth once.
- [x] **T22.6.9 - Write single unit tests** - What: Dispatcher and synth parameter tables each proven once. How: One Vitest test per fn (getAudioCtx, synthBuy, synthSell, synthAlert, synthError, playSound) with a mocked AudioContext.
- [x] **T22.6.10 - Verify audio latency and merge** - What: Sounds land under 50ms after events across Chrome and Firefox. How: Measure event-to-sound delay with performance.now logs, tighten envelopes, ESLint, merge.

### F22.7 - Browser Notification Bridge

**What:** Alerts reach the user even with the tab hidden: native OS notifications with a clean toast fallback.
**How:** Notification.requestPermission on explicit opt-in, sendNotification fn gated by document.hidden, fallback route on deny.

- [x] **T22.7.1 - Branch and scaffold notification bridge** - What: A branch for native OS notifications. How: git checkout -b feature/f22-7-native-notify; create src/alerts/notify.js.
- [x] **T22.7.2 - Build permissionState fn** - What: The current Notification permission always mirrored in app state. How: Implement permissionState() reading Notification.permission into state via setValue on load and change.
- [x] **T22.7.3 - Opt-in permission flow** - What: Permission requested only on an explicit user click, never on load. How: An enable button with data-action calling Notification.requestPermission and updating state on grant or deny.
- [x] **T22.7.4 - Build sendNotification fn** - What: Clean native notifications with instrument context, no stacking spam. How: Implement sendNotification with title, body and tag using tag-based replacement per instrument.
- [x] **T22.7.5 - Build visibilityGate fn** - What: Native pings only when the tab is hidden; toasts own the foreground. How: Implement visibilityGate(docHidden, severity) deciding native versus toast from document.hidden.
- [x] **T22.7.6 - Build fallbackRoute fn** - What: Denied or unsupported browsers still see everything via toasts. How: Implement fallbackRoute(permission, alert) rerouting to enqueueToast with a fallback badge.
- [x] **T22.7.7 - Click-to-focus wiring** - What: Clicking a notification lands the user on the right instrument block. How: notification.onclick calling window.focus() and emitting a data-intent style jump to the instrument.
- [x] **T22.7.8 - Severity settings UI** - What: Native notifications switchable per severity level. How: A checkbox matrix bound via data-model writing alerts.native.enabled per severity in state.
- [x] **T22.7.9 - Write single unit tests** - What: Bridge logic proven with a mocked Notification API. How: One Vitest test each for permissionState, sendNotification, visibilityGate and fallbackRoute; vitest -t runs.
- [x] **T22.7.10 - Verify hidden-tab delivery and merge** - What: A backgrounded tab still taps the shoulder. How: Hide the tab, fire a test alert, confirm the OS notification and click-focus, ESLint, merge.

### F22.8 - Mute & Do-Not-Disturb

**What:** The user silences everything with one switch or a timed snooze while the log still records every event.
**How:** dnd and snoozeUntil keys in Spektrum state consulted by all dispatchers, header toggle, addAsync snooze expiry.

- [x] **T22.8.1 - Branch and scaffold DND module** - What: A branch for the master silence switch. How: git checkout -b feature/f22-8-dnd; create src/alerts/dnd.js with dnd and snoozeUntil state keys.
- [x] **T22.8.2 - Build isSilenced fn** - What: One truth for whether outputs may make noise. How: Implement isSilenced(dnd, snoozeUntil, nowTs) returning true on the flag or an active snooze.
- [x] **T22.8.3 - Gate all dispatchers** - What: Toasts, sounds and native pings all obey the switch; the log never does. How: Insert isSilenced checks in toast, sound and notify dispatch paths while appendLog stays ungated.
- [x] **T22.8.4 - Header toggle button** - What: Bell on/off in the header, one click to silence the desk. How: Icon button with data-action toggleDnd and an orange active state class in day and night themes.
- [x] **T22.8.5 - Snooze menu** - What: Silence for 5, 15 or 60 minutes with a live countdown. How: Menu options setting snoozeUntil via setValue plus a computed() countdown label in the header.
- [x] **T22.8.6 - Auto-expire snooze** - What: Sound comes back on schedule without user action. How: An addAsync timer clearing snoozeUntil at expiry and emitting a quiet info toast on resume.
- [x] **T22.8.7 - Critical bypass option** - What: Error-level execution alerts can pierce DND when the user wants. How: A bypassCritical flag in settings checked inside the gate for severity-error exec events.
- [x] **T22.8.8 - Persist DND state** - What: A silenced desk stays silenced across reloads. How: Map dnd, snoozeUntil and bypassCritical through spektrum/persist under stockz.alerts.dnd.
- [x] **T22.8.9 - Write single unit tests** - What: Gate logic verified once per fn. How: One Vitest test each for isSilenced, toggleDnd and the snooze setter fn; run only those tests.
- [x] **T22.8.10 - Verify full silence and merge** - What: With DND on, zero noise while the log keeps filling. How: Fire mixed alerts under DND, confirm log-only behavior and the bypass path, ESLint, merge.

### F22.9 - Alert Log Block

**What:** The user scrolls a terminal-style block of recent alerts with time, severity and source filters, nothing lost.
**How:** 500-entry ring buffer in state rendered as a dashboard grid block with data-each rows and computed filters.

- [x] **T22.9.1 - Branch and scaffold log block** - What: A branch plus dashboard block for alert history. How: git checkout -b feature/f22-9-alert-log; create src/alerts/alertLog.js and register the grid block in the shell.
- [x] **T22.9.2 - Build appendLog fn** - What: Every alert kept, memory bounded at 500 entries. How: Implement appendLog(state, alert) as a capped ring buffer via addValue with head trim.
- [x] **T22.9.3 - Wire pre-DND tap** - What: Muted alerts still make history. How: watch() on trigger('alert:fired') calling appendLog before any isSilenced gating runs.
- [x] **T22.9.4 - Build formatTs fn and row render** - What: Rows show HH:MM:SS.mmm, severity dot, source and text. How: Implement formatTs(ts) and a data-each row template with {{ts}}, {{severity}}, {{source}} and {{text}} bindings.
- [x] **T22.9.5 - Build filteredLog computed** - What: One-tap filters by severity and source narrow the view instantly. How: A filter chip toggle set in state feeding a filteredLog computed() consumed by the data-each.
- [x] **T22.9.6 - Row jump wiring** - What: Clicking a log row jumps to the instrument it came from. How: data-intent on rows carrying the instrument id, handled by the dashboard navigation intent handler.
- [x] **T22.9.7 - Unread badge and clear** - What: A count of unseen alerts on the block plus one-click clear. How: computed() unread count since last block focus and a clear-log data-action resetting the buffer.
- [x] **T22.9.8 - Style terminal rows** - What: The log reads like a proper terminal tail in both themes. How: Monospace rows, green/orange severity accents, newest-first pinned scroll with pause on hover.
- [x] **T22.9.9 - Write single unit tests** - What: Buffer and formatting proven once per fn. How: One Vitest test each for appendLog, formatTs and the filteredLog fn; targeted vitest -t runs.
- [x] **T22.9.10 - Verify burst cap and merge** - What: A 1000-alert burst leaves exactly 500 clean rows. How: Script a burst, assert cap and ordering, check scroll performance, ESLint, merge to main.

### F22.10 - Persistent Alert Definitions

**What:** The user's alerts and notification preferences survive reloads exactly as left, with export and import as JSON.
**How:** spektrum/persist maps definition and prefs slices to localStorage with schema versioning and a migration fn.

- [x] **T22.10.1 - Branch and scaffold persistence** - What: A branch dedicated to alert durability. How: git checkout -b feature/f22-10-alert-persist; create src/alerts/alertPersist.js declaring persisted slices.
- [x] **T22.10.2 - Persist alert definitions** - What: Price and signal alert definitions survive any reload. How: Map the definitions slice through spektrum/persist to localStorage key stockz.alerts.defs.
- [x] **T22.10.3 - Persist notification prefs** - What: Toggles, volumes and thresholds come back exactly as set. How: Map signal, exec, health, native and sound settings via spektrum/persist under stockz.alerts.prefs.
- [x] **T22.10.4 - Build migrateAlerts fn** - What: Old stored shapes upgrade cleanly instead of breaking. How: Implement migrateAlerts(stored, fromVersion) with a schemaVersion field and a stepwise upgrade map.
- [x] **T22.10.5 - Build sanitizeOnLoad fn** - What: Corrupt or stale entries never poison a session. How: Implement sanitizeOnLoad(defs) dropping malformed entries, clamping prices and stripping transient fired flags.
- [x] **T22.10.6 - Order rehydration after feeds** - What: No false fires at boot from stale prices. How: Sequence run() startup so alert arming happens only after phase-11 feeds report connected.
- [x] **T22.10.7 - Build exportAlerts and importAlerts fns** - What: Whole alert sets shared between machines as a JSON file. How: Implement exportAlerts as a Blob download and importAlerts via file input, validated through sanitizeOnLoad.
- [x] **T22.10.8 - Build quotaGuard fn** - What: localStorage limits never silently eat alerts. How: Implement quotaGuard(serialized, maxBytes) raising an error toast when serialized size nears the cap.
- [x] **T22.10.9 - Write single unit tests** - What: Durability fns each locked by one test. How: One Vitest test each for migrateAlerts, sanitizeOnLoad, exportAlerts, importAlerts and quotaGuard; targeted runs.
- [x] **T22.10.10 - Verify reload cycle and merge** - What: A full reload restores alerts live against real feeds. How: Reload with feeds connected, confirm definitions and prefs restored with no boot fires, full ESLint, merge.

---

## Phase 23 - Auto-Trade Bot Runner

**What:** Strategies pull the trigger themselves: high trade counts without fatigue.
**How:** Vanilla ES module bot loop mapping armed phase-20 strategy signals to phase-17 execution-engine orders through throttle, cooldown and cap gates on Spektrum state.

### F23.1 - Bot loop core

**What:** An always-on loop that turns armed strategy signals into orders with zero clicks per trade.
**How:** ES module src/bot/runner.js consuming phase-20 signal events via Spektrum watch and dispatching passing signals to the phase-17 execution engine.

- [x] **T23.1.1 - Branch bot loop core** - What: An isolated line of work for the bot loop. How: git checkout -b feature/f23.1-bot-loop-core from an up-to-date main.
- [x] **T23.1.2 - Scaffold runner module** - What: One home for all bot loop logic. How: Create src/bot/runner.js exporting createBotRunner(state) with start/stop stubs, registered via Spektrum addSystem.
- [x] **T23.1.3 - Signal intake queue** - What: No signal lost during a burst. How: Implement enqueueSignal(sig) writing into a 256-slot ring buffer array with drop-oldest overflow policy.
- [x] **T23.1.4 - Subscribe to strategy signals** - What: The loop hears every strategy fire the instant it happens. How: Spektrum watch('strategies.signals') appends each emitted signal object into the intake queue.
- [x] **T23.1.5 - Drain tick** - What: Signals become decisions within 50ms. How: Implement drainTick() on a 50ms setInterval popping queued signals FIFO into the decision pipeline.
- [x] **T23.1.6 - Decision pipeline skeleton** - What: One ordered gate chain every signal must pass. How: Implement decide(sig) running armGate, optInGate, throttleGate, cooldownGate and capGate stubs, each returning {pass, reason}.
- [x] **T23.1.7 - Order dispatch call** - What: Passing signals become real venue orders. How: Wire decide() pass results into the phase-17 execution engine submitOrder() with an origin:'bot' tag on each order.
- [x] **T23.1.8 - Decision record store** - What: Every bot decision is captured for later display. How: Implement pushDecision(entry) appending {ts, strategy, instrument, action, reason} to a 200-entry ring at bot.decisions, called from decide().
- [x] **T23.1.9 - Single unit tests for loop fns** - What: Each new function proven exactly once. How: One Vitest test per fn (enqueueSignal, drainTick, decide, pushDecision) in runner.test.js, run via npx vitest run -t fnName.
- [x] **T23.1.10 - Merge loop core** - What: The bot loop foundation lands on main. How: Run the targeted Vitest tests plus ESLint, merge feature/f23.1-bot-loop-core into main, delete the branch.

### F23.2 - Master arm switch

**What:** One master switch arms or disarms all auto-trading instantly, fully separate from manual order arming.
**How:** Spektrum boolean bot.masterArmed flipped by a data-action, checked first in the decision pipeline, excluded from persistence so sessions boot disarmed.

- [x] **T23.2.1 - Branch master arm** - What: Isolated work on the master switch. How: git checkout -b feature/f23.2-master-arm from an up-to-date main.
- [x] **T23.2.2 - Arm gate implementation** - What: A disarmed bot never places a single order. How: setValue('bot.masterArmed', false) as default and implement armGate rejecting signals with reason 'master-disarmed'.
- [x] **T23.2.3 - Toggle action** - What: One click flips auto-trading on or off. How: defineFn toggleMasterArm flipping the flag and firing trigger('bot.armChanged'), bound with data-action on the switch element.
- [x] **T23.2.4 - Flip-switch UI** - What: An unmistakable arm control in the bot block. How: Build a flip-switch showing green ARMED / orange DISARMED using phase-3 money-hacker tokens and data-if labels.
- [x] **T23.2.5 - Separation from manual arm** - What: Manual trading is never affected by bot state. How: Keep the phase-15 manual flow on its own manual.armed key and add a module comment forbidding cross-reads between the two flags.
- [x] **T23.2.6 - Safe boot default** - What: The bot never wakes up armed after a reload. How: Exclude bot.masterArmed from the spektrum/persist mapping so every session starts disarmed regardless of last state.
- [x] **T23.2.7 - Arm hotkey** - What: Arm or disarm without touching the mouse. How: Register Shift+A in the phase-16 hotkey registry calling toggleMasterArm.
- [x] **T23.2.8 - Feed entries on arm change** - What: Every arm flip is on the record with a timestamp. How: Push an ARMED or DISARMED entry via pushDecision from a watch on bot.armChanged.
- [x] **T23.2.9 - Single unit tests for arm fns** - What: Switch logic proven once per function. How: One Vitest test each for toggleMasterArm and armGate, run via npx vitest run -t targeted at each fn.
- [x] **T23.2.10 - Merge master arm** - What: The master switch lands on main. How: Green targeted Vitest runs plus ESLint, then merge feature/f23.2-master-arm into main and delete the branch.

### F23.3 - Per-strategy auto opt-in

**What:** Each strategy is opted into auto mode individually, so only trusted logic trades on its own.
**How:** An autoEnabled flag per strategy config in Spektrum state, edited from the strategy list and enforced by optInGate in the pipeline.

- [x] **T23.3.1 - Branch strategy opt-in** - What: Isolated work on per-strategy auto mode. How: git checkout -b feature/f23.3-strategy-opt-in from an up-to-date main.
- [x] **T23.3.2 - Extend strategy schema** - What: Every strategy carries its own auto permission. How: Add autoEnabled:false to the phase-20 strategy config objects and their default factory.
- [x] **T23.3.3 - Opt-in gate fn** - What: Signals from non-opted strategies are silently benched. How: Implement optInGate(sig, state) reading strategies.byId[sig.strategyId].autoEnabled and rejecting with reason 'not-opted-in'.
- [x] **T23.3.4 - Opt-in toggle UI** - What: One checkbox per strategy row grants auto mode. How: Add a data-each strategy list checkbox bound with data-model to autoEnabled.
- [x] **T23.3.5 - AUTO badge** - What: Opted-in strategies are visible at a glance. How: Render a small green AUTO badge next to opted strategies with data-if and phase-3 badge styles.
- [x] **T23.3.6 - Persist opt-ins** - What: Auto permissions survive reloads. How: Map the strategies autoEnabled flags into localStorage via spektrum/persist.
- [x] **T23.3.7 - All-off action** - What: One click revokes auto mode everywhere. How: defineFn disableAllAuto clearing every autoEnabled flag, bound to a data-action button above the strategy list.
- [x] **T23.3.8 - Gate order verification** - What: Confidence the opt-in check runs right after the master gate. How: Trace a synthetic signal through decide() with spektrum/devtools and confirm gate ordering and reasons.
- [x] **T23.3.9 - Single unit tests for opt-in fns** - What: Opt-in logic proven once per function. How: One Vitest test each for optInGate and disableAllAuto with targeted npx vitest run -t invocations.
- [x] **T23.3.10 - Merge strategy opt-in** - What: Per-strategy auto mode lands on main. How: Green targeted tests plus ESLint, merge feature/f23.3-strategy-opt-in into main, delete the branch.

### F23.4 - Signal-to-order mapper

**What:** Signals become correctly sized, correctly routed orders without any manual math.
**How:** Pure fn mapSignalToOrder(sig, rules) in src/bot/mapper.js producing venue-ready order objects using phase-15 size rules and the phase-12 instrument registry.

- [x] **T23.4.1 - Branch signal mapper** - What: Isolated work on the mapper. How: git checkout -b feature/f23.4-signal-mapper from an up-to-date main.
- [x] **T23.4.2 - Mapper module** - What: A single pure function owns signal-to-order translation. How: Create src/bot/mapper.js exporting mapSignalToOrder(sig, rules) returning {instrument, side, type, size, price}.
- [x] **T23.4.3 - Size rules** - What: Order size follows the trader's chosen rule automatically. How: Apply per-strategy fixed-size or pct-of-equity sizing from settings state inside the mapper.
- [x] **T23.4.4 - Side and type mapping** - What: Signal direction becomes the right order verb. How: Map sig.direction to buy/sell and pick market vs limit (with offset ticks) from the strategy config.
- [x] **T23.4.5 - Instrument routing** - What: Orders reach the right venue symbol every time. How: Resolve sig.instrument to an OKX v5 instId or EToro symbol through the phase-12 instrument registry.
- [x] **T23.4.6 - Lot and tick snapping** - What: No order rejected for bad increments. How: Implement snapToStep(value, step) and apply venue lot size and tick size steps to size and price.
- [x] **T23.4.7 - Invalid signal rejection** - What: Malformed signals never reach a venue. How: Return {error, reason} for missing or NaN fields and log the reason via pushDecision.
- [x] **T23.4.8 - Wire mapper into pipeline** - What: Every passing signal is mapped before dispatch. How: Call mapSignalToOrder in the decide() pass path ahead of the submitOrder dispatch step.
- [x] **T23.4.9 - Single unit tests for mapper fns** - What: Mapping proven once per function. How: One Vitest test each for mapSignalToOrder and snapToStep in mapper.test.js with targeted npx vitest run -t.
- [x] **T23.4.10 - Merge signal mapper** - What: The mapper lands on main. How: Green targeted tests plus ESLint, merge feature/f23.4-signal-mapper into main, delete the branch.

### F23.5 - Orders-per-minute throttle

**What:** A hard ceiling on order rate keeps the bot fast but never runaway.
**How:** Sliding-window timestamp ring in src/bot/throttle.js checked by throttleGate against a settings limit, pruned lazily per call.

- [x] **T23.5.1 - Branch order throttle** - What: Isolated work on rate limiting. How: git checkout -b feature/f23.5-order-throttle from an up-to-date main.
- [x] **T23.5.2 - Throttle module** - What: A reusable rate limiter for the bot. How: Create src/bot/throttle.js exporting createThrottle(limitPerMin) whose allow(now) uses a timestamp ring plus head pointer, O(1) amortized.
- [x] **T23.5.3 - Throttle setting** - What: The trader sets their own orders-per-minute ceiling. How: Add bot.maxOrdersPerMin (default 30) to settings state with a numeric field in the phase-7 settings panel.
- [x] **T23.5.4 - Gate wiring** - What: Over-limit signals are rejected instantly with a reason. How: Implement throttleGate calling throttle.allow(Date.now()) and pushing reason 'throttled' via pushDecision on reject.
- [x] **T23.5.5 - Count intended orders** - What: Dry-run stats predict live stats exactly. How: Record a timestamp for every order that passes gates, whether dispatched live or logged dry.
- [x] **T23.5.6 - Lazy window pruning** - What: No timers, no background cost. How: Prune expired timestamps inside allow(now) by advancing the head pointer, keeping the throttle allocation-free.
- [x] **T23.5.7 - Live rate meter** - What: The trader sees n/limit usage at all times. How: Bind a computed bot.ordersLastMin in the bot block showing {{bot.ordersLastMin}}/limit, turning orange above 80%.
- [x] **T23.5.8 - Reset on disarm** - What: A re-armed bot starts with a clean window. How: Clear the timestamp ring from a watch on bot.armChanged when masterArmed goes false.
- [x] **T23.5.9 - Single unit tests for throttle fns** - What: Rate logic proven once per function. How: One Vitest test each for createThrottle and allow using vi.useFakeTimers, run with npx vitest run -t.
- [x] **T23.5.10 - Merge order throttle** - What: The throttle lands on main. How: Green targeted tests plus ESLint, merge feature/f23.5-order-throttle into main, delete the branch.

### F23.6 - Losing-streak cooldown

**What:** The bot benches itself after a losing streak so tilt losses stop compounding.
**How:** Consecutive-loss counter fed by phase-18 realized fills; hitting the streak limit starts a timed cooldown enforced by cooldownGate.

- [x] **T23.6.1 - Branch loss cooldown** - What: Isolated work on the cooldown. How: git checkout -b feature/f23.6-loss-cooldown from an up-to-date main.
- [x] **T23.6.2 - Streak counter** - What: The bot knows exactly how many losers in a row. How: Implement onFillClosed(pnl) incrementing bot.lossStreak on negative realized PnL and resetting on a win, fed by phase-18 fill events.
- [x] **T23.6.3 - Cooldown starter** - What: The bench happens automatically at the limit. How: Implement startCooldown(untilTs) setting bot.cooldownUntil when the streak reaches bot.cooldownAfterLosses.
- [x] **T23.6.4 - Cooldown gate** - What: No auto orders while benched. How: Implement cooldownGate rejecting signals while Date.now() < bot.cooldownUntil with reason 'cooldown'.
- [x] **T23.6.5 - Cooldown settings** - What: Streak length and bench time are the trader's call. How: Add bot.cooldownAfterLosses (default 3) and bot.cooldownMinutes (default 10) numeric fields to the phase-7 settings panel.
- [x] **T23.6.6 - Countdown UI** - What: The trader sees exactly when the bot returns. How: Bind a computed mm:ss remaining value in the bot block, styled orange with a subtle pulse from phase-3 tokens.
- [x] **T23.6.7 - Manual clear action** - What: One click ends the bench early, no dialog. How: defineFn clearCooldown zeroing bot.cooldownUntil, bound with data-action to a small RESUME button.
- [x] **T23.6.8 - Cooldown feed entries** - What: Bench start and end are on the record. How: Push cooldown-start and cooldown-end entries with streak details via pushDecision.
- [x] **T23.6.9 - Single unit tests for cooldown fns** - What: Cooldown logic proven once per function. How: One Vitest test each for onFillClosed, startCooldown, cooldownGate and clearCooldown with targeted -t runs.
- [x] **T23.6.10 - Merge loss cooldown** - What: The cooldown lands on main. How: Green targeted tests plus ESLint, merge feature/f23.6-loss-cooldown into main, delete the branch.

### F23.7 - Per-instrument position cap

**What:** The bot can never pyramid one instrument past a set exposure cap.
**How:** capGate compares current open size plus pending bot orders for the signal's instrument against a settings cap in one comparison.

- [x] **T23.7.1 - Branch position cap** - What: Isolated work on exposure caps. How: git checkout -b feature/f23.7-position-cap from an up-to-date main.
- [x] **T23.7.2 - Cap settings** - What: A default cap plus per-instrument exceptions. How: Add bot.maxPositionPerInstrument and a bot.capOverrides map to settings state with phase-7 persistence.
- [x] **T23.7.3 - Open size lookup** - What: Exposure reads cost nothing. How: Implement getOpenSize(instId) as an O(1) read from the phase-18 positions.byInstrument index.
- [x] **T23.7.4 - Pending exposure fn** - What: In-flight bot orders count against the cap too. How: Implement exposureFor(instId) summing open size plus unfilled origin:'bot' working orders from phase-17 state.
- [x] **T23.7.5 - Cap gate fn** - What: Over-cap signals are rejected in one comparison. How: Implement capGate rejecting when exposureFor(instId) + mapped size exceeds the resolved cap, reason 'position-cap'.
- [x] **T23.7.6 - Overrides editor** - What: Different caps for different instruments in seconds. How: Build a small data-each table of instrument/cap rows with data-model editing inside the settings panel.
- [x] **T23.7.7 - Cap feed entries** - What: Blocked signals show the exact numbers. How: Push a decision entry containing current exposure vs cap values whenever capGate rejects.
- [x] **T23.7.8 - Capped list display** - What: The trader sees which instruments are maxed out. How: Show a computed list of at-cap instruments in the bot block behind data-if.
- [x] **T23.7.9 - Single unit tests for cap fns** - What: Cap logic proven once per function. How: One Vitest test each for getOpenSize, exposureFor and capGate with targeted npx vitest run -t.
- [x] **T23.7.10 - Merge position cap** - What: The cap lands on main. How: Green targeted tests plus ESLint, merge feature/f23.7-position-cap into main, delete the branch.

### F23.8 - Bot status block with live decision feed

**What:** A live scrolling feed of every bot decision with its reason - trust through transparency.
**How:** A phase-4 grid block rendering the bot.decisions ring via Spektrum data-each, with color coding, filters and a heartbeat indicator.

- [x] **T23.8.1 - Branch bot block** - What: Isolated work on the status block. How: git checkout -b feature/f23.8-bot-block from an up-to-date main.
- [x] **T23.8.2 - Register bot block** - What: The bot gets its own uniform dashboard tile. How: Register a 'bot' block in the phase-4 grid registry with standard block chrome and title.
- [x] **T23.8.3 - Feed markup** - What: Decisions render as a clean scrolling list. How: Build data-each rows over bot.decisions showing {{ts}}, {{strategy}}, {{instrument}} and {{reason}}, with data-cloak to avoid flash.
- [x] **T23.8.4 - Decision color coding** - What: Outcome readable from color alone. How: Bind :class on entry.action mapping dispatched to green, blocked to orange and error to red via phase-3 tokens.
- [x] **T23.8.5 - Auto-scroll with hover pause** - What: Newest decisions always visible, reading never interrupted. How: Keep scrollTop pinned to newest and suspend pinning on pointerenter, resuming on pointerleave.
- [x] **T23.8.6 - Filter chips** - What: One tap isolates dispatched or blocked decisions. How: Add all/dispatched/blocked chips driving a defineFn feedFilter computed over the ring.
- [x] **T23.8.7 - Render window cap** - What: The feed stays snappy at full speed. How: Render only the latest 50 filtered entries via a computed slice to keep DOM node count flat.
- [x] **T23.8.8 - Heartbeat indicator** - What: Proof the loop is alive at a glance. How: Bind a pulsing dot and tick counter to bot.lastTickAt and bot.ticks set by drainTick.
- [x] **T23.8.9 - Single unit test for filter fn** - What: The filter proven once. How: One Vitest test for feedFilter covering each chip value, run via npx vitest run -t feedFilter.
- [x] **T23.8.10 - Merge bot block** - What: The status block lands on main. How: Green targeted test plus ESLint, merge feature/f23.8-bot-block into main, delete the branch.

### F23.9 - Dry-run mode

**What:** Full bot behavior with zero live orders - see exactly what it would do before letting it loose.
**How:** A bot.dryRun flag forks dispatch into logDryOrder() while every gate, throttle and counter behaves identically, entries marked DRY.

- [x] **T23.9.1 - Branch dry-run** - What: Isolated work on dry-run mode. How: git checkout -b feature/f23.9-dry-run from an up-to-date main.
- [x] **T23.9.2 - Dry-run flag and toggle** - What: One switch between rehearsal and live. How: Add bot.dryRun defaulting true, a data-action toggle in the bot block, persisted via spektrum/persist.
- [x] **T23.9.3 - Dispatch fork** - What: Dry mode never touches a venue. How: Implement dispatchOrDry(order) routing to logDryOrder when bot.dryRun else to the phase-17 submitOrder call.
- [x] **T23.9.4 - Dry order logger** - What: Every intended order is fully recorded. How: Implement logDryOrder(order) pushing a DRY feed entry with the full mapped order JSON and appending it to an IndexedDB dryRuns store.
- [x] **T23.9.5 - DRY banner** - What: No mistaking rehearsal for live. How: Render a striped orange DRY RUN banner across the bot block behind data-if on bot.dryRun.
- [x] **T23.9.6 - Identical accounting check** - What: Dry numbers genuinely predict live numbers. How: Verify throttle timestamps, caps and session counters fire for dry orders by replaying a recorded signal burst through the loop.
- [x] **T23.9.7 - Copy dry orders action** - What: Intended orders reviewable anywhere. How: defineFn copyDryOrders serializing the dryRuns entries to JSON onto navigator.clipboard via a data-action button.
- [x] **T23.9.8 - Live-switch feed entry** - What: Going live is an explicit, logged moment. How: Push a red LIVE MODE entry via pushDecision whenever bot.dryRun flips to false.
- [x] **T23.9.9 - Single unit tests for dry-run fns** - What: Fork and logger proven once each. How: One Vitest test each for dispatchOrDry and logDryOrder using fake-indexeddb, targeted npx vitest run -t.
- [x] **T23.9.10 - Merge dry-run** - What: Dry-run mode lands on main. How: Green targeted tests plus ESLint, merge feature/f23.9-dry-run into main, delete the branch.

### F23.10 - Session report and kill-switch hard stop

**What:** A per-session bot scoreboard plus an instant hard stop the moment the phase-24 breaker trips.
**How:** Spektrum counters and computed PnL aggregated per session, with watch('breaker.tripped') invoking a synchronous hardStop of the loop.

- [x] **T23.10.1 - Branch session report** - What: Isolated work on reporting and the hard stop. How: git checkout -b feature/f23.10-session-report from an up-to-date main.
- [x] **T23.10.2 - Session counters** - What: Signals, orders, fills, wins and losses all counted live. How: addValue bot.session counters at each pipeline point: intake, dispatch and phase-18 fill events.
- [x] **T23.10.3 - Bot session PnL** - What: The bot's own profit line, separate from manual trades. How: Add a computed bot.session.pnl summing realized PnL of fills whose orders carry the origin:'bot' tag.
- [x] **T23.10.4 - Funnel report strip** - What: One glance shows signals to orders to fills conversion. How: Render a summary strip in the bot block binding {{bot.session.signalsSeen}}, {{bot.session.ordersSent}} and {{bot.session.fills}}.
- [x] **T23.10.5 - Report export** - What: The session is portable evidence. How: Implement downloadSessionReport() building a JSON Blob of counters, PnL and the decision ring served via URL.createObjectURL.
- [x] **T23.10.6 - Session reset** - What: A fresh scoreboard each day or on demand. How: Implement resetSession() clearing bot.session, wired to a data-action button and a local-midnight rollover check in drainTick.
- [x] **T23.10.7 - Breaker subscription** - What: A tripped breaker stops the bot with no human in the loop. How: Spektrum watch('breaker.tripped') invoking hardStop() the moment phase-24 publishes a trip.
- [x] **T23.10.8 - Hard stop semantics** - What: Not one queued signal escapes after a trip. How: Implement hardStop() clearing the setInterval, synchronously draining the queue with reason 'killed' and setting bot.masterArmed false.
- [x] **T23.10.9 - Single unit tests for report fns** - What: Stop and report logic proven once per function. How: One Vitest test each for hardStop, resetSession and downloadSessionReport with targeted npx vitest run -t.
- [x] **T23.10.10 - Merge session report** - What: Reporting and the hard stop land on main. How: Green targeted tests plus ESLint, merge feature/f23.10-session-report into main, delete the branch.

---

## Phase 24 - Lean Circuit Breakers

**What:** One fast safety net that cuts losses instantly without ever slowing the flow.
**How:** Minimal O(1) breaker checks inline in the phase-17 order path - daily max loss, max position, kill switch - where a trip cancels, flattens and disarms via pure ES module fns on Spektrum state.

### F24.1 - Breaker core with O(1) inline checks

**What:** Safety that costs under a millisecond per order - never a dialog, never a wait.
**How:** src/breakers/core.js checkBreakers(ctx) running plain number comparisons against a precomputed threshold cache, returning a trip code or 0.

- [x] **T24.1.1 - Branch breaker core** - What: An isolated line of work for the breaker engine. How: git checkout -b feature/f24.1-breaker-core from an up-to-date main.
- [x] **T24.1.2 - Core check fn** - What: One tiny function guards every order. How: Create src/breakers/core.js exporting pure checkBreakers(ctx) doing only primitive comparisons, no state reads, no allocation.
- [x] **T24.1.3 - Threshold cache** - What: Zero settings lookups on the hot path. How: Implement refreshThresholds() copying breaker settings into a flat plain object, re-run from a Spektrum watch on settings changes.
- [x] **T24.1.4 - Order-path hook** - What: Every order passes the net exactly once. How: Insert a single checkBreakers call in the phase-17 execution engine submit path before any venue send.
- [x] **T24.1.5 - Trip code constants** - What: Unambiguous machine-readable trip reasons. How: Export a numeric enum (0 none, 1 daily-loss, 2 position-block, 3 loss-streak, 4 kill) as frozen constants.
- [x] **T24.1.6 - Trip publisher latch** - What: One trip fires exactly one reaction chain. How: Implement tripBreaker(code, values) setting breaker.tripped and firing trigger('breaker.tripped', code) behind an idempotent latch.
- [x] **T24.1.7 - No-dialog contract** - What: A rejection is a state change, never a popup. How: Return a rejection object from the order path and document the no-confirm no-modal rule in the module header comment.
- [x] **T24.1.8 - Perf benchmark** - What: Proof the check stays under budget. How: Add a Vitest bench running checkBreakers 1e6 times asserting under 1ms per 1000 calls on the dev machine.
- [x] **T24.1.9 - Single unit tests for core fns** - What: Core logic proven once per function. How: One Vitest test each for checkBreakers, refreshThresholds and tripBreaker via targeted npx vitest run -t.
- [x] **T24.1.10 - Merge breaker core** - What: The breaker engine lands on main. How: Green targeted tests plus ESLint, merge feature/f24.1-breaker-core into main, delete the branch.

### F24.2 - Daily max-loss breaker

**What:** Trading halts the instant the day's realized plus unrealized loss hits the limit.
**How:** A single breaker.dayPnl number maintained from phase-18 events so the hot-path check is one comparison against a pre-negated threshold.

- [x] **T24.2.1 - Branch daily loss** - What: Isolated work on the daily-loss breaker. How: git checkout -b feature/f24.2-daily-loss from an up-to-date main.
- [x] **T24.2.2 - Day PnL accumulator** - What: One number always equals today's total PnL. How: Implement updateDayPnl() combining phase-18 realized totals and mark-to-market unrealized into breaker.dayPnl.
- [x] **T24.2.3 - Unrealized cadence** - What: Accuracy without per-tick cost. How: Recompute the unrealized component on the phase-11 tick batch flush, not on every raw tick.
- [x] **T24.2.4 - Pre-negated threshold** - What: The hot path stays a single <=. How: Store -maxDailyLoss in the threshold cache at refreshThresholds so no negation happens per order.
- [x] **T24.2.5 - Check wiring** - What: The limit binds on every single order. How: Implement dailyLossCheck inside checkBreakers comparing breaker.dayPnl against the cached negative limit, code 1.
- [x] **T24.2.6 - Day rollover** - What: Yesterday never blocks today. How: Implement resetDay() archiving the prior day PnL into IndexedDB and zeroing the accumulator at local midnight or manual reset.
- [x] **T24.2.7 - Near-limit percentage** - What: Warning light data before the trip. How: Add a computed breaker.dailyPct of limit consumed, feeding the F24.7 LEDs.
- [x] **T24.2.8 - Trip wiring with snapshot** - What: The trip records exactly what tripped it. How: Call tripBreaker(1, {dayPnl}) once via the latch the moment dailyLossCheck fires.
- [x] **T24.2.9 - Single unit tests for daily fns** - What: Daily-loss logic proven once per function. How: One Vitest test each for updateDayPnl, dailyLossCheck and resetDay via targeted npx vitest run -t.
- [x] **T24.2.10 - Merge daily loss** - What: The daily-loss breaker lands on main. How: Green targeted tests plus ESLint, merge feature/f24.2-daily-loss into main, delete the branch.

### F24.3 - Per-instrument max position breaker

**What:** No single instrument can ever grow past the trader's max size, even under rapid fire.
**How:** positionCheck compares open size plus incoming order size against a cached per-instrument cap in one comparison, blocking the order without a full trip.

- [x] **T24.3.1 - Branch max position** - What: Isolated work on the position breaker. How: git checkout -b feature/f24.3-max-position from an up-to-date main.
- [x] **T24.3.2 - Size accessor** - What: Exposure lookups cost nothing. How: Implement getPosSize(instId) as an O(1) wrapper over the phase-18 positions.byInstrument index.
- [x] **T24.3.3 - Position check fn** - What: Oversized orders die before the venue sees them. How: Implement positionCheck comparing getPosSize(instId) + order.size against the cached cap, code 2.
- [x] **T24.3.4 - Override flattening** - What: Custom caps per instrument at hot-path speed. How: Flatten the settings capOverrides map into the threshold cache at refreshThresholds for direct key access.
- [x] **T24.3.5 - Reduce-only exemption** - What: Exits always go through, whatever the cap. How: Pass any order whose sign reduces current exposure via a single sign comparison before the cap check.
- [x] **T24.3.6 - Block-not-trip semantics** - What: One fat-fingered size never flattens the whole book. How: Wire code 2 as a soft per-order rejection in the order path that does not fire the tripBreaker latch.
- [x] **T24.3.7 - Ticket flash feedback** - What: The trader sees the block without a dialog. How: Set breaker.lastBlock so the phase-15 order ticket flashes an orange border via :class for 600ms.
- [x] **T24.3.8 - Blocked counter** - What: A running count of saves for the session. How: addValue breaker.session.blocked on each rejection, shown in the phase-19 HUD stats row.
- [x] **T24.3.9 - Single unit tests for position fns** - What: Position logic proven once per function. How: One Vitest test each for getPosSize and positionCheck via targeted npx vitest run -t.
- [x] **T24.3.10 - Merge max position** - What: The position breaker lands on main. How: Green targeted tests plus ESLint, merge feature/f24.3-max-position into main, delete the branch.

### F24.4 - Consecutive-loss auto-pause

**What:** A string of losers auto-pauses the whole desk before the hole gets deeper.
**How:** A realized-loss streak counter checked in one comparison; hitting the limit pauses new entries while exits stay open.

- [x] **T24.4.1 - Branch loss streak** - What: Isolated work on the streak pause. How: git checkout -b feature/f24.4-loss-streak from an up-to-date main.
- [x] **T24.4.2 - Realized streak tracker** - What: One authoritative count of consecutive losers. How: Implement onRealizedFill(pnl) in the breakers module incrementing breaker.lossStreak on losses and resetting on wins from phase-18 fills.
- [x] **T24.4.3 - Streak check fn** - What: The limit binds in a single comparison. How: Implement streakCheck comparing breaker.lossStreak against the cached maxConsecLosses, code 3.
- [x] **T24.4.4 - Pause action** - What: Entries stop, exits stay open. How: Implement pauseTrading() setting breaker.paused so new entry orders reject with reason 'paused' while reduce-only orders pass.
- [x] **T24.4.5 - Check wiring** - What: The streak guard sits inline with the others. How: Add streakCheck to checkBreakers routing code 3 to pauseTrading via the tripBreaker latch.
- [x] **T24.4.6 - Pause stamp UI** - What: The pause is impossible to miss. How: Render a PAUSED stamp with streak count in the phase-19 HUD block behind data-if on breaker.paused.
- [x] **T24.4.7 - Timed resume** - What: The desk reopens automatically after the breather. How: Implement clearPause() invoked when a pauseMinutes timer elapses or via the F24.8 re-arm flow.
- [x] **T24.4.8 - Streak setting default** - What: The streak limit is the trader's number. How: Add maxConsecLosses (default 5, 0 disables) to the breaker settings schema consumed by refreshThresholds.
- [x] **T24.4.9 - Single unit tests for streak fns** - What: Streak logic proven once per function. How: One Vitest test each for onRealizedFill, streakCheck, pauseTrading and clearPause via targeted npx vitest run -t.
- [x] **T24.4.10 - Merge loss streak** - What: The auto-pause lands on main. How: Green targeted tests plus ESLint, merge feature/f24.4-loss-streak into main, delete the branch.

### F24.5 - Kill switch

**What:** One button or key nukes all activity instantly - the fastest exit in the room.
**How:** A header button plus a phase-16 hotkey calling killSwitch(), which fires the trip latch synchronously with zero confirmation steps.

- [x] **T24.5.1 - Branch kill switch** - What: Isolated work on the kill switch. How: git checkout -b feature/f24.5-kill-switch from an up-to-date main.
- [x] **T24.5.2 - Kill fn** - What: One synchronous call ends everything. How: Implement killSwitch() invoking tripBreaker(4, {source}) immediately, idempotent behind the existing latch.
- [x] **T24.5.3 - Header kill button** - What: The escape hatch is always one glance away. How: Add a permanent KILL button to the phase-5 header with a minimum 44px hit area, bound via data-action to killSwitch.
- [x] **T24.5.4 - Kill hotkey** - What: Zero mouse travel in an emergency. How: Register Ctrl+Shift+K in the phase-16 registry using a capture-phase keydown listener so it fires even with an input focused.
- [x] **T24.5.5 - Instant latch behavior** - What: One press, no confirm, visibly done. How: Single activation trips immediately and swaps the button into a KILLED state via data-if - no dialogs anywhere.
- [x] **T24.5.6 - Alarm styling** - What: The button reads as the emergency control it is. How: Style with a dedicated high-contrast alarm treatment from phase-3 tokens, distinct in both day and night themes.
- [x] **T24.5.7 - Bot stop verification** - What: Certainty the phase-23 loop dies on kill. How: Fire killSwitch in the dev build and assert bot.masterArmed is false and bot ticks stop, using spektrum/inspect on live state.
- [x] **T24.5.8 - Press-to-cancel latency** - What: Proof of how fast the kill really is. How: Record performance.now() from activation to the first cancel dispatch and store the delta on breaker.lastKillLatencyMs.
- [x] **T24.5.9 - Single unit test for kill fn** - What: The kill path proven once. How: One Vitest test for killSwitch asserting latch idempotency, run via npx vitest run -t killSwitch.
- [x] **T24.5.10 - Merge kill switch** - What: The kill switch lands on main. How: Green targeted test plus ESLint, merge feature/f24.5-kill-switch into main, delete the branch.

### F24.6 - Trip action: cancel, flatten, disarm

**What:** One trip wipes the slate: all orders cancelled, all positions flat, all bots off.
**How:** executeTripAction() disarms bots then fires venue cancel-all and reduce-only market flattens over OKX v5 and EToro REST in parallel.

- [x] **T24.6.1 - Branch trip action** - What: Isolated work on the trip reaction. How: git checkout -b feature/f24.6-trip-action from an up-to-date main.
- [x] **T24.6.2 - Orchestrator fn** - What: One function owns the full slate-wipe sequence. How: Implement executeTripAction(code) running disarm, cancel-all and flatten-all with per-venue calls issued in parallel via Promise.allSettled.
- [x] **T24.6.3 - Cancel-all per venue** - What: Every resting order dies at once. How: Implement cancelAll() posting OKX v5 /api/v5/trade/cancel-batch-orders with HMAC-signed headers and issuing EToro REST order deletes.
- [x] **T24.6.4 - Flatten-all per venue** - What: Every open position goes to flat at market. How: Implement flattenAll() sending reduce-only market closes per position from the phase-18 snapshot to OKX and EToro.
- [x] **T24.6.5 - Single retry pass** - What: One transient venue hiccup does not leave exposure. How: Retry each failed cancel or flatten exactly once after 500ms via setTimeout, then surface the failure - no retry loops.
- [x] **T24.6.6 - Flatten-pending state** - What: The trader sees anything not yet flat. How: Maintain breaker.flattenPending as a list of instruments cleared by phase-18 position updates, rendered red until empty.
- [x] **T24.6.7 - Trip-code action map** - What: Each trip does exactly what it should, nothing more. How: Encode TRIP_ACTIONS mapping codes 1 and 4 to full flatten plus disarm and code 3 to pause-only, consumed by a watch on breaker.tripped.
- [x] **T24.6.8 - In-flight guard** - What: A double trip never double-flattens. How: Add an in-flight boolean checked and set synchronously at the top of executeTripAction.
- [x] **T24.6.9 - Single unit tests for trip fns** - What: The wipe proven once per function. How: One Vitest test each for executeTripAction, cancelAll and flattenAll using vi.mock on fetch, targeted npx vitest run -t.
- [x] **T24.6.10 - Merge trip action** - What: The trip reaction lands on main. How: Green targeted tests plus ESLint, merge feature/f24.6-trip-action into main, delete the branch.

### F24.7 - Header breaker LEDs

**What:** Tiny header LEDs show breaker health at a glance - green fine, orange near limit, red tripped.
**How:** A Spektrum computed derives an LED state per breaker from percent-of-limit values, bound to dots in the phase-5 header via :class.

- [x] **T24.7.1 - Branch breaker leds** - What: Isolated work on the LEDs. How: git checkout -b feature/f24.7-breaker-leds from an up-to-date main.
- [x] **T24.7.2 - LED derivation fn** - What: One pure mapping from numbers to light colors. How: Implement ledStateFor(pct, tripped) returning 'ok', 'warn' or 'tripped', wrapped in a computed breaker.leds list.
- [x] **T24.7.3 - LED markup** - What: Three dots live beside the theme toggle. How: Render a data-each over breaker.leds in the phase-5 header right cluster with :class binding the state.
- [x] **T24.7.4 - Warn threshold** - What: Orange arrives with room to react. How: Fix the warn boundary at 80% of the daily-loss and streak limits as an exported constant, no extra setting.
- [x] **T24.7.5 - LED styling** - What: Lights that fit the money-hacker terminal. How: Style dots with phase-3 CSS custom properties, a soft glow, day/night variants and an @keyframes red blink when tripped.
- [x] **T24.7.6 - Native tooltips** - What: Exact numbers on hover with zero widget cost. How: Bind :title per dot showing current value versus limit, relying on the native browser tooltip.
- [x] **T24.7.7 - Click to settings** - What: One click jumps from light to limit. How: Add data-action on each dot navigating to the breaker section of the phase-7 settings panel.
- [x] **T24.7.8 - Reduced motion respect** - What: No blink for motion-sensitive traders. How: Wrap the blink animation in a prefers-reduced-motion: no-preference media query, falling back to solid red.
- [x] **T24.7.9 - Single unit test for led fn** - What: The derivation proven once. How: One Vitest test for ledStateFor covering ok, warn and tripped boundaries via npx vitest run -t ledStateFor.
- [x] **T24.7.10 - Merge breaker leds** - What: The LEDs land on main. How: Green targeted test plus ESLint, merge feature/f24.7-breaker-leds into main, delete the branch.

### F24.8 - Deliberate quick re-arm flow

**What:** Getting back in after a trip is deliberate but takes seconds, not paperwork.
**How:** A hold-to-arm button (1 second press) calls rearm(), clearing the trip latch while day PnL and streak counters stay intact.

- [x] **T24.8.1 - Branch re-arm** - What: Isolated work on the re-arm flow. How: git checkout -b feature/f24.8-re-arm from an up-to-date main.
- [x] **T24.8.2 - Re-arm fn** - What: The latch clears but the limits still bind. How: Implement rearm() resetting breaker.tripped and the trip latch while leaving breaker.dayPnl and breaker.lossStreak untouched.
- [x] **T24.8.3 - Hold-to-arm button** - What: Re-arming takes intent, not a dialog. How: Show a RE-ARM button behind data-if on breaker.tripped requiring a full 1s pointerdown hold before rearm() fires.
- [x] **T24.8.4 - Hold progress fn** - What: The hold is visible as it happens. How: Implement armHoldProgress driving a radial progress ring from pointerdown to pointerup via requestAnimationFrame.
- [x] **T24.8.5 - Still-over-limit guard** - What: No re-arm into an already-blown limit. How: Re-run dailyLossCheck inside rearm() and keep the trip with an explanatory reason text when the limit is still exceeded.
- [x] **T24.8.6 - Bots stay off rule** - What: Re-arming the desk never re-arms the robots. How: Leave phase-23 bot.masterArmed false after rearm() and state it in a caption under the button.
- [x] **T24.8.7 - Re-arm record** - What: Every re-arm is traceable. How: Store {ts, priorCode} on breaker.lastRearm at each successful rearm() for the F24.9 log to pick up.
- [x] **T24.8.8 - Success transition styling** - What: A satisfying orange-to-green flip on completion. How: Add a CSS transition on the button state classes using phase-3 tokens for both themes.
- [x] **T24.8.9 - Single unit tests for re-arm fns** - What: Re-arm logic proven once per function. How: One Vitest test each for rearm and armHoldProgress via targeted npx vitest run -t.
- [x] **T24.8.10 - Merge re-arm** - What: The re-arm flow lands on main. How: Green targeted tests plus ESLint, merge feature/f24.8-re-arm into main, delete the branch.

### F24.9 - Breaker event log

**What:** Every trip, block, pause and re-arm is on the record with the exact numbers attached.
**How:** logBreakerEvent(evt) appends compact entries to a Spektrum ring and an IndexedDB breakerEvents store off the hot path via queueMicrotask.

- [x] **T24.9.1 - Branch breaker log** - What: Isolated work on the event log. How: git checkout -b feature/f24.9-breaker-log from an up-to-date main.
- [x] **T24.9.2 - Log fn** - What: Recording never slows a check. How: Implement logBreakerEvent({ts, code, values}) pushing a 100-entry state ring and deferring the IndexedDB add with queueMicrotask.
- [x] **T24.9.3 - IndexedDB store** - What: Events survive reloads for post-session review. How: Add a breakerEvents object store keyed by ts in the shared IndexedDB upgrade helper used for tick recordings.
- [x] **T24.9.4 - Instrument call sites** - What: Nothing safety-related goes unlogged. How: Call logBreakerEvent from tripBreaker, pauseTrading, rearm and positionCheck rejections with structured value payloads.
- [x] **T24.9.5 - Log panel** - What: The record is readable inside the app. How: Render a newest-first data-each list of entries in the breaker settings section with code labels and values.
- [x] **T24.9.6 - Journal mirror** - What: Breaker events appear in the trading story. How: Mirror each entry into the phase-25 trade journal stream tagged type 'breaker'.
- [x] **T24.9.7 - Retention prune** - What: The store never grows unbounded. How: Implement pruneBreakerEvents deleting IndexedDB entries older than 30 days, run once at session start.
- [x] **T24.9.8 - Copy log action** - What: The log is shareable in one click. How: defineFn copyBreakerLog serializing visible entries to JSON onto navigator.clipboard via a data-action button.
- [x] **T24.9.9 - Single unit tests for log fns** - What: Log logic proven once per function. How: One Vitest test each for logBreakerEvent and pruneBreakerEvents using fake-indexeddb via targeted npx vitest run -t.
- [x] **T24.9.10 - Merge breaker log** - What: The event log lands on main. How: Green targeted tests plus ESLint, merge feature/f24.9-breaker-log into main, delete the branch.

### F24.10 - Threshold settings

**What:** All breaker limits set once in settings, in plain numbers, and they stick and apply instantly.
**How:** A Breakers card in the phase-7 settings panel bound via data-model, persisted with spektrum/persist and hot-swapped through refreshThresholds.

- [x] **T24.10.1 - Branch breaker settings** - What: Isolated work on threshold settings. How: git checkout -b feature/f24.10-breaker-settings from an up-to-date main.
- [x] **T24.10.2 - Settings schema module** - What: One source of truth for every limit and default. How: Consolidate maxDailyLoss, maxPosDefault, capOverrides, maxConsecLosses and pauseMinutes defaults into src/breakers/settings.js.
- [x] **T24.10.3 - Breakers settings card** - What: Every limit editable in one place. How: Build a Breakers card in the phase-7 settings panel with numeric inputs bound via data-model, step and min attributes set.
- [x] **T24.10.4 - Validation fn** - What: Bad numbers can never reach the hot path. How: Implement validateBreakerSettings clamping to positive ranges (0 allowed where it means disabled), snapping invalid input back on change.
- [x] **T24.10.5 - Persist limits** - What: Limits survive every reload. How: Map breaker.settings to the localStorage key stockz.breakers through spektrum/persist.
- [x] **T24.10.6 - Hot threshold reload** - What: A changed limit binds on the very next order. How: Spektrum watch on breaker.settings invoking refreshThresholds so the cache updates without restart.
- [x] **T24.10.7 - No-untrip-on-raise guard** - What: Raising a limit never silently revives a tripped desk. How: Keep breaker.tripped latched through settings changes so only the F24.8 hold-to-arm clears it.
- [x] **T24.10.8 - Live context display** - What: Limits shown against reality. How: Render current values beside each input, e.g. 'now: -120.50 / 500.00', from computed bindings with the account currency suffix.
- [x] **T24.10.9 - Single unit test for validation fn** - What: The clamp proven once. How: One Vitest test for validateBreakerSettings covering clamp and zero-disable cases via npx vitest run -t validateBreakerSettings.
- [x] **T24.10.10 - Merge breaker settings** - What: Threshold settings land on main. How: Green targeted test plus ESLint, merge feature/f24.10-breaker-settings into main, delete the branch.

---

## Phase 25 - Trade Journal & Time-Travel Audit

**What:** Every trade remembered and replayable, so the user can review and learn from each scalp without any manual bookkeeping.
**How:** Build a journal on execution fills plus Spektrum checkpoint/serialize/replay, IndexedDB tick recordings, CSV export and a filterable dashboard block.

### F25.1 - Fill Pairing Into Round-Trip Trades

**What:** Raw venue fills grouped into complete round-trip trades, so each scalp shows as one journal entry instead of scattered executions.
**How:** Pure pairFills() FIFO matcher in src/journal/pairing.js fed from the fills stream via Spektrum watch, emitting trade records into state.journal.trades.

- [x] **T25.1.1 - Cut pairing branch** - What: Isolated workspace so pairing work never destabilizes main. How: git checkout -b feature/f25.1-fill-pairing from a freshly pulled main.
- [x] **T25.1.2 - Define trade record schema** - What: One agreed shape every journal consumer can rely on. How: JSDoc typedef in src/journal/types.js with id, instrument, side, qty, entryFills, exitFills, openTs, closeTs.
- [x] **T25.1.3 - Build FIFO lot matcher** - What: Deterministic entry/exit matching per instrument. How: Pure matchLots(fills) in src/journal/pairing.js pairing oldest open lots first, returning closed lots plus remainder.
- [x] **T25.1.4 - Support partial exits and scale-outs** - What: Scaled-out scalps still pair into correct round trips. How: Extend pairFills() to split a lot when exit qty is smaller than entry qty, carrying the open remainder forward.
- [x] **T25.1.5 - Split position flips** - What: A long-to-short flip fill books as one close plus one open, not a corrupt trade. How: Add splitFlipFill() that divides a crossing fill into a closing leg and an opening leg by signed position size.
- [x] **T25.1.6 - Dedupe fills by venue id** - What: Reconnect replays of the fill feed never double-count a trade. How: Keep a Set of OKX fillId and EToro execution ids and skip already-seen ids inside the pairing reducer.
- [x] **T25.1.7 - Wire the live fills stream** - What: Trades appear in the journal the instant a scalp closes. How: Spektrum watch on state.fills runs pairFills() and addValue()s each completed trade into state.journal.trades.
- [x] **T25.1.8 - Persist open pairing state** - What: Half-open trades survive a page reload mid-scalp. How: Sync the open-lots ledger under stockz.journal.openLots with spektrum/persist to localStorage.
- [x] **T25.1.9 - Write single unit tests for pairing fns** - What: matchLots, pairFills and splitFlipFill each proven by exactly one test. How: One Vitest test per function in pairing.test.js, run with vitest run -t per function name.
- [x] **T25.1.10 - Verify and merge pairing** - What: Pairing lands on main only when green. How: Run the three targeted Vitest tests plus eslint src/journal, then merge feature/f25.1-fill-pairing into main.

### F25.2 - Per-Trade Metrics: Hold Time, MAE/MFE, Slippage, Fees

**What:** Every closed trade carries hold time, MAE/MFE, slippage and fees, so the user sees exactly where each scalp made or lost money.
**How:** Pure metric functions in src/journal/metrics.js reading fills plus IndexedDB tick recordings, attached to trades via Spektrum computed on close.

- [x] **T25.2.1 - Cut metrics branch** - What: Metric work stays off main until proven. How: git checkout -b feature/f25.2-trade-metrics from updated main.
- [x] **T25.2.2 - Implement holdTime()** - What: Millisecond-accurate hold duration per trade. How: Pure holdTime(trade) in src/journal/metrics.js returning closeTs minus openTs, formatted by an existing duration helper.
- [x] **T25.2.3 - Implement slippage()** - What: Visible cost of chasing price on entry and exit. How: slippage(trade) comparing intended limit price on each fill against its actual average fill price, summed in quote currency.
- [x] **T25.2.4 - Implement sumFees()** - What: True fee cost per round trip across venues. How: sumFees(trade) aggregating the fee fields from OKX v5 fill payloads and EToro execution records into one signed number.
- [x] **T25.2.5 - Implement maeMfe() over tick recordings** - What: Worst excursion and best unrealized profit for every scalp. How: maeMfe(trade, ticks) scanning the IndexedDB tick recording between openTs and closeTs for min/max adverse and favorable move.
- [x] **T25.2.6 - Implement netPnl() and rMultiple()** - What: Bottom-line result and risk-adjusted size of each trade. How: netPnl(trade) from fills minus sumFees(); rMultiple(trade, stopDist) dividing net by initial risk distance when a stop is tagged.
- [x] **T25.2.7 - Attach metrics on trade close** - What: Metrics appear on the trade record without any manual step. How: Spektrum computed('journal.enriched') maps state.journal.trades through the metric fns whenever a trade closes.
- [x] **T25.2.8 - Render metric columns** - What: Hold, MAE/MFE, slippage and fees readable at a glance per row. How: Extend the journal row template with {{trade.holdTime}}-style bindings and monospace numeric formatting.
- [x] **T25.2.9 - Write single unit tests for metric fns** - What: Each of the six metric functions proven by exactly one test. How: One Vitest test per fn in metrics.test.js with fixture fills and ticks, run via vitest run -t per name.
- [x] **T25.2.10 - Verify and merge metrics** - What: Enriched journal ships only when green. How: Run the six targeted tests and eslint, confirm live enrichment against a paper fill, merge to main.

### F25.3 - Notes and Tags on Trades

**What:** The user can annotate any trade with free-text notes and reusable tags, turning the journal into a real learning tool.
**How:** Tag and note state on each trade record, edited inline through Spektrum data-model bindings and defineFn actions, persisted with spektrum/persist.

- [x] **T25.3.1 - Cut annotation branch** - What: Notes work isolated from main. How: git checkout -b feature/f25.3-notes-tags from main.
- [x] **T25.3.2 - Model notes and tags state** - What: A durable home for annotations per trade. How: Add note string and tags array to the trade typedef plus a global state.journal.tagCatalog of known tags.
- [x] **T25.3.3 - Implement tag actions** - What: One-keystroke tagging of any trade. How: defineFn addTag(tradeId, tag) and removeTag(tradeId, tag) that update the trade and grow tagCatalog, exposed via data-action.
- [x] **T25.3.4 - Build inline note editor** - What: Notes typed directly in the journal row, no dialogs. How: data-model bound textarea revealed by a data-if edit flag per row, saving on blur through setValue.
- [x] **T25.3.5 - Render tag chips** - What: Tags visible as compact colored chips on each trade. How: data-each over trade.tags rendering chips with a remove data-action, styled in the money-hacker palette.
- [x] **T25.3.6 - Seed a preset tag palette** - What: Instant tagging vocabulary like plan, fomo, news, revenge. How: Ship a default tagCatalog array in src/journal/tags.js merged with user-created tags on load.
- [x] **T25.3.7 - Add tag autocomplete** - What: Existing tags suggested while typing to avoid near-duplicates. How: Bind the tag input to a datalist populated by data-each over tagCatalog with prefix filtering via a computed.
- [x] **T25.3.8 - Persist annotations** - What: Notes and tags survive reloads and sessions. How: Register journal notes, tags and tagCatalog paths with spektrum/persist to localStorage.
- [x] **T25.3.9 - Write single unit tests for tag fns** - What: addTag, removeTag and the suggestion filter each proven once. How: One Vitest test per function in tags.test.js, executed with vitest run -t per function.
- [x] **T25.3.10 - Verify and merge annotations** - What: Annotation feature reaches main green. How: Run targeted tests, tag and note a live paper trade end-to-end, merge feature branch to main.

### F25.4 - Checkpoint on Every Closed Trade

**What:** Each closed trade freezes a labeled point-in-time snapshot, so the user can jump back to the exact app state around any scalp.
**How:** Call Spektrum checkpoint() from the trade-close trigger with trade metadata labels, listing checkpoints in the journal for one-click time-travel.

- [x] **T25.4.1 - Cut checkpoint branch** - What: Time-travel work isolated from main. How: git checkout -b feature/f25.4-trade-checkpoints from main.
- [x] **T25.4.2 - Hook checkpoint into trade close** - What: A snapshot exists for every completed scalp automatically. How: In the trade-close trigger() handler call Spektrum checkpoint() right after the trade record is appended.
- [x] **T25.4.3 - Label checkpoints with trade metadata** - What: Snapshots findable by trade, not cryptic ids. How: Pass a label built by checkpointLabel(trade) combining trade id, instrument and net PnL into the checkpoint call.
- [x] **T25.4.4 - Maintain a checkpoint index** - What: A browsable catalog of all trade snapshots. How: Append {label, tradeId, ts} entries to state.journal.checkpoints via addValue alongside each checkpoint() call.
- [x] **T25.4.5 - Implement jump-to-checkpoint** - What: One click restores the app to the moment a trade closed. How: defineFn jumpToCheckpoint(id) using Spektrum replay() to the stored checkpoint, exposed via data-action.
- [x] **T25.4.6 - Guard checkpoint cost** - What: Snapshotting never adds latency to the hot trading path. How: Defer the checkpoint() call with queueMicrotask after fill processing and skip when a checkpoint for the same tradeId exists.
- [x] **T25.4.7 - Build the checkpoint list UI** - What: Snapshots visible inside the journal block per trade. How: data-each over state.journal.checkpoints rendering label rows with a jump data-action and relative timestamps.
- [x] **T25.4.8 - Add safe return-to-live** - What: Browsing history can never strand the user in the past. How: Snapshot a live-head checkpoint before any jump and render a fixed Return to Live button that replay()s back to it.
- [x] **T25.4.9 - Write single unit tests for checkpoint fns** - What: checkpointLabel and the index appender each proven once. How: One Vitest test per function in checkpoints.test.js run with vitest run -t per name.
- [x] **T25.4.10 - Verify and merge checkpoints** - What: Time-travel lands on main only when green. How: Run targeted tests, jump to a checkpoint and back in the browser, then merge the feature branch.

### F25.5 - Full Session Export via serialize()

**What:** The whole trading session downloads as one JSON file, so the user owns a portable, shareable record of the day.
**How:** Wrap Spektrum serialize() in exportSession() adding a metadata envelope, redacting secrets, and downloading through a Blob object URL.

- [x] **T25.5.1 - Cut export branch** - What: Export work stays off main. How: git checkout -b feature/f25.5-session-export from main.
- [x] **T25.5.2 - Implement exportSession()** - What: The complete app state captured in one call. How: exportSession() in src/journal/export.js invoking Spektrum serialize() and returning the raw state payload.
- [x] **T25.5.3 - Add the metadata envelope** - What: Exports carry version, date and venue context for future imports. How: buildEnvelope() wrapping the payload with schemaVersion, exportedAt ISO date, app version and instrument list.
- [x] **T25.5.4 - Redact secrets before export** - What: An exported file can never leak API keys. How: redactSecrets(payload) deep-deleting any OKX or EToro key, secret or passphrase paths before serialization to text.
- [x] **T25.5.5 - Optionally bundle tick recordings** - What: Exports can include the raw ticks that drove the session. How: When the include-ticks checkbox is set, read the session range from IndexedDB and attach it under envelope.ticks.
- [x] **T25.5.6 - Compress large exports** - What: Multi-hour sessions download in megabytes, not hundreds. How: Pipe the JSON through CompressionStream('gzip') into the Blob when payload size exceeds 5 MB, naming the file .json.gz.
- [x] **T25.5.7 - Trigger the file download** - What: One click saves stockz-session-YYYYMMDD.json to disk. How: Create a Blob object URL and click a temporary anchor with a date-stamped download attribute, then revoke the URL.
- [x] **T25.5.8 - Place the export control** - What: Export reachable from the journal without hunting menus. How: Add an Export Session button to the journal block header bound with data-action to exportSession, styled per the design system.
- [x] **T25.5.9 - Write single unit tests for export fns** - What: buildEnvelope and redactSecrets each proven by one test. How: One Vitest test per function in export.test.js asserting envelope fields and key removal, run via vitest run -t.
- [x] **T25.5.10 - Verify and merge export** - What: Export ships green with no secret leakage. How: Run targeted tests, export a real paper session and grep the file for key material, then merge to main.

### F25.6 - Session Import and Step Replay

**What:** Any exported session loads back in and replays step by step, letting the user re-live and dissect a past trading day.
**How:** File picker plus drag-drop importing validated JSON into Spektrum replay() with play, pause, step and speed controls in a replay bar.

- [x] **T25.6.1 - Cut import branch** - What: Replay work isolated from main. How: git checkout -b feature/f25.6-session-import from main.
- [x] **T25.6.2 - Build the import entry points** - What: Sessions load via a file picker or dropping a file on the journal. How: Hidden file input plus dragover/drop handlers on the journal block reading the file with FileReader, gunzipping .gz via DecompressionStream.
- [x] **T25.6.3 - Implement validateSession()** - What: Corrupt or incompatible files are rejected with a clear reason. How: validateSession(json) in src/journal/import.js checking schemaVersion, required envelope keys and trade array shape, returning ok or an error string.
- [x] **T25.6.4 - Load into the replay harness** - What: An imported session becomes a navigable timeline. How: Feed the validated payload into Spektrum replay() initialized paused at step zero, tracking position in state.replay.cursor.
- [x] **T25.6.5 - Enforce replay-only mode** - What: No live order can ever fire while browsing a past session. How: setValue('replay.active', true) on import and gate every venue-facing data-intent and action behind that flag.
- [x] **T25.6.6 - Build transport controls** - What: Play, pause, step forward, step back and speed at the user's fingertips. How: Replay bar component with data-action buttons calling defineFn transport fns that advance replay() and a speed multiplier select.
- [x] **T25.6.7 - Add the progress scrubber** - What: Jump anywhere in the session by dragging. How: Range input bound with data-model to replay.cursor that seeks replay() to the chosen step on input, showing step count and timestamp.
- [x] **T25.6.8 - Implement exit-to-live** - What: Leaving replay cleanly restores the live desk. How: defineFn exitReplay() that discards replay state, replay()s to the pre-import live checkpoint and clears replay.active.
- [x] **T25.6.9 - Write single unit tests for import fns** - What: validateSession and the transport step fn each proven once. How: One Vitest test per function in import.test.js with valid and broken fixtures, run via vitest run -t.
- [x] **T25.6.10 - Verify and merge import** - What: Import and replay reach main green. How: Run targeted tests, round-trip an export through import and scrub it fully, then merge the feature branch.

### F25.7 - Journal Block with Filters

**What:** A dashboard journal block the user can slice by instrument, tag and win/loss to find exactly the trades worth studying.
**How:** Uniform grid block rendering enriched trades with data-each, filtered through a computed pipeline driven by chip and select controls.

- [x] **T25.7.1 - Cut journal-block branch** - What: UI work stays off main. How: git checkout -b feature/f25.7-journal-block from main.
- [x] **T25.7.2 - Scaffold the journal grid block** - What: The journal occupies a standard dashboard tile. How: Create src/blocks/journal/ with block markup registered into the uniform dashboard grid between header and footer.
- [x] **T25.7.3 - Render trade rows** - What: Every enriched trade listed with its key numbers. How: data-each over the filtered trades computed, one row template showing instrument, side, PnL, hold time and tags.
- [x] **T25.7.4 - Build the filter state and computed** - What: One reactive source of truth for the active slice. How: state.journal.filters {instrument, tag, outcome} feeding a Spektrum computed('journal.filtered') applying filterTrades().
- [x] **T25.7.5 - Wire filter controls** - What: Instrument select, tag chips and a win/loss toggle change the list instantly. How: Selects and chip buttons bound with data-action to setValue on journal.filters, with a clear-all reset action.
- [x] **T25.7.6 - Add column sorting** - What: Trades orderable by time, PnL or hold with one click. How: sortTrades(trades, key, dir) pure fn applied in the computed, header cells cycling direction via data-action.
- [x] **T25.7.7 - Window long trade lists** - What: A thousand-trade day scrolls at 60fps. How: Render only rows inside the scroll viewport by slicing the filtered list against scrollTop in a rAF-driven window computed.
- [x] **T25.7.8 - Style wins and losses** - What: Green wins and orange losses readable in both themes. How: data-if classes mapping outcome to the money-hacker palette CSS custom properties for day and night themes.
- [x] **T25.7.9 - Write single unit tests for filter fns** - What: filterTrades and sortTrades each proven by one test. How: One Vitest test per function in journalBlock.test.js with mixed fixture trades, run via vitest run -t.
- [x] **T25.7.10 - Verify and merge journal block** - What: The block ships green and readable. How: Run targeted tests, exercise every filter combination against seeded trades in the browser, merge to main.

### F25.8 - CSV Export for Spreadsheets

**What:** The filtered journal downloads as clean CSV, so the user can analyze trades in Excel or Google Sheets without retyping.
**How:** Pure buildCsv() over the filtered trades with RFC 4180 escaping, delivered as a Blob download from a journal header button.

- [x] **T25.8.1 - Cut CSV branch** - What: CSV work isolated from main. How: git checkout -b feature/f25.8-csv-export from main.
- [x] **T25.8.2 - Implement toCsvRow()** - What: Any trade value survives commas, quotes and newlines intact. How: toCsvRow(values) in src/journal/csv.js quoting and doubling embedded quotes per RFC 4180.
- [x] **T25.8.3 - Implement buildCsv()** - What: A complete spreadsheet-ready document from any trade list. How: buildCsv(trades) emitting a header row of metric column names then one toCsvRow per trade.
- [x] **T25.8.4 - Map metric columns** - What: Hold time, MAE/MFE, slippage, fees, tags and notes all present as columns. How: csvColumns spec array pairing header labels with accessor fns over the enriched trade record.
- [x] **T25.8.5 - Normalize numbers and dates** - What: Files import cleanly regardless of user locale. How: Format numbers with fixed decimal points and timestamps as ISO 8601 strings inside the accessors, never locale-dependent.
- [x] **T25.8.6 - Export the active slice** - What: What you filter is what you export. How: Feed the journal.filtered computed rather than all trades into buildCsv so the download honors current filters.
- [x] **T25.8.7 - Wire the download and confirm** - What: One click saves stockz-trades-YYYYMMDD.csv with feedback. How: Blob download via a temporary anchor from a header button data-action, then a brief toast via the notifications block.
- [x] **T25.8.8 - Handle the empty case** - What: An empty filter result never yields a broken file. How: Disable the export button with a data-if when journal.filtered is empty and still emit the header row if forced via keyboard.
- [x] **T25.8.9 - Write single unit tests for CSV fns** - What: toCsvRow and buildCsv each proven by exactly one test. How: One Vitest test per function in csv.test.js asserting escaping and header order, run via vitest run -t.
- [x] **T25.8.10 - Verify and merge CSV export** - What: CSV lands on main opening cleanly in a spreadsheet. How: Run targeted tests, open an exported file in LibreOffice to eyeball columns, merge the feature branch.

### F25.9 - Daily Summary Rows

**What:** Each trading day collapses into one summary line of trades, win rate, net PnL and fees, giving the user an instant day-by-day scorecard.
**How:** groupByDay() and daySummary() pure fns feeding Spektrum computed summaries rendered as collapsible day headers in the journal list.

- [x] **T25.9.1 - Cut summaries branch** - What: Summary work stays off main. How: git checkout -b feature/f25.9-daily-summaries from main.
- [x] **T25.9.2 - Implement groupByDay()** - What: Trades bucketed by their local close date. How: groupByDay(trades) in src/journal/summary.js keying a Map by YYYY-MM-DD derived from closeTs.
- [x] **T25.9.3 - Implement daySummary()** - What: One truthful stat line per day. How: daySummary(trades) returning tradeCount, wins, winRate, grossPnl, fees and netPnl from the enriched records.
- [x] **T25.9.4 - Compute summaries reactively** - What: Day rows update the moment a trade closes. How: Spektrum computed('journal.days') mapping groupByDay output through daySummary over the filtered trades.
- [x] **T25.9.5 - Render collapsible day headers** - What: Days scannable closed, trades one click away. How: data-each over journal.days rendering a header row per day with a data-action toggle and data-if on the trade sublist.
- [x] **T25.9.6 - Pin the live today row** - What: Today's running score always visible while scalping. How: Sticky-position the current day header at the block top with CSS and bind its numbers to the live computed.
- [x] **T25.9.7 - Style summary rows distinctly** - What: Day lines pop from trade lines at a glance. How: Heavier monospace weight, subtle background from the design-system surface token and green/orange net PnL coloring per theme.
- [x] **T25.9.8 - Expand day details on demand** - What: Fees versus gross and average hold per day one hover away. How: Title tooltip plus an expandable detail strip driven by data-if showing avgHold, maxWin and maxLoss from daySummary.
- [x] **T25.9.9 - Write single unit tests for summary fns** - What: groupByDay and daySummary each proven by one test. How: One Vitest test per function in summary.test.js covering a multi-day fixture, run via vitest run -t.
- [x] **T25.9.10 - Verify and merge summaries** - What: Daily scorecards ship green. How: Run targeted tests, confirm collapse state and today pinning across a simulated midnight rollover, merge to main.

### F25.10 - History Retention and Pruning

**What:** The journal stays fast forever: old trades, ticks and checkpoints age out by policy while anything valuable can be archived first.
**How:** pruneTrades() and companion fns applying a settings-driven retention policy to state, IndexedDB tick stores and the checkpoint index at idle time.

- [x] **T25.10.1 - Cut retention branch** - What: Pruning work isolated from main. How: git checkout -b feature/f25.10-retention from main.
- [x] **T25.10.2 - Model the retention policy** - What: The user decides how much history to keep. How: settings.retention {maxDays, maxTrades, maxCheckpoints} with defaults in the settings block, persisted via spektrum/persist.
- [x] **T25.10.3 - Implement pruneTrades()** - What: Trade history trimmed exactly to policy. How: Pure pruneTrades(trades, policy, now) in src/journal/retention.js returning kept trades and a pruned list by age then count.
- [x] **T25.10.4 - Prune tick recordings** - What: IndexedDB never balloons past the retention window. How: pruneTicks(policy) deleting IndexedDB tick recording ranges older than maxDays via a keyrange cursor delete.
- [x] **T25.10.5 - Cap the checkpoint index** - What: Time-travel stays snappy with a bounded snapshot set. How: pruneCheckpoints(index, policy) dropping the oldest entries past maxCheckpoints and removing their stored snapshots.
- [x] **T25.10.6 - Schedule pruning at idle** - What: Cleanup never competes with live scalping. How: Run the three prune fns from requestIdleCallback shortly after session start and once per hour via a timer.
- [x] **T25.10.7 - Offer archive-before-prune** - What: Nothing valuable disappears silently. How: When pruning would drop trades, prompt once to download them via the existing buildCsv and exportSession paths before deletion.
- [x] **T25.10.8 - Show storage usage** - What: The user sees how much space history consumes. How: Read navigator.storage.estimate() into state.journal.storage and render used/quota with a slim bar in the journal footer.
- [x] **T25.10.9 - Write single unit tests for prune fns** - What: pruneTrades, pruneTicks and pruneCheckpoints each proven once. How: One Vitest test per function in retention.test.js with fake-timer dates, run via vitest run -t.
- [x] **T25.10.10 - Verify and merge retention** - What: Policy-driven pruning lands green on main. How: Run targeted tests, dry-run a prune against seeded old data checking counts, then merge the feature branch.

---

## Phase 26 - Analytics & Performance Dashboard

**What:** The truth about the user's edge: win rate, expectancy, drawdown and patterns by hour and instrument, computed from real journal data.
**How:** Analytics dashboard blocks with pure stat functions over journal trades, Spektrum computed wiring and hand-rolled canvas chart renderers.

### F26.1 - KPI Tiles: Win Rate, Expectancy, Profit Factor, Avg Win/Loss

**What:** The four numbers that define an edge shown as always-live tiles, so the user knows in one glance whether the approach is working.
**How:** Pure stat fns in src/analytics/kpis.js wired through Spektrum computed into a tile row inside a uniform analytics grid block.

- [x] **T26.1.1 - Cut KPI branch** - What: KPI work isolated from main. How: git checkout -b feature/f26.1-kpi-tiles from a freshly pulled main.
- [x] **T26.1.2 - Implement winRate()** - What: Honest percentage of winning scalps. How: Pure winRate(trades) in src/analytics/kpis.js counting netPnl > 0 over closed trades, returning null for an empty set.
- [x] **T26.1.3 - Implement expectancy()** - What: Expected value per trade in quote currency. How: expectancy(trades) computing winRate * avgWin + lossRate * avgLoss from enriched journal records.
- [x] **T26.1.4 - Implement profitFactor()** - What: Gross profit over gross loss as one durability number. How: profitFactor(trades) dividing summed winning netPnl by absolute summed losing netPnl, guarding divide-by-zero with Infinity.
- [x] **T26.1.5 - Implement avgWin() and avgLoss()** - What: Typical size of a winner versus a loser. How: avgWin(trades) and avgLoss(trades) averaging netPnl over each outcome subset, returned as signed quote-currency numbers.
- [x] **T26.1.6 - Scaffold the analytics block and tile row** - What: KPIs live in a standard dashboard tile. How: Create src/blocks/analytics/ registered into the uniform grid, with a four-tile flex row template using {{}} bindings.
- [x] **T26.1.7 - Wire KPIs reactively** - What: Tiles update the instant a trade closes. How: Spektrum computed('analytics.kpis') mapping the period-filtered trades through the five stat fns, bound into the tiles.
- [x] **T26.1.8 - Style the tiles** - What: Terminal-style KPI tiles legible in day and night themes. How: Monospace values with green/orange sign coloring from design-system custom properties and a dim label line per tile.
- [x] **T26.1.9 - Write single unit tests for KPI fns** - What: Each of the five stat functions proven by exactly one test. How: One Vitest test per fn in kpis.test.js with a mixed win/loss fixture, run via vitest run -t per name.
- [x] **T26.1.10 - Verify and merge KPI tiles** - What: KPIs land on main only when green. How: Run the targeted tests plus eslint src/analytics, cross-check tile values against a hand-computed fixture, merge to main.

### F26.2 - Equity Curve Chart

**What:** A live equity curve of cumulative net PnL per trade, so the user sees the shape of the session and the account trajectory instantly.
**How:** equitySeries() pure fn feeding a hand-rolled canvas line renderer with axes, crosshair hover and Spektrum watch-driven redraws.

- [x] **T26.2.1 - Cut equity-curve branch** - What: Chart work stays off main. How: git checkout -b feature/f26.2-equity-curve from main.
- [x] **T26.2.2 - Implement equitySeries()** - What: One clean data series of account progress. How: Pure equitySeries(trades) in src/analytics/equity.js returning cumulative netPnl points keyed by trade closeTs.
- [x] **T26.2.3 - Scaffold the canvas renderer** - What: A crisp chart surface on every screen. How: drawEquity(ctx, series, size) module with devicePixelRatio-scaled canvas sizing and a clearRect frame reset.
- [x] **T26.2.4 - Draw axes and gridlines** - What: Values readable without guessing scale. How: Compute nice min/max ticks in drawEquity and stroke dim horizontal gridlines with right-edge price labels in monospace.
- [x] **T26.2.5 - Draw the equity line and zero baseline** - What: Above-water and underwater segments visually distinct. How: Stroke the polyline splitting color at the zero crossing, green above and orange below per the money-hacker palette.
- [x] **T26.2.6 - Add the hover crosshair** - What: Any point inspectable down to the exact trade. How: pointermove handler snapping to the nearest series point, drawing crosshair lines and a tooltip with trade id, time and equity.
- [x] **T26.2.7 - Wire reactive redraws** - What: The curve extends live as trades close. How: Spektrum watch on the period-filtered trades computed scheduling drawEquity via requestAnimationFrame with the fresh series.
- [x] **T26.2.8 - Handle theme and resize** - What: The chart stays crisp across theme flips and layout changes. How: ResizeObserver re-rasterizes on block resize; colors read from CSS custom properties at draw time so day/night just works.
- [x] **T26.2.9 - Write single unit tests for equity fns** - What: equitySeries and the tick calculator each proven once. How: One Vitest test per function in equity.test.js asserting cumulative sums and tick bounds, run via vitest run -t.
- [x] **T26.2.10 - Verify and merge equity curve** - What: The curve ships green and pixel-clean. How: Run targeted tests, eyeball rendering on 1x and 2x displays in both themes, merge the feature branch to main.

### F26.3 - PnL-by-Hour Heatmap

**What:** A weekday-by-hour heatmap of net PnL revealing exactly when the user makes and loses money, so trading hours can be chosen on evidence.
**How:** bucketByHour() aggregation plus a diverging green/orange color scale rendered as a canvas cell grid with hover stats and a legend.

- [x] **T26.3.1 - Cut heatmap branch** - What: Heatmap work isolated from main. How: git checkout -b feature/f26.3-hour-heatmap from main.
- [x] **T26.3.2 - Implement bucketByHour()** - What: PnL and trade counts folded into 7x24 time cells. How: Pure bucketByHour(trades) in src/analytics/heatmap.js keying weekday and local hour of closeTs, summing netPnl and count.
- [x] **T26.3.3 - Implement the diverging color scale** - What: Profit and loss intensity readable at a glance. How: cellColor(value, maxAbs) interpolating from orange through neutral to green symmetrically around zero using the palette custom properties.
- [x] **T26.3.4 - Render the cell grid** - What: The full week of hours in one compact canvas. How: drawHeatmap(ctx, buckets, size) painting devicePixelRatio-scaled cells with weekday row labels and hour column labels.
- [x] **T26.3.5 - Add cell hover stats** - What: Exact PnL, trade count and win rate per hour on demand. How: pointermove hit-testing cell coordinates and rendering a positioned tooltip div bound through Spektrum setValue.
- [x] **T26.3.6 - Distinguish empty from break-even cells** - What: No-data hours never masquerade as flat performance. How: Paint zero-trade cells with a hatched neutral fill distinct from the zero-PnL midpoint color.
- [x] **T26.3.7 - Draw the legend** - What: The color-to-PnL mapping self-explanatory. How: Horizontal gradient bar under the grid with min, zero and max labels rendered in the same canvas pass.
- [x] **T26.3.8 - Wire live updates** - What: Today's cells shift as scalps close. How: Spektrum watch on period-filtered trades re-running bucketByHour and scheduling drawHeatmap on requestAnimationFrame.
- [x] **T26.3.9 - Write single unit tests for heatmap fns** - What: bucketByHour and cellColor each proven by one test. How: One Vitest test per function in heatmap.test.js with cross-midnight fixtures, run via vitest run -t.
- [x] **T26.3.10 - Verify and merge heatmap** - What: The heatmap lands green with truthful cells. How: Run targeted tests, verify a known fixture pattern renders in the expected cells in-browser, merge to main.

### F26.4 - PnL by Instrument Ranking

**What:** A ranked list of instruments by net PnL with win rate and trade count, so the user doubles down on pairs that pay and drops ones that bleed.
**How:** groupByInstrument() and rankInstruments() fns feeding a canvas horizontal bar chart with click-through filtering into the journal block.

- [x] **T26.4.1 - Cut ranking branch** - What: Ranking work stays off main. How: git checkout -b feature/f26.4-instrument-ranking from main.
- [x] **T26.4.2 - Implement groupByInstrument()** - What: Per-instrument totals from raw trades. How: Pure groupByInstrument(trades) in src/analytics/instruments.js aggregating netPnl, fees, count and wins per instrument id.
- [x] **T26.4.3 - Implement rankInstruments()** - What: Best to worst ordering with derived rates. How: rankInstruments(groups) sorting by netPnl descending and attaching winRate and avgPnl per instrument.
- [x] **T26.4.4 - Render horizontal bars** - What: Relative performance visible as proportional bars. How: drawRanking(ctx, ranks, size) painting green/orange bars from a zero axis with instrument labels in monospace on canvas.
- [x] **T26.4.5 - Annotate count and win rate** - What: Context beyond raw PnL on every row. How: Draw trade count and winRate percentage at each bar end, dimmed via the design-system muted color token.
- [x] **T26.4.6 - Add click-to-filter** - What: One click jumps from a ranked instrument to its trades. How: Canvas click hit-testing rows then setValue on journal.filters.instrument so the journal block re-slices instantly.
- [x] **T26.4.7 - Wire reactive updates** - What: Rankings reshuffle live as results change. How: Spektrum computed('analytics.ranking') over period-filtered trades with a watch scheduling redraws on requestAnimationFrame.
- [x] **T26.4.8 - Cap and overflow the list** - What: Ten instruments readable, the rest reachable. How: Render the top ten bars and an aggregated Other row, with a data-action toggle expanding the full list.
- [x] **T26.4.9 - Write single unit tests for ranking fns** - What: groupByInstrument and rankInstruments each proven once. How: One Vitest test per function in instruments.test.js with a multi-venue fixture, run via vitest run -t.
- [x] **T26.4.10 - Verify and merge ranking** - What: The ranking ships green with working click-through. How: Run targeted tests, click a bar and confirm the journal filter applies, then merge the feature branch.

### F26.5 - Hold-Time Distribution Histogram

**What:** A histogram of how long scalps are held, colored by average PnL per bucket, so the user learns the hold durations where the edge lives.
**How:** holdTimeBuckets() with log-scale duration bins rendered by a canvas bar renderer with median/average markers and per-bar tooltips.

- [x] **T26.5.1 - Cut histogram branch** - What: Histogram work isolated from main. How: git checkout -b feature/f26.5-holdtime-histogram from main.
- [x] **T26.5.2 - Define log-scale bins** - What: Sub-10s scalps and 10-minute holds both resolve clearly. How: HOLD_BINS constant in src/analytics/holdtime.js with edges 10s, 30s, 1m, 3m, 10m, 30m, plus an overflow bin.
- [x] **T26.5.3 - Implement holdTimeBuckets()** - What: Trade counts and avg PnL per duration bin. How: Pure holdTimeBuckets(trades) folding each trade's holdTime metric into HOLD_BINS with count and mean netPnl per bin.
- [x] **T26.5.4 - Implement medianHold() and avgHold()** - What: The two center-of-mass numbers for hold behavior. How: medianHold(trades) via sorted midpoint and avgHold(trades) via mean over holdTime values.
- [x] **T26.5.5 - Render the histogram bars** - What: The distribution shape visible in one look. How: drawHistogram(ctx, buckets, size) painting bars scaled to max count with bin edge labels beneath on a DPR-scaled canvas.
- [x] **T26.5.6 - Color bars by bucket PnL** - What: Profitable hold ranges glow green, losing ranges orange. How: Fill each bar with cellColor(avgPnl, maxAbs) reusing the diverging scale from the heatmap module.
- [x] **T26.5.7 - Draw median and average markers** - What: Typical hold length marked directly on the chart. How: Vertical dashed lines at medianHold and avgHold positions with small labels, drawn after the bars.
- [x] **T26.5.8 - Add per-bar tooltips and wiring** - What: Exact counts and avg PnL per bin, always current. How: pointermove hit-testing bars into a tooltip div plus a Spektrum watch redrawing on period-filtered trade changes.
- [x] **T26.5.9 - Write single unit tests for hold fns** - What: holdTimeBuckets, medianHold and avgHold each proven once. How: One Vitest test per function in holdtime.test.js with edge-of-bin fixtures, run via vitest run -t.
- [x] **T26.5.10 - Verify and merge histogram** - What: The distribution ships green and truthful. How: Run targeted tests, validate bin placement of boundary-duration fixtures in-browser, merge to main.

### F26.6 - Streak Analysis View

**What:** Current and record win/loss streaks plus a colored sequence strip, so the user spots hot hands and tilt spirals as they form.
**How:** streaks() pure fn over ordered trades feeding stat tiles and a canvas tick-strip renderer with hover detail inside the analytics block.

- [x] **T26.6.1 - Cut streaks branch** - What: Streak work stays off main. How: git checkout -b feature/f26.6-streak-analysis from main.
- [x] **T26.6.2 - Implement streaks()** - What: Current, max win and max loss streaks computed exactly. How: Pure streaks(trades) in src/analytics/streaks.js scanning close-ordered outcomes and returning current, maxWin and maxLoss runs.
- [x] **T26.6.3 - Implement streakSegments()** - What: The full session as consecutive run segments for drawing. How: streakSegments(trades) returning an array of {outcome, length, startTradeId} runs preserving order.
- [x] **T26.6.4 - Render streak stat tiles** - What: The three streak numbers visible instantly. How: Tile trio in the analytics template bound with {{streaks.current}}-style expressions, sign-colored green/orange.
- [x] **T26.6.5 - Render the sequence strip** - What: The whole day's rhythm as a compact color barcode. How: drawStreakStrip(ctx, segments, size) painting one thin green or orange tick per trade in close order on canvas.
- [x] **T26.6.6 - Highlight the active run** - What: The ongoing streak stands out from history. How: Draw a brighter outline over the trailing run segment and pulse its stat tile with a CSS animation while it grows.
- [x] **T26.6.7 - Surface a tilt hint** - What: A quiet visual nudge when losses stack up. How: data-if banner in the block when streaks.current is a loss run of five or more, styled as a dim warning, no dialogs and no blocking.
- [x] **T26.6.8 - Add strip hover and wiring** - What: Any tick traceable to its trade, always live. How: pointermove hit-testing ticks into a tooltip with trade id and PnL, plus a Spektrum watch redrawing on new closes.
- [x] **T26.6.9 - Write single unit tests for streak fns** - What: streaks and streakSegments each proven by one test. How: One Vitest test per function in streaks.test.js with alternating and monotone fixtures, run via vitest run -t.
- [x] **T26.6.10 - Verify and merge streaks** - What: Streak analysis lands green on main. How: Run targeted tests, replay a fixture session confirming tile and strip agreement, merge the feature branch.

### F26.7 - Fees vs Gross PnL Comparison

**What:** Gross PnL, total fees and the fee-drag ratio side by side per venue, so the user sees how much of the edge the exchanges are eating.
**How:** grossVsFees() aggregation split by OKX and EToro rendered as paired canvas bars with a fee-ratio tile and hover breakdowns.

- [x] **T26.7.1 - Cut fees branch** - What: Fee analysis isolated from main. How: git checkout -b feature/f26.7-fees-vs-gross from main.
- [x] **T26.7.2 - Implement grossVsFees()** - What: The three headline numbers of fee drag. How: Pure grossVsFees(trades) in src/analytics/fees.js summing gross PnL and fees from enriched trades and deriving feeRatio.
- [x] **T26.7.3 - Implement venueFeeSplit()** - What: Fee cost attributed to the venue that charged it. How: venueFeeSplit(trades) partitioning fee sums by the OKX or EToro origin recorded on each fill.
- [x] **T26.7.4 - Render paired bars** - What: Gross versus fees comparable at a glance per venue. How: drawFeeBars(ctx, data, size) painting a green gross bar beside an orange fee bar for each venue on a DPR-scaled canvas.
- [x] **T26.7.5 - Add the fee-ratio tile** - What: One percentage that says how much edge fees consume. How: Tile bound to {{analytics.fees.feeRatio}} with threshold coloring shifting toward orange as the ratio climbs.
- [x] **T26.7.6 - Add hover breakdowns** - What: Maker/taker and per-venue detail on demand. How: pointermove over bars raising a tooltip with fee totals, trade counts and average fee per trade for that venue.
- [x] **T26.7.7 - Wire reactive updates** - What: Fee drag stays current with every close. How: Spektrum computed('analytics.fees') over period-filtered trades with a watch scheduling drawFeeBars redraws.
- [x] **T26.7.8 - Style and place the block section** - What: The comparison sits cleanly in the analytics tile. How: Grid area beneath the KPI row with section heading, using spacing and border tokens from the design system.
- [x] **T26.7.9 - Write single unit tests for fee fns** - What: grossVsFees and venueFeeSplit each proven once. How: One Vitest test per function in fees.test.js with mixed-venue fixtures, run via vitest run -t.
- [x] **T26.7.10 - Verify and merge fee comparison** - What: Fee truth ships green. How: Run targeted tests, reconcile totals against summed journal fee columns for a fixture day, merge to main.

### F26.8 - Drawdown Curve and Max Drawdown

**What:** An underwater equity chart plus max drawdown depth, duration and recovery stats, so the user knows the worst pain the strategy inflicts.
**How:** drawdownSeries() and maxDrawdown() fns over the equity series rendered as a canvas area chart with a marked deepest trough.

- [x] **T26.8.1 - Cut drawdown branch** - What: Drawdown work stays off main. How: git checkout -b feature/f26.8-drawdown from main.
- [x] **T26.8.2 - Implement drawdownSeries()** - What: Distance below the running equity peak at every trade. How: Pure drawdownSeries(equity) in src/analytics/drawdown.js tracking the running max and emitting peak-minus-equity points.
- [x] **T26.8.3 - Implement maxDrawdown()** - What: Depth, duration and recovery time of the worst slide. How: maxDrawdown(series) locating the deepest trough with its peak start, trough timestamp and recovery index or null if unrecovered.
- [x] **T26.8.4 - Render the underwater area** - What: Every drawdown visible as an orange lake under zero. How: drawUnderwater(ctx, series, size) filling the area between zero and the drawdown line with translucent orange on canvas.
- [x] **T26.8.5 - Mark the maximum drawdown** - What: The single worst moment labeled on the chart. How: Draw a marker at the trough with a depth label and a bracket spanning peak to recovery along the time axis.
- [x] **T26.8.6 - Add drawdown stat tiles** - What: Max depth, duration and current drawdown as plain numbers. How: Three tiles bound to a computed('analytics.drawdown') exposing maxDepth, maxDuration and currentDepth.
- [x] **T26.8.7 - Track live current drawdown** - What: The user always knows how far below peak the session sits. How: Extend the computed to derive currentDepth from the latest equity point, tinting the tile orange while below peak.
- [x] **T26.8.8 - Wire redraws and hover** - What: The lake deepens live and any point is inspectable. How: Spektrum watch scheduling drawUnderwater on trade closes plus pointermove tooltip showing depth and date at the cursor.
- [x] **T26.8.9 - Write single unit tests for drawdown fns** - What: drawdownSeries and maxDrawdown each proven by one test. How: One Vitest test per function in drawdown.test.js including an unrecovered-trough fixture, run via vitest run -t.
- [x] **T26.8.10 - Verify and merge drawdown** - What: Drawdown truth lands green on main. How: Run targeted tests, verify the marked trough matches a hand-computed fixture, merge the feature branch.

### F26.9 - Period Selector: Day/Week/Month/All

**What:** One switch scopes every analytics number and chart to today, this week, this month or all time, so short-term form and long-term edge are both visible.
**How:** A shared state.analytics.period value with filterByPeriod() feeding all analytics computeds, a segmented control UI and spektrum/persist memory.

- [ ] **T26.9.1 - Cut period branch** - What: Period work isolated from main. How: git checkout -b feature/f26.9-period-selector from main.
- [ ] **T26.9.2 - Model the period state** - What: One source of truth every analytics block obeys. How: state.analytics.period holding day, week, month or all, mutated only through a setPeriod defineFn using setValue.
- [ ] **T26.9.3 - Implement periodRange()** - What: Correct timestamp bounds for any period keyword. How: Pure periodRange(period, now) in src/analytics/period.js returning start/end epochs with Monday week starts and calendar months.
- [ ] **T26.9.4 - Implement filterByPeriod()** - What: Only in-period trades feed the stats. How: filterByPeriod(trades, range) returning trades whose closeTs falls inside the range, exposed as computed('analytics.trades').
- [ ] **T26.9.5 - Rebase all analytics computeds** - What: Every KPI, chart and ranking obeys the selector automatically. How: Point kpis, equity, heatmap, ranking, holdtime, streaks, fees and drawdown computeds at analytics.trades instead of raw journal trades.
- [ ] **T26.9.6 - Build the segmented control** - What: Day, week, month and all switchable in one click. How: Four-button segment in the analytics header bound with data-action to setPeriod, active state styled via a data-if class.
- [ ] **T26.9.7 - Add keyboard cycling** - What: Periods flippable without leaving the keyboard. How: Register a bracket-key binding through the existing hotkey registry that cycles setPeriod through the four values.
- [ ] **T26.9.8 - Persist and refresh** - What: The chosen period survives reload and charts repaint instantly. How: Sync analytics.period via spektrum/persist and trigger('analytics.repaint') so every canvas renderer redraws on change.
- [ ] **T26.9.9 - Write single unit tests for period fns** - What: periodRange and filterByPeriod each proven once. How: One Vitest test per function in period.test.js with fixed fake-timer dates across a month boundary, run via vitest run -t.
- [ ] **T26.9.10 - Verify and merge period selector** - What: Scoped analytics ship green. How: Run targeted tests, flip all four periods confirming every block re-scopes consistently, merge to main.

### F26.10 - Performance Report Export

**What:** The full analytics picture exports as a JSON snapshot, a shareable markdown summary and chart PNGs, so the edge can be reviewed outside the app.
**How:** buildReport() assembling stats, reportMarkdown() text rendering and canvas.toBlob PNG capture, all downloadable from the analytics header.

- [ ] **T26.10.1 - Cut report branch** - What: Report work stays off main. How: git checkout -b feature/f26.10-report-export from main.
- [ ] **T26.10.2 - Implement buildReport()** - What: Every analytics number frozen into one snapshot object. How: Pure buildReport(state) in src/analytics/report.js collecting kpis, ranking, fees, streaks, drawdown and period metadata.
- [ ] **T26.10.3 - Implement reportMarkdown()** - What: A paste-anywhere text summary of the period. How: reportMarkdown(report) rendering headings, a KPI table and top/bottom instruments as a markdown string.
- [ ] **T26.10.4 - Capture chart PNGs** - What: The equity curve, heatmap and drawdown as image files. How: chartToPng(canvas, name) using canvas.toBlob('image/png') on each named chart canvas at its current DPR resolution.
- [ ] **T26.10.5 - Download the JSON snapshot** - What: A machine-readable report file on disk. How: Serialize buildReport output through JSON.stringify into a Blob anchor download named stockz-report-<period>-YYYYMMDD.json.
- [ ] **T26.10.6 - Copy markdown to clipboard** - What: The summary pasteable into chat or docs in one click. How: navigator.clipboard.writeText with the reportMarkdown string from a Copy Summary data-action, confirmed by a toast.
- [ ] **T26.10.7 - Build the export menu** - What: All three export forms reachable from one header control. How: Dropdown in the analytics header with JSON, Markdown and PNG entries wired via data-action to the export fns.
- [ ] **T26.10.8 - Name files consistently** - What: Reports sort chronologically in any folder. How: reportFilename(kind, period, date) helper producing stockz-report-<period>-YYYYMMDD.<ext> shared by all three paths.
- [ ] **T26.10.9 - Write single unit tests for report fns** - What: buildReport, reportMarkdown and reportFilename each proven once. How: One Vitest test per function in report.test.js snapshotting markdown output, run via vitest run -t.
- [ ] **T26.10.10 - Verify and merge report export** - What: Exports ship green and complete. How: Run targeted tests, generate all three artifacts for a fixture session and inspect them, then merge the feature branch to main.

---

## Phase 27 - Market Replay & Backtesting

**What:** Test the scalp before risking a cent: record real markets, replay them through the desk, and score strategies with simulated fills.
**How:** Record normalized tick streams to IndexedDB, replay them through the standard Spektrum pipeline at 1x-50x, and run strategies headless in Workers with a sim fill model.

### F27.1 - Tick Session Recorder

**What:** Capture live tick streams to disk so any interesting market moment can be replayed later on demand.
**How:** Buffer normalized ticks off the phase 11 pipeline in a Worker and batch-write chunks to an IndexedDB recordings database.

- [ ] **T27.1.1 - Recorder feature branch** - What: Isolated line of work so recorder code never lands on main half-done. How: git switch -c feature/tick-recorder from a fresh main pull.
- [ ] **T27.1.2 - Recordings DB schema** - What: A durable home for tick sessions in the browser. How: openRecordingDb() creating IndexedDB stockz-recordings with sessions and chunks object stores keyed by sessionId.
- [ ] **T27.1.3 - Recorder core** - What: One call starts capturing every normalized tick crossing the desk. How: createTickRecorder() subscribing to the pipeline tick stream via Spektrum watch on ticks state.
- [ ] **T27.1.4 - Chunk buffering** - What: Smooth writes that never stutter the UI during bursts. How: flushChunk() batches ticks into typed-array chunks every 500 ticks or 2 seconds, whichever first.
- [ ] **T27.1.5 - Worker writer** - What: Recording costs zero main-thread frames while scalping. How: recorder-worker.js receives chunks via postMessage transferables and performs the IndexedDB puts.
- [ ] **T27.1.6 - Session metadata** - What: Every recording is self-describing: what, where, when, how much. How: finalizeSession() writes instruments, venue, start/end timestamps, and tick count onto the session record.
- [ ] **T27.1.7 - Record toggle block** - What: One-click REC from the dashboard with an unmissable live indicator. How: Grid block with data-action="toggleRecording" and a pulsing orange REC dot styled with design-system tokens.
- [ ] **T27.1.8 - Storage quota guard** - What: Recording never silently eats the whole browser quota. How: checkStorageQuota() via navigator.storage.estimate; auto-stop and warn at 90% usage.
- [ ] **T27.1.9 - Recorder unit tests** - What: Each recorder function proven correct in isolation. How: One Vitest test per new fn (openRecordingDb, flushChunk, finalizeSession, checkStorageQuota) run via vitest run -t per function.
- [ ] **T27.1.10 - Recorder merge** - What: Recording ships to the desk. How: ESLint clean plus targeted Vitest green, then merge feature/tick-recorder into main.

### F27.2 - Recording Library Manager

**What:** Browse, size, label, and prune saved sessions so storage stays lean and the right replay is easy to find.
**How:** A Spektrum-bound library block listing IndexedDB sessions with size, duration, rename, and instant delete actions.

- [ ] **T27.2.1 - Library feature branch** - What: Library work stays off main until complete. How: git switch -c feature/recording-library from main.
- [ ] **T27.2.2 - listRecordings query** - What: The full catalog of saved sessions in one call. How: listRecordings() cursors the sessions store and returns a metadata array sorted by start time.
- [ ] **T27.2.3 - recordingSize calculator** - What: Honest per-session storage cost in MB. How: recordingSize() sums chunk byteLengths for a sessionId via an index range query.
- [ ] **T27.2.4 - Library state loader** - What: The library view is always current without manual refresh. How: addAsync loader populates setValue('replay.library', rows) and re-runs after record/delete events.
- [ ] **T27.2.5 - Library block markup** - What: A scannable terminal-style table of recordings. How: data-each rows showing label, venue, instruments, duration, tick count, and MB in the money-hacker mono style.
- [ ] **T27.2.6 - Delete recording action** - What: Reclaim space instantly with a single click, no confirm dialog. How: deleteRecording() removes session plus chunks in one IndexedDB transaction, wired via data-action with optimistic row removal.
- [ ] **T27.2.7 - Inline rename** - What: Recordings get memorable names like "CPI spike 14:30". How: data-model bound label field persisting edits to the session record on blur.
- [ ] **T27.2.8 - Sort and filter view** - What: Find the right session among dozens in seconds. How: computed('replay.libraryView') sorting by date or size and filtering by instrument substring.
- [ ] **T27.2.9 - Library unit tests** - What: Query, size, and delete functions each verified once. How: One Vitest test per fn (listRecordings, recordingSize, deleteRecording) executed with vitest run -t targeting only that test.
- [ ] **T27.2.10 - Library merge** - What: Session management lands on main. How: Lint plus targeted tests green, merge feature/recording-library into main.

### F27.3 - Replay Player Transport

**What:** Scrub through a recorded session at 1x to 50x with pause and single-tick step, like a video editor for markets.
**How:** A player module rescheduling recorded inter-tick gaps by a speed factor, driven by a transport block bound with Spektrum data-action.

- [ ] **T27.3.1 - Player feature branch** - What: Transport work isolated from main. How: git switch -c feature/replay-player from main.
- [ ] **T27.3.2 - Player core** - What: A session loads and holds a precise playback cursor. How: createReplayPlayer() streaming chunks from IndexedDB with cursor, clock, and speed state.
- [ ] **T27.3.3 - Tick scheduling** - What: Playback pacing that mirrors the recorded market at any speed. How: nextTickDelay() scales recorded inter-tick gaps by the speed factor with a burst clamp for 50x.
- [ ] **T27.3.4 - Transport functions** - What: Play, pause, and single-tick step primitives the UI can trust. How: playReplay(), pauseReplay(), and stepTick() mutating player state through Spektrum trigger actions.
- [ ] **T27.3.5 - Speed selector** - What: Snap between 1x, 2x, 5x, 10x, 25x, 50x mid-playback. How: Button row bound data-action="setReplaySpeed" writing replay.speed consumed by nextTickDelay.
- [ ] **T27.3.6 - Seek timeline** - What: Click anywhere in the session to jump straight there. How: Hand-rolled canvas timeline mapping click x to seekToTime() using the chunk time index.
- [ ] **T27.3.7 - Transport block UI** - What: A tight one-row player: transport, speed, clock, progress. How: Grid block styled with design tokens, mono timestamps, green progress bar, orange paused state.
- [ ] **T27.3.8 - Playback hotkeys** - What: Space to pause, arrows to step, no mouse needed. How: Register replay bindings in the phase 16 hotkey registry, active only while replay.source is engaged.
- [ ] **T27.3.9 - Player unit tests** - What: Every transport function proven once, per the one-test rule. How: One Vitest test each for nextTickDelay, playReplay, pauseReplay, stepTick, seekToTime run via vitest run -t.
- [ ] **T27.3.10 - Player merge** - What: The transport ships. How: ESLint plus targeted Vitest green, merge feature/replay-player into main.

### F27.4 - Replay Pipeline Integration

**What:** Replayed ticks light up every dashboard block - charts, book, tape - exactly like live data, no forked code paths.
**How:** Emit replayed ticks into the same normalized Spektrum addValue stream the live feed uses, behind a feed.source flag.

- [ ] **T27.4.1 - Integration feature branch** - What: Pipeline wiring isolated until proven. How: git switch -c feature/replay-pipeline from main.
- [ ] **T27.4.2 - Feed source state** - What: The desk always knows whether it is watching live or replay. How: setTradeFeedSource() guarding setValue('feed.source', 'live'|'replay') transitions.
- [ ] **T27.4.3 - Replay tick emission** - What: Replay data flows down the identical pipe as OKX ticks. How: emitReplayTick() pushing through the same addValue('ticks') path the phase 11 pipeline normalizers feed.
- [ ] **T27.4.4 - Live feed mute** - What: No live ticks contaminate a replay session. How: Pause OKX v5 WebSocket channel subscriptions on replay start and restore them on exit.
- [ ] **T27.4.5 - Block compatibility pass** - What: Micro-charts, order book, and tape render replay data untouched. How: Drive each block from a recording in the Vite dev server and fix any live-only assumption found.
- [ ] **T27.4.6 - Replay mode badge** - What: Zero chance of mistaking replay for live money. How: Header chip REPLAY rendered with data-if="feed.source == 'replay'" in warning orange.
- [ ] **T27.4.7 - Clock override** - What: Time-based blocks show the recorded moment, not wall time. How: replayNow() returning the current replay timestamp, consumed wherever blocks read session time.
- [ ] **T27.4.8 - Exit replay action** - What: One click back to live with a clean slate. How: exitReplay() stops the player, clears replay state, and re-subscribes live channels atomically.
- [ ] **T27.4.9 - Integration unit tests** - What: Source switching and emission functions each verified once. How: One Vitest test per fn (setTradeFeedSource, emitReplayTick, replayNow, exitReplay) via vitest run -t.
- [ ] **T27.4.10 - Integration merge** - What: Replay powers the whole dashboard from main. How: Lint plus targeted tests green, merge feature/replay-pipeline into main.

### F27.5 - Headless Backtest Runner

**What:** Score a strategy against a recording in seconds without rendering a single pixel.
**How:** Run the phase 20 strategy engine over recorded ticks inside a Worker at maximum speed using an isolated headless Spektrum run() instance.

- [ ] **T27.5.1 - Runner feature branch** - What: Backtest engine developed off main. How: git switch -c feature/backtest-runner from main.
- [ ] **T27.5.2 - Backtest orchestrator** - What: One function call turns recording plus strategy into a result. How: runBacktest({recordingId, strategyId, params}) coordinating worker start, streaming, and result collection.
- [ ] **T27.5.3 - Worker harness** - What: Full-speed crunching that leaves the desk perfectly responsive. How: backtest-worker.js streams chunks from IndexedDB and drives the strategy loop tick by tick.
- [ ] **T27.5.4 - Headless state sandbox** - What: Backtests can never touch or dirty live desk state. How: Instantiate an isolated Spektrum state container with run() inside the worker per backtest.
- [ ] **T27.5.5 - Signal capture** - What: Every strategy entry and exit recorded with its exact tick. How: collectSignals() appending {side, price, ts, reason} entries emitted by the strategy engine hooks.
- [ ] **T27.5.6 - Progress reporting** - What: Long runs show live percent complete, not a frozen spinner. How: Worker posts progress messages throttled to 10 per second, bound to a progress bar via setValue.
- [ ] **T27.5.7 - Cancel support** - What: Abort a misconfigured run instantly without leaks. How: cancelBacktest() signals the worker via postMessage and terminates after a clean chunk boundary.
- [ ] **T27.5.8 - Backtest launcher block** - What: Pick recording, strategy, and params, hit run. How: Grid block with data-model selects and data-action="startBacktest", styled in the terminal aesthetic.
- [ ] **T27.5.9 - Runner unit tests** - What: Orchestration functions each covered exactly once. How: One Vitest test per fn (runBacktest, collectSignals, cancelBacktest) run via vitest run -t per function.
- [ ] **T27.5.10 - Runner merge** - What: Headless backtesting available on main. How: ESLint plus targeted Vitest green, merge feature/backtest-runner into main.

### F27.6 - Sim Fill Model

**What:** Fills that behave like a real venue - spread paid, latency felt, fees charged - so backtest PnL is honest.
**How:** Pure fill functions applying configurable spread, slippage, latency, and fee assumptions to strategy orders inside the backtest worker.

- [ ] **T27.6.1 - Fill model branch** - What: Fill math developed in isolation. How: git switch -c feature/sim-fill-model from main.
- [ ] **T27.6.2 - Market fill function** - What: Simulated market orders pay the spread like real ones. How: simMarketFill() filling at the opposing best price plus configured slippage bps.
- [ ] **T27.6.3 - Limit fill function** - What: Simulated limits only fill when the tape actually trades through them. How: simLimitFill() matching when a replayed print crosses the limit price.
- [ ] **T27.6.4 - Latency application** - What: Orders arrive late like they would over the wire. How: applyLatency() delaying order arrival by configured ms and filling against the tick current at arrival.
- [ ] **T27.6.5 - Size-scaled slippage** - What: Big clips cost more, exactly as in thin books. How: slippageForSize() mapping order size to extra bps via a configurable piecewise curve.
- [ ] **T27.6.6 - Fee model** - What: Net PnL includes what the venue would actually charge. How: simFees() applying taker/maker bps with OKX v5 and EToro fee presets selectable per run.
- [ ] **T27.6.7 - Fill assumptions config** - What: Assumptions are explicit, tunable, and remembered. How: Spread, latency, slippage, and fee settings block persisted via spektrum/persist under backtest.fillConfig.
- [ ] **T27.6.8 - Runner wiring** - What: Every strategy order in a backtest routes through the honest fill math. How: backtest-worker routes order intents through simMarketFill/simLimitFill with applyLatency and simFees composed.
- [ ] **T27.6.9 - Fill model unit tests** - What: Each pure fill fn pinned by exactly one test. How: One Vitest test per fn (simMarketFill, simLimitFill, applyLatency, slippageForSize, simFees) via vitest run -t.
- [ ] **T27.6.10 - Fill model merge** - What: Honest fills become the backtest default. How: Lint plus targeted tests green, merge feature/sim-fill-model into main.

### F27.7 - Backtest Results Report

**What:** One glance tells whether the strategy earns: trade list, PnL, expectancy, win rate, and max drawdown with an equity curve.
**How:** Compute statistics from sim fills with pure functions and render a report block with a hand-rolled canvas equity chart.

- [ ] **T27.7.1 - Report feature branch** - What: Reporting built off main. How: git switch -c feature/backtest-report from main.
- [ ] **T27.7.2 - Trade pairing** - What: Raw fills become readable round-trip trades. How: buildTradeList() pairing entry and exit fills into trades with side, duration, and net PnL.
- [ ] **T27.7.3 - Expectancy stats** - What: The single number scalpers care about: expected PnL per trade. How: computeExpectancy() deriving win rate, average win/loss, and expectancy from the trade list.
- [ ] **T27.7.4 - Drawdown calculation** - What: Worst-case pain quantified before real money feels it. How: computeDrawdown() tracking running equity peak-to-trough maximum drawdown.
- [ ] **T27.7.5 - Equity series** - What: The shape of the run, plottable at any resolution. How: equityCurve() producing a cumulative PnL series downsampled to a target point count.
- [ ] **T27.7.6 - Report block layout** - What: Headline stats readable in one second. How: Stat tiles for trades, net PnL, expectancy, win %, and max DD in a uniform grid block with design tokens.
- [ ] **T27.7.7 - Canvas equity chart** - What: The equity curve drawn fast and on-brand. How: Hand-rolled canvas renderer painting the curve green above zero and orange below with a zero axis line.
- [ ] **T27.7.8 - Report export** - What: Results shareable outside the app in one click. How: copyReportJson() serializing the result object to the clipboard via navigator.clipboard.writeText.
- [ ] **T27.7.9 - Report unit tests** - What: Every stat function pinned by its single test. How: One Vitest test per fn (buildTradeList, computeExpectancy, computeDrawdown, equityCurve, copyReportJson) via vitest run -t.
- [ ] **T27.7.10 - Report merge** - What: Result reporting live on main. How: ESLint plus targeted Vitest green, merge feature/backtest-report into main.

### F27.8 - Parameter Sweep

**What:** Find the sweet spot: run a whole grid of strategy parameter combos and instantly see which ones print.
**How:** Expand a parameter grid, queue backtests across a Worker pool, and tabulate per-combo results in a live sortable table.

- [ ] **T27.8.1 - Sweep feature branch** - What: Sweep machinery built in isolation. How: git switch -c feature/param-sweep from main.
- [ ] **T27.8.2 - Grid expansion** - What: Ranges become an explicit list of every combo to test. How: expandParamGrid() computing the cartesian product of per-param value ranges with a combo cap.
- [ ] **T27.8.3 - Sweep queue** - What: Combos run automatically start to finish with visible progress. How: runSweep() feeding combos to the backtest worker with a completed/total counter via setValue.
- [ ] **T27.8.4 - Worker pool concurrency** - What: Sweeps finish minutes faster on multicore machines. How: Pool sized by navigator.hardwareConcurrency runs combos in parallel backtest workers.
- [ ] **T27.8.5 - Live results state** - What: Rows appear the moment each combo finishes, not at the end. How: addValue('sweep.results', row) per completion streaming into the bound table.
- [ ] **T27.8.6 - Results table block** - What: Instantly sort combos by what matters. How: data-each table sortable by net PnL, expectancy, and drawdown via computed('sweep.view').
- [ ] **T27.8.7 - Heat coloring** - What: Winners and losers visible without reading a number. How: Cell backgrounds on a green-to-orange scale from normalized PnL via computed style bindings.
- [ ] **T27.8.8 - Apply best combo** - What: The winning params flow into the live strategy in one click. How: applyComboParams() writing the selected row's params into strategy settings via setValue, wired data-action.
- [ ] **T27.8.9 - Sweep unit tests** - What: Grid and apply functions each verified once. How: One Vitest test per fn (expandParamGrid, runSweep, applyComboParams) run via vitest run -t per function.
- [ ] **T27.8.10 - Sweep merge** - What: Parameter optimization ships. How: Lint plus targeted tests green, merge feature/param-sweep into main.

### F27.9 - Run Comparison

**What:** Two runs side by side - instantly see which strategy or parameter set behaved better and where.
**How:** Archive finished runs to IndexedDB and render pinned pairs in twin columns with overlaid canvas equity curves and stat deltas.

- [ ] **T27.9.1 - Compare feature branch** - What: Comparison view built off main. How: git switch -c feature/run-compare from main.
- [ ] **T27.9.2 - Run archive** - What: Finished backtests survive reloads for later study. How: saveRunResult() persisting result objects into an IndexedDB runs store with strategy, params, and seed.
- [ ] **T27.9.3 - Run listing** - What: Every archived run browsable with headline stats. How: listRuns() querying the runs store into a data-each picker sorted by finish time.
- [ ] **T27.9.4 - Pin to compare** - What: Any two runs snap into the comparison slots. How: pinRun() writing run ids into compare.slots state via data-action, second pin replacing the oldest.
- [ ] **T27.9.5 - Stat deltas** - What: The differences computed for you: PnL, expectancy, drawdown gaps. How: diffRunStats() producing signed deltas between slot A and slot B stat sets.
- [ ] **T27.9.6 - Twin column layout** - What: Mirrored reports readable as one comparison. How: Two stat columns with delta badges colored green for better and orange for worse, in a uniform grid block.
- [ ] **T27.9.7 - Overlay equity chart** - What: Both equity curves on one time axis tell the story instantly. How: Canvas renderer drawing both curves in distinct hues with a compact legend and shared scale.
- [ ] **T27.9.8 - Slot management** - What: Clear or swap comparisons without friction. How: clearSlot() actions plus an empty-slot hint styled in muted terminal green.
- [ ] **T27.9.9 - Compare unit tests** - What: Archive and diff functions each pinned once. How: One Vitest test per fn (saveRunResult, listRuns, pinRun, diffRunStats, clearSlot) via vitest run -t.
- [ ] **T27.9.10 - Compare merge** - What: Side-by-side analysis on main. How: ESLint plus targeted Vitest green, merge feature/run-compare into main.

### F27.10 - Deterministic Replay Harness

**What:** Same recording, same params, same seed, same result - every backtest reproducible to the tick.
**How:** A seeded PRNG behind all sim randomness plus Spektrum checkpoint/serialize snapshots hashed to verify byte-identical outcomes.

- [ ] **T27.10.1 - Determinism branch** - What: Reproducibility work isolated. How: git switch -c feature/replay-determinism from main.
- [ ] **T27.10.2 - Seeded PRNG** - What: All simulated randomness becomes replayable. How: createSeededRng() implementing mulberry32; slippage jitter and latency jitter route through it exclusively.
- [ ] **T27.10.3 - Seed plumbing** - What: Every run records its seed and can be rerun identically. How: Seed stored in run config, displayed in the report, with a rerun-with-seed data-action.
- [ ] **T27.10.4 - End-state snapshot** - What: A run's final state captured for exact comparison. How: Spektrum checkpoint() plus serialize() on the headless container at backtest completion.
- [ ] **T27.10.5 - Result hashing** - What: Two runs comparable with a single string equality. How: hashRunResult() canonicalizing the fill log JSON key order and hashing with a small FNV-1a implementation.
- [ ] **T27.10.6 - Determinism verifier** - What: Proof on screen that the sim is deterministic. How: verifyDeterminism() running one backtest twice and comparing hashes, surfaced as a green DETERMINISTIC badge.
- [ ] **T27.10.7 - Stable money math** - What: PnL that never drifts by float error between runs. How: roundToTick() and fixed-decimal accumulation helpers used across fill and stat functions.
- [ ] **T27.10.8 - Regression fixture** - What: A tiny known-good recording guards the pipeline forever. How: Commit a small JSON tick fixture and a stored expected hash loaded by the verifier's test.
- [ ] **T27.10.9 - Harness unit tests** - What: RNG, hash, and verifier functions each covered exactly once. How: One Vitest test per fn (createSeededRng, hashRunResult, verifyDeterminism, roundToTick) via vitest run -t.
- [ ] **T27.10.10 - Determinism merge** - What: Reproducible backtesting guaranteed on main. How: Lint plus targeted tests green, merge feature/replay-determinism into main.

---

## Phase 28 - Paper Trading Mode

**What:** Full-speed practice on live prices with zero risk: the same desk, the same blocks, fake fills.
**How:** A paper execution adapter implementing the phase 17 engine interface with simulated fills computed from the live OKX/EToro feed.

### F28.1 - Paper/Live Mode Switch

**What:** Flip the whole desk to risk-free paper in one click and always know exactly which mode you are in.
**How:** A trade.mode state with a header toggle and a prominent orange PAPER banner rendered via Spektrum data-if.

- [ ] **T28.1.1 - Mode switch branch** - What: Mode plumbing isolated until proven. How: git switch -c feature/paper-mode-switch from a fresh main.
- [ ] **T28.1.2 - Mode state** - What: One source of truth for paper versus live across the app. How: setValue('trade.mode', 'paper'|'live') persisted through spektrum/persist to localStorage.
- [ ] **T28.1.3 - Mode transition function** - What: Switching swaps execution safely in one atomic step. How: setTradeMode() rebinding the active execution adapter and clearing in-flight intents before flipping state.
- [ ] **T28.1.4 - Header toggle control** - What: PAPER/LIVE always one click away. How: Segmented control in the header bound with data-action="setTradeMode", styled with design-system tokens.
- [ ] **T28.1.5 - Orange paper banner** - What: Impossible to forget you are on fake money. How: Full-width PAPER TRADING strip under the header via data-if="trade.mode == 'paper'", high-contrast orange in both themes.
- [ ] **T28.1.6 - Hold-to-go-live control** - What: Going live is deliberate but still dialog-free and fast. How: 600ms press-and-hold on the LIVE segment with a filling progress ring, releasing early cancels.
- [ ] **T28.1.7 - Mode-aware accents** - What: Order entry and positions subtly restyle so peripheral vision knows the mode. How: computed('trade.isPaper') driving an orange accent class on trading blocks via :class bindings.
- [ ] **T28.1.8 - URL mode override** - What: A shared link can open the desk straight into paper. How: Parse ?mode=paper in the phase 8 URL param layer before the adapter binds at boot.
- [ ] **T28.1.9 - Switch unit tests** - What: Each mode function verified by its single test. How: One Vitest test per fn (setTradeMode, parseModeParam) run via vitest run -t targeting only that test.
- [ ] **T28.1.10 - Switch merge** - What: Mode switching ships to the desk. How: ESLint clean plus targeted Vitest green, merge feature/paper-mode-switch into main.

### F28.2 - Paper Sim Fill Engine

**What:** Fake fills that behave like real ones: markets cross the live spread, limits wait their turn in a modeled queue.
**How:** Fill functions driven by live best bid/ask and tape prints, with a queue-position model for resting limit orders.

- [ ] **T28.2.1 - Fill engine branch** - What: Fill logic developed off main. How: git switch -c feature/paper-fills from main.
- [ ] **T28.2.2 - Paper market fill** - What: Market orders pay the real live spread instantly. How: paperMarketFill() filling at the current opposing best price from the phase 11 book state plus size-based slip.
- [ ] **T28.2.3 - Resting order store** - What: Paper limits live somewhere inspectable and fast. How: paper.restingOrders state keyed by instrument with price-sorted arrays maintained by pure insert/remove fns.
- [ ] **T28.2.4 - Queue position estimate** - What: Limits do not fill the instant price touches - they wait realistically. How: queuePosition() estimating ahead-volume at the level from phase 14 order book depth.
- [ ] **T28.2.5 - Limit match on prints** - What: Resting orders fill only as real tape volume trades through them. How: paperLimitMatch() decrementing queue by each print at the level and filling once queue is consumed.
- [ ] **T28.2.6 - Partial fills** - What: Big paper orders fill in believable slices. How: Fill slices sized by print volume emitted as separate fill events via addValue('paper.fills').
- [ ] **T28.2.7 - Cancel and amend** - What: Working paper orders behave like live ones under edits. How: cancelPaperOrder() removes instantly; amendPaperOrder() re-queues at the new price with fresh queue position.
- [ ] **T28.2.8 - Fill event parity** - What: Downstream blocks cannot tell paper fills from live ones. How: Emit the exact live-engine fill event shape via Spektrum trigger so consumers stay adapter-agnostic.
- [ ] **T28.2.9 - Fill engine unit tests** - What: Every sim fill fn pinned by exactly one test. How: One Vitest test per fn (paperMarketFill, queuePosition, paperLimitMatch, cancelPaperOrder, amendPaperOrder) via vitest run -t.
- [ ] **T28.2.10 - Fill engine merge** - What: Realistic paper fills land on main. How: Lint plus targeted tests green, merge feature/paper-fills into main.

### F28.3 - Paper Balance & Equity

**What:** A believable practice account: starting cash, live-marked equity, and exposure all ticking in real time.
**How:** Paper account state updated by fill events with equity computed from live marks via Spektrum computed().

- [ ] **T28.3.1 - Account feature branch** - What: Account math isolated from main. How: git switch -c feature/paper-account from main.
- [ ] **T28.3.2 - Account state seed** - What: Every paper trader starts with clean, remembered cash. How: paper.balance defaulting to 10000 on first boot, persisted via spektrum/persist.
- [ ] **T28.3.3 - Fill-to-balance application** - What: Cash moves exactly as fills and fees dictate. How: applyFillToBalance() applying signed cash and fee deltas per paper fill event.
- [ ] **T28.3.4 - Live equity computation** - What: Equity breathes with the market tick by tick. How: computed('paper.equity') summing balance plus unrealized PnL from live mark prices.
- [ ] **T28.3.5 - Exposure metric** - What: See how leveraged the practice book is at a glance. How: computeExposure() summing open position notionals as a percentage of equity.
- [ ] **T28.3.6 - Account block** - What: Cash, equity, exposure, and session PnL in one tile. How: Uniform grid block with mono figures styled in the money-hacker terminal aesthetic for both themes.
- [ ] **T28.3.7 - Equity tick flash** - What: Changes register in peripheral vision without reading digits. How: Brief green/orange CSS flash class toggled by a Spektrum watch on paper.equity.
- [ ] **T28.3.8 - Starting balance setting** - What: Practice with the stake you actually plan to trade. How: data-model bound starting-balance field in the settings modal applied on next reset.
- [ ] **T28.3.9 - Account unit tests** - What: Balance and exposure functions each covered once. How: One Vitest test per fn (applyFillToBalance, computeExposure) run via vitest run -t per function.
- [ ] **T28.3.10 - Account merge** - What: The paper account goes live on main. How: ESLint plus targeted Vitest green, merge feature/paper-account into main.

### F28.4 - Reused Positions & PnL Blocks

**What:** Positions and live PnL blocks work identically in paper - zero relearning, zero forked UI code.
**How:** The paper adapter emits engine-standard position and fill events so the phase 18 blocks consume them unchanged.

- [ ] **T28.4.1 - Positions feature branch** - What: Adapter parity work off main. How: git switch -c feature/paper-positions from main.
- [ ] **T28.4.2 - Engine interface audit** - What: The paper adapter covers every method the desk calls. How: Enumerate the phase 17 execution interface and stub each method on the paper adapter with typed signatures.
- [ ] **T28.4.3 - Position bookkeeping** - What: Average price, size, and realized PnL tracked correctly through adds and flips. How: paperPositionUpdate() applying each fill with weighted-average and flip-through-zero logic.
- [ ] **T28.4.4 - Event name parity** - What: Downstream code needs zero paper-specific branches. How: Emit identical event names and payload shapes via trigger() as the live adapter publishes.
- [ ] **T28.4.5 - Namespaced mode state** - What: Paper and live books can never bleed into each other. How: Positions stored under paper.positions versus live.positions with the adapter writing only its own namespace.
- [ ] **T28.4.6 - View selector wiring** - What: Blocks automatically show the active mode's book. How: computed('positions.view') selecting the namespace by trade.mode, consumed by the phase 18 blocks.
- [ ] **T28.4.7 - Isolation walkthrough** - What: Confidence that flipping modes leaks nothing. How: Scripted dev-server walkthrough opening positions in both modes and asserting namespace contents via spektrum/inspect.
- [ ] **T28.4.8 - Paper row accent** - What: Paper positions recognizable at a glance inside the shared block. How: Orange left-border accent class applied through the computed isPaper flag on rendered rows.
- [ ] **T28.4.9 - Positions unit tests** - What: Bookkeeping functions each pinned by one test. How: One Vitest test per fn (paperPositionUpdate, selectPositionsView) executed via vitest run -t.
- [ ] **T28.4.10 - Positions merge** - What: Shared blocks officially serve both modes. How: Lint plus targeted tests green, merge feature/paper-positions into main.

### F28.5 - Paper Account Reset

**What:** Blown the practice account? One hold-gesture wipes it back to a fresh start in under a second.
**How:** A resetPaperAccount() function clearing paper state atomically, guarded only by a lean hold-to-confirm control.

- [ ] **T28.5.1 - Reset feature branch** - What: Reset logic isolated. How: git switch -c feature/paper-reset from main.
- [ ] **T28.5.2 - Atomic reset function** - What: Positions, resting orders, and cash return to day one all at once. How: resetPaperAccount() batching setValue clears and restoring the configured starting balance in one update.
- [ ] **T28.5.3 - Epoch stamping** - What: History from before a reset stays intact and attributable. How: newPaperEpoch() incrementing paper.epoch so prior trades remain journaled under their old epoch id.
- [ ] **T28.5.4 - Hold-to-reset control** - What: No accidental wipes, yet no confirm dialog slowing the desk. How: 600ms press-and-hold button with a filling progress ring, release-early cancels, wired via data-action.
- [ ] **T28.5.5 - Reset placement** - What: Reset findable where you need it: account block and settings. How: Mount the hold control in the paper account block plus a settings modal entry sharing one action.
- [ ] **T28.5.6 - Reset toast** - What: Clear feedback the wipe actually happened. How: Brief PAPER ACCOUNT RESET notification pushed through the phase 22 notification channel.
- [ ] **T28.5.7 - Persist flush** - What: A reload can never resurrect the dead account. How: Force a spektrum/persist write of cleared paper keys immediately after the reset batch commits.
- [ ] **T28.5.8 - Session stats restart** - What: The phase 19 HUD starts a clean sheet after reset. How: Reset emits a paper epoch event the session stats block consumes to zero its counters.
- [ ] **T28.5.9 - Reset unit tests** - What: Reset and epoch functions each verified once. How: One Vitest test per fn (resetPaperAccount, newPaperEpoch) run via vitest run -t targeting each test.
- [ ] **T28.5.10 - Reset merge** - What: Fearless practice resets available on main. How: ESLint plus targeted Vitest green, merge feature/paper-reset into main.

### F28.6 - Journal Tagging for Paper Trades

**What:** Paper trades never pollute the real record - journaled fully but clearly tagged and filterable apart.
**How:** Fill and trade events carry mode and epoch tags that the phase 25 journal stores, badges, and filters on.

- [ ] **T28.6.1 - Tagging feature branch** - What: Journal tagging isolated. How: git switch -c feature/paper-journal-tags from main.
- [ ] **T28.6.2 - Trade event tagging** - What: Every paper record self-identifies forever. How: tagTradeEvent() stamping mode:'paper' and the current epoch id onto every paper fill and trade event.
- [ ] **T28.6.3 - Journal schema extension** - What: Old journal entries keep working while new ones carry mode. How: Additive mode and epoch fields on the journal record shape with a default of 'live' for legacy rows.
- [ ] **T28.6.4 - Mode filter chips** - What: Flip the journal between ALL, LIVE, and PAPER instantly. How: Filter chips bound with data-action feeding a computed('journal.view') selector.
- [ ] **T28.6.5 - Paper row badge** - What: Paper entries unmistakable when browsing ALL. How: Compact orange P pill rendered per row via data-if on the record's mode field.
- [ ] **T28.6.6 - Default journal scope** - What: The journal opens showing the mode you are trading. How: journal.view initialized from trade.mode via computed with the chip override persisted per session.
- [ ] **T28.6.7 - Export mode column** - What: CSV exports keep paper and live separable in spreadsheets. How: Extend the journal export fn to include mode and epoch columns in the CSV header and rows.
- [ ] **T28.6.8 - Write boundary guard** - What: An untagged trade can never sneak into the journal. How: assertModeTag() validating mode presence at the journal write function and rejecting invalid records.
- [ ] **T28.6.9 - Tagging unit tests** - What: Tag and guard functions each pinned once. How: One Vitest test per fn (tagTradeEvent, assertModeTag) executed via vitest run -t per function.
- [ ] **T28.6.10 - Tagging merge** - What: Clean, tagged history ships. How: Lint plus targeted tests green, merge feature/paper-journal-tags into main.

### F28.7 - Latency Simulation

**What:** Optional realism: paper orders feel the same delay live ones would, so speed habits transfer to real trading.
**How:** Configurable artificial latency with jitter applied to paper submit, cancel, and amend, filling against the market at arrival time.

- [ ] **T28.7.1 - Latency feature branch** - What: Latency sim isolated. How: git switch -c feature/paper-latency from main.
- [ ] **T28.7.2 - Delay function** - What: Each order gets a realistic, reproducible delay. How: latencyDelay() combining base ms with jitter drawn from the phase 27 createSeededRng.
- [ ] **T28.7.3 - Order path hook** - What: Submit, cancel, and amend all feel the wire. How: The paper adapter defers each action's effect by latencyDelay() using a scheduled timeout queue.
- [ ] **T28.7.4 - Auto preset from live** - What: Realism without configuration: match your actual measured latency. How: Auto mode reads the rolling OKX round-trip metric from phase 29 as the base delay.
- [ ] **T28.7.5 - Latency settings UI** - What: Off, auto, or a custom millisecond value in one control. How: Settings modal group with data-model bound slider and mode radio persisted via spektrum/persist.
- [ ] **T28.7.6 - In-flight order state** - What: Delayed paper orders look pending exactly like live ones. How: Orders enter the same in-flight visual state in the order entry block until the delayed fill event lands.
- [ ] **T28.7.7 - Fill at arrival price** - What: A moving market punishes slow orders honestly. How: Fill price computed from the tick current at arrival time, not submit time, inside the deferred handler.
- [ ] **T28.7.8 - Latency HUD chip** - What: Always visible when artificial delay is shaping fills. How: Small HUD chip showing the active sim latency in ms, hidden via data-if when off.
- [ ] **T28.7.9 - Latency unit tests** - What: Delay and arrival-fill functions each covered once. How: One Vitest test per fn (latencyDelay, fillAtArrival) run via vitest run -t targeting each.
- [ ] **T28.7.10 - Latency merge** - What: Realistic timing ships as an option. How: ESLint plus targeted Vitest green, merge feature/paper-latency into main.

### F28.8 - Paper vs Live Comparison

**What:** See whether practice is translating: paper and live performance side by side over any date range.
**How:** A comparison block computing per-mode statistics from tagged journal records with dual canvas equity curves.

- [ ] **T28.8.1 - Comparison feature branch** - What: Comparison view off main. How: git switch -c feature/paper-vs-live from main.
- [ ] **T28.8.2 - Per-mode stats** - What: The same honest numbers computed for each mode. How: statsByMode() aggregating tagged journal trades into PnL, win rate, expectancy, and average hold per mode.
- [ ] **T28.8.3 - Date range state** - What: Compare today, this week, this month, or everything. How: Range chips (1D/7D/30D/ALL) bound via data-action writing compare.range consumed by statsByMode.
- [ ] **T28.8.4 - Twin stat columns** - What: Paper and live readable as one honest scoreboard. How: Mirrored columns headed PAPER in orange and LIVE in green inside a uniform grid block.
- [ ] **T28.8.5 - Delta highlights** - What: Where practice beats reality jumps out immediately. How: Signed delta badges per stat row computed by diffModeStats() with green/orange coloring.
- [ ] **T28.8.6 - Dual equity curves** - What: Both journeys on one chart tell the transfer story. How: Hand-rolled canvas renderer drawing both cumulative curves with hover crosshair readout.
- [ ] **T28.8.7 - Small-sample hint** - What: No false conclusions from five trades. How: computed hint shown via data-if when either mode has fewer than 20 trades in range.
- [ ] **T28.8.8 - Empty live state** - What: Paper-only users see encouragement, not a broken block. How: Friendly go-live nudge layout rendered when zero live trades exist in range.
- [ ] **T28.8.9 - Comparison unit tests** - What: Stat and diff functions each pinned once. How: One Vitest test per fn (statsByMode, diffModeStats) executed via vitest run -t per function.
- [ ] **T28.8.10 - Comparison merge** - What: The transfer scoreboard ships. How: Lint plus targeted tests green, merge feature/paper-vs-live into main.

### F28.9 - Paper-First Onboarding

**What:** Every new user starts safely in paper mode - the first trade on STOCKZ is always a free one.
**How:** Boot logic defaults trade.mode to paper when no stored choice exists, with a one-time dismissible intro hint on the banner.

- [ ] **T28.9.1 - Onboarding feature branch** - What: Boot defaults isolated. How: git switch -c feature/paper-onboarding from main.
- [ ] **T28.9.2 - Initial mode resolver** - What: New users land in paper; returning users keep their choice. How: resolveInitialMode() returning 'paper' when the persisted mode key is absent, else the stored value.
- [ ] **T28.9.3 - Boot sequence wiring** - What: The right adapter binds before the first order can exist. How: Resolve mode in the main.js boot sequence ahead of execution adapter binding and bindDOM.
- [ ] **T28.9.4 - Precedence rules** - What: Overrides behave predictably: URL beats stored beats default. How: Document and implement URL param > persisted setting > paper default inside resolveInitialMode.
- [ ] **T28.9.5 - Go-live key gate** - What: Nobody reaches live mode without working venue keys. How: Hold-to-go-live checks phase 8 key presence and routes to the key modal when OKX/EToro keys are missing.
- [ ] **T28.9.6 - First-run hint** - What: Newcomers instantly understand the orange banner and how to go live. How: One-time dismissible callout attached to the paper banner with terse money-hacker microcopy.
- [ ] **T28.9.7 - Hint dismissal memory** - What: The hint never nags twice. How: Dismissal flag persisted via spektrum/persist and gated with data-if on the flag.
- [ ] **T28.9.8 - Onboarding polish** - What: The first minute looks sharp in both themes. How: Style the hint and gate flows with design tokens, verifying day and night contrast in the Vite dev server.
- [ ] **T28.9.9 - Onboarding unit tests** - What: Resolver and gate functions each verified once. How: One Vitest test per fn (resolveInitialMode, checkLiveKeyGate) run via vitest run -t targeting each.
- [ ] **T28.9.10 - Onboarding merge** - What: Safe-by-default first sessions ship. How: ESLint plus targeted Vitest green, merge feature/paper-onboarding into main.

### F28.10 - Paper Engine Hardening

**What:** Edge cases that break lesser sims - crossed books, price gaps, stalled feeds - handled cleanly so practice never lies.
**How:** Guard functions for degenerate market states plus a seeded scripted-market fixture proving paper fills deterministically end to end.

- [ ] **T28.10.1 - Hardening feature branch** - What: Edge-case work isolated. How: git switch -c feature/paper-hardening from main.
- [ ] **T28.10.2 - Crossed book guard** - What: No fantasy fills from momentarily crossed or locked books. How: isCrossedBook() detecting bid >= ask and deferring paper fills until the book is sane.
- [ ] **T28.10.3 - Gap fill handling** - What: Market orders through a price gap fill at the gapped price, not a stale quote. How: gapFill() selecting the post-gap best price when the book jumps beyond the last quote.
- [ ] **T28.10.4 - Feed stall guard** - What: A frozen feed cannot mint fills from dead prices. How: feedStallGuard() parking paper matching after N seconds without ticks and showing a stall chip via data-if.
- [ ] **T28.10.5 - Scripted market fixture** - What: A deterministic mini-market to interrogate the engine. How: Commit a JSON tick-and-book script fixture exercising spreads, gaps, prints, and stalls.
- [ ] **T28.10.6 - Seeded sim randomness** - What: Paper jitter and slip reproduce exactly under a seed. How: Route all paper randomness through the phase 27 createSeededRng with the seed held in paper state.
- [ ] **T28.10.7 - Scenario runner** - What: Whole-engine behavior assertable as data, not clicks. How: runScriptedScenario() feeding the fixture through the paper adapter and returning the ordered fill log.
- [ ] **T28.10.8 - Boundary math helpers** - What: Zero-size and sub-tick orders resolve predictably everywhere. How: Reuse roundToTick() from phase 27 plus a rejectDegenerateOrder() validator at the adapter entry.
- [ ] **T28.10.9 - Hardening unit tests** - What: Every guard and scenario fn pinned by exactly one test. How: One Vitest test per fn (isCrossedBook, gapFill, feedStallGuard, runScriptedScenario, rejectDegenerateOrder) via vitest run -t.
- [ ] **T28.10.10 - Hardening merge** - What: A sim that never lies lands on main. How: Lint plus targeted tests green, merge feature/paper-hardening into main.

---

## Phase 29 - Latency & Rendering Optimization

**What:** Sub-frame snappiness under fire: the desk never lags a busy tape, even during flood-level tick bursts.
**How:** Profile with Chrome DevTools and an in-app meter, then move parsing to Web Workers, coalesce via rAF, window long lists, cache canvas layers, and pool objects.

### F29.1 - Perf Budget & Frame Meter

**What:** Traders and devs see live FPS/frame-time and know exactly which budget every block must hit.
**How:** Write docs/perf-budget.md, build a rAF-based frame meter as a Spektrum system, and render it as an optional HUD block styled in the money-hacker palette.

- [ ] **T29.1.1 - Branch perf-budget-meter** - What: Isolated line for the meter work. How: git checkout -b feature/perf-budget-meter from a fresh main pull.
- [ ] **T29.1.2 - Author perf budget doc** - What: Written targets everyone optimizes against. How: Create docs/perf-budget.md with 16ms frame, 50ms input latency, and 200KB gzip bundle budgets per block.
- [ ] **T29.1.3 - Build measureFrameTime fn** - What: Accurate per-frame timing source. How: Implement measureFrameTime() computing rolling deltas between requestAnimationFrame timestamps.
- [ ] **T29.1.4 - Build formatFrameMs fn** - What: Readable meter labels like 16.7ms/60fps. How: Implement formatFrameMs(ms) returning fixed-width strings for the HUD display.
- [ ] **T29.1.5 - Register fpsMeter Spektrum system** - What: Meter values flow through app state like everything else. How: addSystem('fpsMeter') calling setValue('perf.fps') and setValue('perf.frameMs') once per second.
- [ ] **T29.1.6 - Meter block markup** - What: A grid block showing live fps and frame time. How: Add blocks/perf-meter.html with {{perf.fps}} bindings and data-if over-budget warning rows, wired via bindDOM.
- [ ] **T29.1.7 - Style meter with budget states** - What: Instant visual read: green good, orange warm, red over budget. How: CSS classes toggled by :class bindings against docs/perf-budget.md thresholds in both day/night themes.
- [ ] **T29.1.8 - Long task observer** - What: Jank over 50ms is captured, not guessed. How: Register a PerformanceObserver for longtask entries and addValue('perf.longTasks') with duration and timestamp.
- [ ] **T29.1.9 - Meter visibility setting** - What: Traders hide the meter when not tuning. How: Settings toggle bound with data-model persisted through spektrum/persist to localStorage.
- [ ] **T29.1.10 - Single tests and merge** - What: Feature lands green on main. How: Write one Vitest test each for measureFrameTime and formatFrameMs, run vitest -t per fn, then merge feature/perf-budget-meter to main.

### F29.2 - Worker Feed Parsing

**What:** Heavy WS JSON parsing leaves the main thread, so the UI stays responsive during tick storms.
**How:** Move OKX and EToro payload parsing into a Vite module Web Worker with a typed postMessage bridge and per-frame batching.

- [ ] **T29.2.1 - Branch worker-feed-parsing** - What: Safe workspace for the worker migration. How: git checkout -b feature/worker-feed-parsing from main.
- [ ] **T29.2.2 - Scaffold feed parser worker** - What: A dedicated parsing thread exists. How: Create src/workers/feed-parser.worker.js loaded via new Worker(new URL(...), {type:'module'}) so Vite bundles it.
- [ ] **T29.2.3 - Move parseOkxFrame into worker** - What: OKX v5 WS frames decode off-thread. How: Relocate parseOkxFrame(json) for tickers/books channels into the worker and delete the main-thread copy.
- [ ] **T29.2.4 - Move parseEtoroPayload into worker** - What: EToro REST payload decoding also leaves the main thread. How: Relocate parseEtoroPayload(json) into the same worker behind a message kind switch.
- [ ] **T29.2.5 - Define bridge message protocol** - What: Predictable worker traffic that never surprises consumers. How: Implement makeFeedMessage(kind, payload) with kinds parse-okx, parse-etoro, batch-out, parse-error.
- [ ] **T29.2.6 - Batch worker output per frame** - What: One message per frame instead of thousands. How: Buffer parsed ticks in the worker and flush arrays on a 16ms setTimeout cadence matched to rAF.
- [ ] **T29.2.7 - Wire main-thread applier** - What: Parsed batches land in Spektrum state. How: onmessage handler feeds batch-out arrays into addValue('feed.ticks') behind the existing pipeline entry point.
- [ ] **T29.2.8 - Error and malformed-frame channel** - What: Bad frames are counted, never crash the desk. How: worker onerror plus parse-error messages incrementing setValue('feed.parseErrors') shown on the perf meter.
- [ ] **T29.2.9 - Inline fallback path** - What: Desk still runs where Workers are blocked. How: Feature-detect Worker support and lazy-import the same parse fns on the main thread as fallback.
- [ ] **T29.2.10 - Single tests and merge** - What: Worker parsing ships verified. How: One Vitest test each for parseOkxFrame, parseEtoroPayload, makeFeedMessage via vitest -t, then merge feature/worker-feed-parsing to main.

### F29.3 - Transferable Message Strategy

**What:** Worker-to-main handoff is zero-copy, so big tick batches cost microseconds instead of clone time.
**How:** Pack tick batches into Float64Array buffers and postMessage them as transferables, with buffer recycling back to the worker.

- [ ] **T29.3.1 - Branch transferable-strategy** - What: Isolated buffer-protocol work. How: git checkout -b feature/transferable-strategy from main.
- [ ] **T29.3.2 - Clone vs transfer benchmark page** - What: A measured basis for the strategy, not folklore. How: Add bench/clone-vs-transfer.html timing postMessage RTT for structured clone vs transferred ArrayBuffers at 1k/10k ticks.
- [ ] **T29.3.3 - Build encodeTickBuffer fn** - What: Ticks become a compact binary batch. How: Implement encodeTickBuffer(ticks) packing ts/price/size/side into a Float64Array with a fixed stride.
- [ ] **T29.3.4 - Build decodeTickBuffer fn** - What: Main thread reads batches without JSON cost. How: Implement decodeTickBuffer(buffer) yielding tick views using the same stride constants module.
- [ ] **T29.3.5 - Switch bridge to transferables** - What: Zero-copy delivery is the default path. How: Change worker flush to postMessage({kind:'batch-out', buffer}, [buffer]) and update the main-thread applier to decode.
- [ ] **T29.3.6 - Recycle buffers to the worker** - What: No per-batch ArrayBuffer allocation churn. How: Main thread posts consumed buffers back with a recycle kind; worker keeps a small free-list to refill.
- [ ] **T29.3.7 - Structured-clone fallback** - What: Odd browsers still get data, just slower. How: try/catch around transfer; on DataCloneError fall back to plain array clone and set a perf.transferFallback flag.
- [ ] **T29.3.8 - Zero-copy dev assertion** - What: Regressions in transfer are caught immediately. How: In dev builds assert buffer.byteLength === 0 after postMessage and console.warn with the offending kind.
- [ ] **T29.3.9 - Single tests for codec fns** - What: The binary protocol is locked by tests. How: One Vitest test each for encodeTickBuffer and decodeTickBuffer round-tripping a fixture batch, run via vitest -t.
- [ ] **T29.3.10 - Flood verify and merge** - What: Strategy proven under load and landed. How: Run the bench page against a replayed OKX flood, record numbers in docs/perf-budget.md, merge feature/transferable-strategy to main.

### F29.4 - rAF Flush Coalescing

**What:** All state mutations paint at most once per frame, so a thousand ticks cost one DOM update.
**How:** Audit every Spektrum setValue/addValue site and route hot-path writes through a single scheduleFlush that triggers refresh once per requestAnimationFrame.

- [ ] **T29.4.1 - Branch raf-coalescing** - What: Contained refactor of flush timing. How: git checkout -b feature/raf-coalescing from main.
- [ ] **T29.4.2 - Inventory mutation call sites** - What: A complete map of who writes state and when. How: grep all setValue/addValue/trigger call sites into docs/flush-audit.md tagged hot-path or cold-path.
- [ ] **T29.4.3 - Build scheduleFlush fn** - What: One choke point for frame-aligned updates. How: Implement scheduleFlush(mutate) queueing closures and draining them in a single rAF callback ending with Spektrum refresh().
- [ ] **T29.4.4 - Route feed appliers through scheduleFlush** - What: Tick batches stop causing mid-frame repaints. How: Wrap the worker batch applier and book/tape writers in scheduleFlush instead of direct setValue calls.
- [ ] **T29.4.5 - Keep inputs immediate** - What: Order entry still feels instant, never a frame late. How: Document and enforce that data-action handlers write synchronously; only feed-driven paths use scheduleFlush.
- [ ] **T29.4.6 - Batch DOM reads before writes** - What: No layout thrash on resize-heavy paths. How: Refactor chart resize handlers to read getBoundingClientRect for all canvases first, then apply writes in one pass.
- [ ] **T29.4.7 - Devtools frame verification** - What: Proof of one refresh per frame. How: Use spektrum/devtools timeline during a replay flood and screenshot a 60-frame window into the flush audit doc.
- [ ] **T29.4.8 - Coalescing drop counter** - What: Visibility into how much work coalescing saves. How: Count queued vs executed flushes and expose perf.coalesced on the frame meter block.
- [ ] **T29.4.9 - Single test for scheduleFlush** - What: Flush semantics guaranteed by a test. How: One Vitest test for scheduleFlush using a mocked requestAnimationFrame asserting single drain per frame, run via vitest -t.
- [ ] **T29.4.10 - Replay verify and merge** - What: Coalescing lands proven. How: Drive spektrum replay of a recorded burst, confirm frame meter stays under budget, merge feature/raf-coalescing to main.

### F29.5 - Windowed List Rendering

**What:** Tape, book, and journal scroll like glass with 10k rows because only visible rows exist in the DOM.
**How:** Build a computeWindow slice fn and refactor the long lists to Spektrum data-each over a computed visible slice with spacer elements.

- [ ] **T29.5.1 - Branch windowed-lists** - What: Isolated list-virtualization work. How: git checkout -b feature/windowed-lists from main.
- [ ] **T29.5.2 - Build computeWindow fn** - What: The one function deciding which rows render. How: Implement computeWindow(scrollTop, rowHeight, viewportHeight, total, overscan) returning {start, end, padTop, padBottom}.
- [ ] **T29.5.3 - Window the tape list** - What: Time-and-sales stays smooth at full flood. How: Bind tape scroll to setValue('tape.scrollTop') and drive data-each from a computed slice using computeWindow.
- [ ] **T29.5.4 - Audit and window book overflow** - What: Deep-book views beyond the fixed 25 levels stay cheap. How: Apply the same computed-slice pattern to the expanded order book depth view.
- [ ] **T29.5.5 - Window the journal list** - What: Months of trade history scroll instantly. How: Refactor journal rows to windowed data-each with padTop/padBottom spacer divs preserving native scrollbar size.
- [ ] **T29.5.6 - Tune overscan constant** - What: No blank flashes when flinging. How: Test overscan values 3/5/8 rows under fast wheel scroll and fix the winner as a named constant.
- [ ] **T29.5.7 - Keyed row recycling** - What: Row nodes are reused, not recreated. How: Use keyed data-each on stable tick/trade ids so Spektrum patches text instead of replacing elements.
- [ ] **T29.5.8 - Scroll position restore** - What: Returning to a block lands where the trader left it. How: Persist journal scrollTop through spektrum/persist and reapply on block mount.
- [ ] **T29.5.9 - Single test for computeWindow** - What: Slice math is provably correct at edges. How: One Vitest test for computeWindow covering top, bottom, and overscan-clamped cases, run via vitest -t.
- [ ] **T29.5.10 - Jank verify and merge** - What: Windowing ships with evidence. How: Fling a 10k-entry journal while watching the longtask counter stay at zero, then merge feature/windowed-lists to main.

### F29.6 - Canvas Layer Caching

**What:** Charts repaint only the moving price, so static grids and axes cost nothing per tick.
**How:** Split each chart into stacked static and dynamic canvases, cache the static layer to an offscreen canvas, and blit it with drawImage under a dirty-flag.

- [ ] **T29.6.1 - Branch canvas-layer-cache** - What: Contained chart renderer surgery. How: git checkout -b feature/canvas-layer-cache from main.
- [ ] **T29.6.2 - Stack static and dynamic canvases** - What: Two layers, one visual chart. How: Render axes/gridlines on a lower canvas and price/ticks on an absolutely positioned upper canvas per chart block.
- [ ] **T29.6.3 - Build renderStaticLayer fn** - What: Grid drawing isolated into one cacheable call. How: Implement renderStaticLayer(ctx, scale, theme) drawing axes, gridlines, and labels only.
- [ ] **T29.6.4 - Offscreen cache and blit** - What: Static pixels drawn once, copied thereafter. How: Paint renderStaticLayer into a cached OffscreenCanvas and drawImage-blit it on frames that only move price.
- [ ] **T29.6.5 - Build shouldRedrawStatic fn** - What: Cache invalidates exactly when needed. How: Implement shouldRedrawStatic(prev, next) comparing scale, size, and theme, called before every blit.
- [ ] **T29.6.6 - Invalidate on zoom and theme** - What: No stale grids after zoom or day/night flips. How: watch('chart.scale') and watch('theme.mode') to flip the dirty flag feeding shouldRedrawStatic.
- [ ] **T29.6.7 - devicePixelRatio-aware cache** - What: Crisp grids on retina without repaint cost. How: Size the offscreen cache at cssSize * devicePixelRatio and re-cache on dpr change via matchMedia resolution listener.
- [ ] **T29.6.8 - Sparkline Path2D reuse** - What: Micro-chart strokes stop rebuilding every frame. How: Cache each sparkline as a Path2D, appending only the newest segment and re-stroking the cached path.
- [ ] **T29.6.9 - Single test for shouldRedrawStatic** - What: Invalidation logic is pinned by a test. How: One Vitest test for shouldRedrawStatic covering scale, resize, and theme deltas, run via vitest -t.
- [ ] **T29.6.10 - Paint-profile verify and merge** - What: Caching proven in the profiler and landed. How: Record a DevTools paint profile showing the static layer untouched across 300 tick frames, merge feature/canvas-layer-cache to main.

### F29.7 - Tick Object Pools

**What:** Tick flood stops triggering GC pauses because tick objects are recycled instead of allocated.
**How:** Build a generic createPool with acquire/release, route feed decode through it, and sweep-release consumed ticks at frame end.

- [ ] **T29.7.1 - Branch tick-object-pool** - What: Isolated allocation-discipline work. How: git checkout -b feature/tick-object-pool from main.
- [ ] **T29.7.2 - Build createPool fn** - What: One reusable pool primitive for the codebase. How: Implement createPool(factory, reset, maxSize) returning {acquire, release, stats} backed by a plain array free-list.
- [ ] **T29.7.3 - Define tick reset fn** - What: Recycled ticks never leak stale fields. How: Implement resetTick(tick) zeroing ts/price/size/side/venue before a tick returns to the free-list.
- [ ] **T29.7.4 - Acquire in decode path** - What: Hot path allocates zero literals. How: Change decodeTickBuffer to fill pool-acquired tick objects instead of creating object literals per row.
- [ ] **T29.7.5 - Frame-end release sweep** - What: Ticks return to the pool the moment consumers are done. How: After chart/tape appliers run in the scheduleFlush drain, release the frame's tick batch back to the pool.
- [ ] **T29.7.6 - Cap and overflow policy** - What: Pool never becomes its own memory leak. How: Enforce maxSize in release, discarding overflow objects so bursts cannot grow the free-list unbounded.
- [ ] **T29.7.7 - Pool stats on perf meter** - What: Hit-rate visibility for tuning pool size. How: Expose pool stats via setValue('perf.poolHitRate') rendered as a row on the perf meter block.
- [ ] **T29.7.8 - Single tests for pool fns** - What: Pool contract locked down. How: One Vitest test each for createPool and resetTick covering acquire-release-reuse and overflow discard, run via vitest -t.
- [ ] **T29.7.9 - GC pressure verify** - What: Proof the pool actually cuts collections. How: Compare DevTools allocation-sampling profiles before/after during a replay flood and note minor-GC counts in docs/perf-budget.md.
- [ ] **T29.7.10 - Merge tick-object-pool** - What: Pooling lands green on main. How: Confirm targeted Vitest runs pass and ESLint is clean, then merge feature/tick-object-pool to main.

### F29.8 - Bundle Budget & Code Splitting

**What:** First paint stays fast because heavy blocks load lazily and the core bundle has an enforced size ceiling.
**How:** Split replay/analytics/backtesting behind dynamic import(), tune Vite manualChunks, and gate size with a Node check script against the budget doc.

- [ ] **T29.8.1 - Branch bundle-splitting** - What: Isolated build-shape work. How: git checkout -b feature/bundle-splitting from main.
- [ ] **T29.8.2 - Visualize current bundle** - What: A truthful picture of what weighs what. How: Add rollup-plugin-visualizer to vite.config.js and commit the treemap findings into docs/perf-budget.md.
- [ ] **T29.8.3 - Lazy-load replay block** - What: Market replay code costs nothing until opened. How: Convert the replay block entry to dynamic import('./blocks/replay.js') triggered by its nav data-action.
- [ ] **T29.8.4 - Lazy-load analytics and backtest blocks** - What: Two more heavy blocks off the critical path. How: Apply the same dynamic import pattern to analytics and backtesting block entry modules.
- [ ] **T29.8.5 - Tune manualChunks** - What: Stable chunk boundaries and better caching. How: Configure build.rollupOptions.output.manualChunks in vite.config.js grouping workers and chart renderers.
- [ ] **T29.8.6 - Build parseSizeReport fn** - What: Machine-readable sizes from the build output. How: Implement parseSizeReport(distDir) in scripts/check-size.js returning gzip sizes per chunk via Node zlib.
- [ ] **T29.8.7 - Wire npm run size gate** - What: Over-budget builds fail loudly before deploy. How: Add a size script running vite build then check-size.js comparing against budgets and exiting non-zero on breach.
- [ ] **T29.8.8 - Prune dead exports** - What: Tree-shaking actually removes unused code. How: Fix ESLint no-unused-vars findings and side-effect flags in package.json so Rollup drops dead modules.
- [ ] **T29.8.9 - Modulepreload critical chunks** - What: Lazy splits never add first-interaction latency. How: Add link rel=modulepreload tags for the core state and grid chunks in index.html.
- [ ] **T29.8.10 - Single test and merge** - What: Size gate is tested and the split ships. How: One Vitest test for parseSizeReport against a fixture dist dir via vitest -t, confirm npm run size passes, merge feature/bundle-splitting to main.

### F29.9 - Hidden-Tab Degraded Mode

**What:** A backgrounded desk sips CPU and battery, then snaps back to full rate the instant the trader returns.
**How:** Watch document.visibilitychange, throttle feed applies to 1Hz and pause canvas rAF loops while hidden, with an instant full refresh on return.

- [ ] **T29.9.1 - Branch hidden-tab-mode** - What: Contained degraded-mode work. How: git checkout -b feature/hidden-tab-mode from main.
- [ ] **T29.9.2 - Visibility watcher system** - What: App state knows when nobody is looking. How: addSystem listening to document visibilitychange and calling setValue('ui.tabHidden', document.hidden).
- [ ] **T29.9.3 - Build computeUpdateInterval fn** - What: One place decides the degraded cadence. How: Implement computeUpdateInterval(tabHidden) returning 16ms visible and 1000ms hidden for the flush scheduler.
- [ ] **T29.9.4 - Throttle flush scheduler when hidden** - What: Background CPU drops to near zero. How: Have scheduleFlush switch from rAF to a setTimeout at computeUpdateInterval when ui.tabHidden is true.
- [ ] **T29.9.5 - Pause canvas render loops** - What: No invisible pixels get painted. How: Guard chart and sparkline rAF loops on ui.tabHidden via watch, cancelling pending frames on hide.
- [ ] **T29.9.6 - Snapshot-coalesce book updates** - What: Order book memory stays flat while hidden. How: In the worker, collapse hidden-tab book deltas into a latest-state snapshot instead of queueing every update.
- [ ] **T29.9.7 - Keep alert evaluation live** - What: Price alerts still fire from a background tab. How: Confirm alert-condition checks run in the feed worker path, untouched by the main-thread throttle, with a regression note in docs.
- [ ] **T29.9.8 - Instant catch-up on return** - What: Zero stale frames when the tab refocuses. How: On visibilitychange to visible, apply the coalesced snapshot, call refresh(), and flash a brief resume indicator styled orange.
- [ ] **T29.9.9 - Single test for computeUpdateInterval** - What: Degrade decision is test-locked. How: One Vitest test for computeUpdateInterval asserting both cadences, run via vitest -t.
- [ ] **T29.9.10 - CPU verify and merge** - What: Degraded mode ships with measured savings. How: Compare Chrome Task Manager CPU for the hidden tab before/after, record in docs/perf-budget.md, merge feature/hidden-tab-mode to main.

### F29.10 - Profiling Pass & Fix Sprint

**What:** The whole desk is measured end-to-end against the budget doc and every red number gets fixed before ship.
**How:** Drive a deterministic flood from recorded IndexedDB ticks via spektrum replay, profile with DevTools Performance and heap snapshots, and fix top hotspots.

- [ ] **T29.10.1 - Branch profiling-pass** - What: Dedicated line for the tuning sprint. How: git checkout -b feature/profiling-pass from main.
- [ ] **T29.10.2 - Build deterministic load harness** - What: Repeatable flood so before/after numbers mean something. How: Implement loadFloodRecording(name) streaming a saved IndexedDB tick recording through spektrum replay at 10x speed.
- [ ] **T29.10.3 - Record baseline traces** - What: A frozen starting point for the sprint. How: Capture DevTools Performance traces and heap snapshots of the flood scenario and store the summary numbers in docs/perf-budget.md.
- [ ] **T29.10.4 - Fix top main-thread hotspot** - What: The single worst frame cost is eliminated. How: Take the heaviest self-time fn from the trace, optimize it, and re-trace to confirm the win.
- [ ] **T29.10.5 - Fix second and third hotspots** - What: The next two offenders fall too. How: Repeat the optimize-and-retrace loop for hotspots two and three, one commit each.
- [ ] **T29.10.6 - Fix top memory retainer** - What: The biggest leak or hoard is closed. How: Diff two heap snapshots across a 5-minute flood, chase the largest growing retainer path, and fix its lifecycle.
- [ ] **T29.10.7 - Hot-path lint guards** - What: Accidental slowdowns cannot sneak back in. How: Add ESLint no-console and no-restricted-syntax rules scoped to src/workers and renderer modules.
- [ ] **T29.10.8 - Before/after results table** - What: A signed-off scoreboard of the phase. How: Extend docs/perf-budget.md with a table of baseline vs final fps, frame-ms, GC count, and bundle size.
- [ ] **T29.10.9 - Single tests for sprint helpers** - What: Every fn introduced by fixes gets its one test. How: Write one Vitest test each for loadFloodRecording and any helper fns added in T29.10.4-6, run via vitest -t per fn.
- [ ] **T29.10.10 - Final budget gate and merge** - What: Phase exits with every budget green. How: Run the flood with the perf meter and npm run size, confirm all budgets pass, merge feature/profiling-pass to main.

---

## Phase 30 - Build, GitHub Pages Deploy & Release

**What:** One command from code to live URL: the desk ships to GitHub Pages with no CI dependency and a clean rollback story.
**How:** Vite production build plus the gh-pages npm package publishing dist from a local npm run deploy - explicitly no GitHub Actions anywhere.

### F30.1 - Vite Production Build Config

**What:** A reproducible production build whose asset URLs resolve correctly under the GitHub Pages base path.
**How:** Configure vite.config.js with the Pages base, es2022 target, worker bundling, and a build-output secret scan, verified through vite preview.

- [ ] **T30.1.1 - Branch vite-prod-build** - What: Isolated build-config work. How: git checkout -b feature/vite-prod-build from main.
- [ ] **T30.1.2 - Set Pages base path** - What: Assets load from /stockz/ instead of 404ing at the domain root. How: Set base '/stockz/' in vite.config.js sourced from a STOCKZ_BASE env default via loadEnv.
- [ ] **T30.1.3 - Build resolveBaseHref fn** - What: Runtime code computes correct links under any base. How: Implement resolveBaseHref() reading import.meta.env.BASE_URL for router and asset URL construction.
- [ ] **T30.1.4 - Pin build target es2022** - What: Modern output with no legacy transpile bloat. How: Set build.target 'es2022' and esbuild minify in vite.config.js, confirming top-level await in workers survives.
- [ ] **T30.1.5 - Verify worker chunk emission** - What: Feed-parser worker keeps working on the live site. How: Run vite build and confirm the module worker chunk lands in dist/assets with a base-prefixed URL.
- [ ] **T30.1.6 - Sourcemap policy** - What: Debuggable errors without shipping readable source. How: Set build.sourcemap 'hidden' so maps emit to dist but no sourceMappingURL comment reaches browsers.
- [ ] **T30.1.7 - Secret scan of dist** - What: Guarantee no OKX/EToro key values ever reach the bundle. How: Add scripts/scan-dist.js grepping dist for STOCKZ_OKX/STOCKZ_ETORO values from .env and failing the build on any hit.
- [ ] **T30.1.8 - Preview smoke run** - What: The exact production artifact proven locally. How: Run vite preview against dist and click through grid, header nav, and theme toggle under the /stockz/ base.
- [ ] **T30.1.9 - Single tests for build fns** - What: Each new fn ships with its one test. How: One Vitest test each for resolveBaseHref and the scan-dist matcher fn, run via vitest -t per fn.
- [ ] **T30.1.10 - Merge vite-prod-build** - What: Build config lands green on main. How: Confirm npm run build passes with scan clean, then merge feature/vite-prod-build to main.

### F30.2 - gh-pages Deploy Command

**What:** npm run deploy publishes the desk to the live URL from any operator's machine, no CI involved.
**How:** Install the gh-pages npm package, wire predeploy/deploy scripts pushing dist to the gh-pages branch, and guard against dirty-tree deploys.

- [ ] **T30.2.1 - Branch ghpages-deploy** - What: Isolated deploy-tooling work. How: git checkout -b feature/ghpages-deploy from main.
- [ ] **T30.2.2 - Install gh-pages package** - What: The publish mechanism exists locally. How: npm install --save-dev gh-pages and commit the package.json/package-lock.json change.
- [ ] **T30.2.3 - Wire deploy scripts** - What: One memorable command builds and ships. How: Add "predeploy": "npm run build" and "deploy": "gh-pages -d dist" to package.json scripts.
- [ ] **T30.2.4 - Emit .nojekyll marker** - What: Pages serves every dist file untouched by Jekyll. How: Add an empty public/.nojekyll so Vite copies it into dist on every build.
- [ ] **T30.2.5 - Build buildDeployMessage fn** - What: Every gh-pages commit is traceable to a version. How: Implement buildDeployMessage(pkgVersion, shortSha) returning "deploy vX.Y.Z (sha)" passed via gh-pages -m.
- [ ] **T30.2.6 - Build checkCleanTree guard** - What: Half-committed code can never reach production. How: Implement checkCleanTree() in scripts/deploy-guard.js running git status --porcelain and exiting non-zero when dirty.
- [ ] **T30.2.7 - Chain guard into predeploy** - What: The guard runs automatically, not by memory. How: Prepend node scripts/deploy-guard.js to the predeploy script before npm run build.
- [ ] **T30.2.8 - First live deploy** - What: The desk exists at its public URL. How: Run npm run deploy, enable Pages on the gh-pages branch in repo settings, and load the live /stockz/ URL.
- [ ] **T30.2.9 - Single tests for deploy fns** - What: Deploy helpers are test-locked. How: One Vitest test each for buildDeployMessage and checkCleanTree (mocking execSync), run via vitest -t per fn.
- [ ] **T30.2.10 - Merge ghpages-deploy** - What: The deploy path lands on main. How: Verify the live URL serves the latest build, then merge feature/ghpages-deploy to main.

### F30.3 - SPA 404 Fallback Routing

**What:** Deep links and refreshes on any route load the app instead of the GitHub Pages 404 page.
**How:** Ship a 404.html that stashes the requested path in sessionStorage and redirects to index, where a restore fn replays the route with params intact.

- [ ] **T30.3.1 - Branch spa-404-fallback** - What: Isolated routing-fallback work. How: git checkout -b feature/spa-404-fallback from main.
- [ ] **T30.3.2 - Build encodeRedirect fn** - What: The requested URL survives the bounce losslessly. How: Implement encodeRedirect(location) capturing pathname, search, and hash into one sessionStorage payload.
- [ ] **T30.3.3 - Author 404.html** - What: Pages misses become instant app loads. How: Create public/404.html with an inline script calling encodeRedirect then location.replace to the /stockz/ index.
- [ ] **T30.3.4 - Build readRedirect fn** - What: The app resumes exactly where the link pointed. How: Implement readRedirect() in main.js popping the sessionStorage payload and applying history.replaceState before Spektrum run().
- [ ] **T30.3.5 - Preserve API key params** - What: Key-in-URL access works through the fallback bounce. How: Ensure search params ride inside the sessionStorage payload, never the redirect URL, so keys stay out of referrer headers.
- [ ] **T30.3.6 - Copy fallback into dist** - What: Every deploy carries the fallback automatically. How: Keep 404.html in Vite publicDir and assert its presence in the scan-dist output check.
- [ ] **T30.3.7 - Route restore wiring** - What: Restored paths select the right dashboard block. How: Feed readRedirect output into the nav state via setValue('nav.route') before first bindDOM paint.
- [ ] **T30.3.8 - Single tests for redirect fns** - What: The bounce protocol is pinned by tests. How: One Vitest test each for encodeRedirect and readRedirect with a mocked sessionStorage, run via vitest -t per fn.
- [ ] **T30.3.9 - Live deep-link verify** - What: Proof against the real Pages 404 handler. How: Deploy, open /stockz/journal?symbol=BTC-USDT directly, and confirm the journal block opens with params applied.
- [ ] **T30.3.10 - Merge spa-404-fallback** - What: Fallback routing lands on main. How: Confirm targeted tests and the live check pass, then merge feature/spa-404-fallback to main.

### F30.4 - Cache Busting & Update Safety

**What:** Every redeploy reaches users without hard refreshes, and stale chunks self-heal instead of breaking the desk.
**How:** Verify Vite content-hash filenames via build.manifest, add a chunk-error reload handler, and stamp the build version into the footer.

- [ ] **T30.4.1 - Branch cache-busting** - What: Isolated cache-safety work. How: git checkout -b feature/cache-busting from main.
- [ ] **T30.4.2 - Enable build manifest** - What: A machine-readable map of hashed assets per build. How: Set build.manifest true in vite.config.js and inspect dist/.vite/manifest.json entries.
- [ ] **T30.4.3 - Assert hashed filenames** - What: No asset can be cached across versions by name. How: Extend scripts/check-size.js to fail if any dist/assets file lacks a content-hash segment.
- [ ] **T30.4.4 - Diff consecutive builds** - What: Confidence that only changed chunks change names. How: Script scripts/diff-builds.js comparing two manifest.json files and printing renamed vs stable chunks.
- [ ] **T30.4.5 - Build handleChunkError fn** - What: A mid-deploy user gets a reload, not a dead block. How: Implement handleChunkError(err) catching dynamic import failures and prompting a one-click location.reload.
- [ ] **T30.4.6 - Wire chunk handler to lazy blocks** - What: All code-split entry points are protected. How: Wrap the replay/analytics/backtest dynamic imports from phase 29 in handleChunkError.
- [ ] **T30.4.7 - Inject version stamp** - What: Anyone can read which build is live. How: Define __STOCKZ_VERSION__ from package.json via Vite define and bind it into the footer next to the Neko Media credit.
- [ ] **T30.4.8 - Document Pages cache behavior** - What: Operators know exactly how updates propagate. How: Note GitHub Pages' 10-minute max-age on HTML and immutable hashed assets in docs/deploy.md.
- [ ] **T30.4.9 - Single test for handleChunkError** - What: The self-heal path is test-locked. How: One Vitest test for handleChunkError with a rejected import mock, run via vitest -t.
- [ ] **T30.4.10 - Redeploy verify and merge** - What: Update safety proven live. How: Deploy twice with a visible change, confirm the new version appears without hard refresh, merge feature/cache-busting to main.

### F30.5 - Pinned Production Importmap

**What:** The live desk always loads the exact Spektrum build it was tested against - no surprise CDN upgrades.
**How:** Swap the loose dev importmap for an exact unpkg pin at build time via a Vite HTML transform, dropping devtools modules from production.

- [ ] **T30.5.1 - Branch pinned-importmap** - What: Isolated importmap work. How: git checkout -b feature/pinned-importmap from main.
- [ ] **T30.5.2 - Record exact Spektrum version** - What: One source of truth for the pin. How: Add a spektrumVersion field to package.json matching the version dev currently resolves from unpkg.
- [ ] **T30.5.3 - Build buildImportmap fn** - What: Importmap JSON generated, never hand-edited. How: Implement buildImportmap(version, mode) returning entries for spektrum, spektrum/persist, and spektrum/compile at https://unpkg.com/spektrum@<version>.
- [ ] **T30.5.4 - Vite HTML transform plugin** - What: index.html gets the right map per mode automatically. How: Write a small transformIndexHtml plugin injecting buildImportmap output, loose in dev, exact in build.
- [ ] **T30.5.5 - Exclude devtools in prod** - What: Zero debug tooling weight ships to traders. How: Have buildImportmap omit spektrum/devtools and spektrum/inspect entries when mode is production.
- [ ] **T30.5.6 - Preload the engine module** - What: Spektrum starts fetching before the first module executes. How: Emit a modulepreload link for the pinned unpkg spektrum URL alongside the importmap.
- [ ] **T30.5.7 - CSP compile path note** - What: A documented route if unpkg eval policies tighten. How: Document the spektrum/compile fallback for strict-CSP hosting in docs/deploy.md.
- [ ] **T30.5.8 - Single test for buildImportmap** - What: Pin logic locked by a test. How: One Vitest test for buildImportmap asserting exact-version URLs and prod exclusions, run via vitest -t.
- [ ] **T30.5.9 - Network verify on live build** - What: Proof the pin is what actually loads. How: Deploy and confirm in the DevTools network panel that spektrum resolves to the pinned @version URL.
- [ ] **T30.5.10 - Merge pinned-importmap** - What: Deterministic engine loading lands on main. How: Confirm dev still hot-reloads and prod pins correctly, then merge feature/pinned-importmap to main.

### F30.6 - Versioning & Changelog Convention

**What:** Every release has a semver number, a tag, and a human-readable list of what changed.
**How:** Adopt npm version with Keep a Changelog formatting, a bumpChangelog helper, and git tags that tie gh-pages deploys to source commits.

- [ ] **T30.6.1 - Branch release-versioning** - What: Isolated release-convention work. How: git checkout -b feature/release-versioning from main.
- [ ] **T30.6.2 - Seed CHANGELOG.md** - What: A changelog exists with the rules written down. How: Create CHANGELOG.md in Keep a Changelog format with an Unreleased section and entries back-filled for phases shipped so far.
- [ ] **T30.6.3 - Build bumpChangelog fn** - What: Releasing rolls Unreleased into a dated version block automatically. How: Implement bumpChangelog(version, date) in scripts/release.js rewriting CHANGELOG.md headings.
- [ ] **T30.6.4 - Wire npm version hook** - What: One command bumps, logs, and tags. How: Add a version script running node scripts/release.js then git add CHANGELOG.md so npm version patch commits both.
- [ ] **T30.6.5 - Tag naming convention** - What: Tags map one-to-one to deploys. How: Document vX.Y.Z annotated tags and ensure npm version creates them, pushed with git push --follow-tags.
- [ ] **T30.6.6 - Version in deploy message** - What: gh-pages history reads as a release log. How: Feed the package.json version into buildDeployMessage so every publish commit names its release.
- [ ] **T30.6.7 - Footer version binding** - What: Traders can report exactly which build they run. How: Bind {{version}} in the footer from the __STOCKZ_VERSION__ define via a Spektrum computed.
- [ ] **T30.6.8 - Release checklist doc** - What: A repeatable release ritual, not tribal knowledge. How: Add docs/release.md ordering: clean tree, npm version, push tags, npm run deploy, smoke check.
- [ ] **T30.6.9 - Single test for bumpChangelog** - What: Changelog rewriting is test-locked. How: One Vitest test for bumpChangelog against a fixture changelog asserting the rolled section, run via vitest -t.
- [ ] **T30.6.10 - Dry release and merge** - What: The convention proven end-to-end. How: Cut v0-series patch release on the branch, verify tag/changelog/footer agree, merge feature/release-versioning to main.

### F30.7 - Post-Deploy Smoke Verification

**What:** Two minutes after any deploy, the operator knows the live desk loads, accepts keys, streams data, and can place an order.
**How:** A written checklist in docs plus a Node smokeFetch script asserting the live URL serves the fresh build, exercised against OKX public WS and paper orders.

- [ ] **T30.7.1 - Branch deploy-smoke** - What: Isolated smoke-verification work. How: git checkout -b feature/deploy-smoke from main.
- [ ] **T30.7.2 - Author smoke checklist** - What: The canonical post-deploy ritual on paper. How: Write docs/smoke-checklist.md covering load, theme toggle, key modal, OKX feed, EToro fetch, and paper order round-trip.
- [ ] **T30.7.3 - Build smokeFetch fn** - What: Automated proof the deploy actually landed. How: Implement smokeFetch(url) in scripts/smoke.js fetching the live index and returning status plus referenced hashed asset paths.
- [ ] **T30.7.4 - Build assertFreshBuild fn** - What: Catches the classic stale-deploy failure. How: Implement assertFreshBuild(html, manifest) comparing live asset hashes against the local dist manifest.
- [ ] **T30.7.5 - Wire npm run smoke** - What: One command runs the scripted half of the checklist. How: Add a smoke script running scripts/smoke.js against the Pages URL and printing pass/fail per assertion.
- [ ] **T30.7.6 - Key-path live check** - What: URL-param key entry verified on production. How: Open the live URL with a paper-tier key param set and confirm the key modal is skipped and settings hydrate from localStorage.
- [ ] **T30.7.7 - Feed live check** - What: Real ticks on the real site. How: Watch the OKX v5 public WS connect on the live desk and confirm tape rows and sparklines move within 5 seconds.
- [ ] **T30.7.8 - Order-path live check** - What: The money path works without risking money. How: Place and close one paper-mode order on the live site and confirm PnL updates in the positions block.
- [ ] **T30.7.9 - Single tests for smoke fns** - What: Smoke tooling gets its one test per fn. How: One Vitest test each for smokeFetch (mocked fetch) and assertFreshBuild (fixture manifest), run via vitest -t per fn.
- [ ] **T30.7.10 - Full pass and merge** - What: The checklist proven on a real deploy. How: Run the entire checklist after a fresh npm run deploy, record results in docs/smoke-checklist.md, merge feature/deploy-smoke to main.

### F30.8 - Custom Domain Support

**What:** The desk can ship at a branded domain like stockz.nekomedia.nl with HTTPS, not just github.io.
**How:** Emit an optional CNAME file into dist, switch the Vite base to '/' for domain builds via env, and document the DNS records.

- [ ] **T30.8.1 - Branch custom-domain** - What: Isolated domain-support work. How: git checkout -b feature/custom-domain from main.
- [ ] **T30.8.2 - Build resolvePagesBase fn** - What: One fn decides project-path vs root-domain base. How: Implement resolvePagesBase(env) returning '/' when STOCKZ_DOMAIN is set, else '/stockz/', consumed by vite.config.js.
- [ ] **T30.8.3 - Emit CNAME into dist** - What: gh-pages deploys keep the domain binding. How: Write a tiny Vite plugin emitting a CNAME file containing STOCKZ_DOMAIN into dist during build when the env var exists.
- [ ] **T30.8.4 - DNS setup doc** - What: Anyone can point a domain in one sitting. How: Document apex A/AAAA records to Pages IPs and the www CNAME record in docs/deploy.md with the HTTPS-enforce toggle.
- [ ] **T30.8.5 - Base-aware 404 fallback** - What: SPA fallback keeps working at the domain root. How: Parameterize the 404.html redirect target through resolvePagesBase output injected by the HTML transform plugin.
- [ ] **T30.8.6 - Importmap unaffected check** - What: CDN pins keep loading under the new origin. How: Verify the unpkg importmap URLs are absolute and origin-independent in a domain-mode preview build.
- [ ] **T30.8.7 - www vs apex policy** - What: One canonical URL, no split traffic. How: Document choosing apex as canonical with www CNAME redirecting, in docs/deploy.md.
- [ ] **T30.8.8 - Single test for resolvePagesBase** - What: Base switching is test-locked. How: One Vitest test for resolvePagesBase covering domain-set and unset cases, run via vitest -t.
- [ ] **T30.8.9 - Domain-mode build verify** - What: Proof the artifact is domain-ready. How: Build with STOCKZ_DOMAIN set, run vite preview, and confirm root-relative assets and CNAME presence in dist.
- [ ] **T30.8.10 - Merge custom-domain** - What: Optional domain path lands on main. How: Confirm default github.io builds are byte-identical to before when the env var is unset, merge feature/custom-domain to main.

### F30.9 - PWA Install Experience

**What:** Traders pin STOCKZ to dock or taskbar and launch it as a standalone app window.
**How:** Ship a manifest.webmanifest with money-hacker theme colors and icon set, deliberately without a service worker so trading data is never stale-cached.

- [ ] **T30.9.1 - Branch pwa-install** - What: Isolated installability work. How: git checkout -b feature/pwa-install from main.
- [ ] **T30.9.2 - Author manifest.webmanifest** - What: The browser recognizes STOCKZ as installable. How: Create public/manifest.webmanifest with name, short_name, display standalone, start_url from the Pages base, and green-on-dark theme colors.
- [ ] **T30.9.3 - Generate icon set** - What: Crisp dock icons at every size. How: Script scripts/make-icons.js using sharp to render 192, 512, and maskable PNGs from the terminal-style logo SVG into public/icons.
- [ ] **T30.9.4 - Link manifest and meta tags** - What: All platforms discover the manifest. How: Add link rel=manifest plus apple-touch-icon and apple-mobile-web-app meta tags to index.html.
- [ ] **T30.9.5 - Theme-color day/night metas** - What: The OS chrome matches the active theme. How: Add two theme-color meta tags with prefers-color-scheme media attributes matching the design-system palettes.
- [ ] **T30.9.6 - Build canInstall fn** - What: The app knows when an install prompt is available. How: Implement canInstall() capturing beforeinstallprompt into state via setValue('ui.installEvent') and returning readiness.
- [ ] **T30.9.7 - Install action in settings** - What: One click from settings to dock. How: Add an Install App entry with data-action calling the captured prompt and clearing state on acceptance.
- [ ] **T30.9.8 - No-service-worker decision record** - What: Future devs know stale-cache risk was rejected on purpose. How: Document in docs/deploy.md why a trading desk ships without SW caching and how installability works without one.
- [ ] **T30.9.9 - Single test for canInstall** - What: Prompt gating is test-locked. How: One Vitest test for canInstall with a synthetic beforeinstallprompt event, run via vitest -t.
- [ ] **T30.9.10 - Install verify and merge** - What: Installability proven on the live site. How: Deploy, install to dock in Chrome desktop, confirm standalone launch with correct icon and colors, merge feature/pwa-install to main.

### F30.10 - Operator Runbook & Docs

**What:** Anyone with the repo and keys can run, deploy, and roll back the desk using docs alone.
**How:** Write README run/deploy/rollback runbooks naming Node 22, Vite, and gh-pages, with a link-checker script keeping the docs honest.

- [ ] **T30.10.1 - Branch operator-docs** - What: Isolated documentation work. How: git checkout -b feature/operator-docs from main.
- [ ] **T30.10.2 - README run section** - What: A fresh clone runs in five minutes. How: Document Node 22, npm install, npm run dev, and .env.local naming STOCKZ_OKX_* / STOCKZ_ETORO_* vars without ever showing values.
- [ ] **T30.10.3 - Deploy runbook** - What: The ship procedure is written, not remembered. How: Write docs/deploy.md steps: clean tree, npm version, git push --follow-tags, npm run deploy, npm run smoke.
- [ ] **T30.10.4 - Rollback runbook** - What: A bad release is reversible in under five minutes. How: Document git checkout vX.Y.Z && npm ci && npm run deploy to republish any prior tag to gh-pages.
- [ ] **T30.10.5 - Troubleshooting section** - What: The three classic Pages failures have written cures. How: Cover base-path 404s, stale-cache symptoms, and importmap pin mismatches with diagnosis steps each.
- [ ] **T30.10.6 - Key handling doc** - What: Operators pass keys safely every time. How: Document URL-param format and the key modal flow, with an explicit never-commit-keys and never-share-URLs-with-keys warning.
- [ ] **T30.10.7 - Build checkDocLinks fn** - What: Docs cannot silently rot. How: Implement checkDocLinks(dir) in scripts/doc-links.js resolving relative markdown links and internal anchors, failing on dead ones.
- [ ] **T30.10.8 - Help link in footer** - What: Docs are one click from the running desk. How: Add a docs icon in the footer beside the Neko Media LinkedIn/npm/GitHub icons linking to the repo docs folder.
- [ ] **T30.10.9 - Single test for checkDocLinks** - What: The link checker has its one test. How: One Vitest test for checkDocLinks against a fixture docs tree with one dead link, run via vitest -t.
- [ ] **T30.10.10 - Fresh-clone dry run and merge** - What: Docs proven by a cold walkthrough. How: Clone into a clean directory, follow only the docs through run and deploy, fix gaps found, merge feature/operator-docs to main.

---
