# Deployment — GitHub Pages, No CI

**There is no GitHub Actions in this repository — ever.** No workflow files, no
`.github/workflows/`, no CI badges. Publishing is a deliberate local command.

## How it ships

```bash
npm run deploy
# = vite build && gh-pages -d dist
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
