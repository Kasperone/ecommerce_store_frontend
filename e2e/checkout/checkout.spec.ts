// Checkout happy path — the core revenue flow: PDP → add to cart → /checkout
// → place order → pending order created server-side.
//
// Promoted from a Playwright-MCP verify pass per the promotion ritual
// (e2e/README.md §"Promotion ritual"). Fixtures are created per run with
// unique slugs/names so the spec is rerunnable without manual cleanup.
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Checkout', () => {
  test('happy path: add to cart, fill shipping, place order, pending order created', async ({ page }) => {
    const api = await ApiClient.create()
    const runId = Date.now()
    const user = randomEphemeralUser()
    let adminToken = ''
    let productId: number | null = null

    try {
      // --- fixtures: product + quotable shipping (admin API), fresh customer
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const slug = `e2e-checkout-${runId}`
      const product = await api.createProduct(adminToken, {
        name: 'E2E Checkout Widget',
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

      await api.register(user)
      await api.markVerified(user.email)
      const { accessToken, refreshCookie } = await api.loginViaApi(user.email, user.password)
      await page.context().addCookies([refreshCookie])

      // --- add to cart from the PDP
      await page.goto(`/products/${slug}`)
      await expect(page.getByRole('heading', { name: 'E2E Checkout Widget' })).toBeVisible()
      // The cart is client-only Pinia state — re-click until the hydrated
      // handler lands (same recovery pattern as admin/category-crud.spec.ts).
      // A successful add opens the cart drawer with the product in it.
      await expect(async () => {
        await page.getByRole('button', { name: 'Add to Cart' }).first().click()
        await expect(
          page.getByRole('dialog').getByText('E2E Checkout Widget'),
        ).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 20_000 })

      await page.goto('/cart')
      await expect(page.getByText('E2E Checkout Widget').first()).toBeVisible()
      await expect(page.getByRole('link', { name: 'Proceed to checkout' })).toBeVisible()

      // --- single-page checkout: shipping form + method + summary
      await page.goto('/checkout')
      const address = page.getByLabel('Address', { exact: true })
      await expect(address).toBeVisible()
      await address.fill('123 Main St')
      await page.getByLabel('City', { exact: true }).fill('New York')
      await page.getByLabel('Postal code', { exact: true }).fill('10001')
      await page.getByLabel('Country', { exact: true }).click()
      await page.getByRole('option', { name: 'United States' }).click()

      // Picking a country quotes shipping; the selector auto-selects the
      // cheapest method, which enables "Place order".
      await expect(page.getByText('E2E Standard').first()).toBeVisible()
      await expect(page.getByText('Order summary')).toBeVisible()
      const placeOrder = page.getByRole('button', { name: 'Place order' })
      await expect(placeOrder).toBeEnabled()
      await placeOrder.click()

      // --- success page. Generous timeouts: the first hit compiles the
      // /checkout/success chunk on the dev server (cold CI runs take >5s).
      // Only the heading is asserted: the order-number box reads an
      // in-memory useState that legitimately resets if the dev server falls
      // back to a hard load on that first chunk — the order itself is
      // verified server-side below.
      await expect(page).toHaveURL(/\/checkout\/success/, { timeout: 30_000 })
      await expect(page.getByRole('heading', { name: 'Order placed!' }))
        .toBeVisible({ timeout: 30_000 })

      // --- server-side truth: one pending order with the right money math
      const orders = await api.listOrders(accessToken)
      expect(orders).toHaveLength(1)
      const order = await api.getOrder(accessToken, orders[0]!.id)
      expect(order.status).toBe('pending')
      expect(order.currency).toBe('USD')
      expect(order.subtotal).toBe(100)
      expect(order.shipping).toBe(10)
      expect(order.discount).toBe(0)
      expect(order.coupon_code).toBeNull()
      // total = goods subtotal − discount + shipping
      expect(order.total).toBe(110)
      expect(order.shipping_address).toBe('123 Main St')
      expect(order.shipping_city).toBe('New York')
      expect(order.shipping_postal_code).toBe('10001')
      expect(order.shipping_country).toBe('US')
      expect(order.items).toHaveLength(1)
      expect(order.items[0]!.product_id).toBe(productId)
      expect(order.items[0]!.quantity).toBe(1)
      expect(order.items[0]!.unit_price).toBe(100)

      // The success navigation cleared the cart.
      await page.goto('/cart')
      await expect(page.getByText('Your cart is empty')).toBeVisible()
    }
    finally {
      // Best-effort teardown — the order row keeps FK references, so the
      // delete may be rejected; unique per-run slugs make leftovers harmless.
      // The shipping fixture is shared (ensure-semantics) and never deleted.
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
