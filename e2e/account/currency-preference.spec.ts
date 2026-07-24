// Currency preference persistence — a signed-in customer's shopping currency
// is stored on the account (PATCH /api/v1/me/preferences) and survives a full
// reload because the select is seeded from the server snapshot
// (GET /api/v1/me/preferences), not just a cookie. Money-adjacent: the chosen
// currency drives which per-currency price the whole store renders.
//
// Drafted against the live app via the planner/generator flow (real selectors
// captured from /account/preferences). Conventions mirror
// e2e/account/account-panel.spec.ts (ephemeral user, refresh-cookie inject,
// server-truth assertions).
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

// Cold dev-server chunk compile on first hit under concurrent CI — generous
// budget, same as the other account specs.
test.setTimeout(120_000)

test.describe('Currency preference', () => {
  test('changing shopping currency persists server-side across a reload', async ({ page }) => {
    const api = await ApiClient.create()
    const user = randomEphemeralUser()
    try {
      await api.register(user)
      await api.markVerified(user.email)
      const { refreshCookie } = await api.loginViaApi(user.email, user.password)
      await page.context().addCookies([refreshCookie])

      // Wait for the preferences snapshot GET so the USelect is seeded before
      // we read/drive it (an un-seeded select would race the assertion).
      const prefsSettled = page
        .waitForResponse(
          r => r.url().includes('/api/v1/me/preferences') && r.request().method() === 'GET',
          { timeout: 15_000 },
        )
        .catch(() => null)
      await page.goto('/account/preferences')
      await prefsSettled

      // A brand-new account defaults to the storefront currency (USD).
      const currency = page.getByRole('combobox', { name: 'Shopping currency' })
      await expect(currency).toContainText('USD', { timeout: 60_000 })

      // Change USD → PLN. The Nuxt UI USelect is a listbox (not a native
      // <select>): click to open, then pick the option. The PATCH persists it.
      const patched = page.waitForResponse(
        r => r.url().includes('/api/v1/me/preferences')
          && r.request().method() === 'PATCH'
          && r.ok(),
        { timeout: 15_000 },
      )
      await currency.click()
      await page.getByRole('option', { name: 'PLN (zł)' }).click()
      await patched
      await expect(page.getByText('Currency preference updated.').first())
        .toBeVisible({ timeout: 10_000 })

      // Header currency control switches immediately (there's a header + footer
      // "Select currency" — .first() is the header one).
      await expect(page.getByRole('button', { name: 'Select currency' }).first())
        .toContainText('PLN')

      // Full reload → the select is re-seeded from the SERVER snapshot. If it
      // still reads PLN, the preference was persisted to the account, not just
      // held in client state.
      await page.goto('/account/preferences')
      await expect(page.getByRole('combobox', { name: 'Shopping currency' }))
        .toContainText('PLN')
      await expect(page.getByRole('button', { name: 'Select currency' }).first())
        .toContainText('PLN')
    }
    finally {
      await api.dispose()
    }
  })
})
