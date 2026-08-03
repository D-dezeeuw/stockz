# Deployment — GitHub Pages, No CI

**There is no GitHub Actions in this repository — ever.** No workflow files, no
`.github/workflows/`, no CI badges. Publishing is a deliberate local command.

## Repository setting (one-time, required)

**Settings → Pages → Source: "Deploy from a branch" → Branch: `gh-pages`, folder
`/ (root)`.**

If Pages is pointed at `main` instead, the site serves the *source* `index.html` —
which references `/src/main.js` and 404s, because the module graph is only resolved at
build time. Symptom: the live page loads but every asset is missing. Check with
`curl -s <url> | grep -oE 'src="[^"]*"'`: it must show `/stockz/assets/index-<hash>.js`,
never `/src/main.js`.

## How it ships

```bash
npm run deploy
# = vite build && bash scripts/publish-pages.sh
```

`scripts/publish-pages.sh` builds a single orphan commit whose tree is **exactly**
`dist/` (plus `.nojekyll`) and force-pushes it to `gh-pages`. It replaced a bare
`gh-pages -d dist` call, which left repository dotfiles (`.claude/`, `.env.example`,
`.gitignore`, `src/**/.gitkeep`) in the published branch — source files on a public
site. Always verify after a deploy:

```bash
git fetch -q origin gh-pages:refs/remotes/origin/gh-pages -f
git ls-tree -r --name-only origin/gh-pages   # must be the build and nothing else
```

- `vite.config.js` sets `base: '/stockz/'` so assets resolve under
  `https://d-dezeeuw.github.io/stockz/`.
- The [`gh-pages`](https://www.npmjs.com/package/gh-pages) npm package force-pushes
  `dist/` to the `gh-pages` branch; GitHub Pages serves that branch.
- `public/404.html` mirrors `index.html` so deep links survive Pages routing.
- The importmap in the built `index.html` pins the exact Spektrum version
  (`https://unpkg.com/spektrum@<x.y.z>/...`) — `@latest` is for dev only; a release
  never shifts under the user.

## Release ritual

1. On `main`, all merged features green (per `testing-policy.md`).
2. Bump version in `package.json`, add a CHANGELOG entry (keep-a-changelog style).
3. `npm run deploy` from the local checkout.
4. Smoke check the live URL: page loads themed · key modal appears (or URL-param key
   accepted) · OKX LED green · ticks flowing · paper-mode order round-trips.
5. Tag: `git tag v<x.y.z> && git push --tags`.

## Rollback

`gh-pages` history is disposable: check out the previous tag and `npm run deploy`
again. Never edit the `gh-pages` branch by hand.

## Access URLs

- `https://<user>.github.io/stockz/` — key modal flow.
- `https://<user>.github.io/stockz/?okxKey=...&okxSecret=...&okxPass=...` — instant
  session (URL is scrubbed on load; still prefer the modal on shared machines).
