// Fault injection: the invoice PDF endpoint 500s.
//
// A distinct failure surface from the checkout faults — different page,
// different component, and a different *delivery mechanism*. The invoice is
// Bearer-authed, so it cannot be a plain `<a href>`: `useDownloadInvoice`
// fetches the PDF as a Blob and triggers an object-URL anchor click. That
// makes the error path unusually easy to get wrong, and it has a known sharp
// edge documented in the composable itself — with `responseType: 'blob'`,
// ofetch parses the *error* body as a Blob too, so the `{ detail }` JSON has to
// be re-read and reparsed or the toast surfaces garbage.
//
// This spec pins that behaviour end to end: a 500 must produce a real error
// toast and no file, and the very same click must produce a real file once the
// endpoint recovers.
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(180_000)

test.describe('Invoice download fault injection', () => {
  test('invoice 500: error toast, no file; the same click downloads once the endpoint recovers', async ({ page }) => {
    const api = await ApiClient.create()
    const runId = Date.now()
    const user = randomEphemeralUser()
    let adminToken = ''
    let productId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const product = await api.createProduct(adminToken, {
        name: 'E2E Invoice Widget',
        slug: `e2e-fault-invoice-${runId}`,
        price_usd: 100,
        price_pln: 400,
        price_eur: 90,
        stock: 5,
      })
      productId = product.id
      const shipping = await api.ensureShippingFixture(adminToken, {
        methodName: 'E2E Standard',
        countryCodes: ['US'],
        rates: [{ currency: 'USD', amount: 10 }],
      })

      await api.register(user)
      await api.markVerified(user.email)
      const { accessToken, refreshCookie } = await api.loginViaApi(user.email, user.password)
      await page.context().addCookies([refreshCookie])

      // Build the order through the API — placing it through the UI is
      // checkout.spec.ts's job, and repeating it here would just make this
      // spec slower and more fragile without testing anything new.
      const order = await api.createOrderViaApi(accessToken, {
        productId: product.id,
        quantity: 1,
        shippingMethodId: shipping.methodId,
      })

      let failInvoice = true
      let invoiceAttempts = 0
      await page.route('**/api/v1/orders/*/invoice**', async (route) => {
        invoiceAttempts += 1
        if (!failInvoice) return route.continue()
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'invoice renderer unavailable' }),
        })
      })

      await page.goto(`/account/orders/${order.id}`)
      const downloadButton = page.getByRole('button', { name: /download invoice/i })
      await expect(downloadButton).toBeVisible({ timeout: 60_000 })

      // --- the 500 surfaces as a toast and produces no file.
      // Arm the download listener BEFORE clicking so a file slipping through
      // would be caught rather than raced past.
      const strayDownload = page.waitForEvent('download', { timeout: 8_000 }).catch(() => null)
      await downloadButton.click()

      await expect(page.getByText(/couldn't download the invoice/i).first())
        .toBeVisible({ timeout: 30_000 })
      expect(await strayDownload).toBeNull()

      // TWO attempts for ONE click, and that is correct: `useApi` sets no retry
      // options, so ofetch's defaults apply — an idempotent GET is retried once
      // and 500 is in the default `retryStatusCodes`. Worth pinning rather than
      // loosening to `>= 1`: it means a flaky invoice renderer is silently
      // double-hit per click, which matters for a PDF-generating endpoint. If
      // this ever reads 1, someone disabled the retry; if it climbs, someone
      // raised it.
      expect(invoiceAttempts).toBe(2)

      // --- POSITIVE CONTROL: the same button, the same click, endpoint healthy.
      // Without this, "no file was downloaded" would pass just as happily if the
      // button were inert, mis-located, or never wired to the endpoint at all.
      failInvoice = false
      const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })
      await downloadButton.click()
      const download = await downloadPromise

      // The order is unpaid, so the server returns a PROFORMA and names it
      // accordingly — asserting `invoice-…` here would be wrong, and the
      // composable goes out of its way to honour the server's filename
      // precisely because mislabelling a proforma as an invoice is a legal
      // problem, not a cosmetic one.
      expect(download.suggestedFilename()).toMatch(/\.pdf$/)
      // One more attempt, not two: a 200 is not retried.
      expect(invoiceAttempts).toBe(3)
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
