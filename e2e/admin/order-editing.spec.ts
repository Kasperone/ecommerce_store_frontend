// Admin order editing — the A2 money path promoted from the 2026-07-15
// Back-Office Maturity live-verify pass. A PENDING order's line items can be
// re-edited: the admin changes a quantity, adds a line via the product picker,
// and sets a manual discount; ONE `PATCH /orders/{id}/items` recomputes
// subtotal/total (Decimal-exact, ROUND_HALF_UP), reconciles stock, and appends
// an `edited` timeline event. Editing is gated to pending orders + the
// orders:write capability — a PAID order shows no "Edit items" toggle.
//
// Deterministic: own seeded order (fresh customer + fresh products with unique
// slugs), shipping rate 0 so `total == subtotal − discount`, cleaned up after.
// Conventions mirror e2e/checkout/pl-money-path.spec.ts (money-path spec) and
// e2e/admin/category-crud.spec.ts (admin-page auth via refresh-cookie inject).
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'
import { setUInputNumber } from '../helpers/uinputnumber'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Admin order editing (A2)', () => {
  test('edits a pending order — recomputes totals + records a timeline event', async ({ page }) => {
    // Heavy admin page (order detail + editor + picker + timeline) cold-compiles
    // on the dev server; give it the generous budget the e2e README calls for.
    test.slow()

    const api = await ApiClient.create()
    const runId = Date.now()
    const user = randomEphemeralUser()
    let adminToken = ''
    let productAId: number | null = null
    let productBId: number | null = null

    try {
      // --- fixtures: two USD products + a US shipping rate of 0, fresh customer
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken

      const productA = await api.createProduct(adminToken, {
        name: `E2E Edit Base ${runId}`,
        slug: `e2e-edit-base-${runId}`,
        price_usd: 10.01, // non-round → proves Decimal arithmetic, not float drift
        price_pln: 40,
        price_eur: 9,
        stock: 10,
      })
      productAId = productA.id
      const productB = await api.createProduct(adminToken, {
        name: `E2E Edit Add ${runId}`,
        slug: `e2e-edit-add-${runId}`,
        price_usd: 5,
        price_pln: 20,
        price_eur: 4.5,
        stock: 10,
      })
      productBId = productB.id

      // Reuse the SHARED US fixture every checkout spec uses ('E2E Standard' /
      // US / $10) — idempotent, adds no method. A per-run cheaper method would
      // pollute the shared US zone and get auto-selected by the UI checkout
      // specs (breaking their shipping-total assertions).
      const { methodId } = await api.ensureShippingFixture(adminToken, {
        methodName: 'E2E Standard',
        countryCodes: ['US'],
        rates: [{ currency: 'USD', amount: 10 }],
      })

      await api.register(user)
      await api.markVerified(user.email)
      const { accessToken: customerToken } = await api.loginViaApi(user.email, user.password)

      // Seed a PENDING order (product A × 1) straight through the API.
      const order = await api.createOrderViaApi(customerToken, {
        productId: productAId,
        quantity: 1,
        shippingMethodId: methodId,
        currency: 'USD',
      })
      expect(order.status).toBe('pending')

      // --- open the admin order detail page as the owner-admin
      const adminCookie = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      await page.context().addCookies([adminCookie.refreshCookie])
      await page.goto(`/admin/orders/${order.id}`)
      await expect(page.getByRole('heading', { name: order.order_number })).toBeVisible()

      // --- enter edit mode (pending + orders:write → toggle present)
      await page.getByTestId('order-edit-items-toggle').click()
      const editor = page.getByTestId('order-items-editor')
      await expect(editor).toBeVisible()

      // Bump product A's quantity 1 → 2. The UInputNumber's data-testid lands on
      // the spinbutton input itself, so scope by the line and pick the visible
      // spinbutton by its accessible name (there's one "Qty" per line).
      await setUInputNumber(
        page.getByTestId(`order-edit-line-${productAId}`).getByRole('spinbutton', { name: 'Qty' }),
        2,
      )

      // Add product B via the picker (search → pick → add).
      await page.getByPlaceholder(/search products to add/i).fill(String(runId))
      await page.getByTestId(`order-edit-product-${productBId}`).click()
      await page.getByTestId('order-edit-add').click()
      await expect(page.getByTestId(`order-edit-line-${productBId}`)).toBeVisible()

      // Set a manual discount (the only "Discount" spinbutton on the page).
      await setUInputNumber(page.getByRole('spinbutton', { name: 'Discount' }), 1.51)

      // Live preview (client-side) already reflects the recompute:
      // subtotal = 2×10.01 + 1×5.00 = 25.02; total = 25.02 − 1.51 + 10 (shipping) = 33.51.
      await expect(page.getByTestId('order-edit-subtotal')).toContainText('25.02')
      await expect(page.getByTestId('order-edit-total')).toContainText('33.51')

      // --- save (single PATCH /orders/{id}/items)
      await page.getByTestId('order-edit-save').click()

      // The editor collapses back to the read-only card on save. This used to
      // race with the save's invalidation refetch: the detail page gated its
      // whole content subtree on `isLoading`, which flips true on that refetch,
      // so the editor unmounted mid-save and the in-flight `emit('saved')` fired
      // from a detached instance — the editor remounted still open. The page now
      // gates loading on `status === 'pending'` (initial load only), so the
      // content stays mounted through refetches and the close is deterministic.
      await expect(editor).toBeHidden({ timeout: 20_000 })

      // The edit event also lands at the top of the timeline (events are
      // newest-first, and the timeline refetches on save).
      const timeline = page.locator('ol').filter({ hasText: 'Order created' })
      await expect(timeline.locator('> li').first())
        .toContainText('Order items edited', { timeout: 20_000 })

      // --- server-side truth: Decimal-exact recompute in the read-back. Re-mint
      // the customer token first — the e2e backend runs a short access-token TTL
      // and the cold-compile page load above can age the original token.
      const { accessToken: freshCustomerToken } = await api.loginViaApi(user.email, user.password)
      const saved = await api.getOrder(freshCustomerToken, order.id)
      expect(saved.subtotal).toBe(25.02)
      expect(saved.discount).toBe(1.51)
      expect(saved.shipping).toBe(10)
      expect(saved.total).toBe(33.51)
      expect(saved.items).toHaveLength(2)
      const productIds = saved.items.map(i => i.product_id).sort((a, b) => a - b)
      expect(productIds).toEqual([productAId, productBId].sort((a, b) => a - b))
      const lineA = saved.items.find(i => i.product_id === productAId)
      expect(lineA?.quantity).toBe(2)
    }
    finally {
      if (productAId) await api.deleteProduct(adminToken, productAId).catch(() => {})
      if (productBId) await api.deleteProduct(adminToken, productBId).catch(() => {})
      await api.dispose()
    }
  })

  test('a PAID order shows no "Edit items" toggle', async ({ page }) => {
    test.slow()

    const api = await ApiClient.create()
    const runId = Date.now()
    const user = randomEphemeralUser()
    let adminToken = ''
    let productId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken

      const product = await api.createProduct(adminToken, {
        name: `E2E Edit Paid ${runId}`,
        slug: `e2e-edit-paid-${runId}`,
        price_usd: 12,
        price_pln: 48,
        price_eur: 11,
        stock: 5,
      })
      productId = product.id
      // Shared US fixture (see the pending test) — no per-run method.
      const { methodId } = await api.ensureShippingFixture(adminToken, {
        methodName: 'E2E Standard',
        countryCodes: ['US'],
        rates: [{ currency: 'USD', amount: 10 }],
      })

      await api.register(user)
      await api.markVerified(user.email)
      const { accessToken: customerToken } = await api.loginViaApi(user.email, user.password)
      const order = await api.createOrderViaApi(customerToken, {
        productId,
        quantity: 1,
        shippingMethodId: methodId,
        currency: 'USD',
      })
      // Advance to paid — edit-items is a pending-only affordance.
      await api.advanceOrderStatus(adminToken, order.id, 'paid')

      const adminCookie = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      await page.context().addCookies([adminCookie.refreshCookie])
      await page.goto(`/admin/orders/${order.id}`)
      await expect(page.getByRole('heading', { name: order.order_number })).toBeVisible()

      // The items card renders, but with no edit toggle for a non-pending order.
      await expect(page.getByRole('heading', { name: 'Items', exact: true })).toBeVisible()
      await expect(page.getByTestId('order-edit-items-toggle')).toHaveCount(0)
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
