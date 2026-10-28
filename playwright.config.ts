import { defineConfig, devices } from '@playwright/test'

// The dev-server port is overridable for hosts where :3000 is already taken.
// Defaults to 3000 so local `npm run e2e` is unchanged.
const WEB_PORT = Number(process.env.E2E_WEB_PORT) || 3000

// Specs that switch the shared `gift_cards_enabled` toggle; they get their own
// serialized projects below instead of running in `chromium`.
const GIFT_CARD_SPECS = /checkout\/gift-card(-purchase)?\.spec\.ts/

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
  // timing flakiness on CI runners.
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
      testIgnore: [/auth\.setup\.ts/, GIFT_CARD_SPECS],
      use: { ...devices['Desktop Chrome'] },
    },
    // The two gift-card specs both switch `store_config.gift_cards_enabled` on
    // and restore it in `afterAll` (see `restoreStoreConfigAfterAll`). That
    // singleton is shared, and with more than one worker one file's restore
    // switches the toggle off under the other file's tests — the flag input
    // vanishes mid-checkout. Files only ever run in parallel with each other, so
    // chaining them as dependent projects serializes just this pair and costs
    // nothing at `workers: 1`. Everything else stays in `chromium`.
    {
      name: 'gift-card-tender',
      testMatch: /checkout\/gift-card\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'gift-card-purchase',
      testMatch: /checkout\/gift-card-purchase\.spec\.ts/,
      dependencies: ['gift-card-tender'],
      use: { ...devices['Desktop Chrome'] },
    },
    // Tag-scoped extra dimensions. Both are deliberately NOT full-suite runs:
    // the back-office is desktop-shaped by design (wide tables, side-by-side
    // locale panes) and running it at 412px would assert a layout nobody
    // ships. Opt specs in with @mobile / @smoke instead — `grep` means an
    // untagged spec costs these projects nothing.
    //
    // Replaces a hand-driven 375px sweep across 27 admin routes done once on
    // 2026-06-11 and never repeated. A manual audit that goes stale in weeks
    // is worth less than eight specs that run every time.
    {
      name: 'mobile',
      testIgnore: /auth\.setup\.ts/,
      grep: /@mobile/,
      use: { ...devices['Pixel 7'] },
    },
    // A `webkit` project is deliberately NOT enabled yet, though the specs for
    // it are already tagged @smoke. WebKit is the only non-Chromium engine
    // available and would be the only thing to catch a Safari-only break
    // (partially de-risking the deferred Apple Pay verification) — but it could
    // not be verified on the machine this was written on: WebKit needs
    // libicu74 / libxml2 / libflite1, which Arch does not provide under the
    // names `playwright install-deps` expects, and there is no sudo.
    //
    // Enabling it is two changes, both trivial once someone can actually run it:
    //   1. this block:
    //        { name: 'webkit', testIgnore: /auth\.setup\.ts/,
    //          grep: /@smoke/, use: { ...devices['Desktop Safari'] } }
    //   2. `npx playwright install-deps chromium` -> `... chromium webkit`
    //      in .github/workflows/test.yml.
    //
    // Shipping it unverified would mean discovering on main whether four specs
    // pass in an engine nobody had run them in, so the tags land now and the
    // project lands when it can be proven.
    // The `setup` project (auth.setup.ts) is intentionally NOT a default
    // project: every current spec brings its own fresh context via
    // `test.use({ storageState: empty })`. Re-enable it (and add a chromium
    // project that consumes its storageState) when an admin/account spec
    // actually needs the pre-authed user — until then, keeping it active
    // would burn a KNOWN_USER login on every run and hit slowapi's
    // 5/15min-per-email limit faster than necessary.
  ],
})
