// GDPR data-rights (Art. 15/20 + erasure) — the /account/privacy surface:
//   1. "Download my data" triggers POST /api/v1/me/data-export and streams the
//      snapshot to the browser as account-data-<date>.json (the export must
//      actually contain the caller's data).
//   2. "Delete my account" soft-deletes + anonymizes: refresh tokens revoked
//      and the login email placeholdered, so the account can no longer sign in.
//
// Drafted against the live app via the planner/generator flow. Ephemeral users
// throughout — the deletion test is irreversible by design.
import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { ApiClient } from '../fixtures/apiClient'
import { randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(120_000)

test.describe('Account privacy (GDPR)', () => {
  test('data export downloads a JSON snapshot containing the account', async ({ page }) => {
    const api = await ApiClient.create()
    const user = randomEphemeralUser()
    try {
      await api.register(user)
      await api.markVerified(user.email)
      const { refreshCookie } = await api.loginViaApi(user.email, user.password)
      await page.context().addCookies([refreshCookie])

      await page.goto('/account/privacy')
      // Gate interaction on a client-only hydration signal — the header's
      // <CartTrigger> ("Open cart") only mounts after hydration. Clicking the
      // export button before then loses the handler (SSR hydration race).
      await expect(page.getByRole('button', { name: 'Open cart' })).toBeVisible({ timeout: 60_000 })
      const exportBtn = page.getByRole('button', { name: 'Download my data' })
      await expect(exportBtn).toBeVisible()

      // The click POSTs /me/data-export, then builds a Blob + <a download> and
      // clicks it — capture the resulting browser download.
      const downloadPromise = page.waitForEvent('download', { timeout: 20_000 })
      await exportBtn.click()
      const download = await downloadPromise
      expect(download.suggestedFilename()).toMatch(/^account-data-.*\.json$/)
      await expect(page.getByText('Your data export has started downloading.').first())
        .toBeVisible({ timeout: 10_000 })

      // The snapshot must actually carry the caller's data, not an empty stub.
      const path = await download.path()
      const payload = JSON.parse(await readFile(path, 'utf8'))
      expect(JSON.stringify(payload)).toContain(user.email)
    }
    finally {
      await api.dispose()
    }
  })

  test('account deletion anonymizes and blocks further sign-in', async ({ page }) => {
    const api = await ApiClient.create()
    const user = randomEphemeralUser()
    try {
      await api.register(user)
      await api.markVerified(user.email)
      const { refreshCookie } = await api.loginViaApi(user.email, user.password)
      await page.context().addCookies([refreshCookie])

      await page.goto('/account/privacy')
      // Hydration gate (see the export test) — clicking before hydration would
      // fail to open the confirmation modal.
      await expect(page.getByRole('button', { name: 'Open cart' })).toBeVisible({ timeout: 60_000 })
      await page.getByRole('button', { name: 'Delete my account' }).click()

      // Confirmation modal → confirm the irreversible delete.
      await expect(page.getByText('Delete your account?')).toBeVisible({ timeout: 60_000 })
      await page.getByRole('button', { name: 'Delete account', exact: true }).click()

      // Signed out + sent home with the success notice.
      await expect(page.getByText('Your account has been deleted.').first())
        .toBeVisible({ timeout: 15_000 })
      await expect(page).toHaveURL(/\/$|\/\?/, { timeout: 15_000 })

      // Server truth: the credentials no longer authenticate (email placeholdered,
      // tokens revoked) — loginViaApi throws on a non-2xx.
      await expect(api.loginViaApi(user.email, user.password)).rejects.toThrow()
    }
    finally {
      await api.dispose()
    }
  })
})
