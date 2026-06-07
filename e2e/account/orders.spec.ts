// Customer order lifecycle — order history list → order detail → cancel a
// pending order (confirm modal) → status flips to cancelled and the reserved
// stock is restored server-side.
//
// Promoted from a Playwright-MCP verify pass per the promotion ritual
// (e2e/README.md §"Promotion ritual"). The order is created through the API
// (checkout has its own spec) so this one stays focused on the lifecycle.
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Order lifecycle', () => {
  test('customer can view order history and cancel a pending order', async ({ page }) => {
    const api = await ApiClient.create()
    const runId = Date.now()
    const user = randomEphemeralUser()
    let adminToken = ''
    let productId: number | null = null

    try {
      // --- fixtures: product + shared shipping; order created via API
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const product = await api.createProduct(adminToken, {
        name: 'E2E Lifecycle Widget',
        slug: `e2e-lifecycle-${runId}`,
        price_usd: 50,
        price_pln: 200,
        price_eur: 45,
        stock: 5,
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
      // Creating the order reserved stock.
      expect(await api.getProductStock(product.id)).toBe(3)

      // --- order history shows the pending order (30s: first CI hit
      // compiles the page chunk on the cold dev server)
      await page.goto('/account/orders')
      const row = page.getByText(order.order_number).first()
      await expect(row).toBeVisible({ timeout: 30_000 })
      await expect(page.getByText('Pending', { exact: true }).first()).toBeVisible()

      // --- order detail (30s: cold-chunk compile, as above)
      await page.goto(`/account/orders/${order.id}`)
      await expect(page.getByText(order.order_number).first()).toBeVisible({ timeout: 30_000 })
      await expect(page.getByText('E2E Lifecycle Widget').first()).toBeVisible()

      // --- cancel: button → confirm modal → status flips
      // Re-click until the hydrated handler lands (admin/category-crud pattern).
      const dialog = page.getByRole('dialog')
      await expect(async () => {
        await page.getByRole('button', { name: 'Cancel order' }).first().click()
        await expect(dialog).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 20_000 })
      await expect(dialog.getByText('restores stock')).toBeVisible()
      await dialog.getByRole('button', { name: 'Yes, cancel' }).click()

      await expect(page.getByText('Cancelled', { exact: true }).first()).toBeVisible()
      // The cancel affordance is pending-only — it must be gone now.
      await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0)

      // --- server-side truth: status persisted + stock restored
      const cancelled = await api.getOrder(accessToken, order.id)
      expect(cancelled.status).toBe('cancelled')
      expect(await api.getProductStock(product.id)).toBe(5)
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
