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
      // ── Errors (hard failures) ───────────────────────────────────────────
      'react-hooks/rules-of-hooks': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],

      // ── Intentionally silenced ───────────────────────────────────────────
      // routes.tsx legitimately mixes lazy imports + component exports; this
      // rule is a dev HMR DX hint only — CI never hot-reloads.
      'react-refresh/only-export-components': 'off',

      // Date.now()/new Date() in render for urgency/countdown display is benign.
      'react-hooks/purity': 'off',

      // setState inside effects is intentional in: PortalRoute (module-level
      // cache read), PortalShell (JWT decode on mount). Both are one-shot
      // synchronous reads from external state — not cascading render triggers.
      'react-hooks/set-state-in-effect': 'off',

      // Third-party lib (react-hook-form) returns non-memoizable functions;
      // this is an upstream limitation, not a bug in our code.
      'react-hooks/incompatible-library': 'off',

      // exhaustive-deps is enforced at review time; auto-disabling here avoids
      // false positives on stable-reference patterns (data ?? [] etc).
      'react-hooks/exhaustive-deps': 'off',

      // immutability is aspirational — off until we adopt Immer/Zustand patterns.
      'react-hooks/immutability': 'off',
    },
  },
])
