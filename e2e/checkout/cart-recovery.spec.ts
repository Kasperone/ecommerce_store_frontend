// Abandoned-cart recovery money path (BE #198, FE #293/#294), promoted per the
// promotion ritual (e2e/README.md §"Promotion ritual"):
//
//   1. Authed shopper adds to cart → the client plugin's debounced
//      `PUT /carts/mine` mirrors it into `saved_carts` (asserted by polling the
//      row — only the sync endpoint writes it).
//   2. A recovery token is arranged at the DB seam via
//      ApiClient.mintCartRecoveryToken — the exact `recovery_token` +
//      `recovery_email_sent_at` pair the email job commits per send. The job
//      itself (store_config gate, threshold hours, marketing consent, Resend)
//      is backend-integration-test territory; E2E owns the money path from a
//      live token onward.
//   3. The link is opened in a FRESH, unauthenticated context — it restores
//      cart contents only and never authenticates — and must merge the items
//      into the local cart and redirect to /cart.
//   4. The restored cart is completed to a placed order via guest checkout
//      (the natural continuation of a logged-out recovery), verified
//      server-side through the public track API — same depth as
//      guest-checkout.spec.ts / checkout.spec.ts.
//
// Plus one cheap negative: an unknown token renders the `cart_not_found`
// error state (machine code → i18n key, shared/utils/cartRecoveryStatus.ts).
//
// Fixtures are per-run with unique slugs so the spec is rerunnable.
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Abandoned-cart recovery', () => {
  test('synced cart → recovery link restores it logged-out → guest completes checkout', async ({ page, browser, baseURL }) => {
    // Heavy multi-route flow across two browser contexts — budget like the
    // other money-path specs (dev-server cold compiles).
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const user = randomEphemeralUser()
    let adminToken = ''
    let productId: number | null = null
    let guestContext: Awaited<ReturnType<typeof browser.newContext>> | null = null

    try {
      // --- fixtures: product + quotable US shipping (admin API), fresh customer
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const slug = `e2e-cart-recovery-${runId}`
      const product = await api.createProduct(adminToken, {
        name: 'E2E Recovery Widget',
        slug,
        price_usd: 60,
        price_pln: 240,
        price_eur: 54,
        stock: 5,
      })
      productId = product.id
      // Same shared fixture as checkout.spec.ts (ensure-semantics, converges).
      await api.ensureShippingFixture(adminToken, {
        methodName: 'E2E Standard',
        countryCodes: ['US'],
        rates: [{ currency: 'USD', amount: 10 }],
      })

      await api.register(user)
      await api.markVerified(user.email)
      const { refreshCookie } = await api.loginViaApi(user.email, user.password)
      await page.context().addCookies([refreshCookie])
      const userId = await api.getUserId(user.email)

      // --- authed add-to-cart from the PDP. The cart is client-only Pinia
      // state — re-click until the hydrated handler lands (drawer opens).
      await page.goto(`/products/${slug}`)
      await expect(page.getByRole('heading', { name: 'E2E Recovery Widget' })).toBeVisible()
      await expect(async () => {
        await page.getByRole('button', { name: 'Add to Cart' }).first().click()
        await expect(
          page.getByRole('dialog').getByText('E2E Recovery Widget'),
        ).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 20_000 })

      // --- the debounced (~2.5s) PUT /carts/mine sync lands: poll the
      // saved_carts row (server-side truth; only the sync writes it).
      await expect
        .poll(async () => (await api.getSavedCart(userId))?.items ?? null, {
          message: 'debounced PUT /carts/mine snapshot never landed in saved_carts',
          timeout: 20_000,
        })
        .toEqual([{ product_id: productId, variant_id: null, quantity: 1 }])

      // --- arrange the recovery token (the email job's DB effect, see header)
      const token = await api.mintCartRecoveryToken(userId)

      // --- open the link in a FRESH unauthenticated context: the token
      // restores cart contents only, it must work fully logged-out.
      guestContext = await browser.newContext({ baseURL })
      const guest = await guestContext.newPage()
      await guest.goto(`/cart/recover/${token}`)

      // Items merged into the (empty) local cart → redirect to /cart with the
      // line restored at live catalog data.
      await expect(guest).toHaveURL(/\/cart$/, { timeout: 30_000 })
      await expect(guest.getByText('E2E Recovery Widget').first()).toBeVisible()
      await expect(guest.getByText('$60.00').first()).toBeVisible()

      // Restoring did NOT authenticate: the header still offers Login.
      await expect(
        guest.getByRole('banner').getByRole('link', { name: 'Login' }),
      ).toBeVisible()

      // --- complete the money path: guest checkout on the restored cart
      await guest.goto('/checkout')
      await expect(guest.getByTestId('guest-email')).toBeVisible()
      await guest.getByTestId('guest-email').fill(`recovered-${runId}@example.com`)
      await guest.getByLabel('Address', { exact: true }).fill('7 Recovery Rd')
      await guest.getByLabel('City', { exact: true }).fill('Boston')
      await guest.getByLabel('Postal code', { exact: true }).fill('02101')
      await guest.getByLabel('Country', { exact: true }).click()
      await guest.getByRole('option', { name: 'United States' }).click()

      // Picking a country quotes shipping; the cheapest method auto-selects.
      await expect(guest.getByText('E2E Standard').first()).toBeVisible()
      const placeOrder = guest.getByRole('button', { name: 'Place order' })
      await expect(placeOrder).toBeEnabled()
      await placeOrder.click()

      await expect(guest).toHaveURL(/\/checkout\/success/, { timeout: 30_000 })
      await expect(guest.getByRole('heading', { name: 'Order placed!' }))
        .toBeVisible({ timeout: 30_000 })

      // --- server-side truth via the public track API (guest order)
      const cta = guest.getByTestId('view-order-cta')
      await expect(cta).toBeVisible()
      await cta.click()
      await expect(guest).toHaveURL(/\/orders\/track\//, { timeout: 15_000 })
      const urlToken = new URL(guest.url()).pathname.split('/').pop()!
      const tracked = await api.trackGuestOrder(urlToken)

      expect(tracked.status).toBe('pending')
      expect(tracked.currency).toBe('USD')
      expect(tracked.subtotal).toBeCloseTo(60, 2)
      expect(tracked.shipping).toBeCloseTo(10, 2)
      // total = goods subtotal − discount + shipping (discount read, not
      // assumed: the e2e DB may carry an automatic coupon).
      expect(tracked.total).toBeCloseTo(tracked.subtotal - tracked.discount + tracked.shipping, 2)
      expect(tracked.items).toHaveLength(1)
      expect(tracked.items[0]!.product_name).toBe('E2E Recovery Widget')
      expect(tracked.items[0]!.quantity).toBe(1)
      expect(tracked.items[0]!.unit_price).toBeCloseTo(60, 2)
    }
    finally {
      // Best-effort teardown — the order row keeps FK references, so the
      // delete may be rejected; unique per-run slugs make leftovers harmless.
      // The shipping fixture is shared (ensure-semantics) and never deleted.
      if (guestContext) await guestContext.close().catch(() => {})
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })

  test('invalid token renders the cart_not_found error state', async ({ page }) => {
    // Unknown token → 404 `cart_not_found` (machine code on the wire) → the
    // `cart.recover.invalid` copy in the page's error state. No fixtures.
    await page.goto(`/cart/recover/e2e-invalid-token-${Date.now()}`)
    await expect(page.getByTestId('recover-error')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('recover-error-message'))
      .toContainText(/recovery link isn't valid/i)
    // No redirect — the shopper stays on the recover page with the error.
    await expect(page).toHaveURL(/\/cart\/recover\//)
  })
})
