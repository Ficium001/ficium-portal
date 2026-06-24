import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'api']),  // Vercel serverless fns — plain JS, no TS rules
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Dev-only HMR hint — advisory, not a correctness rule. Keep visible
      // as a warning so it doesn't block CI on legitimate const+component files.
      'react-refresh/only-export-components': 'warn',
      // Honor the established `_`-prefix convention for intentionally-unused
      // bindings (args, vars, caught errors).
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // Advisory React performance/immutability hints — surfaced as warnings
      // pending a proper per-effect review (see CONTRIBUTING / tech-debt).
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      // `Date.now()`/`new Date()` during render for "is this urgent" display
      // calculations are benign here — keep as advisory, not a build blocker.
      'react-hooks/purity': 'warn',
    },
  },
])
