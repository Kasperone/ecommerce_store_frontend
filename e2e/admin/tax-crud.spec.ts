// Admin tax configuration (`/admin/tax`) — tax categories and the per-country
// rate windows under them. The *calculation* legs (per-product VAT, faktura
// decomposition, reverse charge) are covered by the checkout specs; what was
// unspecced is the configuration surface those calculations read from.
//
// The page is master/detail: selecting a category row swaps the rates table
// below it. Both tables live in their own `<section>`, so every locator here is
// section-scoped — an unscoped `tbody tr` would count rows from both.
//
// Two tests:
//   1. the category → rate lifecycle, ending in a category delete that takes
//      its rates with it.
//   2. the duplicate-rate guard (same country + valid-from ⇒ 409).
//
// ⚠️ Both deletes are NATIVE `confirm()` dialogs, not modals. Playwright
// auto-DISMISSES dialogs unless a handler is registered, so without
// `page.on('dialog', …)` the delete silently no-ops.
//
// Deliberately NOT covered: the "cannot delete the default category" 409. The
// only deterministic way to exercise it is to own a default category, and
// promoting one demotes the store's real default — global state that would leak
// into every sibling spec (the same reason `/admin/settings` is skipped).
import { expect, test, type Locator, type Page } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(240_000)

function field(scope: Page | Locator, label: string): Locator {
  return scope.getByLabel(new RegExp(`^${label}\\s*\\*?$`))
}

