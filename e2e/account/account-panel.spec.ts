// Account panel (Waves A/B) — profile edit persists through PUT /me, and the
// address book CRUD enforces the single-default-shipping business rule.
//
// Promoted from a Playwright-MCP verify pass per the promotion ritual
// (e2e/README.md §"Promotion ritual").
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

// CI runs several E2E jobs concurrently on the shared hive host and the
// dev server compiles page chunks on first hit — generous budget, same
// pattern as auth/refresh.spec.ts.
test.setTimeout(120_000)

test.describe('Account panel', () => {
  test('profile edit persists across a reload', async ({ page }) => {
    const api = await ApiClient.create()
    const user = randomEphemeralUser()
    try {
      await api.register(user)
      await api.markVerified(user.email)
      const { refreshCookie } = await api.loginViaApi(user.email, user.password)
      await page.context().addCookies([refreshCookie])

      // The client boot re-fetches GET /auth/me and the form's watcher
      // re-seeds the fields from it — fill only after that fetch lands or
      // typed values get clobbered.
      const meSettled = page
        .waitForResponse(
          r => r.url().includes('/auth/me') && r.request().method() === 'GET',
          { timeout: 15_000 },
        )
        .catch(() => null)
      await page.goto('/account/profile')
      await meSettled
      const firstName = page.getByLabel('First name')
      // 30s: first CI hit compiles the page chunk on the cold dev server.
      await expect(firstName).toHaveValue(user.firstName, { timeout: 60_000 })

      // The form pre-fills from the auth store and a late user re-fetch can
      // clobber values typed too early — fill, let the watchers settle, and
      // re-fill if the values were overwritten.
      await expect(async () => {
        await firstName.fill('Updated')
        await page.getByLabel('Last name').fill('Customer')
        await page.getByLabel('Phone', { exact: true }).fill('+1 555 010 0199')
        await page.waitForTimeout(300)
        await expect(firstName).toHaveValue('Updated')
        await expect(page.getByLabel('Last name')).toHaveValue('Customer')
      }).toPass({ timeout: 20_000 })

      await expect(async () => {
        await page.getByRole('button', { name: 'Save changes' }).click()
        await expect(page.getByText('Profile updated.').first()).toBeVisible({ timeout: 3_000 })
      }).toPass({ timeout: 15_000 })

      // Server-side persistence: a fresh load re-fetches the user.
      await page.goto('/account/profile')
      await expect(page.getByLabel('First name')).toHaveValue('Updated')
      await expect(page.getByLabel('Last name')).toHaveValue('Customer')
      await expect(page.getByLabel('Phone', { exact: true })).toHaveValue('+1 555 010 0199')
    }
    finally {
      await api.dispose()
    }
  })

  test('address CRUD enforces a single default shipping address', async ({ page }) => {
    const api = await ApiClient.create()
    const user = randomEphemeralUser()
    try {
      await api.register(user)
      await api.markVerified(user.email)
      const { accessToken, refreshCookie } = await api.loginViaApi(user.email, user.password)
      await page.context().addCookies([refreshCookie])

      await page.goto('/account/addresses')
      // 30s: first CI hit compiles the page chunk on the cold dev server.
      await expect(page.getByText('You have no saved addresses yet.'))
        .toBeVisible({ timeout: 60_000 })

      // --- add the first address as default shipping
      const dialog = page.getByRole('dialog')
      await expect(async () => {
        await page.getByRole('button', { name: 'Add address' }).click()
        await expect(dialog).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 20_000 })
      await dialog.getByLabel('Recipient name').fill('Home Person')
      await dialog.getByLabel('Street address').fill('1 First St')
      await dialog.getByLabel('City').fill('New York')
      await dialog.getByLabel('Postal code').fill('10001')
      await dialog.getByLabel('Country').click()
      await page.getByRole('option', { name: 'United States' }).click()
      await dialog.getByText('Use as my default shipping address').click()
      await dialog.getByRole('button', { name: 'Save address' }).click()
      await expect(page.getByText('Address added.').first()).toBeVisible()
      // The card renders the recipient twice (heading + address block);
      // "Default shipping" must be exact or it also matches the checkbox label.
      await expect(page.getByText('Home Person').first()).toBeVisible()
      await expect(page.getByText('Default shipping', { exact: true })).toBeVisible()

      // --- add a second address, also default shipping → it takes the badge
      await expect(async () => {
        await page.getByRole('button', { name: 'Add address' }).click()
        await expect(dialog).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 20_000 })
      await dialog.getByLabel('Recipient name').fill('Office Person')
      await dialog.getByLabel('Street address').fill('2 Second Ave')
      await dialog.getByLabel('City').fill('Boston')
      await dialog.getByLabel('Postal code').fill('02101')
      await dialog.getByLabel('Country').click()
      await page.getByRole('option', { name: 'United States' }).click()
      await dialog.getByText('Use as my default shipping address').click()
      await dialog.getByRole('button', { name: 'Save address' }).click()
      await expect(page.getByText('Address added.').first()).toBeVisible()
      await expect(page.getByText('Office Person').first()).toBeVisible()

      // Business rule: only ONE default shipping address — server-side truth.
      await expect
        .poll(async () => {
          const addresses = await api.listAddresses(accessToken)
          return addresses
            .filter(a => a.is_default_shipping)
            .map(a => a.recipient_name)
        })
        .toEqual(['Office Person'])
      await expect(page.getByText('Default shipping', { exact: true })).toHaveCount(1)

      // --- delete the second address (confirm modal). Cards sort the
      // default-shipping one first, so scope the button to the Office card
      // instead of relying on insertion order.
      const officeCard = page.locator('.c-address-card').filter({ hasText: 'Office Person' })
      await officeCard.getByRole('button', { name: 'Delete address' }).click()
      await expect(page.getByText('Delete this address?')).toBeVisible()
      await page.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(page.getByText('Address deleted.').first()).toBeVisible()
      await expect(page.getByText('Office Person')).toHaveCount(0)
      expect(await api.listAddresses(accessToken)).toHaveLength(1)
    }
    finally {
      await api.dispose()
    }
  })
})
