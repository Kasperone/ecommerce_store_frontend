// Guest checkout — an anonymous shopper places an order with only an email
// address (no account), receives a tracking token, and can view their order
// on the public /orders/track/{token} page without logging in.
//
// Promoted from a Playwright-MCP verify pass per the promotion ritual
// (e2e/README.md §"Promotion ritual"). Fixtures created per run so the spec
// is rerunnable.
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Guest checkout', () => {
  test('guest places an order and can track it via the public token page', async ({ page }) => {
    const api = await ApiClient.create()
    const runId = Date.now()
    let adminToken = ''
    let productId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken

      const slug = `e2e-guest-${runId}`
      const product = await api.createProduct(adminToken, {
        name: 'E2E Guest Widget',
        slug,
        price_usd: 40,
        price_pln: 160,
        price_eur: 36,
        stock: 5,
      })
      productId = product.id

      await api.ensureShippingFixture(adminToken, {
        methodName: 'E2E Standard',
        countryCodes: ['US'],
        rates: [{ currency: 'USD', amount: 10 }],
      })

      // --- PDP: add to cart as a guest (no auth cookie set)
      await page.goto(`/products/${slug}`)
      await expect(page.getByRole('heading', { name: 'E2E Guest Widget' })).toBeVisible()
      await expect(async () => {
        await page.getByRole('button', { name: 'Add to Cart' }).first().click()
        await expect(
          page.getByRole('dialog').getByText('E2E Guest Widget'),
        ).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 20_000 })

      // --- /checkout: guest email field must appear, not the saved-address picker
      await page.goto('/checkout')
      await expect(page.getByTestId('guest-hint')).toBeVisible()
      await expect(page.getByTestId('guest-email')).toBeVisible()

      await page.getByTestId('guest-email').fill('guest-test@example.com')
      await page.getByLabel('Address', { exact: true }).fill('5 Guest Ave')
      await page.getByLabel('City', { exact: true }).fill('Boston')
      await page.getByLabel('Postal code', { exact: true }).fill('02101')
      await page.getByLabel('Country', { exact: true }).click()
      await page.getByRole('option', { name: 'United States' }).click()

      await expect(page.getByText('E2E Standard').first()).toBeVisible()
      const placeOrder = page.getByRole('button', { name: 'Place order' })
      await expect(placeOrder).toBeEnabled()
      await placeOrder.click()

      // --- success page
      await expect(page).toHaveURL(/\/checkout\/success/, { timeout: 30_000 })
      await expect(page.getByRole('heading', { name: 'Order placed!' }))
        .toBeVisible({ timeout: 30_000 })

      // --- "View order" CTA points to the public track page (not /account)
      const cta = page.getByTestId('view-order-cta')
      await expect(cta).toBeVisible()
      await cta.click()

      // --- /orders/track/{token}: public, no login required
      await expect(page).toHaveURL(/\/orders\/track\//, { timeout: 15_000 })
      // Page should show the order number heading and status badge
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByText('E2E Guest Widget')).toBeVisible()
      await expect(page.getByTestId('track-ships-to')).toContainText('Boston')

      // --- server-side: verify data via the public track API
      const urlToken = new URL(page.url()).pathname.split('/').pop()!
      const tracked = await api.trackGuestOrder(urlToken)

      expect(tracked.status).toBe('pending')
      expect(tracked.currency).toBe('USD')
      expect(tracked.subtotal).toBeCloseTo(40, 2)
      expect(tracked.shipping).toBeCloseTo(10, 2)
      expect(tracked.discount).toBe(0)
      expect(tracked.total).toBeCloseTo(50, 2)
      expect(tracked.shipping_city).toBe('Boston')
      expect(tracked.shipping_country).toBe('US')
      expect(tracked.items).toHaveLength(1)
      expect(tracked.items[0]!.product_name).toBe('E2E Guest Widget')
      expect(tracked.items[0]!.quantity).toBe(1)
      expect(tracked.items[0]!.unit_price).toBeCloseTo(40, 2)
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
