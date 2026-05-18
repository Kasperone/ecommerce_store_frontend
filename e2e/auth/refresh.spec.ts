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

// Verifies session continuity past `ACCESS_TOKEN_EXPIRE_MINUTES`. The auth
// store schedules a proactive refresh at `exp - 60s` (PROACTIVE_REFRESH_MS);
// with TTL=2min that fires once around T=60s. The hard reload at the end
// exercises the boot-time restore: middleware awaits tryRestoreSession via
// the sessionRestoreAttempted flag, the SSR auth plugin forwards the refresh
// cookie to /auth/refresh and replays the rotated Set-Cookie, Pinia hydrates
// the SSR-populated auth state into the client store, and the client-only
// header renders the Account button after hydration.
test('silent refresh → session survives access-token expiry', async ({ page }) => {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email', { exact: true }).fill(REFRESH_USER.email)
  await page.getByLabel(/^password$/i).fill(REFRESH_USER.password)
  await page.getByRole('button', { name: /continue/i }).click()
  await expect(page).toHaveURL('/account')

  await page.waitForTimeout(130_000)

  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('[aria-label="Account"]')).toBeVisible()
})
