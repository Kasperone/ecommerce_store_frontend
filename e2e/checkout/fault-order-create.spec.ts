// Fault injection: the order POST fails at the network edge mid-checkout.
//
// This is the highest-value untested state in the app. Every checkout spec so
// far drives a healthy stack, so the failure contract — the one a real customer
// hits when the backend 500s on the last click — has never been exercised:
//
//   1. the error is surfaced, not swallowed
//   2. the customer stays on /checkout (no phantom success page)
//   3. the cart is NOT cleared (the goods survive to a retry)
//   4. no order row is created
//
// (4) is the assertion that needs care. "No order exists" passes just as
// happily if the flow never reached the POST at all — a broken locator, a
// disabled button, a validation guard firing early would all produce a green
// vacuum. So the spec ends with a POSITIVE CONTROL: drop the fault, place the
// order for real, and assert exactly one order now exists. That run proves the
// path was reachable all along, which is what makes the zero above meaningful.
//
// Uses `page.route` at the network edge (the pattern proven in
// admin/category-hero-seo.spec.ts) rather than breaking the backend, so the
// fault is precise, synchronous and leaves the rest of the stack live.
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

// Drives the full checkout twice (the fault run, then the positive control),
// each hitting cold Vite compiles for /products, /checkout and
// /checkout/success. The 30s default is not close to enough.
test.setTimeout(240_000)

test.describe('Checkout fault injection', () => {
  test('order create 500: error shown, cart survives, no order row, then succeeds on retry', async ({ page }) => {
    const api = await ApiClient.create()
    const runId = Date.now()
    const user = randomEphemeralUser()
    let adminToken = ''
    let productId: number | null = null

    try {
      // --- fixtures: product + quotable shipping, fresh verified customer
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const slug = `e2e-fault-order-${runId}`
      const product = await api.createProduct(adminToken, {
        name: 'E2E Fault Widget',
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

      // Fail ONLY the create POST, and only while `failOrderCreate` is set. A
      // flag beats `page.unroute()` here: flipping it is synchronous, so the
      // positive control below cannot race a half-removed handler. Method-gated
      // because the checkout page also GETs under /api/v1/orders.
      let failOrderCreate = true
      let createAttempts = 0
      await page.route('**/api/v1/orders/', async (route) => {
        if (route.request().method() !== 'POST') return route.continue()
        if (!failOrderCreate) return route.continue()
        createAttempts += 1
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'order service unavailable' }),
        })
      })

      // --- add to cart from the PDP
      await page.goto(`/products/${slug}`)
      await expect(page.getByRole('heading', { name: 'E2E Fault Widget' })).toBeVisible()
      // The cart is client-only Pinia state — re-click until the hydrated
      // handler lands (same recovery pattern as checkout.spec.ts).
      await expect(async () => {
        await page.getByRole('button', { name: 'Add to Cart' }).first().click()
        await expect(
          page.getByRole('dialog').getByText('E2E Fault Widget'),
        ).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 20_000 })

      // --- single-page checkout
      await page.goto('/checkout')
      const address = page.getByLabel('Address', { exact: true })
      await expect(address).toBeVisible()
      await address.fill('123 Main St')
      await page.getByLabel('City', { exact: true }).fill('New York')
      await page.getByLabel('Postal code', { exact: true }).fill('10001')
      await page.getByLabel('Country', { exact: true }).click()
      await page.getByRole('option', { name: 'United States' }).click()

      await expect(page.getByText('E2E Standard').first()).toBeVisible()
      const placeOrder = page.getByRole('button', { name: 'Place order' })
      await expect(placeOrder).toBeEnabled()
      await placeOrder.click()

      // --- (1) the failure is surfaced, not swallowed
      await expect(page.getByText('Could not place your order').first())
        .toBeVisible({ timeout: 30_000 })
      // The fault actually fired — without this the alert could in principle be
      // some other validation error and the rest of the test would misread it.
      expect(createAttempts).toBe(1)

      // --- (2) no phantom success navigation
      await expect(page).toHaveURL(/\/checkout(\?|$)/)

      // --- (3) the cart survived, so the customer can retry. localStorage is
      // the real source of truth here, not a UI scrape: the cart is
      // client-only state (`STORAGE_KEY = 'cart'` in app/stores/cart.ts,
      // persisted as a bare CartItem[]) and has no server row to assert on.
      const persistedCart = await page.evaluate(
        () => JSON.parse(localStorage.getItem('cart') ?? '[]') as unknown[],
      )
      expect(persistedCart).toHaveLength(1)

      // --- (4) nothing was persisted
      expect(await api.listOrders(accessToken)).toHaveLength(0)

      // --- POSITIVE CONTROL: drop the fault and place the same order for real.
      // Without this, assertion (4) is unfalsifiable — it would pass just as
      // happily if the click never reached the network at all.
      failOrderCreate = false
      await page.goto('/checkout')
      await expect(page.getByLabel('Address', { exact: true })).toBeVisible()
      await page.getByLabel('Address', { exact: true }).fill('123 Main St')
      await page.getByLabel('City', { exact: true }).fill('New York')
      await page.getByLabel('Postal code', { exact: true }).fill('10001')
      await page.getByLabel('Country', { exact: true }).click()
      await page.getByRole('option', { name: 'United States' }).click()
      await expect(page.getByText('E2E Standard').first()).toBeVisible()

      const retry = page.getByRole('button', { name: 'Place order' })
      await expect(retry).toBeEnabled()
      await retry.click()

      await expect(page).toHaveURL(/\/checkout\/success/, { timeout: 30_000 })

      const orders = await api.listOrders(accessToken)
      expect(orders).toHaveLength(1)
      const order = await api.getOrder(accessToken, orders[0]!.id)
      expect(order.status).toBe('pending')
      expect(order.total).toBe(110)
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
