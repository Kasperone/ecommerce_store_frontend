// Admin quote → order conversion — the B2B leg that mints real money.
//
// `account/quote-request.spec.ts` covers the customer asking for a quote. What
// was unguarded is what the admin does with it: negotiate, accept, and convert.
// Conversion is not a status flip — it creates a genuine pending order, and it
// has two properties that are easy to regress and invisible in the UI:
//
//   1. **Ownership.** The order belongs to the company's *primary contact*
//      (`company.primary_user_id`), never to the converting admin — otherwise
//      order history, emails and invoices all address the wrong person. The
//      order response never spells out `user_id`, so only pg can prove it.
//   2. **Quoted price wins.** Lines snapshot the *negotiated* unit price, with
//      no re-pricing against the catalog. The product here lists at 100 and is
//      quoted at 80 precisely so a silent re-price would show up as a wrong total.
//
// The spec also pins the convert *gate*: the action is offered only for an
// accepted, not-yet-converted quote, and `quotes.converted_order_id` is the
// one-way latch that makes a second conversion impossible.
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

const LIST_PRICE = 100
const QUOTED_PRICE = 80
const QUOTED_QTY = 2

test.describe('Admin quote conversion', () => {
  test('accepting and converting a quote mints a pending order for the company contact at the quoted price', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const buyer = randomEphemeralUser()
    let adminToken = ''
    let productId: number | null = null
    let companyId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken

      const product = await api.createProduct(adminToken, {
        name: `E2E Quote Widget ${runId}`,
        slug: `e2e-quote-widget-${runId}`,
        price_usd: LIST_PRICE,
        price_pln: 400,
        price_eur: 90,
        stock: 10,
      })
      productId = product.id

      await api.register(buyer)
      await api.markVerified(buyer.email)
      const buyerId = await api.userIdByEmail(buyer.email)
      const company = await api.createCompanyWithPrimaryUser(adminToken, {
        name: `E2E Quote Co ${runId}`,
        primaryUserId: buyerId,
      })
      companyId = company.id

      // Negotiated below list — conversion must honour this, not re-price.
      const quote = await api.createQuote(adminToken, {
        companyId: company.id,
        currency: 'USD',
        items: [{
          description: 'Negotiated bulk line',
          quantity: QUOTED_QTY,
          unitPrice: QUOTED_PRICE,
          productId: product.id,
        }],
      })
      expect(quote.status).toBe('draft')

      const stockBefore = await api.getProductStock(productId)

      // --- admin: the quotes queue → detail
      await page.context().addCookies([admin.refreshCookie])
      await page.goto('/admin/quotes')

      const rowLink = page.getByRole('link', { name: `#${quote.id}`, exact: true })
      await expect(rowLink).toBeVisible({ timeout: 15_000 })
      await expect(async () => {
        await rowLink.click()
        await expect(page.getByRole('heading', { name: `Quote #${quote.id}` }))
          .toBeVisible({ timeout: 5_000 })
      }).toPass({ timeout: 20_000 })

      // A draft quote is not convertible — the action must not be offered.
      await expect(page.getByTestId('quote-convert')).toBeHidden()

      // --- negotiate: draft → accepted through the Manage card
      await page.getByTestId('quote-status-select').click()
      await page.getByRole('option', { name: 'Accepted', exact: true }).click()
      await page.getByTestId('quote-save').click()

      const convertBtn = page.getByTestId('quote-convert')
      await expect(convertBtn).toBeVisible({ timeout: 15_000 })
      expect((await api.getQuoteRow(quote.id)).status).toBe('accepted')

      // --- convert
      await convertBtn.click()
      await expect(page.getByRole('heading', { name: 'Convert quote to order?' })).toBeVisible()
      await page.getByTestId('quote-convert-confirm').click()

      // A successful conversion redirects straight to the order it minted (the
      // success toast is transient; the navigation is the durable signal).
      await expect(page).toHaveURL(/\/admin\/orders\/\d+$/, { timeout: 20_000 })

      // --- authoritative DB truth
      const quoteRow = await api.getQuoteRow(quote.id)
      expect(quoteRow.status).toBe('accepted')
      expect(quoteRow.convertedOrderId).not.toBeNull()
      expect(page.url()).toContain(`/admin/orders/${quoteRow.convertedOrderId}`)

      // Revisiting the quote shows the one-way latch: convert is no longer
      // offered, replaced by a link back to the order.
      await page.goto(`/admin/quotes/${quote.id}`)
      await expect(page.getByTestId('quote-converted-link')).toBeVisible({ timeout: 15_000 })
      await expect(convertBtn).toBeHidden()

      const order = await api.getOrderRow(quoteRow.convertedOrderId!)
      expect(order.status).toBe('pending')
      // Owned by the company's primary contact, NOT by the converting admin.
      expect(order.userId).toBe(buyerId)
      // Quoted price honoured, no re-pricing against the 100 list price.
      expect(order.items).toHaveLength(1)
      expect(order.items[0]!.productId).toBe(productId)
      expect(order.items[0]!.quantity).toBe(QUOTED_QTY)
      expect(order.items[0]!.unitPrice).toBe(QUOTED_PRICE)
      // Conversion sets no shipping method, so shipping/discount/tax are 0 and
      // the total is exactly the quoted line total.
      expect(order.shipping).toBe(0)
      expect(order.total).toBe(QUOTED_PRICE * QUOTED_QTY)

      // Stock is reserved like a normal order (no backorder on convert).
      expect(await api.getProductStock(productId)).toBe(stockBefore - QUOTED_QTY)
    }
    finally {
      // Both 409 once an order references them — expected, not a failure.
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      if (companyId) await api.deleteCompany(adminToken, companyId).catch(() => {})
      await api.dispose()
    }
  })
})
