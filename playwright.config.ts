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
  // Raised from Playwright's 30s default when the suite was sharded (2026-08-12).
  //
  // The suite runs against `npm run dev`, so the FIRST spec to touch a route
  // pays Vite's cold compile for it. Unsharded, the checkout specs ran late
  // enough that /checkout and /products/* were already warm and 30s was quietly
  // enough. Sharding reassigns which spec goes first, so on shard 3 the
  // checkout specs became the ones paying the compile — and timed out at 30s.
  // The failure then cascaded: a timeout kill never runs `finally`, so
  // auto-discount.spec.ts leaked its automatic coupon, and every retry picked
  // up the stale coupon instead of its own and failed a different assertion.
  //
  // 57 of the 67 specs already set their own 90–240s budget; the 30s default
  // was the outlier, and it was only ever survivable because of an ordering
  // accident. A timeout is a cap, not a wait, so this costs passing runs
  // nothing.
  timeout: 90_000,
  // 2 retries (3 attempts) on CI: a fresh attempt self-heals the residual
  // timing flakiness on the shared hive runner even after E2E is serialized.
  retries: process.env.CI ? 2 : 0,
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
