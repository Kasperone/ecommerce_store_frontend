// Admin refund money path — a partial refund against a paid order, issued
// through the admin order-detail refund dialog, and the faktura korygująca
// (KOR) it must produce. Every paid order carries a sequential faktura
// (crud_invoice.issue_for_order fires unconditionally on the pending→paid
// transition), so a refund against it legally requires a corrective invoice:
// crud_refund.create_for_order allocates a gap-free KOR/{year}/{seq} number
// from its own counter (never consuming a faktura number).
//
// The decomposition/numbering internals are unit-tested backend-side; the e2e
// gap is the admin UI flow end-to-end: open the dialog, enter a partial amount,
// submit, and confirm (a) the refund + KOR surface in the order's Refunds
// section, and (b) the authoritative DB record — refund amount, KOR number, and
// the status flip to `partially_refunded` (cumulative refunds < order.total).
//
// The order is built via the API (create → advance to paid) so the browser
// interaction stays focused on the refund surface under test. Conventions
// mirror e2e/admin/order-editing.spec.ts (the admin order-detail spec).
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'
import { setUInputNumber } from '../helpers/uinputnumber'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Admin refund', () => {
  test('partial refund on a paid order records the refund + issues a KOR', async ({ page }) => {
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
        name: `E2E Refund ${runId}`,
        slug: `e2e-refund-${runId}`,
        price_usd: 100,
        price_pln: 400,
        price_eur: 90,
        stock: 5,
      })
      productId = product.id
      // Shared US fixture (same one order-editing uses) — one zone per country.
      const { methodId } = await api.ensureShippingFixture(adminToken, {
        methodName: 'E2E Standard',
        countryCodes: ['US'],
        rates: [{ currency: 'USD', amount: 10 }],
      })

      await api.register(user)
      await api.markVerified(user.email)
      const { accessToken: customerToken } = await api.loginViaApi(user.email, user.password)
      // Order total = 2 × 100 goods + 10 shipping = 210 (before any automatic
      // e2e-DB coupon). A 50 partial is comfortably under it either way, so the
      // status must land on partially_refunded, not refunded.
      const order = await api.createOrderViaApi(customerToken, {
        productId,
        quantity: 2,
        shippingMethodId: methodId,
        currency: 'USD',
      })
      // Advance to paid — this issues the faktura the KOR will correct.
      await api.advanceOrderStatus(adminToken, order.id, 'paid')

      // --- drive the admin refund UI
      const adminCookie = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      await page.context().addCookies([adminCookie.refreshCookie])
      await page.goto(`/admin/orders/${order.id}`)
      await expect(page.getByRole('heading', { name: order.order_number })).toBeVisible()

      // Open the refund dialog (the page-level "Issue refund" action; the dialog
      // reuses the same label on its submit button, so scope submit to the dialog).
      await page.getByRole('button', { name: 'Issue refund' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByRole('heading', { name: 'Issue refund' })).toBeVisible()

      // Goodwill partial: override the amount (no line picker), default reason
      // (customer_request) is fine. Drive the UInputNumber via real key events
      // (see helper) and confirm the value committed before submitting.
      const amountInput = dialog.getByRole('spinbutton', { name: 'Refund amount' })
      await setUInputNumber(amountInput, 50)
      await expect(amountInput).toHaveValue('50')
      const submit = dialog.getByRole('button', { name: 'Issue refund' })
      await expect(submit).toBeEnabled()
      await submit.click()

      // Dialog closes and the order refetches; the Refunds section persistently
      // shows the new refund with its allocated KOR (a transient success toast
      // also fires, but the section line is the durable proof).
      await expect(page.getByText(/Corrective invoice: KOR\/\d{4}\/\d+/)).toBeVisible({ timeout: 15_000 })

      // --- authoritative DB truth
      const summary = await api.getOrderRefundSummary(order.id)
      expect(summary.status).toBe('partially_refunded')
      expect(summary.refunds).toHaveLength(1)
      expect(summary.refunds[0]!.amount).toBe(50)
      expect(summary.refunds[0]!.reason).toBe('customer_request')
      // A faktura korygująca was allocated against the paid order's faktura.
      expect(summary.refunds[0]!.korNumber).toMatch(/^KOR\/\d{4}\/\d+$/)
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
