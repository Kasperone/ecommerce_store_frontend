import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_USER, LOCKOUT_USER } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test('login happy path → redirects home and shows welcome toast', async ({ page }) => {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')

  await page.getByLabel('Email', { exact: true }).fill(KNOWN_USER.email)
  await page.getByLabel(/^password$/i).fill(KNOWN_USER.password)
  await page.getByRole('button', { name: /continue/i }).click()

  await expect(page).toHaveURL('/')
  await expect(page.getByText('Welcome back!', { exact: true })).toBeVisible()
})

test('login while account is locked → stays on /login with error', async ({ page }) => {
  // Behavior-only assertion: backend's 401 is intentionally generic (audit
  // says don't expose lockout state in the response). The test verifies the
  // *correct* password also fails when the user is locked, proving the
  // lockout shortcut fired before password verification. The counter
  // mechanism itself is covered by backend integration tests.
  const api = await ApiClient.create()
  try {
    await api.lockUser(LOCKOUT_USER.email)
  }
  finally {
    await api.dispose()
  }

  await page.goto('/login')
  await page.waitForLoadState('networkidle')

  await page.getByLabel('Email', { exact: true }).fill(LOCKOUT_USER.email)
  await page.getByLabel(/^password$/i).fill(LOCKOUT_USER.password)
  await page.getByRole('button', { name: /continue/i }).click()

  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByText('Error signing in').first()).toBeVisible()
})
