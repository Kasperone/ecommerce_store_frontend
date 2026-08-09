// Admin returns (RMA) processing — the decision leg that moves money.
//
// The customer half is covered by `account/rma.spec.ts` (file a request from
// the order-detail page). What was unguarded is everything after that: the
// admin reviewing the queue and walking the request through
// `requested → approved → received → refunded`, where the last step delegates
// to the shared refund choke point (`crud_refund.create_for_order`) and so
// mints a real refund, a faktura korygująca, and — with restock enabled — the
// inventory movements that put the returned units back on the shelf.
//
// The spec therefore asserts three things the UI alone cannot prove:
//   1. the list's status filter genuinely filters (row present under
//      "Requested", absent under "Rejected"),
//   2. each transition lands in pg (`return_requests.status` + the internal
//      admin note round-tripping), and
//   3. the refund leg produces the whole financial tail — `refunds` row, KOR
//      number, the order flipping to `partially_refunded`, `refund_id` stamped
//      on the return (UNIQUE: one refund per return), and stock restored.
//
// Restock is deliberately exercised: the backend restocks at *refund* time,
// not at receive, and the admin copy promises exactly that.
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { restoreStoreConfigAfterAll } from '../fixtures/storeConfig'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

// This file pins the returns window on the shared store_config singleton
// (below). Pinning is right — inheriting it is not — so hand it back.
restoreStoreConfigAfterAll(['returns_window_days'])

