// RMA / returns — customer requests a return from the order-detail page.
//
// Flow:
//   1. Admin creates a product; customer creates an order via the API.
//   2. Admin advances the order: pending → paid → shipped → delivered
//      (the PATCH to "delivered" stamps delivered_at, opening the return window).
//   3. Customer navigates to /account/orders/{id} and clicks "Request return".
//   4. The return modal shows the line picker; customer sets qty=1 + reason.
//   5. Submitting fires a success toast and creates a return with status=requested.
//
// Promoted from a Playwright-MCP verify pass per the promotion ritual
// (e2e/README.md §"Promotion ritual").
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('RMA — customer return request', () => {
  test('customer requests a return for a delivered order and the request is created server-side', async ({ page }) => {
    const api = await ApiClient.create()
    const runId = Date.now()
    const user = randomEphemeralUser()
    let adminToken = ''
    let productId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken

      // Ensure returns are open (default is 30 days; set explicitly so the
      // spec is deterministic regardless of what the dev DB has been set to).
      await api.updateStoreConfig(adminToken, { returns_window_days: 30 })

      const slug = `e2e-rma-${runId}`
      const product = await api.createProduct(adminToken, {
        name: 'E2E Return Widget',
        slug,
        price_usd: 80,
        price_pln: 320,
        price_eur: 72,
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

      // Create order via API (faster than driving the checkout UI; the RMA
      // flow under test starts at /account/orders/{id}, not at checkout).
      const order = await api.createOrderViaApi(accessToken, {
        productId: product.id,
        quantity: 1,
        shippingMethodId: methodId,
        currency: 'USD',
      })

      // Admin workflow: pending → paid → shipped → delivered.
      // The transition to "delivered" sets delivered_at (eligibility anchor).
      await api.advanceOrderStatus(adminToken, order.id, 'paid')
      await api.advanceOrderStatus(adminToken, order.id, 'shipped')
      await api.advanceOrderStatus(adminToken, order.id, 'delivered')

      // Get order item IDs so we can build exact data-testids for the modal.
      const [itemId] = await api.getOrderItemIds(order.id)
      if (!itemId) throw new Error('No order items found')

      // --- customer navigates to the order detail page
      await page.context().addCookies([refreshCookie])
      await page.goto(`/account/orders/${order.id}`)
      await expect(page.getByText('E2E Return Widget')).toBeVisible({ timeout: 15_000 })

      // The "Request return" button appears when the eligibility query resolves.
      // It is a Pinia Colada client-only query (enabled: import.meta.client),
      // so it fires after hydration — use toPass to retry until visible.
      const returnBtn = page.getByTestId('request-return-button')
      await expect(async () => {
        await expect(returnBtn).toBeVisible({ timeout: 3_000 })
      }).toPass({ timeout: 20_000 })
      await returnBtn.click()

      // --- return modal
      await expect(page.getByTestId('return-line-picker')).toBeVisible()

      // Increment qty from 0 → 1 using the UInputNumber's "Increment" button.
      // fill() on the inner <input> does not trigger Vue's reactivity; the
      // "Increment" button emits update:modelValue correctly.
      const dialog = page.getByRole('dialog', { name: 'Request a return' })
      await dialog.getByRole('button', { name: 'Increment' }).click()

      // The reason select only renders once qty > 0.
      const reasonEl = page.getByTestId(`return-line-${itemId}-reason`)
      await expect(reasonEl).toBeVisible({ timeout: 5_000 })
      await reasonEl.click()
      await page.getByRole('option', { name: 'Defective item' }).click()

      // Submit
      await page.getByTestId('return-submit').click()

      // Success toast
      await expect(
        page.getByLabel('Notifications (F8)').getByText('Return request submitted'),
      ).toBeVisible({ timeout: 10_000 })

      // --- server-side: one return request with status=requested
      const returns = await api.listOrderReturns(accessToken, order.id)
      expect(returns).toHaveLength(1)
      expect(returns[0]!.status).toBe('requested')
      expect(returns[0]!.items).toHaveLength(1)
      expect(returns[0]!.items[0]!.order_item_id).toBe(itemId)
      expect(returns[0]!.items[0]!.quantity).toBe(1)
      expect(returns[0]!.items[0]!.reason).toBe('defective')
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
