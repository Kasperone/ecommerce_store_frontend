// B2B net-terms CROSS-CURRENCY money path (net-terms tail Program D), promoted
// per the promotion ritual (e2e/README.md) as the close-out for FE #307.
//
// Program D relaxed the pre-D rule that hard-gated the pay-on-account option off
// whenever the cart currency differed from the company's billing currency. A
// company's credit limit is denominated in its `default_currency`, but a member
// may check out in another currency; the backend now FX-converts the order into
// the billing currency (admin-configured `store_config.fx_rates`) for the credit
// check and the outstanding balance. E2E owns the storefront proof of that
// behaviour end-to-end:
//
//   1. Admin sets FX rates (EUR is worth 1.08 of the USD pivot) and creates a
//      USD-billing company (credit limit $1000, Net 30) whose primary contact is
//      a fresh shopper — an active B2B member eligible to pay on account.
//   2. The shopper shops in EUR (currency cookie), so cart + summary are €, while
//      the company still bills in $. Pre-D this mismatch hid the option; post-D
//      the "Pay on account" card appears anyway and shows the remaining credit in
//      the billing currency ($), the cross-currency signal.
//   3. Placing the order creates an on-account order in EUR (`currency=EUR`,
//      `payment_method=net_terms`, `company_id` set).
//   4. The credit summary (`GET /companies/me/credit`) then reports the
//      outstanding in USD == the EUR total converted at 1.08 — the FX conversion
//      is observable, not just the dropped gate.
//   5. The admin records the bank transfer → the converted credit is freed
//      (outstanding back to 0).
//
// Same-currency net terms + credit-limit enforcement are covered by
// net-terms-money-path.spec.ts and backend tests; this spec owns the currency
// crossing specifically. A fresh ephemeral shopper is used, FX rates are reset in
// teardown, and fixtures use unique slugs so the spec is rerunnable.
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

// EUR is worth 1.08 USD pivot units; USD is the pivot. Converting an EUR order
// into the company's USD limit multiplies by rate[EUR]/rate[USD] = 1.08.
const EUR_RATE = 1.08

test.use({ storageState: { cookies: [], origins: [] } })

test('B2B member pays on account in EUR against a USD limit: option shown, order + credit FX-converted', async ({ page }) => {
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

    // Admin FX rates so the backend can price an EUR order into a USD limit.
    // Reset to {} in teardown so the shared e2e DB isn't left with rates on.
    await api.updateStoreConfig(adminToken, { fx_rates: { USD: 1, EUR: EUR_RATE } })

    const slug = `e2e-net-terms-fx-${runId}`
    const product = await api.createProduct(adminToken, {
      name: 'E2E FX Net Terms Widget',
      slug,
      price_usd: 100,
      price_pln: 400,
      price_eur: 100,
      stock: 5,
    })
    productId = product.id
    // Free EUR shipping so the EUR order total is a clean goods subtotal.
    await api.ensureShippingFixture(adminToken, {
      methodName: 'E2E FX Standard',
      countryCodes: ['US'],
      rates: [{ currency: 'EUR', amount: 0 }],
    })

    // Fresh shopper = the company's primary contact → active COMPANY_ADMIN member.
    const user = randomEphemeralUser()
    await api.register(user)
    await api.markVerified(user.email)
    const userId = await api.getUserId(user.email)
    companyId = (await api.createCompanyWithPrimaryUser(adminToken, {
      name: `E2E FX Net Terms Co ${runId}`,
      primaryUserId: userId,
      // Billed in USD — the cart will be EUR, so this is the currency crossing.
      netTerms: { days: 30, creditLimit: 1000, defaultCurrency: 'USD' },
    })).id

    // Boot the storefront as the B2B shopper (refresh-cookie session restore) and
    // pin the storefront currency to EUR via the cookie useCurrencyPreference
    // reads on SSR + client (the shopper has no persisted preferred_currency, so
    // the cookie wins). This is what makes the cart currency differ from billing.
    const { accessToken, refreshCookie } = await api.loginViaApi(user.email, user.password)
    await page.context().addCookies([
      refreshCookie,
      { name: 'currency', value: 'EUR', domain: 'localhost', path: '/', sameSite: 'Lax' },
    ])

    // --- add to cart from the PDP (client-only Pinia state; re-click until the
    // hydrated handler lands — same recovery pattern as the other checkout specs).
    await page.goto(`/products/${slug}`)
    await expect(page.getByRole('heading', { name: 'E2E FX Net Terms Widget' })).toBeVisible()
    await expect(async () => {
      await page.getByRole('button', { name: 'Add to Cart' }).first().click()
      await expect(page.getByRole('dialog').getByText('E2E FX Net Terms Widget'))
        .toBeVisible({ timeout: 2_000 })
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
    await expect(page.getByText('E2E FX Standard').first()).toBeVisible()

    // --- the pay-on-account option appears despite EUR cart ≠ USD billing (the
    // Program-D gate drop), offers the Net 30 term, and shows the remaining
    // credit in the billing currency ($) — the cross-currency signal in the UI.
    const netTermsCard = page.getByTestId('net-terms-card')
    await expect(netTermsCard).toBeVisible({ timeout: 20_000 })
    await expect(netTermsCard).toContainText(/net 30/i)
    await expect(netTermsCard).toContainText('$') // credit shown in USD, not the € cart
    await page.getByTestId('net-terms-toggle').click()

    const placeOrder = page.getByRole('button', { name: 'Place order' })
    await expect(placeOrder).toBeEnabled()
    await placeOrder.click()

    await expect(page).toHaveURL(/\/checkout\/success/, { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: 'Order placed!' }))
      .toBeVisible({ timeout: 30_000 })

    // --- server-side truth: the order was placed on account, IN EUR.
    const orders = await api.listOrders(accessToken)
    expect(orders).toHaveLength(1)
    const order = await api.getOrder(accessToken, orders[0]!.id)
    expect(order.status).toBe('pending')
    expect(order.currency).toBe('EUR')
    expect(order.payment_method).toBe('net_terms')
    expect(order.company_id).toBe(companyId)
    expect(order.payment_due_at).not.toBeNull()
    expect(order.net_terms_paid_at ?? null).toBeNull()

    // --- the FX proof: the credit summary reports the USD-billing outstanding as
    // the EUR order total converted at the configured rate (read the total, don't
    // assume it — the e2e DB may carry an automatic coupon).
    const expectedOutstandingUsd = Math.round(order.total * EUR_RATE * 100) / 100
    const credit = await api.getMyCompanyCredit(accessToken)
    expect(credit.currency).toBe('USD')
    expect(credit.credit_limit).toBe(1000)
    expect(credit.outstanding).toBeCloseTo(expectedOutstandingUsd, 2)
    expect(credit.available ?? 0).toBeCloseTo(1000 - expectedOutstandingUsd, 2)

    // --- admin records the bank transfer → converted credit freed (outstanding 0).
    const recorded = await api.recordNetTermsPayment(adminToken, order.id)
    expect(recorded.net_terms_paid_at).not.toBeNull()
    const afterPayment = await api.getMyCompanyCredit(accessToken)
    expect(afterPayment.outstanding).toBeCloseTo(0, 2)
    expect(afterPayment.available ?? 0).toBeCloseTo(1000, 2)
  }
  finally {
    // Reset global FX rates + drop the fixtures. Deleting the company clears the
    // membership so the shopper isn't left B2B.
    await api.updateStoreConfig(adminToken, { fx_rates: {} }).catch(() => {})
    if (companyId !== null) await api.deleteCompany(adminToken, companyId).catch(() => {})
    if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
    await api.dispose()
  }
})