test.describe('Admin returns processing', () => {
  test('admin approves, receives and refunds an RMA — money, KOR and stock all move', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const user = randomEphemeralUser()
    let adminToken = ''
    let productId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken

      // Returns must be open for the request to be creatable at all; set it
      // explicitly so the spec doesn't inherit whatever the e2e DB was left on.
      // `restoreStoreConfigAfterAll` at the top of this file hands the prior
      // value back, so the next spec doesn't inherit ours either.
      await api.updateStoreConfig(adminToken, { returns_window_days: 30 })

      const product = await api.createProduct(adminToken, {
        name: `E2E RMA Admin ${runId}`,
        slug: `e2e-rma-admin-${runId}`,
        price_usd: 100,
        price_pln: 400,
        price_eur: 90,
        stock: 5,
      })
      productId = product.id
      // Shared US fixture — never add a cheaper US method (it hijacks the
      // storefront's cheapest-method auto-select for every sibling spec).
      const { methodId } = await api.ensureShippingFixture(adminToken, {
        methodName: 'E2E Standard',
        countryCodes: ['US'],
        rates: [{ currency: 'USD', amount: 10 }],
      })

      await api.register(user)
      await api.markVerified(user.email)
      const { accessToken: customerToken } = await api.loginViaApi(user.email, user.password)

      // 2 units ordered, 1 returned. Order total is 2 × 100 + 10 shipping, so a
      // 100 refund stays comfortably under it (→ partially_refunded, not
      // refunded) even if the e2e DB carries an automatic coupon.
      const order = await api.createOrderViaApi(customerToken, {
        productId,
        quantity: 2,
        shippingMethodId: methodId,
        currency: 'USD',
      })
      // paid issues the faktura the KOR will later correct; delivered stamps
      // delivered_at, which opens the return window.
      await api.advanceOrderStatus(adminToken, order.id, 'paid')
      await api.advanceOrderStatus(adminToken, order.id, 'shipped')
      await api.advanceOrderStatus(adminToken, order.id, 'delivered')

      const [itemId] = await api.getOrderItemIds(order.id)
      if (!itemId) throw new Error('No order items found')

      const ret = await api.createReturnRequest(customerToken, order.id, {
        items: [{ order_item_id: itemId, quantity: 1, reason: 'defective' }],
        comment: 'Arrived with a cracked casing.',
      })
      expect(ret.status).toBe('requested')

      // --- admin: the returns queue
      await page.context().addCookies([admin.refreshCookie])
      await page.goto('/admin/returns')

      const rowLink = page.getByRole('link', { name: `#${ret.id}`, exact: true })
      await expect(rowLink).toBeVisible({ timeout: 15_000 })

      // The status filter must actually filter: under "Rejected" our freshly
      // requested return has to disappear, and come back under "Requested".
      const statusFilter = page.getByTestId('returns-status-filter')
      await expect(async () => {
        await statusFilter.click()
        await expect(page.getByRole('option', { name: 'Rejected', exact: true }))
          .toBeVisible({ timeout: 3_000 })
      }).toPass({ timeout: 20_000 })
      await page.getByRole('option', { name: 'Rejected', exact: true }).click()
      await expect(rowLink).toBeHidden()

      await statusFilter.click()
      await page.getByRole('option', { name: 'Requested', exact: true }).click()
      await expect(rowLink).toBeVisible()
      await rowLink.click()

      // --- detail: requested → approved
      await expect(page.getByRole('heading', { name: `Return #${ret.id}` })).toBeVisible()
      await expect(page.getByTestId('return-status-badge')).toHaveText('Requested')
      await expect(page.getByTestId('return-customer-comment'))
        .toContainText('Arrived with a cracked casing.')

      const adminNote = `Photos reviewed ${runId}`
      await page.getByTestId('return-approve').click()
      await page.getByTestId('return-action-note').fill(adminNote)
      await page.getByTestId('return-action-confirm').click()

      await expect(page.getByTestId('return-status-badge')).toHaveText('Approved', { timeout: 15_000 })
      const approved = await api.getReturnRow(ret.id)
      expect(approved.status).toBe('approved')
      // The internal note is admin-only and must survive the round-trip.
      expect(approved.adminNote).toBe(adminNote)
      await expect(page.getByTestId('return-admin-note')).toContainText(adminNote)

      // --- approved → received (no stock movement here, by design)
      const stockAfterReceive = await api.getProductStock(productId)
      await page.getByTestId('return-receive').click()
      await page.getByTestId('return-action-confirm').click()
      await expect(page.getByTestId('return-status-badge')).toHaveText('Received', { timeout: 15_000 })
      expect((await api.getReturnRow(ret.id)).status).toBe('received')
      expect(await api.getProductStock(productId)).toBe(stockAfterReceive)

      // --- received → refunded (the money leg)
      await page.getByTestId('return-refund').click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByRole('heading', { name: 'Issue refund for this return' }))
        .toBeVisible()

      // The amount pre-fills with Σ unit_price × returned qty — 1 × 100 — which
      // is also the backend's default when `amount` is omitted.
      const amountInput = dialog.getByRole('spinbutton', { name: 'Refund amount' })
      await expect(amountInput).toHaveValue(/^100(\.00)?$/)

      // Restock is off by default; turning it on is what writes the movements.
      await dialog.getByRole('checkbox').check()
      await page.getByTestId('return-refund-confirm').click()

      await expect(page.getByTestId('return-status-badge')).toHaveText('Refunded', { timeout: 20_000 })

      // --- authoritative DB truth
      const refunded = await api.getReturnRow(ret.id)
      expect(refunded.status).toBe('refunded')
      expect(refunded.refundId).not.toBeNull()

      const summary = await api.getOrderRefundSummary(order.id)
      expect(summary.status).toBe('partially_refunded')
      expect(summary.refunds).toHaveLength(1)
      expect(summary.refunds[0]!.amount).toBe(100)
      expect(summary.refunds[0]!.reason).toBe('customer_request')
      // Every paid order carries a faktura, so the refund legally requires a
      // corrective invoice — allocated from the KOR counter, not the faktura one.
      expect(summary.refunds[0]!.korNumber).toMatch(/^KOR\/\d{4}\/\d+$/)

      // Restock landed: the one returned unit is back on the shelf.
      expect(await api.getProductStock(productId)).toBe(stockAfterReceive + 1)

      // The closed return links to the refund it produced.
      await expect(page.getByText(`#${refunded.refundId}`, { exact: true })).toBeVisible()
    }
    finally {
      // 409s once an order references the product — expected, not a failure.
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
