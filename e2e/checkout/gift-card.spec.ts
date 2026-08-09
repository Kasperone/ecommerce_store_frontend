// Gift-card money path (BE #200/#201, FE #296/#297), promoted per the promotion
// ritual (e2e/README.md §"Promotion ritual"):
//
//   1. A gift card is seeded at the DB seam (ApiClient.mintGiftCard) with a
//      known plaintext code — codes are bearer money, stored only as a sha256
//      hash + last4, so an admin-issued card's plaintext can't be read back.
//      The mint returns the plaintext the storefront redeems (same posture as
//      the cart-recovery token seam).
//   2. The card is redeemed at checkout as a TENDER (not a discount, D2): it
//      applies AFTER the coupon against the order total, so `amount_due = total
//      − gift_card_amount`. The provider charges `amount_due`.
//   3. PARTIAL cover (card < total) → `amount_due > 0` → order stays `pending`,
//      the card is debited by its coverage.
//   4. FULL cover (card ≥ total) → `amount_due === 0` → the order is PAID at
//      creation in the same unit of work (D2), `payment_method = gift_card`.
//
// The check endpoint + redeem/debit invariants (FOR UPDATE, balance_after,
// release-on-cancel) are backend-test territory; E2E owns the storefront money
// path from a seeded card through a placed order, asserted server-side via the
// owner order API — same depth as checkout.spec.ts.
//
// Fixtures are per-run with unique slugs so the spec is rerunnable.
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { restoreStoreConfigAfterAll } from '../fixtures/storeConfig'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

// This file turns the public gift-card toggle on (below). It is a shared
// singleton, so leaving it on rewrites checkout for every later spec — the
// FE #373 bug. Put it back however we found it.
restoreStoreConfigAfterAll(['gift_cards_enabled'])

/**
 * Drives an authed shopper from a fresh product through /checkout with a gift
 * card applied, and places the order. Returns the seeded card + the shopper's
 * access token + the created product id so the caller can assert server-side
 * and tear down. `giftCardBalance` sets partial-vs-full cover against the
 * $priceUsd + $10 shipping total.
 */
