// Admin product CSV — the export → edit → import round-trip.
//
// This is a mass price-mutation tool: the worst-case regression is not a crash
// but a silent mis-parse that re-prices the catalogue. Two properties carry all
// the risk, and neither is visible in the UI:
//
//   1. **`dry_run` really is dry.** The modal validates before it writes, and
//      the backend defaults `dry_run=true`. If validation ever leaked a write,
//      an admin previewing a file would already have changed prices. The spec
//      asserts pg is *untouched* after "Validate".
//   2. **The round-trip is lossless.** The import's upsert key is
//      `id → slug → sku`, so a row that came out of the export must match the
//      same product going back in. Re-importing an unmodified export column set
//      with one changed price must move exactly that price.
//
// The import file is built from the *actual* downloaded export rather than a
// hand-written fixture — a hand-written header would keep passing after the
// export schema changed, which is precisely the drift this spec exists to catch.
import { readFileSync } from 'node:fs'
import { test, expect, type Download } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

const START_PRICE = 100
const IMPORTED_PRICE = 150

/** Split one CSV record, honouring double-quoted fields (which may contain commas). */
function splitCsvRow(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"'
        i++
      }
      else if (ch === '"') inQuotes = false
      else cell += ch
    }
    else if (ch === '"') inQuotes = true
    else if (ch === ',') {
      cells.push(cell)
      cell = ''
    }
    else cell += ch
  }
  cells.push(cell)
  return cells
}

function joinCsvRow(cells: string[]): string {
  return cells
    .map(c => (/[",\n]/.test(c) ? `"${c.replaceAll('"', '""')}"` : c))
    .join(',')
}

test.describe('Admin product CSV', () => {
  test('export → change a price → import: dry-run writes nothing, apply writes exactly one price', async ({ page }) => {
    test.setTimeout(180_000)
    const api = await ApiClient.create()
    const runId = Date.now()
    const slug = `e2e-csv-${runId}`
    let adminToken = ''
    let productId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken

      const product = await api.createProduct(adminToken, {
        name: `E2E CSV Widget ${runId}`,
        slug,
        price_usd: START_PRICE,
        price_pln: 400,
        price_eur: 90,
        stock: 7,
      })
      productId = product.id

      await page.context().addCookies([admin.refreshCookie])
      await page.goto('/admin/products')
      await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible()

      // ------------------------------------------------------------- export
      // Retry until a download actually fires: on a cookie-authed admin page the
      // first click can land before Vue binds the handler, and the button stays
      // visible either way — so the *download event* is the only honest signal
      // that the click was handled.
      let download: Download | undefined
      await expect(async () => {
        const pending = page.waitForEvent('download', { timeout: 8_000 })
        await page.getByRole('button', { name: 'Export CSV' }).click()
        download = await pending
      }).toPass({ timeout: 45_000 })
      if (!download) throw new Error('export never produced a download')
      // What the *user* actually gets. The backend computes a dated/filtered
      // name via `_export_filename`, but the browser cannot read
      // `Content-Disposition` — the API sets no CORS `expose_headers` — so
      // `useExportProducts` always falls back to this generic name.
      // Tracked in notes/plans/test/to-fix/2026-07-28-cors-content-disposition-not-exposed.md
      expect(download.suggestedFilename()).toBe('products.csv')

      // …so the backend's filename + media type are only observable off-browser.
      const direct = await api.fetchProductExportCsv(adminToken)
      expect(direct.status).toBe(200)
      expect(direct.contentType).toContain('text/csv')
      expect(direct.disposition).toMatch(/filename="?products-export-\d{8}\.csv"?/)
      expect(direct.body).toContain(slug)

      const csv = readFileSync(await download.path(), 'utf8')
      const lines = csv.trim().split(/\r?\n/)
      const header = splitCsvRow(lines[0]!)
      const slugCol = header.indexOf('slug')
      const priceCol = header.indexOf('price_usd')
      expect(slugCol, 'export header must carry a slug column').toBeGreaterThanOrEqual(0)
      expect(priceCol, 'export header must carry a price_usd column').toBeGreaterThanOrEqual(0)

      const ourRow = lines
        .slice(1)
        .map(splitCsvRow)
        .find(cells => cells[slugCol] === slug)
      expect(ourRow, 'the new product must appear in the export').toBeTruthy()
      expect(Number(ourRow![priceCol])).toBe(START_PRICE)

      // ------------------------------------------------- edit + import (dry)
      // Header + our single row: the upsert matches on slug, so a one-row file
      // keeps the report to exactly one update and cannot touch anything else.
      ourRow![priceCol] = String(IMPORTED_PRICE)
      const importCsv = `${lines[0]}\n${joinCsvRow(ourRow!)}\n`

      await page.getByRole('button', { name: 'Import CSV' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await dialog.locator('input[aria-label="CSV file"]').setInputFiles({
        name: 'products-import.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(importCsv, 'utf8'),
      })
      await dialog.getByRole('button', { name: 'Validate' }).click()

      // The report previews one update and zero errors …
      await expect(dialog.getByText('1 to update')).toBeVisible({ timeout: 20_000 })
      await expect(dialog.getByText('0 errors')).toBeVisible()
      // … and nothing has been written. This is the assertion that matters:
      // an admin who only previews must not have changed a price.
      expect((await api.getProductRow(productId)).priceUsd).toBe(START_PRICE)

      // ------------------------------------------------------------- apply
      await dialog.getByRole('button', { name: /^Apply 1 change/ }).click()

      await expect(async () => {
        expect((await api.getProductRow(productId!)).priceUsd).toBe(IMPORTED_PRICE)
      }).toPass({ timeout: 20_000 })
      // The upsert matched on slug — it re-priced, it did not create a twin.
      expect((await api.getProductRow(productId)).slug).toBe(slug)
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
