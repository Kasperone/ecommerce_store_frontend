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

  // Lands on /verify-email-sent carrying the email. Assert the decoded query
  // value, not an exact encoded URL — the redirect is built with localePath's
  // route-object form, so Vue Router stringifies the query (leaving `@`
  // unescaped) rather than us hand-encoding it.
  await expect(page).toHaveURL(/\/verify-email-sent\?email=/)
  expect(new URL(page.url()).searchParams.get('email')).toBe(user.email)
})
