import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run against the production bundle served by `vite preview`
// on a fixed port, so what the tests exercise is the same static dist/ the
// demo uses. `npm run build` is part of `webServer.command`, so the specs
// always see the current source.
const PORT = 4173

// PW_CHANNEL=chrome runs the specs in the installed Chrome where Playwright's own
// Chromium has not been downloaded (`npx playwright install chromium`). CI leaves it unset.
// This file runs in Node, but the project has no @types/node, so declare the one global read.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> }
const channel = process.env['PW_CHANNEL']

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(channel === undefined || channel === '' ? {} : { channel }) },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
