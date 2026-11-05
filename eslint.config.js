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
//   6. Module boundaries (design.md §2, tech.md) as one no-restricted-imports
//      block per module directory under src/.

// ---------------------------------------------------------------------------
// Module boundaries
//
// The table in design.md §2 / tech.md says which module may import which. The
// rule that matters most is that the interpreter, runtime and store cannot
// reach the compile module or the Anthropic SDK, so a running card has no code
// path to the LLM (requirement 1.3) by construction rather than by convention.
//
// Imports are matched on the specifier string, so a relative path that climbs
// out of the module directory into a sibling module is what we forbid:
//   ../compile/compileService, ../../ui/dom, ../store  (all forbidden from parser)
// `no-restricted-imports` only inspects static `import`/`export ... from`
// declarations, which is exactly what lets src/ui load src/compile through a
// dynamic `import()` (the only allowed form there, so the SDK stays in a
// separate chunk that is not loaded until Save is pressed).
// ---------------------------------------------------------------------------

const ALL_MODULES = ['parser', 'interpreter', 'store', 'runtime', 'compile', 'ui', 'examples']
const SDK = '@anthropic-ai/sdk'

/**
 * design.md §2, one row per module. `examples` holds data only (raw file
 * imports), so modules that may read bundled example data list it explicitly.
 * `typeOnly`: sibling modules allowed as `import type` only. src/ui may load
 * src/compile only through a dynamic import() so the SDK stays in a separate
 * chunk that is not loaded until Save is pressed; `import type` is allowed
 * because it is erased at build time and creates no code path.
 * @type {Record<string, { mayImport: string[]; packages?: string[]; typeOnly?: string[] }>}
 */
const MAY_IMPORT = {
  parser: { mayImport: [] },
  examples: { mayImport: [] },
  interpreter: { mayImport: ['parser'] },
  store: { mayImport: ['parser', 'examples'] },
  runtime: { mayImport: ['parser', 'interpreter', 'store'] },
  compile: { mayImport: ['parser', 'examples'], packages: [SDK, 'zod'] },
  ui: { mayImport: ['store', 'runtime', 'parser', 'examples'], typeOnly: ['compile'] },
}

/**
 * A regex that matches any relative import specifier climbing out of the
 * current module directory into one of the named sibling modules.
 * @param {string[]} modules
 */
function climbsInto(modules) {
  return `^(\\.\\./)+(${modules.join('|')})(/|$)`
}

/**
 * Build the `no-restricted-imports` option for one module directory.
 * @param {object} opts
 * @param {string} opts.name            the module directory under src/
 * @param {string[]} opts.mayImport     sibling modules this one may import statically
 * @param {string[]} [opts.packages]    npm packages this module may import
 * @param {string[]} [opts.typeOnly]    sibling modules allowed as `import type` only
 */
function boundary({ name, mayImport, packages = [], typeOnly = [] }) {
  const forbiddenModules = ALL_MODULES.filter(
    (m) => m !== name && !mayImport.includes(m) && !typeOnly.includes(m),
  )
  const patterns = []
  if (forbiddenModules.length > 0) {
    patterns.push({
      regex: climbsInto(forbiddenModules),
      message: `src/${name} may only import ${
        mayImport.length > 0 ? mayImport.map((m) => `src/${m}`).join(', ') : 'nothing from src/'
      } (design.md §2).`,
    })
  }
  if (typeOnly.length > 0) {
    patterns.push({
      regex: climbsInto(typeOnly),
      allowTypeImports: true,
      message: `src/${name} may load ${typeOnly
        .map((m) => `src/${m}`)
        .join(', ')} only through a dynamic import() (design.md §2).`,
    })
  }
  const paths = []
  for (const pkg of [SDK, 'zod']) {
    if (!packages.includes(pkg)) {
      paths.push({
        name: pkg,
        message: `${pkg} is reachable only from src/compile (design.md §2, requirement 1.3).`,
      })
    }
  }
  return { paths, patterns }
}

/**
 * One config block per module directory.
 * @param {Parameters<typeof boundary>[0]} opts
 */
function moduleBlock(opts) {
  return {
    files: [`src/${opts.name}/**/*.ts`],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', boundary(opts)],
    },
  }
}

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

  // Module boundaries, one block per module directory (design.md §2).
  ...ALL_MODULES.map((name) => moduleBlock({ name, ...MAY_IMPORT[name] })),

  // Tests next to the code may additionally read the two leaf modules that
  // hold no runtime behaviour of their own: the parser (to check that example
  // scripts parse) and the bundled example data. Everything else in the table
  // still applies to tests, so a test can never pull the compile module or the
  // SDK into the interpreter, runtime or store directories.
  ...ALL_MODULES.map((name) => ({
    files: [`src/${name}/**/*.test.ts`],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        boundary({
          name,
          ...MAY_IMPORT[name],
          mayImport: [...new Set([...MAY_IMPORT[name].mayImport, 'parser', 'examples'])],
        }),
      ],
    },
  })),
])
