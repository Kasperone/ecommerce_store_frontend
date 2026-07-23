// EU B2B reverse-charge money path (tax Phase-0 program, unit U6c), promoted per
// the promotion ritual (e2e/README.md) — the money-path close-out for the reverse
// charge chain (BE #220/#221 + FE #311).
//
// Reverse charge is modelled as a 0%-rate sale priced at NET: an intra-community
// B2B supply to a VIES-verified EU business ships with no VAT, the buyer
// self-accounting in their own member state. E2E owns the storefront proof of the
// whole gate end-to-end — the exact wiring (active company membership + a fresh
// VIES confirmation + an EU-non-home destination, all resolved through the real
// Nuxt auth + company plugins) that unit specs can't exercise:
//
//   1. An admin creates a company whose primary contact is a fresh shopper (an
//      active COMPANY_ADMIN member) and its EU VAT-ID is stamped VIES-confirmed
//      (a DB seam — VIES is dark-gated and API-read-only by design, U3).
//   2. The shopper shops in EUR and checks out shipping to Germany (an EU state ≠
//      the PL home country) — the three conditions the RC gate requires.
//   3. Placing the order strips the VAT: a €123 gross line at the 23% home rate is
//      decomposed to its €100 net, the order snapshots `tax_treatment =
//      reverse_charge` + the buyer's VAT-ID, and `total` is the net (VAT removed).
//   4. The buyer-facing order detail shows the "reverse charge applied" note (U5).
//
// The decomposition arithmetic, the fail-closed gate (stale/absent VIES ⇒
// domestic), and the faktura `odwrotne obciążenie` annotation are backend-test
// territory; this spec owns the storefront money path from an eligible member
// through a VAT-stripped placed order, asserted server-side via the owner order
// API — same depth as net-terms-money-path.spec.ts.
//
// A fresh ephemeral shopper is used, so the only shared teardown is the company
// (deleting it clears the membership); fixtures use unique slugs so the spec is
// rerunnable.
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

// A €123 gross line at the PL home standard rate (23%) decomposes to €100 net:
// 123 / 1.23 = 100.00. Free shipping keeps the order total a clean net subtotal.
const GROSS_EUR = 123
const NET_EUR = 100
const BUYER_VAT_ID = 'DE811234567'

test.use({ storageState: { cookies: [], origins: [] } })

test('EU B2B member with a VIES-confirmed VAT-ID checks out to Germany: VAT stripped, reverse charge applied', async ({ page }) => {
  // Heavy multi-route flow — budget like the other money-path specs.
  test.slow()

  const api = await ApiClient.create()
  const runId = Date.now()
  let adminToken = ''
  let productId: number | null = null
  let companyId: number | null = null

  try {
    const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
    adminToken = admin.accessToken

    const slug = `e2e-reverse-charge-${runId}`
    const product = await api.createProduct(adminToken, {
      name: 'E2E Reverse Charge Widget',
      slug,
      price_usd: 130,
      price_pln: 500,
      price_eur: GROSS_EUR,
      stock: 5,
    })
    productId = product.id
    // Ship to Germany (EU ≠ PL home) with free EUR shipping, so the order total is
    // exactly the net goods subtotal — no shipping term to reason about.
    await api.ensureShippingFixture(adminToken, {
      methodName: 'E2E EU Standard',
      countryCodes: ['DE'],
      rates: [{ currency: 'EUR', amount: 0 }],
    })

    // Fresh shopper = the company's primary contact → active COMPANY_ADMIN member.
    const user = randomEphemeralUser()
    await api.register(user)
    await api.markVerified(user.email)
    const userId = await api.getUserId(user.email)
    companyId = (await api.createCompanyWithPrimaryUser(adminToken, {
      name: `E2E Reverse Charge Co ${runId}`,
      primaryUserId: userId,
    })).id
    // Stamp the company's EU VAT-ID as VIES-confirmed — the RC gate reads this.
    await api.confirmCompanyVies(companyId, BUYER_VAT_ID)

    // Boot the storefront as the B2B shopper (refresh-cookie session restore) and
    // pin the currency to EUR via the cookie useCurrencyPreference reads (the
    // shopper has no persisted preferred_currency, so the cookie wins).
    const { accessToken, refreshCookie } = await api.loginViaApi(user.email, user.password)
    await page.context().addCookies([
      refreshCookie,
      { name: 'currency', value: 'EUR', domain: 'localhost', path: '/', sameSite: 'Lax' },
    ])

    // --- add to cart from the PDP (client-only Pinia state; re-click until the
    // hydrated handler lands — same recovery pattern as the other checkout specs).
    await page.goto(`/products/${slug}`)
    await expect(page.getByRole('heading', { name: 'E2E Reverse Charge Widget' })).toBeVisible()
    await expect(async () => {
      await page.getByRole('button', { name: 'Add to Cart' }).first().click()
      await expect(page.getByRole('dialog').getByText('E2E Reverse Charge Widget'))
        .toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 20_000 })

    // --- single-page checkout: shipping to Germany
    await page.goto('/checkout')
    const address = page.getByLabel('Address', { exact: true })
    await expect(address).toBeVisible()
    await address.fill('1 Berliner Str')
    await page.getByLabel('City', { exact: true }).fill('Berlin')
    await page.getByLabel('Postal code', { exact: true }).fill('10115')
    await page.getByLabel('Country', { exact: true }).click()
    await page.getByRole('option', { name: 'Germany' }).click()
    await expect(page.getByText('E2E EU Standard').first()).toBeVisible()

    const placeOrder = page.getByRole('button', { name: 'Place order' })
    await expect(placeOrder).toBeEnabled()
    await placeOrder.click()

    await expect(page).toHaveURL(/\/checkout\/success/, { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: 'Order placed!' }))
      .toBeVisible({ timeout: 30_000 })

    // --- server-side truth: VAT stripped, reverse charge stamped.
    const orders = await api.listOrders(accessToken)
    expect(orders).toHaveLength(1)
    const order = await api.getOrder(accessToken, orders[0]!.id)
    expect(order.currency).toBe('EUR')
    expect(order.shipping_country).toBe('DE')
    expect(order.tax_treatment).toBe('reverse_charge')
    expect(order.buyer_vat_id).toBe(BUYER_VAT_ID)
    // The €123 gross line was decomposed to its €100 net (23 EUR of VAT removed);
    // free shipping ⇒ total == net subtotal.
    expect(order.subtotal).toBe(NET_EUR)
    expect(order.total).toBe(NET_EUR)

    // --- buyer-facing: the order detail shows the reverse-charge note (U5).
    await page.goto(`/account/orders/${order.id}`)
    await expect(page.getByTestId('order-reverse-charge')).toBeVisible({ timeout: 15_000 })
  }
  finally {
    // Deleting the company clears the membership so the shopper isn't left B2B.
    if (companyId !== null) await api.deleteCompany(adminToken, companyId).catch(() => {})
    if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
    await api.dispose()
  }
})
