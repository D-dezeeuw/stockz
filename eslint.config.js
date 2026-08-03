import js from '@eslint/js'
import globals from 'globals'

/**
 * STOCKZ lint rules — flat config, no legacy .eslintrc.
 *
 * The app is vanilla ES modules running in the browser (plus workers for feed
 * parsing), so browser + worker globals are on everywhere. Rules that catch the
 * bug classes that actually cost money on a trading desk are hard errors.
 */
export default [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },

  js.configs.recommended,

  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.worker,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
    },
  },

  {
    // The state map owns every path string. A raw 'trade.dayPnl' literal at a call site
    // is how a typo invents a silent branch no binding reads - import PATHS instead.
    files: ['src/**/*.js'],
    ignores: [
      'src/state/paths.js',
      'src/state/initial.js',
      'src/actions/names.js',
      '**/*.test.js',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Literal[value=/^(app|ui|settings|market|trade|strategy)\\.[a-zA-Z]/]",
          message:
            'Raw state path literal - import the constant from src/state/paths.js instead.',
        },
      ],
    },
  },

  {
    // Colocated unit tests (see .claude/context/testing-policy.md).
    files: ['**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },

  {
    // Build/tooling config runs in Node.
    files: ['vite.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
]
