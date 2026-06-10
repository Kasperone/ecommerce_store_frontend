// Automatic-discount checkout — an `is_automatic` coupon is previewed and
// applied by the checkout without the customer typing any code.
//
// Two scenarios in one run:
//   below-threshold: cart subtotal < min_order_amount → no discount shown
//   above-threshold: cart subtotal ≥ min_order_amount → discount previewed
//     automatically + applied on place-order
//
// Promoted from a Playwright-MCP verify pass per the promotion ritual
// (e2e/README.md §"Promotion ritual").
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Automatic discount', () => {
  test('auto-discount previews when subtotal meets threshold and is absent below it', async ({ page }) => {
    const api = await ApiClient.create()
    const runId = Date.now()
    const user = randomEphemeralUser()
    let adminToken = ''
    let smallProductId: number | null = null
    let bigProductId: number | null = null
    let couponId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken

      // --- fixtures: two products (one below, one above the $50 threshold)
      const smallSlug = `e2e-autodiscount-small-${runId}`
      const bigSlug = `e2e-autodiscount-big-${runId}`

      const smallProduct = await api.createProduct(adminToken, {
        name: 'E2E Auto Small',
        slug: smallSlug,
        price_usd: 30,
        price_pln: 120,
        price_eur: 27,
        stock: 5,
      })
      smallProductId = smallProduct.id

      const bigProduct = await api.createProduct(adminToken, {
        name: 'E2E Auto Big',
        slug: bigSlug,
        price_usd: 60,
        price_pln: 240,
        price_eur: 54,
        stock: 5,
      })
      bigProductId = bigProduct.id

      await api.ensureShippingFixture(adminToken, {
        methodName: 'E2E Standard',
        countryCodes: ['US'],
        rates: [{ currency: 'USD', amount: 10 }],
      })

      // 15% automatic discount, requires ≥ $50 subtotal.
      // Percent coupons must not set a currency (backend validation).
      const coupon = await api.createCoupon(adminToken, {
        code: `AUTOTEST${runId}`,
        discount_type: 'percent',
        value: 15,
        min_order_amount: 50,
        is_active: true,
        is_automatic: true,
      })
      couponId = coupon.id

      await api.register(user)
      await api.markVerified(user.email)
      const { accessToken, refreshCookie } = await api.loginViaApi(user.email, user.password)
      await page.context().addCookies([refreshCookie])

      // ===================================================================
      // 1. BELOW THRESHOLD: $30 cart → auto-discount must NOT appear
      // ===================================================================
      await page.goto(`/products/${smallSlug}`)
      await expect(page.getByRole('heading', { name: 'E2E Auto Small' })).toBeVisible()
      await expect(async () => {
        await page.getByRole('button', { name: 'Add to Cart' }).first().click()
        await expect(
          page.getByRole('dialog').getByText('E2E Auto Small'),
        ).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 20_000 })

      await page.goto('/checkout')
      await expect(page.getByText('Order summary')).toBeVisible()

      // Wait for CouponField to finish the auto-preview (it fires on mount).
      // The discount line must be absent — the $30 subtotal is below the threshold.
      await page.waitForTimeout(1_500)
      await expect(page.getByTestId('coupon-automatic')).toHaveCount(0)
      await expect(page.getByTestId('summary-discount')).toHaveCount(0)

      // ===================================================================
      // 2. ABOVE THRESHOLD: $60 cart → auto-discount IS previewed + applied
      // ===================================================================
      // Clear the cart via localStorage reset and add the big product.
      await page.evaluate(() => localStorage.removeItem('cart'))
      await page.goto(`/products/${bigSlug}`)
      await expect(page.getByRole('heading', { name: 'E2E Auto Big' })).toBeVisible()
      await expect(async () => {
        await page.getByRole('button', { name: 'Add to Cart' }).first().click()
        await expect(
          page.getByRole('dialog').getByText('E2E Auto Big'),
        ).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 20_000 })

      await page.goto('/checkout')
      await expect(page.getByText('Order summary')).toBeVisible()

      // CouponField auto-previews on mount; wait for the indicator to appear.
      // data-testid="coupon-automatic" is the non-dismissible badge for automatics.
      await expect(page.getByTestId('coupon-automatic')).toBeVisible({ timeout: 10_000 })
      // 15% of $60 = $9.00
      await expect(page.getByTestId('summary-discount')).toContainText('$9.00')

      // --- place the order (automatic discount is re-picked server-side)
      await page.getByLabel('Address', { exact: true }).fill('2 Auto Dr')
      await page.getByLabel('City', { exact: true }).fill('New York')
      await page.getByLabel('Postal code', { exact: true }).fill('10001')
      await page.getByLabel('Country', { exact: true }).click()
      await page.getByRole('option', { name: 'United States' }).click()

      await expect(page.getByText('E2E Standard').first()).toBeVisible()
      const placeOrder = page.getByRole('button', { name: 'Place order' })
      await expect(placeOrder).toBeEnabled()
      await placeOrder.click()

      await expect(page).toHaveURL(/\/checkout\/success/, { timeout: 30_000 })
      await expect(page.getByRole('heading', { name: 'Order placed!' }))
        .toBeVisible({ timeout: 30_000 })

      // --- server-side: auto-discount applied (code recorded, discount = $9)
      const orders = await api.listOrders(accessToken)
      // The small-product order was placed? No — we only filled the small
      // product cart but navigated away before placing. Only the big order exists.
      const bigOrder = orders.find(o => o.total < 80 /* 60 − 9 + 10 = 61 */)
      expect(bigOrder).toBeDefined()
      const order = await api.getOrder(accessToken, bigOrder!.id)
      expect(order.status).toBe('pending')
      expect(order.currency).toBe('USD')
      expect(order.subtotal).toBe(60)
      expect(order.discount).toBe(9)
      expect(order.shipping).toBe(10)
      // total = 60 − 9 + 10 = 61
      expect(order.total).toBe(61)
      // Automatic coupon code IS stored on the order (server re-picks it)
      expect(order.coupon_code).toBe(coupon.code)

      const redeemed = await api.getCoupon(adminToken, couponId)
      expect(redeemed.used_count).toBe(1)
    }
    finally {
      if (couponId) await api.deleteCoupon(adminToken, couponId).catch(() => {})
      if (bigProductId) await api.deleteProduct(adminToken, bigProductId).catch(() => {})
      if (smallProductId) await api.deleteProduct(adminToken, smallProductId).catch(() => {})
      await api.dispose()
    }
  })
})
