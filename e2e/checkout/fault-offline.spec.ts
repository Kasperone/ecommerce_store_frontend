// Fault injection: the network drops mid-checkout.
//
// Deliberately NOT a duplicate of fault-order-create.spec.ts. That one returns
// an HTTP 500 — a real response, with a real `{ detail }` body for
// `normalizeApiError` to read. This one produces no response at all: the
// request dies at the transport layer, so the error reaching the page has no
// status and no body. Those are two different code paths through the error
// normaliser, and the transport-failure path is the one a customer on a phone
// in a lift actually hits.
//
// The contract is the same, and it is the part that matters: a dropped
// connection must not look like a placed order.
//
// `route.abort('internetdisconnected')` rather than `context.setOffline(true)`:
// the suite runs against a Vite dev server whose HMR socket and lazy chunk
// loading share the connection, so a blanket offline toggle breaks the page
// itself and stops testing checkout. Aborting the single POST is the surgical
// equivalent and stays deterministic.
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(240_000)

test.describe('Checkout fault injection', () => {
  test('connection drops on order create: error shown, cart survives, no order row, then succeeds when back online', async ({ page }) => {
    const api = await ApiClient.create()
    const runId = Date.now()
    const user = randomEphemeralUser()
    let adminToken = ''
    let productId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const slug = `e2e-fault-offline-${runId}`
      const product = await api.createProduct(adminToken, {
        name: 'E2E Offline Widget',
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

      let offline = true
      let createAttempts = 0
      await page.route('**/api/v1/orders/', async (route) => {
        if (route.request().method() !== 'POST') return route.continue()
        if (!offline) return route.continue()
        createAttempts += 1
        await route.abort('internetdisconnected')
      })

      await page.goto(`/products/${slug}`)
      await expect(page.getByRole('heading', { name: 'E2E Offline Widget' })).toBeVisible()
      await expect(async () => {
        await page.getByRole('button', { name: 'Add to Cart' }).first().click()
        await expect(
          page.getByRole('dialog').getByText('E2E Offline Widget'),
        ).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 20_000 })

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

      // A transport failure must still reach the user. The alert title is the
      // generic fallback here precisely because there is no server message to
      // show — which is the behaviour being pinned: no message must never mean
      // no feedback.
      await expect(page.getByText('Could not place your order').first())
        .toBeVisible({ timeout: 30_000 })
      expect(createAttempts).toBeGreaterThan(0)

      // Not on the success page, and the button is usable again rather than
      // stuck in its loading state — a spinner that never resolves is the
      // classic way a dropped connection turns into a support ticket.
      await expect(page).toHaveURL(/\/checkout(\?|$)/)
      await expect(placeOrder).toBeEnabled()

      const persistedCart = await page.evaluate(
        () => JSON.parse(localStorage.getItem('cart') ?? '[]') as unknown[],
      )
      expect(persistedCart).toHaveLength(1)

      expect(await api.listOrders(accessToken)).toHaveLength(0)

      // --- POSITIVE CONTROL: back online, same order, must go through. Proves
      // the empty order list above reflects the dropped connection and not an
      // unreachable button.
      offline = false
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
      expect(await api.listOrders(accessToken)).toHaveLength(1)
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
