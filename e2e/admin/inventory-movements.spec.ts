// Admin inventory — the movement ledger and the low-stock alert threshold.
//
// Two surfaces the adjust spec deliberately left to "the backend's concern":
//
//  1. `/admin/inventory/movements` — every stock change, newest first. This is
//     the audit trail an operator reconciles against, so it has to record the
//     right reason, the right signed delta, and the resulting level.
//  2. The low-stock threshold set from the Adjust dialog — the input to every
//     "Low stock" badge, the `low_stock` list filter, and the dashboard's
//     summary counts. A threshold that saves but doesn't re-classify the
//     product is a silently missed reorder.
//
// Ledger contract, verified against the running backend before writing this:
//   - creating a product WITH a `stock` value writes NO movement (the figure
//     lands straight on `products.stock`), so a fresh product's ledger starts
//     empty and exact row counts are meaningful;
//   - `resulting_stock` is the **warehouse level** after the delta, not
//     `products.stock`;
//   - a not-yet-materialised default-warehouse level seeds from the product's
//     unallocated stock, so the first movement's `resulting_stock` still
//     reconciles with the product total.
//
// Not covered here: the `order_placed` / `order_cancelled` reasons. Their
// *stock* effect is already asserted by the checkout specs (`getProductStock`);
// only their rendering on this page would be new, and an order leg would drag
// the shared shipping fixture into a spec that otherwise needs none.
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'
import { selectOption } from '../helpers/nuxtUiSelect'
import { setUInputNumber } from '../helpers/uinputnumber'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(150_000)

/** Narrow the inventory list to one product. The admin route cold-compiles and
 *  a `.fill()` fired pre-hydration updates the DOM but not the v-model, so
 *  retry until the value sticks. */
async function searchInventory(page: import('@playwright/test').Page, name: string) {
  const search = page.getByPlaceholder('Name or SKU')
  await expect(search).toBeVisible({ timeout: 60_000 })
  await expect(async () => {
    await search.fill(name)
    await expect(search).toHaveValue(name, { timeout: 1_000 })
  }).toPass({ timeout: 30_000 })
}

/**
 * Submit a stock dialog, retrying the click until the server confirms the write.
 *
 * The same hydration race that eats the row-action click eats the submit click:
 * the dialog stays open with a fully valid, enabled form and nothing happens.
 * Retrying is therefore mandatory — but these submits MUTATE STOCK, so a naive
 * `toPass` retry over a slow-but-successful click would apply the delta twice.
 * Hence: after each click, wait a full round-trip for `settled()` before even
 * considering another. `settled` reads server state (never a toast — toasts here
 * are transient and this spec has already seen one vanish before assertion).
 */
async function submitDialog(
  page: import('@playwright/test').Page,
  dialog: import('@playwright/test').Locator,
  buttonName: string,
  settled: () => Promise<boolean>,
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (await settled()) return
    await dialog.getByRole('button', { name: buttonName, exact: true }).click()
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      if (await settled()) return
      await page.waitForTimeout(500)
    }
  }
  throw new Error(`"${buttonName}" never took effect after 4 attempts`)
}

/** Open one of a row's action dialogs, re-clicking until it opens (the admin
 *  pages are authed by cookie injection, so the first click can land before Vue
 *  binds its handlers). */
