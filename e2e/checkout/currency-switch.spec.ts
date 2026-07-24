// Multi-currency storefront switch — an anonymous shopper flips the header
// currency (USD → EUR) and the PDP re-prices from the product's per-currency
// column (price_eur), not a runtime conversion. Covers the core multi-currency
// promise; complements pl-money-path.spec.ts (PLN) and net-terms-cross-currency
// (EUR at checkout).
//
// Drafted against the live app via the planner/generator flow. Distinct
// per-currency prices make the switch unambiguous.
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(120_000)

test.describe('Currency switch', () => {
  test('switching the header currency re-prices the PDP from the per-currency column', async ({ page }) => {
    const api = await ApiClient.create()
    const runId = Date.now()
    const slug = `e2e-currency-${runId}`
    let adminToken = ''
    let productId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const product = await api.createProduct(adminToken, {
        name: `E2E Currency Widget ${runId}`,
        slug,
        // Deliberately non-proportional so a runtime FX conversion couldn't
        // produce the EUR figure from USD — it must come from price_eur.
        price_usd: 100,
        price_pln: 500,
        price_eur: 87,
        stock: 5,
      })
      productId = product.id

      // Anonymous shopper — currency lives in a cookie, defaults to USD.
      await page.goto(`/products/${slug}`)
      await expect(page.getByRole('button', { name: 'Open cart' })).toBeVisible({ timeout: 60_000 })
      await expect(page.getByText('$100.00').first()).toBeVisible({ timeout: 30_000 })

      // Flip currency to EUR via the header USelectMenu.
      await page.getByRole('button', { name: 'Select currency' }).first().click()
      await page.getByRole('option', { name: 'EUR' }).click()

      // The PDP now shows the euro price from price_eur (narrowSymbol → €).
      await expect(page.getByText('€87.00').first()).toBeVisible({ timeout: 30_000 })
      await expect(page.getByText('$100.00')).toHaveCount(0)
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
