// Admin draft-order convert money path — an admin composes a draft order in the
// browser (catalog line item + a per-line PRICE OVERRIDE + a manual discount),
// then converts it into a real, paid order through the shared checkout
// machinery.
//
// The wiring under test is the convert step: the draft's `unit_price_override`
// must land on `order_items.unit_price` (NOT the live catalog price), the
// manual header discount must land on `orders.discount` (NEVER routed through
// the coupon engine), and `mark_as_paid` must flip the new order to PAID (which
// also issues its faktura). The draft itself must become `completed` and point
// at exactly the one order it produced (`converted_order_id`).
//
// Prerequisites that are not the feature (product, shipping fixture, the
// customer who owns the resulting order) are seeded via the API; the compose →
// convert flow is driven entirely through the admin UI. Money is asserted from
// two authoritative seams: the owning customer's `getOrder`, and the
// `draft_orders` row via pg. Conventions mirror e2e/admin/refund-money-path.spec.ts.
import { test, expect } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'
import { setUInputNumber } from '../helpers/uinputnumber'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Admin draft-order convert', () => {
  test('composes a draft with a price override + discount and converts it to a paid order', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const owner = randomEphemeralUser()
    let adminToken = ''
    let productId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken

      // Catalog price 100; the draft line will override it to 60 so the order's
      // unit_price proves the override wired through (100 would mean it didn't).
      const productName = `E2E Draft Convert ${runId}`
      const product = await api.createProduct(adminToken, {
        name: productName,
        slug: `e2e-draft-convert-${runId}`,
        price_usd: 100,
        price_pln: 400,
        price_eur: 90,
        stock: 5,
      })
      productId = product.id

      // Shared US fixture (the one every checkout spec uses) — one zone per
      // country, method 'E2E Standard' @ 10. MUST reuse this exact method+rate:
      // the storefront checkout auto-selects the CHEAPEST method in a zone, so a
      // distinct cheaper method here would hijack that selection and break every
      // other US checkout spec's shipping=10 assertion (regression seen in CI).
      const shippingMethodName = 'E2E Standard'
      await api.ensureShippingFixture(adminToken, {
        methodName: shippingMethodName,
        countryCodes: ['US'],
        rates: [{ currency: 'USD', amount: 10 }],
      })

      // The customer who will own the converted order — registered so we can
      // authenticate as them and read the resulting order via the API.
      await api.register(owner)
      await api.markVerified(owner.email)
      const { accessToken: customerToken } = await api.loginViaApi(owner.email, owner.password)
      const ownerId = await api.getUserId(owner.email)

      // --- drive the admin compose UI
      const adminCookie = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      await page.context().addCookies([adminCookie.refreshCookie])

      // 1) Create an empty USD draft (currency defaults to USD).
      await page.goto('/admin/draft-orders/new')
      await expect(page.getByRole('heading', { name: 'New draft order' })).toBeVisible({ timeout: 30_000 })
      // Bounded head-start toward a hydrated page (dev-server networkidle never
      // truly settles — HMR + the auth proactive-refresh timer keep it warm).
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
      // Retry the submit: under the cookie-injection auth path the heading can
      // paint a beat before Vue binds the form's @submit handler, so a single
      // early click lands on the button but is dropped before the handler
      // exists. Re-click until the create navigates (category-crud precedent).
      await expect(async () => {
        await page.getByTestId('draft-order-form-submit').click()
        await expect(page).toHaveURL(/\/admin\/draft-orders\/\d+$/, { timeout: 2000 })
      }).toPass({ timeout: 30_000 })
      const draftId = Number(page.url().match(/\/admin\/draft-orders\/(\d+)$/)![1])
      expect(Number.isInteger(draftId)).toBe(true)

      // 2) Add the catalog line with a per-line price override of 60, qty 2.
      await page.getByTestId('draft-order-product-search').fill(productName)
      const result = page.getByTestId(`draft-order-product-${productId}`)
      await expect(result).toBeVisible()
      await result.click()
      // No active variants → the add button enables once variants resolve empty.
      await setUInputNumber(page.getByRole('spinbutton', { name: 'Qty' }), 2)
      await page.getByTestId('draft-order-add-override').fill('60')
      const addBtn = page.getByTestId('draft-order-add-item')
      await expect(addBtn).toBeEnabled()
      await addBtn.click()
      // Server-computed subtotal reflects the override (60 × 2), not catalog 200.
      await expect(page.getByTestId('draft-order-subtotal')).toContainText('120.00')

      // 3) Fill the header: owner, shipping address, method, and a manual 15 discount.
      await page.getByTestId('draft-order-customer-id').fill(String(ownerId))
      await page.getByTestId('draft-order-address').fill('1 Fixture Way')
      await page.getByTestId('draft-order-city').fill('New York')
      await page.getByTestId('draft-order-postal-code').fill('10001')
      await page.getByTestId('draft-order-country').click()
      await page.getByRole('option', { name: 'United States' }).click()
      await page.getByTestId('draft-order-shipping-method').click()
      await page.getByRole('option', { name: shippingMethodName }).click()
      await page.getByTestId('draft-order-discount-input').fill('15')
      await page.getByTestId('draft-order-save').click()
      // The discount totals line only renders once the saved draft refetches.
      await expect(page.getByTestId('draft-order-discount')).toContainText('15.00')

      // 4) Convert, marking the resulting order paid (payment method defaults to
      //    'manual'). The switch lives on the card; the modal only confirms.
      await page.getByTestId('draft-order-mark-as-paid').click()
      await expect(page.getByRole('switch', { name: 'Mark as paid' })).toBeChecked()
      await page.getByTestId('draft-order-convert').click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await page.getByTestId('draft-order-convert-confirm').click()
      // Success navigates to the new order's admin detail page.
      await page.waitForURL(/\/admin\/orders\/\d+$/, { timeout: 20_000 })

      // --- authoritative truth #1: the draft was consumed into one real order
      const draftRow = await api.getDraftOrderRow(draftId)
      expect(draftRow.status).toBe('completed')
      expect(draftRow.convertedOrderId).not.toBeNull()
      const orderId = draftRow.convertedOrderId!

      // --- authoritative truth #2: the order's money, read as the owning customer
      const order = await api.getOrder(customerToken, orderId)
      // Browser confirmation that the real order rendered (the admin order-detail
      // route cold-compiles on first hit → generous timeout).
      await expect(page.getByRole('heading', { name: order.order_number }))
        .toBeVisible({ timeout: 20_000 })
      expect(order.status).toBe('paid') // mark_as_paid flipped it (and issued a faktura)
      expect(order.currency).toBe('USD')
      expect(order.items).toHaveLength(1)
      expect(order.items[0]!.product_id).toBe(productId)
      expect(order.items[0]!.quantity).toBe(2)
      expect(order.items[0]!.unit_price).toBe(60) // the override, NOT catalog 100
      expect(order.items[0]!.total_price).toBe(120)
      expect(order.subtotal).toBe(120)
      expect(order.discount).toBe(15) // the manual header discount, not a coupon
      expect(order.shipping).toBe(10)
      // total = subtotal − discount + shipping
      expect(order.total).toBe(115)
    }
    finally {
      // The product is now referenced by a real order line — deletion may be
      // FK-blocked; tolerate it (matches refund-money-path). The completed draft
      // is immutable and harmless to leave behind.
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
