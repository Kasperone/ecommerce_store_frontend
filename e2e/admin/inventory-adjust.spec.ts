// Admin inventory adjust — set a product's stock to a new absolute level via
// the Adjust dialog; the change persists and is reflected in the product's
// stock. Covers the admin inventory-management UI (movement ledger is the
// backend's concern; here we assert the resulting stock server-side).
//
// Drafted against the live app via the planner/generator flow. Fresh product
// (its stock lands in the default "Main Warehouse"), asserted via ApiClient.
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(120_000)

test.describe('Admin inventory adjust', () => {
  test('adjusting stock to a new level persists to the product', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const name = `E2E Inventory Widget ${runId}`
    let adminToken = ''
    let productId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const product = await api.createProduct(adminToken, {
        name,
        slug: `e2e-inventory-${runId}`,
        price_usd: 20,
        price_pln: 80,
        price_eur: 18,
        stock: 20,
      })
      productId = product.id
      expect(await api.getProductStock(product.id)).toBe(20)

      await page.context().addCookies([admin.refreshCookie])
      await page.goto('/admin/inventory')
      await expect(page).toHaveURL(/\/admin\/inventory/, { timeout: 30_000 })

      // Narrow to our product. The admin page cold-compiles; a `.fill()` fired
      // before hydration updates the DOM but not the v-model (value silently
      // dropped), so retry the fill until it sticks.
      const search = page.getByPlaceholder('Name or SKU')
      await expect(search).toBeVisible({ timeout: 60_000 })
      await expect(async () => {
        await search.fill(name)
        await expect(search).toHaveValue(name, { timeout: 1_000 })
      }).toPass({ timeout: 30_000 })

      // Open the Adjust dialog — re-click until it opens (hydration-race safe).
      const row = page.getByRole('row').filter({ hasText: name })
      await expect(row).toBeVisible({ timeout: 30_000 })
      const dialogHeading = page.getByText(`Adjust stock — ${name}`)
      await expect(async () => {
        await row.getByRole('button', { name: 'Adjust' }).click()
        await expect(dialogHeading).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 30_000 })

      // The dialog re-seeds New stock to the current level (20) once the
      // warehouse + per-warehouse levels resolve (a watcher). Wait for that to
      // settle first, else it clobbers the value we type. UInputNumber must be
      // driven via keys (not .fill()); Shift+Tab commits to the v-model.
      const newStock = page.getByLabel('New stock')
      await expect(newStock).toHaveValue('20', { timeout: 10_000 })
      await newStock.click()
      await newStock.press('ControlOrMeta+a')
      await newStock.press('Delete')
      await newStock.pressSequentially('7')
      await newStock.press('Shift+Tab')
      await page.getByRole('button', { name: 'Save', exact: true }).click()

      await expect(page.getByText('Stock updated.').first()).toBeVisible({ timeout: 15_000 })

      // Server truth: the product's stock reflects the new absolute level.
      await expect.poll(() => api.getProductStock(product.id), { timeout: 15_000 }).toBe(7)
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
