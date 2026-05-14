import { expect, test } from '@playwright/test'
import { randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test('register happy path → redirects to /verify-email-sent', async ({ page }) => {
  const user = randomEphemeralUser()

  await page.goto('/sign-up')
  await page.waitForLoadState('networkidle')

  await page.getByLabel(/first name/i).fill(user.firstName)
  await page.getByLabel(/last name/i).fill(user.lastName)
  await page.getByLabel('Email', { exact: true }).fill(user.email)
  await page.getByLabel(/^password$/i).fill(user.password)
  await page.getByLabel(/confirm password/i).fill(user.password)

  await page.getByRole('button', { name: /continue/i }).click()

  await expect(page).toHaveURL(new RegExp(`/verify-email-sent\\?email=${encodeURIComponent(user.email).replace(/\./g, '\\.')}`))
})
