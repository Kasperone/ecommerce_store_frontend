// PL-market money path — the Polish-locale buyer journey promoted from the
// Phase D verification pass (currency + Polish-market-launch program). Two
// money-path surfaces the program shipped and Phase D verified by hand:
//
//   1. PL checkout in PLN with a faktura VAT request + NIP checksum gate, paid
//      cash-on-delivery (pobranie) — order persisted with currency=PLN,
//      payment_method='cod', invoice_nip set. BLIK/Przelewy24 are chosen at the
//      PayU gateway (external, verified separately), so the deterministic
//      in-app money path is COD.
//   2. PDP OMNIBUS "najniższa cena z 30 dni" line in /pl/ — renders only when
//      the 30-day low is below the current price (Directive 98/6 Art. 6a).
//
// InPost Paczkomat is intentionally NOT exercised: the Geowidget point-picker
// ships behind NUXT_PUBLIC_INPOST_GEOWIDGET_TOKEN (decision D4) and needs an
// `inpost_*` shipping method seeded — both deferred to the live-verify task.
//
// Fixtures are per-run with unique slugs so the spec is rerunnable. Conventions
// mirror e2e/checkout/checkout.spec.ts (the EN happy path).
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

// A NIP whose check digit is valid (weights 6,5,7,2,3,4,5,6,7 → mod 11 == 4)
// and its broken twin (last digit flipped) for the checksum-rejection branch.
const VALID_NIP = '5260250274'
const INVALID_NIP = '5260250275'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('PL money path', () => {
  test('PLN + faktura/NIP + cash-on-delivery → order persisted', async ({ page }) => {
    // Heavy multi-route flow — /pl/{products,cart,checkout,checkout/success}
    // each cold-compile on the dev server; give it the generous budget the e2e
    // README calls for on the heaviest specs.
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const user = randomEphemeralUser()
    let adminToken = ''
    let productId: number | null = null

    try {
      // --- fixtures: product priced in PLN + a PL shipping rate, fresh customer
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const slug = `e2e-pl-checkout-${runId}`
      const product = await api.createProduct(adminToken, {
        name: 'E2E PL Widget',
        slug,
        price_usd: 100,
        price_pln: 400,
        price_eur: 90,
        stock: 5,
      })
      productId = product.id
      await api.ensureShippingFixture(adminToken, {
        methodName: 'E2E PL Standard',
        countryCodes: ['PL'],
        rates: [{ currency: 'PLN', amount: 0 }],
      })

      await api.register(user)
      await api.markVerified(user.email)
      const { accessToken, refreshCookie } = await api.loginViaApi(user.email, user.password)
      await page.context().addCookies([refreshCookie])

      // --- add to cart from the PL PDP. The cart is client-only Pinia state —
      // re-click until the hydrated handler lands (drawer opens with the item).
      await page.goto(`/pl/products/${slug}`)
      await expect(page.getByRole('heading', { name: 'E2E PL Widget' })).toBeVisible()
      await expect(async () => {
        await page.getByRole('button', { name: 'Dodaj do Koszyka' }).first().click()
        await expect(
          page.getByRole('dialog').getByText('E2E PL Widget'),
        ).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 20_000 })

      await page.goto('/pl/cart')
      await expect(page.getByText('E2E PL Widget').first()).toBeVisible()
      // PLN formatting: comma decimal + zł narrowSymbol (no grouping under 10k).
      await expect(page.getByText('400,00 zł').first()).toBeVisible()

      // --- single-page PL checkout
      await page.goto('/pl/checkout')
      // Exact labels — `getByLabel('Adres')` non-exact also matches the footer
      // newsletter "Adres e-mail" field. The asterisk on required fields is
      // aria-hidden, so the accessible name is the bare label.
      await page.getByLabel('Adres', { exact: true }).fill('ul. Testowa 1')
      await page.getByLabel('Miasto', { exact: true }).fill('Kraków')
      await page.getByLabel('Kod pocztowy', { exact: true }).fill('30-001')
      await page.getByLabel('Kraj', { exact: true }).click()
      await page.getByRole('option', { name: 'Polska' }).click()

      // Picking PL quotes shipping and auto-selects the cheapest method.
      const placeOrder = page.getByRole('button', { name: 'Złóż zamówienie' })

      // --- faktura VAT + NIP checksum gate
      await page.getByRole('checkbox', { name: /Chcę otrzymać fakturę VAT/ }).check()
      const nip = page.getByRole('textbox', { name: 'NIP', exact: true })
      await nip.fill(INVALID_NIP)
      await nip.blur()
      // Invalid checksum → Polish error + submit gated.
      await expect(page.getByText('Podaj prawidłowy 10-cyfrowy NIP.')).toBeVisible()
      await expect(placeOrder).toBeDisabled()
      await nip.fill(VALID_NIP)
      await nip.blur()
      await expect(page.getByText('Podaj prawidłowy 10-cyfrowy NIP.')).toHaveCount(0)

      // --- pay on delivery (pobranie) — the deterministic in-app payment
      await page.getByRole('checkbox', { name: /Płatność przy odbiorze/ }).check()
      await expect(placeOrder).toBeEnabled()
      await placeOrder.click()

      // --- PL success page (locale preserved through the redirect)
      await expect(page).toHaveURL(/\/pl\/checkout\/success/, { timeout: 30_000 })
      await expect(page.getByRole('heading', { name: 'Zamówienie złożone!' }))
        .toBeVisible({ timeout: 30_000 })

      // --- server-side truth
      const orders = await api.listOrders(accessToken)
      expect(orders).toHaveLength(1)
      const order = await api.getOrder(accessToken, orders[0]!.id)
      expect(order.status).toBe('pending')
      expect(order.currency).toBe('PLN')
      expect(order.payment_method).toBe('cod')
      expect(order.invoice_nip).toBe(VALID_NIP)
      expect(order.subtotal).toBe(400)
      // total = goods subtotal − discount + shipping (discount read, not assumed:
      // the e2e DB may carry an automatic coupon).
      expect(order.total).toBeCloseTo(order.subtotal - order.discount + order.shipping, 2)
      expect(order.shipping_country).toBe('PL')
      expect(order.items[0]!.product_id).toBe(productId)
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })

  test('PDP shows OMNIBUS lowest-30d line in PL when the price dropped', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    let adminToken = ''
    let productId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const slug = `e2e-pl-omnibus-${runId}`
      const product = await api.createProduct(adminToken, {
        name: 'E2E PL Omnibus',
        slug,
        price_usd: 500,
        price_pln: 1999,
        price_eur: 450,
        stock: 5,
      })
      productId = product.id
      // Seed a PLN price trail: drop to 1499 then back to 1999. Each PUT appends
      // a price_history row, so lowest-30d (1499) < current (1999) → the line
      // renders (D1 display rule: render iff lowest < current).
      await api.updateProduct(adminToken, productId, { price_pln: 1499 })
      await api.updateProduct(adminToken, productId, { price_pln: 1999 })

      // Public PDP in PL → active currency PLN.
      await page.goto(`/pl/products/${slug}`)
      await expect(page.getByRole('heading', { name: 'E2E PL Omnibus' })).toBeVisible()
      const omnibus = page.getByTestId('omnibus-line')
      await expect(omnibus).toBeVisible()
      await expect(omnibus).toContainText('1499,00')
      await expect(omnibus).toContainText('zł')
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
