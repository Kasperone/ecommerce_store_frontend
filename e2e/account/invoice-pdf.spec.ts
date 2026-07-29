import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Download } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

// The faktura PDF — the one artifact in the money path that is a *legal* record
// rather than a screen. Everything about it is invisible to the rest of the
// suite: the PDF bytes never touch the order API response, the issued number
// lives in its own table, and the whole render can 500 (a missing font, a
// per-rate decomposition bug) while every order assertion stays green.
//
// Three seams, because no single one sees the whole thing:
//   * pg `invoices` — the legal series row (`order_id` UNIQUE, gap-free year/seq)
//   * the browser download — what the customer actually receives, via
//     `useDownloadInvoice`'s Blob → object-URL → anchor dance
//   * the endpoint called directly — the media type and the `Content-Disposition`
//     filename the backend derives from the faktura number, both of which the
//     Blob path throws away when it renames the file client-side
const PDF_MAGIC = '%PDF-'

test.describe('Invoice PDF', () => {
  test('a paid order issues a faktura the customer can download from the account page', async ({ page }) => {
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
        name: `E2E Invoice Widget ${runId}`,
        slug: `e2e-invoice-${runId}`,
        price_usd: 60,
        price_pln: 240,
        price_eur: 55,
        stock: 5,
      })
      productId = product.id
      // Shared US fixture — never introduce a cheaper method here, the storefront
      // auto-selects the cheapest in the zone and would hijack sibling specs.
      const { methodId } = await api.ensureShippingFixture(adminToken, {
        methodName: 'E2E Standard',
        countryCodes: ['US'],
        rates: [{ currency: 'USD', amount: 10 }],
      })

      await api.register(user)
      await api.markVerified(user.email)
      const { accessToken, refreshCookie } = await api.loginViaApi(user.email, user.password)
      await page.context().addCookies([refreshCookie])

      const order = await api.createOrderViaApi(accessToken, {
        productId,
        quantity: 1,
        shippingMethodId: methodId,
        currency: 'USD',
      })

      // Payment is what makes the faktura issuable under Polish law — issuing is
      // unconditional on `paid`, so every paid order carries one.
      await api.advanceOrderStatus(adminToken, order.id, 'paid')

      // --- the legal record
      const invoice = await api.getOrderInvoiceRow(order.id)
      expect(invoice, 'a paid order must have an issued faktura').not.toBeNull()
      expect(invoice!.invoiceNumber).toBeTruthy()
      // The series is per-year and gap-free; the number carries its own year.
      expect(invoice!.invoiceNumber).toContain(String(invoice!.year))
      expect(invoice!.seq).toBeGreaterThan(0)

      // --- what the customer receives
      await page.goto(`/account/orders/${order.id}`)
      await expect(page.getByText(order.order_number).first())
        .toBeVisible({ timeout: 30_000 })

      const downloadButton = page.getByRole('button', { name: 'Download invoice' })
      await expect(downloadButton).toBeVisible({ timeout: 15_000 })

      // The button is SSR'd before Vue binds its handler, so a first click can
      // land on dead markup and never produce a download — retry until one fires.
      let download: Download | undefined
      await expect(async () => {
        const [dl] = await Promise.all([
          page.waitForEvent('download', { timeout: 15_000 }),
          downloadButton.click(),
        ])
        download = dl
      }).toPass({ timeout: 90_000 })

      // The file that lands on disk carries the *faktura* number, not the order
      // number — that is the identifier an accountant reconciles against, and it
      // reaches the client only through Content-Disposition (which the browser
      // can read only because CORS exposes that header, BE #226). The client
      // used to overwrite it with an order-number name built locally.
      expect(download!.suggestedFilename())
        .toBe(`invoice-${invoice!.invoiceNumber.replace(/\//g, '-')}.pdf`)

      const path = await download!.path()
      const bytes = await readFile(path)
      // A real PDF, not an error page or a zero-byte stub.
      expect(bytes.subarray(0, PDF_MAGIC.length).toString('latin1')).toBe(PDF_MAGIC)
      expect(bytes.byteLength).toBeGreaterThan(1000)

      // --- transport truth the Blob path discards
      const direct = await api.fetchOrderInvoicePdf(accessToken, order.id)
      expect(direct.status).toBe(200)
      expect(direct.contentType).toContain('application/pdf')
      // The backend names the attachment after the faktura number, sanitising
      // the series separator (`2026/07/1` → `2026-07-1`) for the filesystem.
      expect(direct.disposition)
        .toContain(`invoice-${invoice!.invoiceNumber.replace(/\//g, '-')}.pdf`)

      // The Polish render is a separate template path (per-rate VAT decomposition,
      // PL labels) — a crash there would never surface in the EN download.
      const pl = await api.fetchOrderInvoicePdf(accessToken, order.id, 'pl')
      expect(pl.status).toBe(200)
      expect(pl.contentType).toContain('application/pdf')
      expect(pl.bytes.subarray(0, PDF_MAGIC.length).toString('latin1')).toBe(PDF_MAGIC)
    }
    finally {
      // 409s once an order references the product — a product with order
      // history must be deactivated, not deleted. Swallow, as the siblings do.
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })

  // No browser here: the proforma/faktura split is a backend contract, and the
  // account page renders the same button either way.
  test('an unpaid order serves a proforma and issues no faktura', async () => {
    const api = await ApiClient.create()
    const runId = Date.now()
    const user = randomEphemeralUser()
    let adminToken = ''
    let productId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken

      const product = await api.createProduct(adminToken, {
        name: `E2E Proforma Widget ${runId}`,
        slug: `e2e-proforma-${runId}`,
        price_usd: 60,
        price_pln: 240,
        price_eur: 55,
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
      const { accessToken } = await api.loginViaApi(user.email, user.password)
      const order = await api.createOrderViaApi(accessToken, {
        productId,
        quantity: 1,
        shippingMethodId: methodId,
        currency: 'USD',
      })
      expect(order.status).toBe('pending')

      // THE legal distinction: a faktura may not be issued before payment, so an
      // unpaid order gets a derived proforma and no `invoices` row is burned —
      // the series must stay gap-free for the orders that do get one.
      const doc = await api.fetchOrderInvoicePdf(accessToken, order.id)
      expect(doc.status).toBe(200)
      expect(doc.contentType).toContain('application/pdf')
      expect(doc.disposition).toContain('proforma-')
      expect(doc.disposition).not.toContain('invoice-')
      expect(doc.bytes.subarray(0, PDF_MAGIC.length).toString('latin1')).toBe(PDF_MAGIC)

      expect(await api.getOrderInvoiceRow(order.id), 'no faktura before payment')
        .toBeNull()
    }
    finally {
      // 409s once an order references the product — a product with order
      // history must be deactivated, not deleted. Swallow, as the siblings do.
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
