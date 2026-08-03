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
  base: mode === 'production' ? '/stockz/' : '/',

  // Only STOCKZ_-prefixed vars reach import.meta.env — nothing else from the shell
  // can leak into the bundle (see .claude/context/integrations.md).
  envPrefix: 'STOCKZ_',

  server: {
    port: 5173,
    strictPort: true,
  },

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
    include: ['src/**/*.test.js'],
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
