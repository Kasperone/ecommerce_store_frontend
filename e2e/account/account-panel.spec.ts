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
test.setTimeout(180_000)

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

      // The form's watch(authStore.user) re-seeds the fields whenever a
      // background user re-fetch lands (boot /auth/me, proactive token
      // refresh at TTL−60s, 401-retry) — any fill can be clobbered before
      // the save click. One atomic fill→save→verify loop converges: if the
      // PUT carried stale values the store round-trips them back into the
      // fields, the trailing check fails the iteration, and we re-fill and
      // re-save until a clean save lands.
      await expect(async () => {
        await firstName.fill('Updated')
        await page.getByLabel('Last name').fill('Customer')
        await page.getByLabel('Phone', { exact: true }).fill('+1 555 010 0199')
        await page.getByRole('button', { name: 'Save changes' }).click()
        await expect(page.getByText('Profile updated.').first()).toBeVisible({ timeout: 5_000 })
        // Post-save the watcher re-seeds from the SAVED user — these holding
        // the new values proves the PUT carried them.
        await expect(firstName).toHaveValue('Updated', { timeout: 2_000 })
        await expect(page.getByLabel('Last name')).toHaveValue('Customer', { timeout: 2_000 })
      }).toPass({ timeout: 90_000 })

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
