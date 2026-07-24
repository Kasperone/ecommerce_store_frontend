// Admin coupon CRUD — create a percentage coupon through the modal, see it in
// the table, then delete it via the confirm modal. Covers the admin coupon
// management UI (the redemption path is covered by checkout/coupon.spec.ts;
// this one is the back-office lifecycle).
//
// Drafted against the live app via the planner/generator flow. Conventions
// mirror e2e/admin/order-editing.spec.ts (admin refresh-cookie inject,
// UInputNumber helper for the numeric field).
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(120_000)

test.describe('Admin coupon CRUD', () => {
  test('create a percent coupon then delete it', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const code = `E2ECRUD${Date.now()}`

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      await page.context().addCookies([admin.refreshCookie])

      await page.goto('/admin/coupons')
      await expect(page).toHaveURL(/\/admin\/coupons/, { timeout: 30_000 })
      // Authed-admin render gate.
      const newBtn = page.getByRole('button', { name: 'New coupon' })
      await expect(newBtn).toBeVisible({ timeout: 60_000 })

      // --- create (discount_type defaults to percent → no select needed)
      // The admin page cold-compiles; a click fired before hydration is lost and
      // the modal won't open (no "Open cart" hydration signal exists on admin
      // chrome). Re-click until the modal's Code field appears — the repo's
      // pattern for client-only-handler races (see checkout.spec.ts).
      const codeInput = page.getByLabel('Code')
      await expect(async () => {
        await newBtn.click()
        await expect(codeInput).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 60_000 })
      await codeInput.fill(code)
      // Set Value (UInputNumber → drive via keys, not .fill()). Commit with
      // Shift+Tab so focus lands back on the Discount-type combobox rather than
      // the empty optional "Minimum order amount": that field is a
      // `z.number().nullable()` UInputNumber that emits `undefined` (not null)
      // once focused+blurred, which the schema rejects and blocks Save.
      const valueField = page.getByLabel('Value')
      await valueField.click()
      await valueField.press('ControlOrMeta+a')
      await valueField.press('Delete')
      await valueField.pressSequentially('15')
      await valueField.press('Shift+Tab')
      await page.getByRole('button', { name: 'Save', exact: true }).click()

      await expect(page.getByText('Coupon created.').first()).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText(code).first()).toBeVisible({ timeout: 15_000 })

      // --- delete via the row action → confirm modal (hydration is settled by
      // now, but keep the same resilient open pattern for the confirm modal)
      const row = page.getByRole('row').filter({ hasText: code })
      const confirmHeading = page.getByText('Delete coupon', { exact: true })
      await expect(async () => {
        await row.getByRole('button', { name: 'Delete' }).click()
        await expect(confirmHeading).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 30_000 })
      await page.getByRole('dialog').getByRole('button', { name: /Delete/ }).click()

      await expect(page.getByText('Coupon deleted.').first()).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText(code)).toHaveCount(0, { timeout: 15_000 })
    }
    finally {
      await api.dispose()
    }
  })
})