async function openRowDialog(
  page: import('@playwright/test').Page,
  name: string,
  action: string,
  heading: string,
) {
  const row = page.getByRole('row').filter({ hasText: name })
  await expect(row).toBeVisible({ timeout: 30_000 })
  const dialogHeading = page.getByText(heading)
  await expect(async () => {
    await row.getByRole('button', { name: action, exact: true }).click()
    await expect(dialogHeading).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
}

test.describe('Admin inventory movements', () => {
  test('restock and adjust each append a ledger row, newest first', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const name = `E2E Movement Widget ${runId}`
    let adminToken = ''
    let productId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const product = await api.createProduct(adminToken, {
        name,
        slug: `e2e-movement-${runId}`,
        price_usd: 20,
        price_pln: 80,
        price_eur: 18,
        stock: 20,
      })
      productId = product.id

      // Baseline: seeding stock at creation must NOT fabricate a ledger row.
      expect(await api.getProductMovements(product.id)).toHaveLength(0)

      await page.context().addCookies([admin.refreshCookie])
      await page.goto('/admin/inventory')
      await expect(page).toHaveURL(/\/admin\/inventory/, { timeout: 30_000 })
      await searchInventory(page, name)

      // --- Leg 1: restock +5 (a supplier receipt) ---------------------------
      await openRowDialog(page, name, 'Restock', `Restock — ${name}`)
      const restockDialog = page.getByRole('dialog')
      await setUInputNumber(restockDialog.getByLabel('Quantity'), 5)
      await restockDialog.getByPlaceholder('PO reference or note (optional)').fill('E2E PO-42')
      const movementCount = async () => (await api.getProductMovements(product.id)).length
      await submitDialog(page, restockDialog, 'Restock', async () => await movementCount() >= 1)
      expect(await api.getProductStock(product.id)).toBe(25)

      // --- Leg 2: adjust down to 7 (a manual correction) --------------------
      await openRowDialog(page, name, 'Adjust', `Adjust stock — ${name}`)
      // The dialog re-seeds New stock from the resolved per-warehouse levels via
      // a watcher; type before that lands and the watcher clobbers the value.
      const newStock = page.getByLabel('New stock')
      await expect(newStock).toHaveValue('25', { timeout: 10_000 })
      await newStock.click()
      await newStock.press('ControlOrMeta+a')
      await newStock.press('Delete')
      await newStock.pressSequentially('7')
      // Shift+Tab (not Tab) commits without focusing the optional threshold field.
      await newStock.press('Shift+Tab')
      await submitDialog(
        page,
        page.getByRole('dialog'),
        'Save',
        async () => await movementCount() >= 2,
      )
      expect(await api.getProductStock(product.id)).toBe(7)

      // --- Server truth: two rows, correct reasons, signed deltas, levels ----
      const movements = await api.getProductMovements(product.id)
      expect(movements).toHaveLength(2)
      expect(movements[0]).toMatchObject({
        reason: 'manual_adjustment',
        delta: -18,
        resulting_stock: 7,
        order_id: null,
      })
      expect(movements[1]).toMatchObject({
        reason: 'restock',
        delta: 5,
        resulting_stock: 25,
        note: 'E2E PO-42',
        order_id: null,
      })

      // --- The ledger page renders them, newest first ------------------------
      // Nothing in the UI links to `?productId=` — the filter is deep-link only,
      // which is exactly why its badge and Clear control need a guard.
      await page.goto(`/admin/inventory/movements?productId=${product.id}`)
      await expect(page.getByRole('heading', { name: 'Stock movements' }))
        .toBeVisible({ timeout: 60_000 })
      await expect(page.getByText(`Filtered to product #${product.id}`)).toBeVisible()

      // Data rows only. Positional `nth()` over `getByRole('row')` does NOT
      // work here: UTable renders a cell-less separator `<tr>` inside the
      // header rowgroup, so the first movement sits at nth(2). Filtering on
      // "has a cell" drops both the header (columnheaders) and the separator
      // (no cells at all), and survives any future chrome rows.
      const dataRows = page.getByRole('row').filter({ has: page.getByRole('cell') })
      // Filtered to one product ⇒ exactly the two movements above.
      await expect(dataRows).toHaveCount(2)
      // Order is the assertion: the adjustment is newer than the restock.
      const newest = dataRows.nth(0)
      await expect(newest).toContainText('Manual adjustment')
      await expect(newest).toContainText('-18')
      const older = dataRows.nth(1)
      await expect(older).toContainText('Restock')
      await expect(older).toContainText('+5')
      await expect(older).toContainText('E2E PO-42')

      // Clearing drops the filter from the URL (and with it the badge).
      await page.getByRole('button', { name: 'Clear' }).click()
      await expect(page).toHaveURL(url => !url.searchParams.has('productId'), { timeout: 15_000 })
      await expect(page.getByText(`Filtered to product #${product.id}`)).toBeHidden()
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })

  test('setting a low-stock threshold flips the product into the low-stock filter', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const name = `E2E Low Stock Widget ${runId}`
    let adminToken = ''
    let productId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken

      // The store-wide default is one shared `store_config` row — read it, never
      // write it. With no default, a product carrying no threshold of its own is
      // never "low"; if a default ever gets set, stock has to clear it for the
      // in-stock precondition below to still mean anything.
      const storeDefault = await api.getStoreLowStockDefaultThreshold()
      const stock = (storeDefault ?? 0) + 12
      const threshold = stock + 8

      const product = await api.createProduct(adminToken, {
        name,
        slug: `e2e-low-stock-${runId}`,
        price_usd: 15,
        price_pln: 60,
        price_eur: 14,
        stock,
      })
      productId = product.id
      expect(await api.getProductLowStockThreshold(product.id)).toBeNull()

      const summaryBefore = await api.getLowStockSummary(adminToken)

      await page.context().addCookies([admin.refreshCookie])
      await page.goto('/admin/inventory')
      await expect(page).toHaveURL(/\/admin\/inventory/, { timeout: 30_000 })
      await searchInventory(page, name)

      // Precondition: with no threshold the product is plain "In stock".
      const row = page.getByRole('row').filter({ hasText: name })
      await expect(row).toContainText('In stock', { timeout: 30_000 })

      // --- Set the threshold from the Adjust dialog, leaving stock alone -----
      await openRowDialog(page, name, 'Adjust', `Adjust stock — ${name}`)
      const dialog = page.getByRole('dialog')
      // Wait for the level watcher to seed New stock before touching the
      // threshold — it re-seeds both fields when it fires.
      await expect(dialog.getByLabel('New stock')).toHaveValue(String(stock), { timeout: 10_000 })
      await setUInputNumber(dialog.getByLabel('Low-stock threshold'), threshold)
      await submitDialog(
        page,
        dialog,
        'Save',
        async () => await api.getProductLowStockThreshold(product.id) === threshold,
      )

      // Server truth: the threshold persisted and the stock did NOT move.
      expect(await api.getProductStock(product.id)).toBe(stock)
      // A threshold edit is a plain product update — it must not forge a movement.
      expect(await api.getProductMovements(product.id)).toHaveLength(0)

      // --- The list re-classifies it ----------------------------------------
      await expect(row).toContainText('Low stock', { timeout: 15_000 })
      await expect(row).toContainText(String(threshold))

      // Drive the real status select: a filter whose `set` call silently does
      // nothing is a bug this project has already shipped once (FE #334), and a
      // deep-link would pass straight through it.
      await selectOption(page, page, 'Status', 'Low stock')
      await expect(page).toHaveURL(/status=low_stock/, { timeout: 15_000 })
      await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible({ timeout: 15_000 })

      await selectOption(page, page, 'Status', 'In stock')
      await expect(page).toHaveURL(/status=in_stock/, { timeout: 15_000 })
      await expect(page.getByRole('row').filter({ hasText: name })).toBeHidden({ timeout: 15_000 })

      // --- The dashboard summary counts it too -------------------------------
      const summaryAfter = await api.getLowStockSummary(adminToken)
      expect(summaryAfter.low_stock_count).toBe(summaryBefore.low_stock_count + 1)
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
