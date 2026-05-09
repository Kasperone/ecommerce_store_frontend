import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('password recovery → submits and shows success card', async ({ page }) => {
  // Backend always returns 200 to /auth/password-reset/request for
  // enumeration prevention, so a non-existent email exercises the same
  // happy-path UI as a real one — no need to register a user first.
  await page.goto('/password-recovery')
  await page.waitForLoadState('networkidle')

  await page.getByLabel(/email/i).fill('does-not-exist@e2e.example.com')
  await page.getByRole('button', { name: /send|reset|continue/i }).click()

  // Success state renders the "Reset your password" heading with the
  // "If an account exists..." description and a "go to login" button.
  await expect(page.getByRole('heading', { name: /reset your password/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /sign in|login|log in/i })).toBeVisible()
})
