// B2B quote request (Wave C) — a company's primary contact requests a quote
// from the cart; the quote is server-priced from current product prices,
// starts as "requested", and shows up in /account/quotes.
//
// Promoted from a Playwright-MCP verify pass per the promotion ritual
// (e2e/README.md §"Promotion ritual").
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

// The dev server compiles page chunks on first hit (slow on CI) — generous
// budget, same pattern as auth/refresh.spec.ts.
test.setTimeout(120_000)

test.describe('B2B quote request', () => {
  test('B2B customer requests a server-priced quote from the cart', async ({ page }) => {
    const api = await ApiClient.create()
    const runId = Date.now()
    const user = randomEphemeralUser()
    let adminToken = ''
    let productId: number | null = null
    let companyId: number | null = null

    try {
      // --- fixtures: product + a company with the fresh user as primary contact
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const slug = `e2e-quote-${runId}`
      const product = await api.createProduct(adminToken, {
        name: 'E2E Quote Widget',
        slug,
        price_usd: 100,
        price_pln: 400,
        price_eur: 90,
        stock: 5,
      })
      productId = product.id

      await api.register(user)
      await api.markVerified(user.email)
      const company = await api.createCompanyWithPrimaryUser(adminToken, {
        name: `E2E Quote Co ${runId}`,
        primaryUserId: await api.getUserId(user.email),
      })
      companyId = company.id

      const { accessToken, refreshCookie } = await api.loginViaApi(user.email, user.password)
      await page.context().addCookies([refreshCookie])

      // --- add to cart, request the quote from /cart
      await page.goto(`/products/${slug}`)
      await expect(page.getByRole('heading', { name: 'E2E Quote Widget' })).toBeVisible()
      await expect(async () => {
        await page.getByRole('button', { name: 'Add to Cart' }).first().click()
        await expect(
          page.getByRole('dialog').getByText('E2E Quote Widget'),
        ).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 60_000 })

      await page.goto('/cart')
      // The CTA is gated by GET /companies/me — it renders only for B2B
      // users. 30s: first CI hit compiles the chunk on the cold dev server.
      const requestQuote = page.getByTestId('request-quote-cta')
      await expect(requestQuote).toBeVisible({ timeout: 60_000 })
      await requestQuote.click()

      // --- lands on the quote detail with the requested status (cold-chunk
      // timeouts as above)
      await expect(page).toHaveURL(/\/account\/quotes\/\d+$/, { timeout: 60_000 })
      await expect(page.getByText('Requested', { exact: true }).first())
        .toBeVisible({ timeout: 60_000 })
      await expect(page.getByText('E2E Quote Widget').first()).toBeVisible()

      // --- the quote is listed for the company
      await page.goto('/account/quotes')
      await expect(page.getByText(/QT-\d+/).first()).toBeVisible({ timeout: 60_000 })
      await expect(page.getByText('Requested', { exact: true }).first()).toBeVisible()

      // --- server-side truth: requested status + server-priced line
      const quotes = await api.listQuotes(accessToken)
      expect(quotes).toHaveLength(1)
      const quote = await api.getQuote(accessToken, quotes[0]!.id)
      expect(quote.status).toBe('requested')
      expect(quote.currency).toBe('USD')
      expect(quote.items).toHaveLength(1)
      // Server-priced: the unit price comes from the product's current USD
      // price, never from anything the client sent.
      expect(quote.items[0]!.product_id).toBe(productId)
      expect(quote.items[0]!.quantity).toBe(1)
      expect(quote.items[0]!.unit_price).toBe(100)
      expect(quote.subtotal).toBe(100)
      expect(quote.total).toBe(100)
    }
    finally {
      if (companyId) await api.deleteCompany(adminToken, companyId).catch(() => {})
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
