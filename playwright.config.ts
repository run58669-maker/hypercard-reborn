import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run against the production bundle served by `vite preview`
// on a fixed port, so what the tests exercise is the same static dist/ the
// demo uses. `npm run build` is part of `webServer.command`, so the specs
// always see the current source.
const PORT = 4173

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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
