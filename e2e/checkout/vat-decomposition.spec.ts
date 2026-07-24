// Multi-rate VAT / faktura decomposition — the wiring the per-rate faktura
// split depends on. The store prices goods VAT-inclusive (gross), so VAT is
// NEVER stored on the order (order.tax is always 0); the faktura decomposes
// net/VAT/gross per rate at print time via compute_vat_breakdown, grouping the
// order lines by their snapshotted `vat_rate`. The decomposition math itself is
// exhaustively unit-tested (backend tests/unit/test_invoice.py — mixed 23%+5%,
// discount allocation, reconciliation). What no test covers is the END-TO-END
// wiring: does a real mixed-rate cart, checked out through the actual checkout
// machinery, resolve each product's tax_category → PL rate and snapshot the
// right `vat_rate` onto every order line? That snapshot is the sole input the
// faktura groups by, so it's the observable truth of a "multi-rate faktura".
//
// This spec builds a genuinely mixed cart — one STANDARD (23%) product and one
// REDUCED_5 (5%) product (both PL rates seeded by migration 1156c88e49a4) —
// runs the full /pl/ COD checkout with a faktura VAT request, then asserts via
// the pg seam that the order carries two distinct per-line rate snapshots
// {23, 5} keyed by product. A single-rate order would collapse to one group;
// the mixed pair is what makes the faktura decompose into multiple rate blocks.
//
// Conventions mirror e2e/checkout/pl-money-path.spec.ts (the PL money path).
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

// Valid-checksum NIP (same one the PL money path uses).
const VALID_NIP = '5260250274'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('VAT decomposition', () => {
  test('mixed-rate cart snapshots per-line vat_rate {23, 5} for the faktura split', async ({ page }) => {
    // Heavy multi-route /pl/ flow with two PDPs — give it the slow budget.
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const user = randomEphemeralUser()
    let adminToken = ''
    const productIds: number[] = []

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken

      // --- fixtures: a STANDARD (23%) product and a REDUCED_5 (5%) product.
      // Grosses chosen so each decomposes to a clean net 100 (123 → 100 + 23 @
      // 23%; 105 → 100 + 5 @ 5%) — documentary only, the decomposition itself
      // is unit-tested; here we assert the rate snapshots the split groups by.
      const reduced5Id = await api.taxCategoryIdByCode('REDUCED_5')
      const standard = await api.createProduct(adminToken, {
        name: 'E2E VAT Standard',
        slug: `e2e-vat-standard-${runId}`,
        price_usd: 30,
        price_pln: 123,
        price_eur: 28,
        stock: 5,
      })
      productIds.push(standard.id)
      const reduced = await api.createProduct(adminToken, {
        name: 'E2E VAT Reduced',
        slug: `e2e-vat-reduced-${runId}`,
        price_usd: 26,
        price_pln: 105,
        price_eur: 24,
        stock: 5,
        tax_category_id: reduced5Id,
      })
      productIds.push(reduced.id)

      await api.ensureShippingFixture(adminToken, {
        methodName: 'E2E PL Standard',
        countryCodes: ['PL'],
        rates: [{ currency: 'PLN', amount: 0 }],
      })

      await api.register(user)
      await api.markVerified(user.email)
      const { accessToken, refreshCookie } = await api.loginViaApi(user.email, user.password)
      await page.context().addCookies([refreshCookie])

      // --- add BOTH products to the cart from their PL PDPs. Cart is client-only
      // Pinia state — re-click until the hydrated handler lands (drawer opens).
      for (const [slug, name] of [
        [`e2e-vat-standard-${runId}`, 'E2E VAT Standard'],
        [`e2e-vat-reduced-${runId}`, 'E2E VAT Reduced'],
      ] as const) {
        await page.goto(`/pl/products/${slug}`)
        await expect(page.getByRole('heading', { name })).toBeVisible()
        await expect(async () => {
          await page.getByRole('button', { name: 'Dodaj do Koszyka' }).first().click()
          await expect(
            page.getByRole('dialog').getByText(name),
          ).toBeVisible({ timeout: 2_000 })
        }).toPass({ timeout: 20_000 })
        // Close the drawer before navigating to the next PDP.
        await page.keyboard.press('Escape')
      }

      await page.goto('/pl/cart')
      await expect(page.getByText('E2E VAT Standard').first()).toBeVisible()
      await expect(page.getByText('E2E VAT Reduced').first()).toBeVisible()

      // --- single-page PL checkout
      await page.goto('/pl/checkout')
      await page.getByLabel('Adres', { exact: true }).fill('ul. Testowa 1')
      await page.getByLabel('Miasto', { exact: true }).fill('Kraków')
      await page.getByLabel('Kod pocztowy', { exact: true }).fill('30-001')
      await page.getByLabel('Kraj', { exact: true }).click()
      await page.getByRole('option', { name: 'Polska' }).click()

      const placeOrder = page.getByRole('button', { name: 'Złóż zamówienie' })

      // faktura VAT request + valid NIP so the order is faktura-bound (the
      // surface the per-rate decomposition prints on).
      await page.getByRole('checkbox', { name: /Chcę otrzymać fakturę VAT/ }).check()
      const nip = page.getByRole('textbox', { name: 'NIP', exact: true })
      await nip.fill(VALID_NIP)
      await nip.blur()
      await expect(page.getByText('Podaj prawidłowy 10-cyfrowy NIP.')).toHaveCount(0)

      await page.getByRole('checkbox', { name: /Płatność przy odbiorze/ }).check()
      await expect(placeOrder).toBeEnabled()
      await placeOrder.click()

      await expect(page).toHaveURL(/\/pl\/checkout\/success/, { timeout: 30_000 })
      await expect(page.getByRole('heading', { name: 'Zamówienie złożone!' }))
        .toBeVisible({ timeout: 30_000 })

      // --- server-side truth
      const orders = await api.listOrders(accessToken)
      expect(orders).toHaveLength(1)
      const order = await api.getOrder(accessToken, orders[0]!.id)
      expect(order.currency).toBe('PLN')
      expect(order.invoice_nip).toBe(VALID_NIP)
      // Prices are gross → subtotal is the sum of gross line totals; VAT lives
      // in there, not in order.tax.
      expect(order.subtotal).toBe(228)
      expect(order.tax).toBe(0)

      // The heart of the assertion: each line snapshotted its own rate, so the
      // faktura groups into TWO rate blocks (23% and 5%), not one.
      const rates = await api.getOrderItemVatRates(order.id)
      expect(rates.get(standard.id)).toBe(23)
      expect(rates.get(reduced.id)).toBe(5)
      expect(new Set(rates.values())).toEqual(new Set([23, 5]))

      // And the gross line totals reconcile to the per-rate inputs the faktura
      // decomposes (123 @ 23%, 105 @ 5%).
      const byProduct = new Map(order.items.map(i => [i.product_id, i.total_price]))
      expect(byProduct.get(standard.id)).toBe(123)
      expect(byProduct.get(reduced.id)).toBe(105)
    }
    finally {
      for (const id of productIds) await api.deleteProduct(adminToken, id).catch(() => {})
      await api.dispose()
    }
  })
})
