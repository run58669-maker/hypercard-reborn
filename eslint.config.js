// @ts-check
import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

// Flat config (ESLint v9+). The project is ESM ("type": "module" in
// package.json), so this file uses import/export syntax.
//
// Structure:
//   1. Global ignores — generated or non-source directories.
//   2. Base ESLint recommended for every JS/TS file (espree parser for JS,
//      @typescript-eslint parser for TS).
//   3. @typescript-eslint recommended (non-type-checked) for every TS file.
//   4. @typescript-eslint recommendedTypeChecked for src/**/*.ts only — the
//      files that tsconfig.json includes — with parserOptions.project so
//      type-aware rules have type information.
//   5. no-explicit-any is "error" everywhere, but downgraded to "warn" in
//      *.test.ts because test mocks often need `any`.
//
// Task 1.3 will add no-restricted-imports blocks for module boundaries here.
export default defineConfig([
  // Files ESLint should never lint.
  {
    ignores: [
      'dist/',
      'node_modules/',
      '.kiro/',
      '.claude/',
      '.git/',
      'docs/',
    ],
  },

  // Base ESLint recommended rules for every JS/TS file.
  {
    extends: [js.configs.recommended],
  },

  // TypeScript recommended rules (non-type-checked) for every TS file,
  // including root config files like vite.config.ts and vitest.config.ts.
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommended],
  },

  // Type-checked rules for src/ — the files tsconfig.json includes.
  // parserOptions.project gives the @typescript-eslint parser the type
  // information that type-aware rules (no-floating-promises, no-unsafe-*,
  // etc.) rely on. Scoped to src/ so root config files, which are not in the
  // tsconfig project, don't cause "file not in project" errors.
  {
    files: ['src/**/*.ts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // Test files may use `any` for mocks — downgrade no-explicit-any to a
  // warning so the lint script still passes (warnings don't fail the run)
  // while keeping `any` visible in code review. The type-checked
  // no-unsafe-* rules are turned off here too: using `any` for a mock
  // would trip no-unsafe-member-access / no-unsafe-assignment as errors,
  // which would defeat the allowance. Non-test source stays fully strict.
  {
    files: ['src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
])
