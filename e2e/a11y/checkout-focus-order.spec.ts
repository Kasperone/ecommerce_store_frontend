// WCAG 2.4.3 Focus Order — checkout tab sequence must follow the logical flow
// (address → shipping method → payment toggles → place order). Axe cannot verify
// tab order; this spec is the guardrail (see e2e/a11y/sweep.ts header).
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'
import { collectFocusTrail, indexOfFocusStop } from '../helpers/focusTrail'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test.describe('Checkout focus order', () => {
  test('guest checkout: shipping method is focused before Place order @smoke', async ({ page }) => {
    const api = await ApiClient.create()
    const runId = Date.now()
    let adminToken = ''
    let productId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken

      const slug = `e2e-focus-order-${runId}`
      const product = await api.createProduct(adminToken, {
        name: 'E2E Focus Order Widget',
        slug,
        price_usd: 40,
        price_pln: 160,
        price_eur: 36,
        stock: 5,
      })
      productId = product.id

      await api.ensureShippingFixture(adminToken, {
        methodName: 'E2E Standard',
        countryCodes: ['US'],
        rates: [{ currency: 'USD', amount: 10 }],
      })

      await page.goto(`/products/${slug}`)
      await expect(page.getByRole('heading', { name: 'E2E Focus Order Widget' })).toBeVisible()
      await expect(async () => {
        await page.getByRole('button', { name: 'Add to Cart' }).first().click()
        await expect(
          page.getByRole('dialog').getByText('E2E Focus Order Widget'),
        ).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 20_000 })

      await expect(async () => {
        await page.goto('/checkout')
        await expect(page.getByTestId('guest-email')).toBeVisible({ timeout: 5_000 })
      }).toPass({ timeout: 30_000 })

      await page.getByTestId('guest-email').fill('guest-focus@example.com')
      await page.getByLabel('Address', { exact: true }).fill('5 Focus Ave')
      await page.getByLabel('City', { exact: true }).fill('Boston')
      await page.getByLabel('Postal code', { exact: true }).fill('02101')
      await page.getByLabel('Country', { exact: true }).click()
      await page.getByRole('option', { name: 'United States' }).click()

      await expect(page.getByText('E2E Standard').first()).toBeVisible()
      await expect(page.getByTestId('checkout-place-order')).toBeVisible()

      // Trail from the first shipping field through the left column — relative
      // order only (header chrome may appear earlier if focus started elsewhere).
      let trail: Awaited<ReturnType<typeof collectFocusTrail>> = []
      await expect(async () => {
        await page.getByTestId('guest-email').focus()
        const collected = await collectFocusTrail(page, { maxSteps: 80 })
        const reachedSubmit = indexOfFocusStop(
          collected,
          s => s.testId === 'checkout-place-order' || s.name === 'Place order',
        )
        expect(
          reachedSubmit,
          `trail must reach Place order: ${JSON.stringify(collected.slice(0, 24))}…`,
        ).toBeGreaterThan(-1)
        trail = collected
      }).toPass({ timeout: 15_000 })

      const guestEmailIdx = indexOfFocusStop(trail, s => s.testId === 'guest-email')
      const addressIdx = indexOfFocusStop(
        trail,
        s => s.name.toLowerCase().includes('address') && s.role === 'textbox',
      )
      const methodIdx = indexOfFocusStop(
        trail,
        s =>
          s.testId === 'shipping-method-option'
          || (s.role === 'radio' && /e2e standard/i.test(s.name)),
      )
      const placeOrderIdx = indexOfFocusStop(
        trail,
        s => s.testId === 'checkout-place-order' || s.name === 'Place order',
      )

      expect(guestEmailIdx).toBeGreaterThanOrEqual(0)
      expect(addressIdx).toBeGreaterThan(guestEmailIdx)
      expect(methodIdx).toBeGreaterThan(addressIdx)
      expect(placeOrderIdx).toBeGreaterThan(methodIdx)
    }
    finally {
      if (productId != null && adminToken) {
        await api.deleteProduct(adminToken, productId).catch(() => {})
      }
    }
  })
})
