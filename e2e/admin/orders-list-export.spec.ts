// Admin orders list — the status filter and the CSV export.
//
// Both feed reconciliation: the filter is how an operator finds the orders they
// need to act on, and the export is what leaves the system for accounting. A
// regression in either is silent — a filter that quietly ignores its input still
// renders a plausible table, and an export that drops rows still downloads.
//
// FE #334 is the precedent: `/admin/shipping` called `useUrlFilters`' `set` with
// two arguments instead of one patch object, so every filter on that page did
// nothing at all, and no spec noticed. This one therefore drives the real
// `USelect` rather than deep-linking `?status=`, so a broken `set` call here
// fails the spec instead of shipping.
//
// Assertions are scoped to the two orders this spec creates. The admin list is
// store-wide and the e2e DB accumulates orders from every other spec, so
// "the paid one is present AND the pending one is absent" is the only claim
// that stays true no matter what else ran first.
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Download } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'
import { selectOption } from '../helpers/nuxtUiSelect'

test.use({ storageState: { cookies: [], origins: [] } })

// `order_export.build_orders_csv` writes UTF-8 *with BOM* so Excel opens the
// file without mangling non-ASCII names. The BOM is part of the contract.
const BOM = '﻿'
const CSV_FIRST_HEADER = 'order_number'

test.describe('Admin orders list', () => {
  test('status filter slices the list and the CSV export carries the filtered rows', async ({ page }) => {
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
        name: `E2E Orders Export Widget ${runId}`,
        slug: `e2e-orders-export-${runId}`,
        price_usd: 40,
        price_pln: 160,
        price_eur: 36,
        stock: 10,
      })
      productId = product.id
      // Shared US fixture — never add a cheaper method here, the storefront
      // auto-selects the cheapest in the zone and would hijack sibling specs.
      const { methodId } = await api.ensureShippingFixture(adminToken, {
        methodName: 'E2E Standard',
        countryCodes: ['US'],
        rates: [{ currency: 'USD', amount: 10 }],
      })

      await api.register(user)
      await api.markVerified(user.email)
      const { accessToken } = await api.loginViaApi(user.email, user.password)

      // Two orders, deliberately in different statuses: one must survive the
      // filter and one must be excluded by it. A filter that does nothing shows
      // both; a filter that shows nothing fails the positive assertion.
      const paidOrder = await api.createOrderViaApi(accessToken, {
        productId,
        quantity: 1,
        shippingMethodId: methodId,
        currency: 'USD',
      })
      const pendingOrder = await api.createOrderViaApi(accessToken, {
        productId,
        quantity: 2,
        shippingMethodId: methodId,
        currency: 'USD',
      })
      await api.advanceOrderStatus(adminToken, paidOrder.id, 'paid')

      // pg is the source of truth for what the filter *should* select.
      expect((await api.getOrderRow(paidOrder.id)).status).toBe('paid')
      expect((await api.getOrderRow(pendingOrder.id)).status).toBe('pending')

      await page.context().addCookies([admin.refreshCookie])
      await page.goto('/admin/orders')
      await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible({ timeout: 30_000 })

      // Unfiltered, both orders are on the list. Assert this first so the
      // post-filter absence below means "the filter removed it", not "it was
      // never rendered".
      await expect(page.getByText(paidOrder.order_number)).toBeVisible({ timeout: 20_000 })
      await expect(page.getByText(pendingOrder.order_number)).toBeVisible()

      // ------------------------------------------------------------ filtering
      // Driven through the real select, not the URL — see the header comment.
      await selectOption(page, page, 'Status', 'Paid')

      // The filter is URL-backed, and every change also resets to page 1.
      await expect(page).toHaveURL(/[?&]status=paid/, { timeout: 15_000 })

      await expect(page.getByText(paidOrder.order_number)).toBeVisible({ timeout: 20_000 })
      await expect(page.getByText(pendingOrder.order_number)).toBeHidden()

      // ------------------------------------------------------------- exporting
      const exportButton = page.getByRole('button', { name: 'Export CSV' })
      await expect(exportButton).toBeVisible()

      // Retry on the *download event*, not on button visibility: the button is
      // visible long before Vue binds its handler, so a first click can land on
      // dead markup and never produce a download.
      let download: Download | undefined
      await expect(async () => {
        const [dl] = await Promise.all([
          page.waitForEvent('download', { timeout: 15_000 }),
          exportButton.click(),
        ])
        download = dl
      }).toPass({ timeout: 90_000 })

      // The server names the file from the *active filters*
      // (`orders.py::_export_filename`): base `orders`, then the status. The
      // browser can only read that name because CORS exposes Content-Disposition
      // (BE #226) and the client honours it (FE #338) — before both, this
      // silently fell back to a generic `orders.csv`.
      expect(download!.suggestedFilename()).toBe('orders-paid.csv')

      const csv = await readFile(await download!.path(), 'utf8')
      expect(csv.startsWith(BOM), 'CSV must keep its UTF-8 BOM for Excel').toBe(true)
      expect(csv.slice(BOM.length)).toMatch(new RegExp(`^${CSV_FIRST_HEADER}`))

      // The export must honour the same filter the table does — an export that
      // ignores it would hand accounting every order in the store.
      expect(csv).toContain(paidOrder.order_number)
      expect(csv).not.toContain(pendingOrder.order_number)

      // --- transport truth the Blob path flattens
      const direct = await api.fetchOrdersExportCsv(adminToken, { status: 'paid' })
      expect(direct.status).toBe(200)
      expect(direct.contentType).toContain('text/csv')
      expect(direct.disposition).toContain('orders-paid.csv')

      // A date filter changes the derived name too: `{from}_{to}`, with `end`
      // standing in for an open upper bound.
      const today = new Date().toISOString().slice(0, 10)
      const dated = await api.fetchOrdersExportCsv(adminToken, {
        status: 'paid',
        dateFrom: today,
      })
      expect(dated.disposition).toContain(`orders-paid-${today}_end.csv`)
    }
    finally {
      // 409s once an order references the product — a product with order history
      // must be deactivated, not deleted. Swallow, as the siblings do.
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
