import { expect, test } from '@playwright/test'
import { KNOWN_USER } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test('login happy path → redirects home and shows welcome toast', async ({ page }) => {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')

  await page.getByLabel(/email/i).fill(KNOWN_USER.email)
  await page.getByLabel(/^password$/i).fill(KNOWN_USER.password)
  await page.getByRole('button', { name: /continue/i }).click()

  await expect(page).toHaveURL('/')
  await expect(page.getByText('Welcome!', { exact: true })).toBeVisible()
})
