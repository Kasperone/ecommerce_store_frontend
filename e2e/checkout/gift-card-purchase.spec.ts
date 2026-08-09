// Gift-card PURCHASE money path (gift cards v2, BE #224 + FE #316), promoted per
// the promotion ritual (e2e/README.md §"Promotion ritual"):
//
//   1. Admin creates a gift-card product (`is_gift_card`) — a digital line: no
//      shipping, non-taxable (MPV voucher). Denomination = the line's price ($50).
//   2. A shopper buys it in an ALL-GIFT-CARD cart. The storefront SKIPS the
//      shipping step entirely (no address / no method) — the new v2 checkout path.
//   3. The order is paid — here it is fully covered by a funding gift-card tender
//      so it reaches PAID at creation deterministically (no provider webhook) —
//      and `mark_paid` ISSUES one real GiftCard per unit (value = the line price),
//      emailed to the recipient, traced to the order (`order_id` provenance).
//   4. The issued card is real bearer money: its plaintext is stored only as a
//      sha256 hash + last4 and can't be read back (same posture as mintGiftCard),
//      so we re-key it to a KNOWN code and redeem it as a TENDER on a second
//      (physical) order, debiting its balance.
//
// The no-shipping checkout + the success "emailed to <recipient>" notice are the
// storefront's new surface; issuance idempotency + FOR-UPDATE debit invariants
// are backend-test territory. Fixtures are per-run with unique slugs so the spec
// is rerunnable.
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { restoreStoreConfigAfterAll } from '../fixtures/storeConfig'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

// Step 4 turns the public gift-card toggle on (below). It is a shared
// singleton, so leaving it on rewrites checkout for every later spec — the
// FE #373 bug. Put it back however we found it.
restoreStoreConfigAfterAll(['gift_cards_enabled'])

