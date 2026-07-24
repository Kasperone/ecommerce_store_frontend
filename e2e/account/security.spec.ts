// Account security — change password from /account/security. Server truth:
// after the change the OLD password is rejected and the NEW one authenticates
// (the backend also revokes the refresh-token family + bumps
// password_changed_at). Security-critical, previously unspecced.
//
// Drafted against the live app via the planner/generator flow. Conventions
// mirror e2e/account/account-panel.spec.ts (ephemeral user, refresh-cookie
// inject, server-truth via ApiClient.loginViaApi).
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(120_000)

test.describe('Account security', () => {
  test('changing password rejects the old credential and accepts the new one', async ({ page }) => {
    const api = await ApiClient.create()
    const user = randomEphemeralUser()
    const newPassword = 'NewEphemeralPass!2'
    try {
      await api.register(user)
      await api.markVerified(user.email)
      const { refreshCookie } = await api.loginViaApi(user.email, user.password)
      await page.context().addCookies([refreshCookie])

      await page.goto('/account/security')
      // Hydration gate — the form's submit handler wires up client-side.
      await expect(page.getByRole('button', { name: 'Open cart' })).toBeVisible({ timeout: 60_000 })

      await page.getByLabel('Current password').fill(user.password)
      await page.getByLabel('New password', { exact: true }).fill(newPassword)
      await page.getByLabel('Confirm new password').fill(newPassword)
      await page.getByRole('button', { name: 'Update password' }).click()

      await expect(page.getByText('Password updated.').first()).toBeVisible({ timeout: 15_000 })

      // Server truth: the old password no longer authenticates, the new one does.
      await expect(api.loginViaApi(user.email, user.password)).rejects.toThrow()
      const relogin = await api.loginViaApi(user.email, newPassword)
      expect(relogin.accessToken).toBeTruthy()
    }
    finally {
      await api.dispose()
    }
  })
})