async function placeOrderWithGiftCard(
  page: import('@playwright/test').Page,
  api: ApiClient,
  opts: { runId: number, name: string, priceUsd: number, giftCardBalance: number },
): Promise<{
  adminToken: string
  accessToken: string
  productId: number
  card: { id: number, last4: string }
}> {
  const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
  const adminToken = admin.accessToken

  // D7: the feature ships dark — turn the public toggle on. It is a shared
  // singleton, so `restoreStoreConfigAfterAll` at the top of this file puts it
  // back; specs that run later must not inherit it.
  await api.updateStoreConfig(adminToken, { gift_cards_enabled: true })

  const slug = `e2e-gift-card-${opts.runId}`
  const product = await api.createProduct(adminToken, {
    name: opts.name,
    slug,
    price_usd: opts.priceUsd,
    price_pln: opts.priceUsd * 4,
    price_eur: opts.priceUsd,
    stock: 5,
  })
  await api.ensureShippingFixture(adminToken, {
    methodName: 'E2E Standard',
    countryCodes: ['US'],
    rates: [{ currency: 'USD', amount: 10 }],
  })

  const user = randomEphemeralUser()
  await api.register(user)
  await api.markVerified(user.email)
  const { accessToken, refreshCookie } = await api.loginViaApi(user.email, user.password)
  await page.context().addCookies([refreshCookie])

  const card = await api.mintGiftCard({ balance: opts.giftCardBalance, currency: 'USD' })

  // --- add to cart from the PDP (client-only Pinia state; re-click until the
  // hydrated handler lands — same recovery pattern as checkout.spec.ts).
  await page.goto(`/products/${slug}`)
  await expect(page.getByRole('heading', { name: opts.name })).toBeVisible()
  await expect(async () => {
    await page.getByRole('button', { name: 'Add to Cart' }).first().click()
    await expect(page.getByRole('dialog').getByText(opts.name)).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })

  // --- single-page checkout: shipping form + method
  await page.goto('/checkout')
  const address = page.getByLabel('Address', { exact: true })
  await expect(address).toBeVisible()
  await address.fill('123 Main St')
  await page.getByLabel('City', { exact: true }).fill('New York')
  await page.getByLabel('Postal code', { exact: true }).fill('10001')
  await page.getByLabel('Country', { exact: true }).click()
  await page.getByRole('option', { name: 'United States' }).click()
  await expect(page.getByText('E2E Standard').first()).toBeVisible()

  // --- apply the gift card: preview via POST /gift-cards/check, applied state
  // shows the masked code + coverage; the summary reflects amount_due.
  await page.getByTestId('gift-card-input').fill(card.code)
  await page.getByTestId('gift-card-apply').click()
  await expect(page.getByTestId('gift-card-applied')).toBeVisible()
  await expect(page.getByTestId('gift-card-coverage')).toBeVisible()
  await expect(page.getByTestId('summary-amount-due')).toBeVisible()

  const placeOrder = page.getByRole('button', { name: 'Place order' })
  await expect(placeOrder).toBeEnabled()
  await placeOrder.click()

  await expect(page).toHaveURL(/\/checkout\/success/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Order placed!' }))
    .toBeVisible({ timeout: 30_000 })

  return { adminToken, accessToken, productId: product.id, card }
}

test.describe('Gift-card checkout tender', () => {
  test('partial cover: card debited, order stays pending, amount_due charged', async ({ page }) => {
    // Heavy multi-route flow — budget like the other money-path specs.
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    let adminToken = ''
    let productId: number | null = null

    try {
      // Total = $100 goods + $10 shipping = $110; a $40 card covers part of it.
      const placed = await placeOrderWithGiftCard(page, api, {
        runId,
        name: 'E2E Gift Widget Partial',
        priceUsd: 100,
        giftCardBalance: 40,
      })
      adminToken = placed.adminToken
      productId = placed.productId

      const orders = await api.listOrders(placed.accessToken)
      expect(orders).toHaveLength(1)
      const order = await api.getOrder(placed.accessToken, orders[0]!.id)

      expect(order.status).toBe('pending')
      expect(order.currency).toBe('USD')
      expect(order.discount).toBe(0)
      expect(order.total).toBe(110)
      // Tender applies against the total: coverage = min(balance, total) = 40.
      expect(order.gift_card_amount).toBe(40)
      expect(order.store_credit_amount).toBe(0)
      // A provider still collects the remainder.
      expect(order.amount_due).toBe(70)
      expect(order.gift_card_last4).toBe(placed.card.last4)

      // The card was debited by its coverage (down to zero here).
      expect(await api.getGiftCardBalance(placed.card.id)).toBe(0)
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })

  test('full cover: amount_due 0 → order PAID at creation, card keeps remainder', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    let adminToken = ''
    let productId: number | null = null

    try {
      // Total = $50 goods + $10 shipping = $60; a $100 card fully covers it.
      const placed = await placeOrderWithGiftCard(page, api, {
        runId,
        name: 'E2E Gift Widget Full',
        priceUsd: 50,
        giftCardBalance: 100,
      })
      adminToken = placed.adminToken
      productId = placed.productId

      const orders = await api.listOrders(placed.accessToken)
      expect(orders).toHaveLength(1)
      const order = await api.getOrder(placed.accessToken, orders[0]!.id)

      expect(order.total).toBe(60)
      // coverage = min(balance, total) = 60 → amount_due 0 → PAID at creation.
      expect(order.gift_card_amount).toBe(60)
      expect(order.amount_due).toBe(0)
      expect(order.status).toBe('paid')
      expect(order.payment_method).toBe('gift_card')
      expect(order.gift_card_last4).toBe(placed.card.last4)

      // $100 − $60 spent = $40 left on the card.
      expect(await api.getGiftCardBalance(placed.card.id)).toBe(40)
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