test.describe('Gift-card purchase money path', () => {
  test('buy an all-gift-card cart (no shipping) → pay → card issued → redeem', async ({ page }) => {
    // Heavy multi-route flow — budget like the other money-path specs.
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    let adminToken = ''
    let giftProductId: number | null = null
    let physicalProductId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      // Redemption (step 4) rides behind v1's public toggle. It is a shared
      // singleton, so `restoreStoreConfigAfterAll` at the top of this file puts
      // it back; specs that run later must not inherit it.
      await api.updateStoreConfig(adminToken, { gift_cards_enabled: true })

      // A $50 gift-card product (variantless — denomination = its price).
      const giftSlug = `e2e-gift-product-${runId}`
      const giftProduct = await api.createProduct(adminToken, {
        name: 'E2E Gift Card 50',
        slug: giftSlug,
        price_usd: 50,
        price_pln: 200,
        price_eur: 45,
        stock: 100,
        is_gift_card: true,
      })
      giftProductId = giftProduct.id

      // A physical product + shipping for the redemption (2nd) order.
      const physSlug = `e2e-redeem-widget-${runId}`
      const physical = await api.createProduct(adminToken, {
        name: 'E2E Redeem Widget',
        slug: physSlug,
        price_usd: 30,
        price_pln: 120,
        price_eur: 27,
        stock: 10,
      })
      physicalProductId = physical.id
      const shipping = await api.ensureShippingFixture(adminToken, {
        methodName: 'E2E Standard',
        countryCodes: ['US'],
        rates: [{ currency: 'USD', amount: 10 }],
      })

      // Shopper.
      const user = randomEphemeralUser()
      await api.register(user)
      await api.markVerified(user.email)
      const { accessToken, refreshCookie } = await api.loginViaApi(user.email, user.password)
      await page.context().addCookies([refreshCookie])

      // Funding tender: a $50 card that fully covers the $50 purchase so the order
      // reaches PAID at creation (→ mark_paid → issuance) without a provider webhook.
      const funding = await api.mintGiftCard({ balance: 50, currency: 'USD' })

      // --- PDP: a gift-card product shows the recipient field; add to cart.
      // The recipient field is SSR'd (not client-only, unlike the checkout form),
      // so a `fill()` before Vue hydrates the v-model listener is silently lost
      // and the recipient never reaches the cart line (it falls back to the buyer
      // email). Gate on hydration first: the header's <CartTrigger> is client-only
      // ("Open cart"), so its appearance means the app has mounted and the fill
      // will be captured — a fill-independent signal (probing via the field itself
      // would hit the very race we're avoiding).
      await page.goto(`/products/${giftSlug}`)
      await expect(page.getByRole('heading', { name: 'E2E Gift Card 50' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Open cart' })).toBeVisible({ timeout: 15_000 })
      await page.getByTestId('gift-card-recipient').fill('recipient@example.com')
      await page.getByRole('button', { name: 'Add to Cart' }).first().click()
      await expect(page.getByRole('dialog').getByText('E2E Gift Card 50')).toBeVisible({ timeout: 5_000 })
      // Sanity: the recipient reached the (persisted) cart line as a single unit —
      // fails fast + clearly if the hydration gate above was insufficient.
      const cartLine = await page.evaluate(
        () => JSON.parse(localStorage.getItem('cart') ?? '[]')[0] as {
          giftCardRecipientEmail?: string
          quantity?: number
        } | undefined,
      )
      expect(cartLine?.giftCardRecipientEmail).toBe('recipient@example.com')
      expect(cartLine?.quantity).toBe(1)

      // --- Checkout: the all-gift-card cart SKIPS shipping (no address field).
      await page.goto('/checkout')
      await expect(page.getByTestId('gift-card-checkout')).toBeVisible()
      await expect(page.getByLabel('Address', { exact: true })).toHaveCount(0)

      // Fund it with the $50 card → amount_due $0.
      await page.getByTestId('gift-card-input').fill(funding.code)
      await page.getByTestId('gift-card-apply').click()
      await expect(page.getByTestId('gift-card-applied')).toBeVisible()

      await page.getByTestId('gift-card-place-order').click()
      await expect(page).toHaveURL(/\/checkout\/success/, { timeout: 30_000 })
      // The new success notice names the recipient.
      await expect(page.getByTestId('gift-card-emailed')).toContainText('recipient@example.com')

      // --- Server-side: the purchase order is PAID, digital (no shipping), and
      // issued exactly one $50 card traced to it.
      const orders = await api.listOrders(accessToken)
      expect(orders).toHaveLength(1)
      const order = await api.getOrder(accessToken, orders[0]!.id)
      expect(order.total).toBe(50)
      expect(order.shipping).toBe(0)
      expect(order.gift_card_amount).toBe(50)
      expect(order.amount_due).toBe(0)
      expect(order.status).toBe('paid')

      const issued = await api.getGiftCardsByOrder(order.id)
      expect(issued).toHaveLength(1)
      expect(issued[0]!.balance).toBe(50)
      expect(issued[0]!.currency).toBe('USD')

      // --- Redemption: the issued card is real money. Re-key it to a known code
      // (the issued plaintext is unreadable) and spend it on a 2nd (physical) order.
      const rekeyed = await api.rekeyGiftCard(issued[0]!.id)
      const redeemOrder = await api.createOrderViaApi(accessToken, {
        productId: physicalProductId,
        quantity: 1,
        shippingMethodId: shipping.methodId,
        giftCardCode: rekeyed.code,
      })
      const placed = await api.getOrder(accessToken, redeemOrder.id)
      // $30 goods + $10 shipping = $40; the $50 card covers it fully.
      expect(placed.total).toBe(40)
      expect(placed.gift_card_amount).toBe(40)
      expect(placed.amount_due).toBe(0)
      // The issued card was debited from $50 to $10.
      expect(await api.getGiftCardBalance(issued[0]!.id)).toBe(10)
    }
    finally {
      if (giftProductId) await api.deleteProduct(adminToken, giftProductId).catch(() => {})
      if (physicalProductId) await api.deleteProduct(adminToken, physicalProductId).catch(() => {})
      await api.dispose()
    }
  })
})
