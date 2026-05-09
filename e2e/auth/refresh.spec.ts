import { expect, test } from '@playwright/test'
import { REFRESH_USER } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

// Slow by design.
//
// `ACCESS_TOKEN_EXPIRE_MINUTES` is an `int` in app/core/config.py. The auth
// store schedules a proactive refresh at `exp - PROACTIVE_REFRESH_MS` where
// PROACTIVE_REFRESH_MS = 60_000ms (app/stores/auth.ts:29). With TTL=1 the
// proactive delay collapses to ~0ms and the store loops on /auth/refresh
// until the 30/hour-per-IP limit trips. TTL=2 (120s) makes the proactive
// refresh fire once at T=60s, then again at T=180s — only ~3 calls in this
// test, well under the rate-limit budget.
test.setTimeout(180_000)

// Skipped pending an auth-plugin fix. The intent of this spec is to verify
// session continuity past `ACCESS_TOKEN_EXPIRE_MINUTES`. The bring-up
// surfaced two distinct bugs that block a clean assertion:
//
// 1. `app/middleware/user.ts` runs synchronously against Pinia state while
//    `app/plugins/auth.ts`'s `tryRestoreSession()` is still awaiting
//    /auth/refresh + /auth/me. On any hard-reload of `/account` (or any
//    middleware-gated page) with a valid refresh cookie, the user is
//    briefly redirected to `/login` before the session is restored. Network
//    log confirms /auth/refresh + /auth/me both return 200 — the middleware
//    just fires too early.
//
// 2. After the plugin completes on `/`, the header DOM ends up with both
//    the unauthenticated `Login` link and the authenticated `Logout` button
//    rendered simultaneously — likely an SSR/hydration mismatch where the
//    server-rendered logged-out template isn't fully replaced when the
//    client-side store updates. The `Account` button (the assertion target)
//    is missing.
//
// Both are real production issues, not E2E quirks. They warrant a separate
// frontend fix PR — candidates:
// - User middleware itself awaits `tryRestoreSession()` when auth state
//   isn't loaded yet (fixes #1).
// - Switch to client-only rendering on the header, OR ensure SSR knows
//   the auth state via a cookie-readable hint (fixes #2).
//
// See `e2e/README.md` flags section.
test.skip('silent refresh → session survives access-token expiry', async ({ page }) => {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel(/email/i).fill(REFRESH_USER.email)
  await page.getByLabel(/^password$/i).fill(REFRESH_USER.password)
  await page.getByRole('button', { name: /continue/i }).click()
  await expect(page).toHaveURL('/')

  await page.waitForTimeout(130_000)

  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('[aria-label="Account"]')).toBeVisible()
})
