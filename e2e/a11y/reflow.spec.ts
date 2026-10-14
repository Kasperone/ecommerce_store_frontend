// WCAG 1.4.10 Reflow — at 320 CSS px width, storefront content must not require
// horizontal scrolling. Axe page sweeps do not cover zoom/reflow; this spec is
// the guardrail (see plans/a11y pending closeout item 7).
import { expect, test, type Page } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'
import { assertNoHorizontalOverflow } from '../helpers/reflow'

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 320, height: 800 },
})
test.setTimeout(120_000)

type CartSeedItem = {
  productId: number
  variantId: null
  slug: string
  name: string
  imageUrl: null
  price_usd: number
  price_pln: number
  price_eur: number
  stock: number
  allowBackorder: boolean
  quantity: number
}

test.describe('Storefront reflow at 320px', () => {
  let cartItem: CartSeedItem
  let productId: number | null = null
  let adminToken = ''

  test.beforeAll(async () => {
    const api = await ApiClient.create()
    const runId = Date.now()
    const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
    adminToken = admin.accessToken

    const slug = `e2e-reflow-${runId}`
    const product = await api.createProduct(adminToken, {
      name: 'E2E Reflow Widget',
      slug,
      price_usd: 40,
      price_pln: 160,
      price_eur: 36,
      stock: 5,
    })
    productId = product.id

    cartItem = {
      productId: product.id,
      variantId: null,
      slug,
      name: 'E2E Reflow Widget',
      imageUrl: null,
      price_usd: 40,
      price_pln: 160,
      price_eur: 36,
      stock: 5,
      allowBackorder: false,
      quantity: 1,
    }
  })

  test.afterAll(async () => {
    if (productId && adminToken) {
      const api = await ApiClient.create()
      await api.deleteProduct(adminToken, productId).catch(() => {})
    }
  })

  async function seedCart(page: Page) {
    await page.addInitScript((item: CartSeedItem) => {
      localStorage.setItem('cart', JSON.stringify([item]))
    }, cartItem)
  }

  test('home has no horizontal overflow @smoke', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 60_000 })
    await assertNoHorizontalOverflow(page)
  })

  test('cart with item has no horizontal overflow @smoke', async ({ page }) => {
    await seedCart(page)
    await page.goto('/cart')
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 60_000 })
    await assertNoHorizontalOverflow(page)
  })

  test('checkout with item has no horizontal overflow @smoke', async ({ page }) => {
    const api = await ApiClient.create()
    await api.ensureShippingFixture(adminToken, {
      methodName: 'E2E Standard',
      countryCodes: ['US'],
      rates: [{ currency: 'USD', amount: 10 }],
    })

    await seedCart(page)
    await expect(async () => {
      await page.goto('/checkout')
      await expect(page.getByTestId('guest-email')).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 30_000 })
    await assertNoHorizontalOverflow(page)
  })

  test('login has no horizontal overflow @smoke', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 60_000 })
    await assertNoHorizontalOverflow(page)
  })
})
