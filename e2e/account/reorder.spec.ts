// "Buy again" / reorder — from the order-history list a customer re-adds a
// past order's lines to the cart at CURRENT prices (client-side cart hydrate,
// no server re-order). Money-adjacent: it's a conversion path and must
// re-resolve live price/stock rather than trust the order's snapshot.
//
// Drafted against the live app via the planner/generator flow. Conventions
// mirror e2e/account/orders.spec.ts (API-seeded order, refresh-cookie inject).
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(120_000)

test.describe('Reorder', () => {
  test('"Buy again" re-adds a past order\'s items to the cart at current prices', async ({ page }) => {
    const api = await ApiClient.create()
    const runId = Date.now()
    const user = randomEphemeralUser()
    let adminToken = ''
    let productId: number | null = null

    try {
      // --- fixtures: a product with stock + shared US shipping; order via API
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const product = await api.createProduct(adminToken, {
        name: `E2E Reorder Widget ${runId}`,
        slug: `e2e-reorder-${runId}`,
        price_usd: 30,
        price_pln: 120,
        price_eur: 27,
        stock: 10,
      })
      productId = product.id
      const { methodId } = await api.ensureShippingFixture(adminToken, {
        methodName: 'E2E Standard',
        countryCodes: ['US'],
        rates: [{ currency: 'USD', amount: 10 }],
      })

      await api.register(user)
      await api.markVerified(user.email)
      const { accessToken, refreshCookie } = await api.loginViaApi(user.email, user.password)
      await page.context().addCookies([refreshCookie])

      const order = await api.createOrderViaApi(accessToken, {
        productId: product.id,
        quantity: 2,
        shippingMethodId: methodId,
      })
      expect(order.status).toBe('pending')

      // --- order history lists the order (30s: cold page chunk compile)
      await page.goto('/account/orders')
      await expect(page.getByText(order.order_number).first()).toBeVisible({ timeout: 60_000 })

      // --- reorder: re-adds the line(s) to the client cart at current prices
      await page.getByRole('button', { name: 'Buy again' }).click()
      // The whole order is buyable (fresh in-stock product) → the "all added"
      // toast fires; its title is stable across the singular/plural body.
      await expect(page.getByText('Added to cart').first()).toBeVisible({ timeout: 15_000 })

      // The cart now carries the reordered product and can proceed to checkout.
      await page.goto('/cart')
      await expect(page.getByRole('link', { name: 'Proceed to checkout' })).toBeVisible({ timeout: 30_000 })
      await expect(page.getByText(`E2E Reorder Widget ${runId}`).first()).toBeVisible()
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
