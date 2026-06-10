// Variant-aware checkout — the shopper picks a size on the PDP, the cart
// carries the variant identity, and the placed order records the variant_id
// + the variant's per-override price.
//
// Promoted from a Playwright-MCP verify pass per the promotion ritual
// (e2e/README.md §"Promotion ritual"). Fixtures are created per run with
// unique slugs/names so the spec is rerunnable without manual cleanup.
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Variant checkout', () => {
  test('selecting a size variant on PDP carries variant price + identity through checkout', async ({ page }) => {
    const api = await ApiClient.create()
    const runId = Date.now()
    const user = randomEphemeralUser()
    let adminToken = ''
    let productId: number | null = null

    try {
      // --- fixtures: product with Size option (S/M/L), M gets a price override
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const slug = `e2e-variant-${runId}`

      // The base product price is $50; M overrides to $29.99 so the test can
      // assert a price different from the base "from" price shown initially.
      const product = await api.createProduct(adminToken, {
        name: 'E2E Size Widget',
        slug,
        price_usd: 50,
        price_pln: 200,
        price_eur: 45,
        stock: 0, // zeroed out when variants are added
      })
      productId = product.id

      const matrix = await api.createProductVariants(adminToken, product.id, {
        options: [
          {
            name: 'Size',
            position: 0,
            values: [
              { value: 'S', position: 0 },
              { value: 'M', position: 1 },
              { value: 'L', position: 2 },
            ],
          },
        ],
        variants: [
          { option_values: ['S'], initial_stock: 5 },
          // M override: $29.99 (distinct from the $50 base so the assertion is unambiguous)
          { option_values: ['M'], price_usd: 29.99, price_pln: 119.99, price_eur: 27.99, initial_stock: 5 },
          { option_values: ['L'], initial_stock: 5 },
        ],
      })

      const mVariant = matrix.variants.find(v => v.title === 'M')
      if (!mVariant) throw new Error('M variant not found in matrix response')

      await api.ensureShippingFixture(adminToken, {
        methodName: 'E2E Standard',
        countryCodes: ['US'],
        rates: [{ currency: 'USD', amount: 10 }],
      })

      await api.register(user)
      await api.markVerified(user.email)
      const { accessToken, refreshCookie } = await api.loginViaApi(user.email, user.password)
      await page.context().addCookies([refreshCookie])

      // --- PDP: select the M size, then add to cart
      await page.goto(`/products/${slug}`)
      await expect(page.getByRole('heading', { name: 'E2E Size Widget' })).toBeVisible()

      // The variant selector renders one button per size value; pick M.
      // exact: true avoids matching other buttons whose accessible name
      // contains the letter "M" (e.g. the dark-mode toggle).
      // The variant selector is client-only Pinia state — retry until the
      // click event is wired (same recovery pattern as "Add to Cart").
      const mButton = page.getByRole('button', { name: 'M', exact: true })
      await expect(mButton).toBeVisible()
      await expect(async () => {
        await mButton.click()
        await expect(mButton).toHaveAttribute('aria-pressed', 'true', { timeout: 2_000 })
      }).toPass({ timeout: 20_000 })

      // After selecting M the price updates to $29.99.
      await expect(page.getByText('$29.99').first()).toBeVisible()

      // Add to cart — the handler is client-only Pinia; retry until the drawer
      // opens (same recovery pattern as the happy-path spec).
      await expect(async () => {
        await page.getByRole('button', { name: 'Add to Cart' }).first().click()
        await expect(
          page.getByRole('dialog').getByText('E2E Size Widget'),
        ).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 20_000 })

      // The drawer shows the variant title alongside the product name.
      await expect(page.getByTestId('line-variant-title')).toContainText('M')

      // --- /cart page confirms the variant line
      await page.goto('/cart')
      await expect(page.getByText('E2E Size Widget').first()).toBeVisible()
      // The variant title is shown in the cart line.
      await expect(page.getByTestId('line-variant-title')).toContainText('M')
      await expect(page.getByRole('link', { name: 'Proceed to checkout' })).toBeVisible()

      // --- single-page checkout
      await page.goto('/checkout')
      await expect(page.getByText('Order summary')).toBeVisible()
      // Summary line shows the variant-priced total ($29.99 × 1).
      await expect(page.getByText('$29.99').first()).toBeVisible()

      await page.getByLabel('Address', { exact: true }).fill('1 Variant Lane')
      await page.getByLabel('City', { exact: true }).fill('New York')
      await page.getByLabel('Postal code', { exact: true }).fill('10001')
      await page.getByLabel('Country', { exact: true }).click()
      await page.getByRole('option', { name: 'United States' }).click()

      await expect(page.getByText('E2E Standard').first()).toBeVisible()
      const placeOrder = page.getByRole('button', { name: 'Place order' })
      await expect(placeOrder).toBeEnabled()
      await placeOrder.click()

      await expect(page).toHaveURL(/\/checkout\/success/, { timeout: 30_000 })
      await expect(page.getByRole('heading', { name: 'Order placed!' }))
        .toBeVisible({ timeout: 30_000 })

      // --- server-side truth: order line carries M's variant_id + $29.99 price
      const orders = await api.listOrders(accessToken)
      expect(orders).toHaveLength(1)
      const order = await api.getOrder(accessToken, orders[0]!.id)
      expect(order.status).toBe('pending')
      expect(order.currency).toBe('USD')
      // subtotal = 29.99 (M variant price), shipping = 10, total = 39.99
      expect(order.subtotal).toBeCloseTo(29.99, 2)
      expect(order.shipping).toBe(10)
      expect(order.discount).toBe(0)
      expect(order.total).toBeCloseTo(39.99, 2)
      expect(order.items).toHaveLength(1)
      expect(order.items[0]!.product_id).toBe(productId)
      expect(order.items[0]!.variant_id).toBe(mVariant.id)
      expect(order.items[0]!.variant_title).toBe('M')
      expect(order.items[0]!.quantity).toBe(1)
      expect(order.items[0]!.unit_price).toBeCloseTo(29.99, 2)
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
