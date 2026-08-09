// Coupon redemption at checkout — apply a percent code, see the discount in
// the summary, and verify the order + the coupon's used_count server-side.
// Also locks the invalid-code error state.
//
// Promoted from a Playwright-MCP verify pass per the promotion ritual
// (e2e/README.md §"Promotion ritual").
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Coupon redemption', () => {
  test('percent coupon discounts the goods subtotal and is recorded on the order', async ({ page }) => {
    const api = await ApiClient.create()
    const runId = Date.now()
    const user = randomEphemeralUser()
    const code = `E2E${runId}`
    let adminToken = ''
    let productId: number | null = null
    let couponId: number | null = null

    try {
      // --- fixtures: product + shared shipping + a 10% coupon, fresh customer
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const slug = `e2e-coupon-${runId}`
      const product = await api.createProduct(adminToken, {
        name: 'E2E Coupon Widget',
        slug,
        price_usd: 100,
        price_pln: 400,
        price_eur: 90,
        stock: 5,
      })
      productId = product.id
      await api.ensureShippingFixture(adminToken, {
        methodName: 'E2E Standard',
        countryCodes: ['US'],
        rates: [{ currency: 'USD', amount: 10 }],
      })
      const coupon = await api.createCoupon(adminToken, {
        code,
        discount_type: 'percent',
        value: 10,
        is_active: true,
      })
      couponId = coupon.id

      await api.register(user)
      await api.markVerified(user.email)
      const { accessToken, refreshCookie } = await api.loginViaApi(user.email, user.password)
      await page.context().addCookies([refreshCookie])

      // --- add to cart, go to checkout
      await page.goto(`/products/${slug}`)
      await expect(page.getByRole('heading', { name: 'E2E Coupon Widget' })).toBeVisible()
      await expect(async () => {
        await page.getByRole('button', { name: 'Add to Cart' }).first().click()
        await expect(
          page.getByRole('dialog').getByText('E2E Coupon Widget'),
        ).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 20_000 })

      await page.goto('/checkout')
      await expect(page.getByText('Order summary')).toBeVisible()

      // --- an unknown code surfaces the error and applies nothing
      // Locate by testid, not role+name: CheckoutGiftCardField renders a second
      // "Apply" button whenever store_config.gift_cards_enabled is on, and that
      // toggle is global state other specs flip — a role locator here is
      // order-dependent (strict-mode violation).
      const couponInput = page.getByTestId('coupon-input')
      await couponInput.fill('E2E-NO-SUCH-CODE')
      await page.getByTestId('coupon-apply').click()
      await expect(page.getByTestId('coupon-error')).toBeVisible()
      await expect(page.getByTestId('summary-discount')).toHaveCount(0)

      // --- the real code applies: badge + discount line in the summary
      await couponInput.fill(code)
      await page.getByTestId('coupon-apply').click()
      await expect(page.getByTestId('coupon-applied')).toBeVisible()
      await expect(page.getByTestId('coupon-applied')).toContainText(code)
      // 10% of the $100 goods subtotal — shipping is not discounted.
      await expect(page.getByTestId('summary-discount')).toContainText('$10.00')

      // --- place the order
      await page.getByLabel('Address', { exact: true }).fill('456 Coupon Ave')
      await page.getByLabel('City', { exact: true }).fill('New York')
      await page.getByLabel('Postal code', { exact: true }).fill('10001')
      await page.getByLabel('Country', { exact: true }).click()
      await page.getByRole('option', { name: 'United States' }).click()
      await expect(page.getByText('E2E Standard').first()).toBeVisible()
      const placeOrder = page.getByRole('button', { name: 'Place order' })
      await expect(placeOrder).toBeEnabled()
      await placeOrder.click()
      // Generous timeouts — the first hit compiles the /checkout/success
      // chunk on the dev server (cold CI runs take >5s).
      await expect(page).toHaveURL(/\/checkout\/success/, { timeout: 30_000 })
      await expect(page.getByRole('heading', { name: 'Order placed!' }))
        .toBeVisible({ timeout: 30_000 })

      // --- server-side truth: discount applied to the goods subtotal only,
      // code recorded, atomic used_count bump
      const orders = await api.listOrders(accessToken)
      expect(orders).toHaveLength(1)
      const order = await api.getOrder(accessToken, orders[0]!.id)
      expect(order.status).toBe('pending')
      expect(order.coupon_code).toBe(code)
      expect(order.subtotal).toBe(100)
      expect(order.discount).toBe(10)
      expect(order.shipping).toBe(10)
      // total = subtotal − discount + shipping
      expect(order.total).toBe(100)

      const redeemed = await api.getCoupon(adminToken, couponId)
      expect(redeemed.used_count).toBe(1)
    }
    finally {
      if (couponId) await api.deleteCoupon(adminToken, couponId).catch(() => {})
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
