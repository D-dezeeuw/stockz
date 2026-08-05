import { defineConfig } from 'vite'

/**
 * STOCKZ build configuration.
 *
 * - `base` is mode-aware: '/' in dev, '/stockz/' in production so assets resolve
 *   under the GitHub Pages project path (see .claude/context/deployment.md).
 * - Spektrum is loaded from the unpkg CDN through the importmap in index.html and is
 *   therefore marked external — it must never be pulled into the bundle.
 * - Vitest config lives here too; coverage powers the >80% (incl. branches) merge gate.
 */
export default defineConfig(({ mode }) => ({
  // Dev-only venue proxies mirroring server/main.js, so the desk behaves identically
  // under `npm run dev` and behind the real backend: same-origin prefixes, stripped
  // before forwarding — the venue receives exactly the path the browser signed.
  // Order matters: '/okx-eea' must be declared before '/okx' or the longer prefix
  // would be swallowed by the shorter one.
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/okx-eea': {
        target: 'https://eea.okx.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/okx-eea/, ''),
      },
      '/okx': {
        target: 'https://www.okx.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/okx/, ''),
      },
      '/etoro': {
        target: 'https://api.etoro.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/etoro/, ''),
      },
    },
  },
  base: mode === 'production' ? '/stockz/' : '/',

  // `envPrefix` is an ALLOWLIST FOR PUBLICATION, not a guard. Every matching var is
  // hardcoded into the browser bundle as a string literal at build time. This was set to
  // 'STOCKZ_' — the same prefix as the credentials — and a production build duly inlined
  // the live OKX key, secret, passphrase, both eToro keys and the LLM key into a deployed
  // asset. The prefix did not protect them; it selected them.
  //
  // So production gets a prefix nothing is named after: a `vite build` now *cannot* carry a
  // credential, whatever is in the shell. Dev keeps STOCKZ_ for the local-.env convenience,
  // because a dev bundle is never published. Anything genuinely meant for the browser goes
  // under STOCKZ_PUBLIC_, where the name says so out loud.
  envPrefix: mode === 'production' ? 'STOCKZ_PUBLIC_' : 'STOCKZ_',

  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },

  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      // Bare specifiers resolved by the browser importmap, not by Rollup.
      external: [/^spektrum(\/.*)?$/],
    },
  },

  test: {
    // One test per function, colocated next to the source it covers
    // (.claude/context/testing-policy.md). Targeted runs stay sub-second.
    environment: 'node',
    include: ['src/**/*.test.js', 'server/**/*.test.js'],
    globals: true,
    watch: false,
    passWithNoTests: true,
    coverage: {
      // Off by default; the merge gate enables it explicitly per feature.
      enabled: false,
      provider: 'v8',
      reporter: ['text-summary'],
    },
  },
}))