test.describe('Admin tax configuration', () => {
  test('create a category → add rates → edit one → delete rate → delete category', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const code = `E2E_${runId}`
    const name = `E2E Tax ${runId}`
    const namePl = `E2E Podatek ${runId}`
    let adminToken = ''
    let categoryId: number | null = null

    page.on('dialog', dialog => void dialog.accept())

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken

      await page.context().addCookies([admin.refreshCookie])
      await page.goto('/admin/tax')
      await expect(page).toHaveURL(/\/admin\/tax/, { timeout: 60_000 })

      const dialog = page.getByRole('dialog')
      // ⚠️ `tbody tr`, not `getByRole('row')`: the categories table is
      // selectable (`@select` swaps the rates below), and Nuxt UI gives those
      // rows `role="button"` — so the row role matches only the HEADER. The
      // rates table below is a plain table and does expose rows.
      const categorySection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Categories' }) })
      const categoryRow = categorySection.locator('tbody tr').filter({ hasText: name })

      // ---- create the category ----
      const newCategoryBtn = page.getByTestId('tax-category-create')
      await expect(newCategoryBtn).toBeVisible({ timeout: 60_000 })
      await expect(async () => {
        await newCategoryBtn.click()
        await expect(dialog.getByTestId('tax-category-code')).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 90_000 })

      await dialog.getByTestId('tax-category-code').fill(code)
      await dialog.getByTestId('tax-category-name').fill(name)
      await field(dialog, 'Name \\(Polish\\)').fill(namePl)
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()

      await expect.poll(
        async () => (await api.getTaxCategoryRowByCode(code))?.name,
        { timeout: 20_000 },
      ).toBe(name)
      const category = await api.getTaxCategoryRowByCode(code)
      categoryId = category!.id
      expect(category?.is_default).toBe(false)

      // ---- select it, then add a rate ----
      // Selecting swaps the rates table below; gate on the section heading so
      // the rate actions below act on THIS category.
      await expect(categoryRow).toBeVisible({ timeout: 20_000 })
      const ratesHeading = page.getByRole('heading', { name: `Rates — ${name}` })
      // Click the CODE cell, not the name: the name is a button that opens the
      // edit modal, and Nuxt UI's row-select handler ignores clicks that land
      // inside a `button` or `a` (`target.closest`). The code cell is plain
      // text, so it is the row's only reliably selectable surface.
      await expect(async () => {
        await categoryRow.locator('td').nth(1).click()
        await expect(ratesHeading).toBeVisible({ timeout: 3_000 })
      }).toPass({ timeout: 60_000 })

      const rateSection = page.locator('section').filter({ has: ratesHeading })
      const addRate = async (country: string, pct: string, validFrom: string) => {
        await expect(async () => {
          await page.getByTestId('tax-rate-create').click()
          await expect(dialog.getByTestId('tax-rate-country')).toBeVisible({ timeout: 2_000 })
        }).toPass({ timeout: 60_000 })
        await dialog.getByTestId('tax-rate-country').fill(country)
        await dialog.getByTestId('tax-rate-pct').fill(pct)
        await dialog.getByTestId('tax-rate-valid-from').fill(validFrom)
        await dialog.getByRole('button', { name: 'Save', exact: true }).click()
      }

      // Typed lowercase on purpose: `tax_rates.country_code` carries a
      // `^[A-Z]{2}$` CHECK, so a row existing at all proves the backend
      // upper-cases the input rather than the DB accepting it as typed.
      await addRate('de', '19', '2026-01-01')
      await expect.poll(
        async () => (await api.getTaxRateRows(categoryId!)).map(r => r.country_code),
        { timeout: 20_000 },
      ).toEqual(['DE'])
      expect((await api.getTaxRateRows(categoryId!))[0]!.rate_pct).toBe('19.00')

      // A second country — and the category list's "Rate (PL)" column, which
      // reads the in-force home-country rate, must pick it up.
      await addRate('PL', '8', '2026-01-01')
      await expect.poll(
        async () => (await api.getTaxRateRows(categoryId!)).length,
        { timeout: 20_000 },
      ).toBe(2)
      await expect(categoryRow).toContainText('8%', { timeout: 15_000 })

      // ---- edit the DE rate: close its window ----
      // Filter on the country CELL, not row text — a bare 'DE' substring would
      // also match a date or a neighbouring code.
      const deRow = rateSection.locator('tbody tr')
        .filter({ has: page.getByRole('cell', { name: 'DE', exact: true }) })
      await expect(async () => {
        await deRow.getByRole('button', { name: 'Edit rate' }).click()
        await expect(dialog.getByTestId('tax-rate-valid-to')).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 60_000 })
      await dialog.getByTestId('tax-rate-valid-to').fill('2027-01-01')
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()
      await expect.poll(
        async () => (await api.getTaxRateRows(categoryId!))
          .find(r => r.country_code === 'DE')?.valid_to,
        { timeout: 20_000 },
      ).toBe('2027-01-01')

      // ---- delete the DE rate (native confirm) ----
      await expect(async () => {
        await deRow.getByRole('button', { name: 'Delete rate' }).click()
        await expect
          .poll(
            async () => (await api.getTaxRateRows(categoryId!)).map(r => r.country_code),
            { timeout: 5_000 },
          )
          .toEqual(['PL'])
      }).toPass({ timeout: 60_000 })

      // ---- delete the category — its remaining rates go with it ----
      await expect(async () => {
        await categoryRow.getByRole('button', { name: 'Delete category' }).click()
        await expect
          .poll(async () => await api.getTaxCategoryRowByCode(code), { timeout: 5_000 })
          .toBeNull()
      }).toPass({ timeout: 60_000 })
      expect(await api.getTaxRateRows(categoryId)).toEqual([])
      categoryId = null
    }
    finally {
      if (categoryId != null) await api.deleteTaxCategory(adminToken, categoryId).catch(() => {})
      await api.dispose()
    }
  })

  test('a second rate for the same country and valid-from is refused', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const code = `E2E_DUP_${runId}`
    const name = `E2E TaxDup ${runId}`
    let adminToken = ''
    let categoryId: number | null = null

    page.on('dialog', dialog => void dialog.accept())

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      // Seeded through the API — the create leg is the other test's subject,
      // and this one is only about what happens on the second rate.
      const category = await api.createTaxCategory(adminToken, { code, name })
      categoryId = category.id
      await api.createTaxRate(adminToken, categoryId, {
        countryCode: 'FR',
        ratePct: 20,
        validFrom: '2026-01-01',
      })

      await page.context().addCookies([admin.refreshCookie])
      await page.goto('/admin/tax')
      await expect(page).toHaveURL(/\/admin\/tax/, { timeout: 60_000 })

      const dialog = page.getByRole('dialog')
      // ⚠️ `tbody tr`, not `getByRole('row')`: the categories table is
      // selectable (`@select` swaps the rates below), and Nuxt UI gives those
      // rows `role="button"` — so the row role matches only the HEADER. The
      // rates table below is a plain table and does expose rows.
      const categorySection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Categories' }) })
      const categoryRow = categorySection.locator('tbody tr').filter({ hasText: name })
      const ratesHeading = page.getByRole('heading', { name: `Rates — ${name}` })

      await expect(categoryRow).toBeVisible({ timeout: 60_000 })
      // Click the CODE cell, not the name: the name is a button that opens the
      // edit modal, and Nuxt UI's row-select handler ignores clicks that land
      // inside a `button` or `a` (`target.closest`). The code cell is plain
      // text, so it is the row's only reliably selectable surface.
      await expect(async () => {
        await categoryRow.locator('td').nth(1).click()
        await expect(ratesHeading).toBeVisible({ timeout: 3_000 })
      }).toPass({ timeout: 60_000 })

      await expect(async () => {
        await page.getByTestId('tax-rate-create').click()
        await expect(dialog.getByTestId('tax-rate-country')).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 60_000 })
      await dialog.getByTestId('tax-rate-country').fill('FR')
      await dialog.getByTestId('tax-rate-pct').fill('21')
      await dialog.getByTestId('tax-rate-valid-from').fill('2026-01-01')
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()

      // The backend 409 surfaces in the modal rather than the row list.
      await expect(dialog.getByText(/already exists/i)).toBeVisible({ timeout: 20_000 })
      // And nothing was stacked: still exactly one FR rate, still at 20%.
      await page.waitForTimeout(1_500)
      const rates = await api.getTaxRateRows(categoryId)
      expect(rates.map(r => r.country_code)).toEqual(['FR'])
      expect(rates[0]!.rate_pct).toBe('20.00')
    }
    finally {
      if (categoryId != null) await api.deleteTaxCategory(adminToken, categoryId).catch(() => {})
      await api.dispose()
    }
  })
})
