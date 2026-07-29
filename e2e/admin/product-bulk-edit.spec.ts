// Admin product bulk edit — the mass price mutation, and the three guardrails
// that keep it from being a blunt instrument.
//
// This is the other half of the CSV item in the admin program; `product-csv.spec.ts`
// covers export→import, this covers the toolbar. Blast radius is the reason it
// matters: one click rewrites the price of every selected product, and the only
// visible feedback is a toast that disappears.
//
// Three backend contracts are asserted here because none of them is observable
// in the UI:
//   * a price change must append an OMNIBUS `price_history` row per product —
//     miss it and the storefront's "lowest price in 30 days" line starts lying
//   * `stock` is NOT a settable field (`ProductBulkSet` is `extra="forbid"`) —
//     stock is the maintained sum of per-warehouse levels and may only move
//     through the inventory ledger, so a `stock` key must 422
//   * an unknown id fails the WHOLE request 404 with nothing written — the
//     batch is all-or-nothing, and a partial write would be silent corruption
//
// Fixture isolation: two products share a unique name prefix, and the list's
// `search` filter narrows the page to exactly those two so "Select all on page"
// is an exact selection rather than "whatever the e2e DB happens to hold".
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

const START_USD = 25
const BULK_USD = 88.5

test.describe('Admin product bulk edit', () => {
  test('sets a price across selected products, records OMNIBUS rows, and refuses stock / unknown ids', async ({ page }) => {
    test.slow()

    const api = await ApiClient.create()
    const runId = Date.now()
    const prefix = `E2E Bulk ${runId}`
    let adminToken = ''
    const productIds: number[] = []

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken

      for (const n of [1, 2]) {
        const product = await api.createProduct(adminToken, {
          name: `${prefix} Widget ${n}`,
          slug: `e2e-bulk-${runId}-${n}`,
          price_usd: START_USD,
          price_pln: 100,
          price_eur: 23,
          stock: 7,
        })
        productIds.push(product.id)
      }
      const [first, second] = productIds as [number, number]

      // Stock is asserted unchanged at the end; capture what it actually is now
      // rather than trusting the create payload.
      const stockBefore = await api.getProductStock(first)

      await page.context().addCookies([admin.refreshCookie])

      // ------------------------------------------------------------ selection
      // Deep-link the search filter so the page holds exactly this spec's two
      // products — "Select all on page" is then an exact selection.
      await page.goto(`/admin/products?search=${encodeURIComponent(prefix)}`)
      await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible({ timeout: 30_000 })

      const rowCheckboxes = page.getByLabel('Select row')
      await expect(rowCheckboxes).toHaveCount(2, { timeout: 30_000 })

      await page.getByLabel('Select all on page').check()
      await expect(page.getByText('2 selected')).toBeVisible()

      // -------------------------------------------------------------- the edit
      // Plain `UInput type="number"` here (not `UInputNumber`), so a normal fill
      // commits to v-model — no clear/type/Tab dance needed.
      await page.getByLabel('USD price').fill(String(BULK_USD))
      await page.getByRole('button', { name: `Apply to 2 products` }).click()

      // The toast is transient; the toolbar collapsing is the persistent signal
      // that the mutation resolved.
      await expect(page.getByText('2 selected')).toBeHidden({ timeout: 20_000 })

      // ----------------------------------------------------- pg is the truth
      for (const id of productIds) {
        const row = await api.getProductRow(id)
        expect(row.priceUsd, `product ${id} price must be rewritten`).toBe(BULK_USD)

        // OMNIBUS: the create seeded one row at START_USD, the bulk edit must
        // append a second at the new price. Newest first.
        const history = await api.getProductPriceHistory(id, 'USD')
        expect(history.length, `product ${id} must have an appended price row`)
          .toBeGreaterThanOrEqual(2)
        expect(history[0]!.price).toBe(BULK_USD)
        expect(history[1]!.price).toBe(START_USD)
      }

      // Untouched currencies must not be dragged along by the edit.
      const untouched = await api.getProductPriceHistory(first, 'PLN')
      expect(untouched.every(h => h.price === 100)).toBe(true)

      // Stock is not a bulk-editable field and must be exactly as it was.
      expect(await api.getProductStock(first)).toBe(stockBefore)

      // ------------------------------------------- guardrail: stock is forbidden
      // The UI cannot build this body — that is the point. `ProductBulkSet` is
      // `extra="forbid"`, so smuggling a direct stock write must be rejected
      // rather than bypassing the inventory ledger.
      const withStock = await api.bulkUpdateProducts(adminToken, {
        product_ids: [first],
        set: { stock: 999 },
      })
      expect(withStock.status, 'a stock key must be refused, not silently ignored').toBe(422)
      expect(await api.getProductStock(first)).toBe(stockBefore)

      // -------------------------------- guardrail: unknown id ⇒ all-or-nothing
      const missingId = 999_999_999
      const withMissing = await api.bulkUpdateProducts(adminToken, {
        product_ids: [second, missingId],
        set: { price_usd: 1.23 },
      })
      expect(withMissing.status).toBe(404)
      expect(withMissing.body).toContain(String(missingId))

      // The real id in that same batch must be untouched — a partial write here
      // would be the worst failure mode, because nothing surfaces it.
      const secondRow = await api.getProductRow(second)
      expect(secondRow.priceUsd, 'a rejected batch must write nothing at all').toBe(BULK_USD)
    }
    finally {
      for (const id of productIds) {
        await api.deleteProduct(adminToken, id).catch(() => {})
      }
      await api.dispose()
    }
  })
})
