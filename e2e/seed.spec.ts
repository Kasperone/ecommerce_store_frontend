// Seed test for the Playwright test agents (planner / generator / healer).
// The generator starts every generated spec from a copy of this file, so it
// encodes how this app boots, authenticates, and names things. Keep it green.
//
// Environment (see e2e/README.md for full bring-up):
// - Nuxt dev on :3000 (launched by Playwright's webServer), FastAPI on :8000,
//   dedicated `ecommerce_e2e` Postgres DB (E2E_DB_URL required).
// - e2e/seed/global-setup.ts runs once before all specs: it truncates
//   ephemeral auth state and seeds KNOWN_USER / KNOWN_ADMIN / LOCKOUT_USER /
//   REFRESH_USER (see e2e/fixtures/testUser.ts; randomEphemeralUser() for
//   throwaway accounts).
//
// Conventions for generated specs:
// - Fresh context per spec: `test.use({ storageState: { cookies: [], origins: [] } })`.
// - Authenticate via ApiClient.loginViaApi + refresh-cookie injection (below),
//   NOT the login form — form logins burn the slowapi 5/15min-per-email budget.
// - Inputs: prefer `getByLabel(/email/i)` over `getByRole('textbox', { name: 'Email' })`;
//   buttons stay `getByRole('button', { name: /…/i })` with lowercase regex.
// - Number inputs (price/qty/stock) are Nuxt UI UInputNumber — raw `fill()`
//   skips v-model; use the helpers in e2e/helpers/uinputnumber.ts.
// - Cross-check backend state through ApiClient (Playwright request + pg),
//   not by scraping the UI.
// - Style: no semicolons, single quotes, 2-space indent (Stylistic lint).
import { test, expect } from '@playwright/test'
import { ApiClient } from './fixtures/apiClient'
import { KNOWN_USER } from './fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Seed', () => {
  // Not @mobile: this asserts the header's inline 'Account' link, which is
  // correct desktop chrome — at 412px the header collapses to a hamburger, so
  // the assertion is desktop-shaped by design, not a responsive defect.
  test('boots authenticated as the known customer', { tag: ['@smoke'] }, async ({ page }) => {
    // API login + cookie injection — the auth plugin exchanges the refresh
    // cookie for an access token on app boot (no form login needed).
    const api = await ApiClient.create()
    try {
      const { refreshCookie } = await api.loginViaApi(KNOWN_USER.email, KNOWN_USER.password)
      await page.context().addCookies([refreshCookie])
    }
    finally {
      await api.dispose()
    }

    await page.goto('/')
    // Session restored → the header swaps Login/Sign up for the Account link.
    // Scope to the banner: the footer has "My Account"/"Create Account" links
    // that would trip strict mode otherwise.
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'Account', exact: true }),
    ).toBeVisible()
  })
})
