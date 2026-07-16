// B2B net-terms money path (Program 2, Shopify-gap P2 #14), promoted per the
// promotion ritual (e2e/README.md §"Promotion ritual"):
//
//   1. An admin creates a company whose primary contact is a fresh shopper, with
//      net terms enabled (Net 30) and a credit limit. The shopper is therefore an
//      active B2B member eligible to pay on account.
//   2. At checkout the "Pay on account (Net N)" option appears — gated through the
//      REAL company-context + credit composables (the exact eligibility wiring
//      unit specs can't exercise through the Nuxt auth + company plugins).
//   3. Choosing it and placing the order creates an on-account order: placed
//      `pending`, `payment_method = net_terms`, `company_id` set, `payment_due_at`
//      stamped (the faktura is issued at placement server-side).
//   4. The admin records the bank transfer → `net_terms_paid_at` is stamped,
//      freeing the credit.
//
// Credit-limit / currency / eligibility enforcement invariants are backend-test
// territory; E2E owns the storefront money path from an eligible member through a
// placed on-account order, asserted server-side via the owner order API — same
// depth as gift-card.spec.ts.
//
// A fresh ephemeral shopper is used, so the only shared teardown is the company
// (deleting it clears the membership); fixtures use unique slugs so the spec is
// rerunnable.
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test('B2B member pays on account: option shown, order placed on terms, payment recorded', async ({ page }) => {
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

    const slug = `e2e-net-terms-${runId}`
    const product = await api.createProduct(adminToken, {
      name: 'E2E Net Terms Widget',
      slug,
      price_usd: 100,
      price_pln: 400,
      price_eur: 90,
      stock: 5,
    })
    productId = product.id
    await api.ensureShippingFixture(adminToken, {
      methodName: 'E2E Standard',
      countryCodes: ['US'],
      rates: [{ currency: 'USD', amount: 10 }],
    })

    // Fresh shopper = the company's primary contact → active COMPANY_ADMIN member.
    const user = randomEphemeralUser()
    await api.register(user)
    await api.markVerified(user.email)
    const userId = await api.getUserId(user.email)
    companyId = (await api.createCompanyWithPrimaryUser(adminToken, {
      name: `E2E Net Terms Co ${runId}`,
      primaryUserId: userId,
      netTerms: { days: 30, creditLimit: 1000, defaultCurrency: 'USD' },
    })).id

    // Boot the storefront as the B2B shopper (refresh-cookie session restore).
    const { accessToken, refreshCookie } = await api.loginViaApi(user.email, user.password)
    await page.context().addCookies([refreshCookie])

    // --- add to cart from the PDP (client-only Pinia state; re-click until the
    // hydrated handler lands — same recovery pattern as the other checkout specs).
    await page.goto(`/products/${slug}`)
    await expect(page.getByRole('heading', { name: 'E2E Net Terms Widget' })).toBeVisible()
    await expect(async () => {
      await page.getByRole('button', { name: 'Add to Cart' }).first().click()
      await expect(page.getByRole('dialog').getByText('E2E Net Terms Widget'))
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
    await expect(page.getByText('E2E Standard').first()).toBeVisible()

    // --- the pay-on-account option appears (eligibility resolved through the real
    // company-credit composable) and offers the Net 30 term.
    const netTermsCard = page.getByTestId('net-terms-card')
    await expect(netTermsCard).toBeVisible({ timeout: 20_000 })
    await expect(netTermsCard).toContainText(/net 30/i)
    await page.getByTestId('net-terms-toggle').click()

    const placeOrder = page.getByRole('button', { name: 'Place order' })
    await expect(placeOrder).toBeEnabled()
    await placeOrder.click()

    await expect(page).toHaveURL(/\/checkout\/success/, { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: 'Order placed!' }))
      .toBeVisible({ timeout: 30_000 })

    // --- server-side assertions: the order was placed on account.
    const orders = await api.listOrders(accessToken)
    expect(orders).toHaveLength(1)
    const order = await api.getOrder(accessToken, orders[0]!.id)
    expect(order.status).toBe('pending')
    expect(order.total).toBe(110)
    expect(order.payment_method).toBe('net_terms')
    expect(order.company_id).toBe(companyId)
    expect(order.payment_due_at).not.toBeNull()
    expect(order.net_terms_paid_at ?? null).toBeNull()

    // --- admin records the bank transfer → paid stamped, credit freed.
    const recorded = await api.recordNetTermsPayment(adminToken, order.id)
    expect(recorded.net_terms_paid_at).not.toBeNull()
  }
  finally {
    // Deleting the company clears the membership so the shopper isn't left B2B.
    if (companyId !== null) await api.deleteCompany(adminToken, companyId).catch(() => {})
    if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
    await api.dispose()
  }
})
