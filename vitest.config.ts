import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Unit and property tests live next to the code as *.test.ts.
    // Playwright specs live in e2e/ and run under @playwright/test, not here.
    include: ['src/**/*.test.ts'],
  },
})
