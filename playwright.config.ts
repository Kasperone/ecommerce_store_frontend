import { defineConfig, devices } from '@playwright/test'

// The dev-server port is overridable so CI can dodge host port clashes — the
// self-hosted hive runner already has :3000 taken by another project. Defaults
// to 3000 so local `npm run e2e` is unchanged.
const WEB_PORT = Number(process.env.E2E_WEB_PORT) || 3000

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'playwright/.test-results',
  reporter: [['html', { open: 'never' }], ['list']],
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  globalSetup: './e2e/seed/global-setup.ts',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run dev -- --port ${WEB_PORT}`,
    port: WEB_PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // The `setup` project (auth.setup.ts) is intentionally NOT a default
    // project: every current spec brings its own fresh context via
    // `test.use({ storageState: empty })`. Re-enable it (and add a chromium
    // project that consumes its storageState) when an admin/account spec
    // actually needs the pre-authed user — until then, keeping it active
    // would burn a KNOWN_USER login on every run and hit slowapi's
    // 5/15min-per-email limit faster than necessary.
  ],
})
