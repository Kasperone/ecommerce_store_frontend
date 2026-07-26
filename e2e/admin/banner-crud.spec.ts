// Admin banner CRUD — create a home-hero banner through the modal (title + a
// pasted image URL, placement defaults to home_hero), see it in the table, then
// delete it via the confirm modal. Covers the admin banner management UI; the
// storefront render of a banner is a separate concern.
//
// Conventions mirror e2e/admin/coupon-crud.spec.ts: admin refresh-cookie inject,
// resilient re-click for the hydration race on admin chrome, dialog-scoped
// locators for the shared "Save"/"Delete" labels.
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(120_000)

test.describe('Admin banner CRUD', () => {
  test('create a banner then delete it', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const title = `E2E Banner ${Date.now()}`
    const imageUrl = 'https://example.com/e2e-banner.png'

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      await page.context().addCookies([admin.refreshCookie])

      await page.goto('/admin/banners')
      await expect(page).toHaveURL(/\/admin\/banners/, { timeout: 30_000 })
      // Authed-admin render gate.
      const newBtn = page.getByRole('button', { name: 'New banner' })
      await expect(newBtn).toBeVisible({ timeout: 60_000 })

      // --- create. The admin page cold-compiles; a click fired before hydration
      // is lost and the modal won't open. Re-click until the modal's Title field
      // appears (the repo pattern for client-only-handler races). "New banner" is
      // both the button and the modal heading, so gate on the Title *field*
      // (getByLabel — the proven coupon-crud pattern; getByRole name doesn't
      // resolve UFormField labels).
      const titleInput = page.getByLabel('Title', { exact: true })
      await expect(async () => {
        await newBtn.click()
        await expect(titleInput).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 60_000 })

      await titleInput.fill(title)
      // image_url is required. The picker is an R2 upload widget with a manual
      // paste-URL fallback — fill the fallback so no upload is needed.
      await page.getByLabel('Or paste a URL').fill(imageUrl)
      // placement defaults to home_hero; sort_order defaults to 0 (valid) — leave
      // both untouched so no UInputNumber undefined-emit gotcha applies.
      await page.getByRole('button', { name: 'Save', exact: true }).click()

      await expect(page.getByText('Banner created.').first()).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 })

      // --- delete via the row action (aria-label "Delete") → confirm modal.
      const row = page.getByRole('row').filter({ hasText: title })
      const confirmHeading = page.getByText('Delete banner', { exact: true })
      await expect(async () => {
        await row.getByRole('button', { name: 'Delete' }).click()
        await expect(confirmHeading).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 30_000 })
      await page.getByRole('dialog').getByRole('button', { name: /Delete/ }).click()

      await expect(page.getByText('Banner deleted.').first()).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText(title)).toHaveCount(0, { timeout: 15_000 })
    }
    finally {
      await api.dispose()
    }
  })
})
