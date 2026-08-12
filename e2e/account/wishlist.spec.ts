// Wishlist — save a product from the PDP, see it on /account/wishlist
// (server-persisted), then remove it. Storefront engagement surface, unspecced.
//
// Drafted against the live app via the planner/generator flow. Conventions
// mirror e2e/checkout/checkout.spec.ts (API-seeded product → PDP) and the other
// account specs (ephemeral user, refresh-cookie inject, hydration gate).
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(120_000)

test.describe('Wishlist', () => {
  test('save a product from the PDP, see it on the wishlist page, then remove it', { tag: ['@mobile'] }, async ({ page }) => {
    const api = await ApiClient.create()
    const runId = Date.now()
    const user = randomEphemeralUser()
    const slug = `e2e-wishlist-${runId}`
    const name = `E2E Wishlist Widget ${runId}`
    let adminToken = ''
    let productId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const product = await api.createProduct(adminToken, {
        name,
        slug,
        price_usd: 40,
        price_pln: 160,
        price_eur: 36,
        stock: 5,
      })
      productId = product.id

      await api.register(user)
      await api.markVerified(user.email)
      const { refreshCookie } = await api.loginViaApi(user.email, user.password)
      await page.context().addCookies([refreshCookie])

      // --- save from the PDP
      await page.goto(`/products/${slug}`)
      // Hydration gate — the WishlistButton handler wires up client-side.
      await expect(page.getByRole('button', { name: 'Open cart' })).toBeVisible({ timeout: 60_000 })
      await page.getByRole('button', { name: 'Add to wishlist' }).click()
      await expect(page.getByText('Saved to your wishlist.').first()).toBeVisible({ timeout: 15_000 })

      // --- the saved product appears on the wishlist page (server-persisted)
      await page.goto('/account/wishlist')
      await expect(page.getByRole('button', { name: 'Open cart' })).toBeVisible({ timeout: 60_000 })
      await expect(page.getByRole('link', { name }).first()).toBeVisible({ timeout: 60_000 })

      // --- remove it → list empties
      await page.getByRole('button', { name: /Remove/ }).first().click()
      await expect(page.getByText('Removed from your wishlist.').first()).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText('Your wishlist is empty.')).toBeVisible({ timeout: 15_000 })
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
