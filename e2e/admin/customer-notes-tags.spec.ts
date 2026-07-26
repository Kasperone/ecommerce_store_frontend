// Admin customer notes + tags — the back-office CRM surface on the customer
// detail page (`/admin/customers/[id]`). Seeds a fresh customer via the API,
// then drives the full lifecycle through the UI:
//   notes: add → edit → delete (each with its success flash + list truth)
//   tags:  create-by-name → detach
// Both widgets render inline on the detail page (no tabs).
//
// Conventions mirror e2e/admin/refund-money-path.spec.ts (ephemeral customer +
// userIdByEmail) and coupon-crud (admin refresh-cookie inject). The FIRST
// interaction after a cookie-injection goto hits the admin-chrome cold-compile
// hydration race, so the add-note step re-fills + re-clicks until the flash
// appears (the Add button is disabled until v-model sees the text, so the retry
// is self-correcting).
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(120_000)

test.describe('Admin customer notes + tags', () => {
  test('note add/edit/delete and tag attach/detach', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const user = randomEphemeralUser()
    const runId = Date.now()
    const noteBody = `E2E note ${runId}`
    const editedBody = `E2E note edited ${runId}`
    const tagName = `e2e-tag-${runId}`

    try {
      await api.register(user)
      await api.markVerified(user.email)
      const customerId = await api.userIdByEmail(user.email)

      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      await page.context().addCookies([admin.refreshCookie])

      await page.goto(`/admin/customers/${customerId}`)
      await expect(page).toHaveURL(new RegExp(`/admin/customers/${customerId}`), { timeout: 30_000 })

      // ---- Notes ----
      const addNoteBtn = page.getByRole('button', { name: 'Add note' })
      await expect(addNoteBtn).toBeVisible({ timeout: 60_000 })

      // Add (hydration-resilient: re-fill + re-click until the flash lands).
      const noteInput = page.getByLabel('Add note') // textarea aria-label
      await expect(async () => {
        await noteInput.fill(noteBody)
        await addNoteBtn.click()
        await expect(page.getByText('Note added.').first()).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 60_000 })
      await expect(page.getByText(noteBody).first()).toBeVisible({ timeout: 15_000 })

      // Edit (hydration settled by now).
      await page.getByRole('button', { name: 'Edit note' }).click()
      const editInput = page.getByLabel('Edit note') // edit-mode textarea aria-label
      await expect(editInput).toBeVisible({ timeout: 10_000 })
      await editInput.fill(editedBody)
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.getByText('Note updated.').first()).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText(editedBody).first()).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText(noteBody)).toHaveCount(0, { timeout: 15_000 })

      // Delete via the trash icon → popover confirm. Both the trash and the
      // confirm share the name "Delete note"; the trash is DOM-first, the
      // portal-rendered popover confirm is last.
      const deleteConfirm = page.getByText('Delete this note?')
      await expect(async () => {
        await page.getByRole('button', { name: 'Delete note' }).first().click()
        await expect(deleteConfirm).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 20_000 })
      await page.getByRole('button', { name: 'Delete note' }).last().click()
      await expect(page.getByText('Note deleted.').first()).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText(editedBody)).toHaveCount(0, { timeout: 15_000 })

      // ---- Tags ----
      // Create-and-assign a new tag by name (Enter submits). No success flash on
      // attach — the pill (and its "Remove <name>" button) is the truth.
      const tagInput = page.getByPlaceholder('New tag name')
      await tagInput.fill(tagName)
      await tagInput.press('Enter')
      const removeTagBtn = page.getByRole('button', { name: `Remove ${tagName}` })
      await expect(removeTagBtn).toBeVisible({ timeout: 15_000 })

      // Detach.
      await removeTagBtn.click()
      await expect(page.getByText('Tag removed.').first()).toBeVisible({ timeout: 15_000 })
      await expect(page.getByRole('button', { name: `Remove ${tagName}` })).toHaveCount(0, { timeout: 15_000 })
    }
    finally {
      await api.dispose()
    }
  })
})
