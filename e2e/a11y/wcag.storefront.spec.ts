// Page-level WCAG 2.2 AA sweep — storefront + customer account.
//
// The harness, the ratchet contract and the regenerate/triage commands all
// live in `./sweep.ts`. Read that first; this file is just the route table.
//
// Its sibling `wcag.admin.spec.ts` covers the back-office. They are separate
// files so CI's 3× sharding can put them on different shards.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'
import { headingReady, runSweep } from './sweep'
import type { Route } from './sweep'

test.use({ storageState: { cookies: [], origins: [] } })

// A cold Vite compile per route, times 18 routes, twice over.
test.setTimeout(900_000)

interface Ctx {
  productId: number
  productSlug: string
  categorySlug: string
  collectionSlug: string
}

/** Both the sign-in and the sign-up forms are "heading, then a text field". */
async function formReady(page: Page, timeout = 60_000): Promise<void> {
  await headingReady(page, timeout)
  await expect(page.getByRole('textbox').first()).toBeVisible({ timeout })
}

const ROUTES: Route<Ctx>[] = [
  { key: 'home', path: () => '/', access: 'anon', ready: page => headingReady(page) },
  { key: 'products', path: () => '/products', access: 'anon', ready: page => headingReady(page) },
  {
    key: 'pdp',
    path: ({ productSlug }) => `/products/${productSlug}`,
    access: 'anon',
    ready: async page => void await expect(
      page.getByRole('heading', { name: 'E2E A11y Widget' }),
    ).toBeVisible(),
  },
  {
    key: 'category',
    path: ({ categorySlug }) => `/category/${categorySlug}`,
    access: 'anon',
    ready: page => headingReady(page),
  },
  { key: 'collections', path: () => '/collections', access: 'anon', ready: page => headingReady(page) },
  {
    key: 'collection',
    path: ({ collectionSlug }) => `/collections/${collectionSlug}`,
    access: 'anon',
    ready: page => headingReady(page),
  },
  {
    // `/search` is SSR-fetched (`useSearchResults`), so stubbing the API with
    // `page.route` cannot make this route deterministic — the fetch runs in the
    // Nuxt server. CI and local e2e both run Meilisearch (see `test.yml`); the
    // sweep creates `E2E A11y Widget` before visiting `/search?q=A11y` so the
    // results list + facets render here. Regenerate `wcag-baseline.json` with the
    // same stack (Meili up, backend pointed at it), not with search disabled.
    key: 'search',
    path: () => '/search?q=A11y',
    access: 'anon',
    ready: page => headingReady(page),
  },
  { key: 'login', path: () => '/login', access: 'anon', ready: page => formReady(page) },
  { key: 'sign-up', path: () => '/sign-up', access: 'anon', ready: page => formReady(page) },
  {
    key: 'password-recovery',
    path: () => '/password-recovery',
    access: 'anon',
    ready: page => formReady(page),
  },
  { key: 'cart', path: () => '/cart', access: 'anon', ready: page => headingReady(page) },
  {
    key: 'checkout',
    path: () => '/checkout',
    access: 'customer',
    // Checkout renders an empty-cart placeholder unless there is a cart.
    // Seeding localStorage pre-navigation scans the REAL checkout form
    // rather than a stub with almost no interactive content.
    prepare: async (page, ctx) => {
      await page.addInitScript((item) => {
        localStorage.setItem('cart', JSON.stringify([item]))
      }, {
        productId: ctx.productId,
        variantId: null,
        slug: ctx.productSlug,
        name: 'E2E A11y Widget',
        imageUrl: null,
        price_usd: 100,
        price_pln: 400,
        price_eur: 90,
        stock: 5,
        allowBackorder: false,
        quantity: 1,
      })
    },
    // Locale-agnostic on purpose: this sweep runs in both EN and PL, so a
    // label-text locator ('Address' / 'Adres') would only ever be right for
    // one of them. The shipping form having painted its first input is the
    // same signal without the copy dependency.
    ready: page => formReady(page, 120_000),
  },
  { key: 'account', path: () => '/account', access: 'customer', ready: page => headingReady(page) },
  {
    key: 'account-orders',
    path: () => '/account/orders',
    access: 'customer',
    ready: page => headingReady(page),
  },
  {
    key: 'account-profile',
    path: () => '/account/profile',
    access: 'customer',
    ready: page => headingReady(page),
  },
  {
    key: 'account-addresses',
    path: () => '/account/addresses',
    access: 'customer',
    ready: page => headingReady(page),
  },
  {
    key: 'account-security',
    path: () => '/account/security',
    access: 'customer',
    ready: page => headingReady(page),
  },
  {
    key: 'account-wishlist',
    path: () => '/account/wishlist',
    access: 'customer',
    ready: page => headingReady(page),
  },
]

for (const locale of ['en', 'pl'] as const) {
  test(`WCAG 2.2 AA sweep — storefront (${locale})`, async ({ browser }) => {
    const api = await ApiClient.create()
    const runId = Date.now()
    const customer = randomEphemeralUser()
    let adminToken = ''
    let productId: number | null = null
    let categoryId: number | null = null
    let collectionId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken

      const productSlug = `e2e-a11y-${locale}-${runId}`
      const categorySlug = `e2e-a11y-cat-${locale}-${runId}`
      const collectionSlug = `e2e-a11y-col-${locale}-${runId}`

      const category = await api.createCategory(adminToken, {
        name: 'E2E A11y Category',
        slug: categorySlug,
        namePl: 'E2E A11y Kategoria',
      })
      categoryId = category.id
      const product = await api.createProduct(adminToken, {
        name: 'E2E A11y Widget',
        slug: productSlug,
        price_usd: 100,
        price_pln: 400,
        price_eur: 90,
        stock: 5,
        category_id: category.id,
        description: 'A widget for the accessibility sweep.',
      })
      productId = product.id
      const collection = await api.createCollection(adminToken, {
        name: 'E2E A11y Collection',
        slug: collectionSlug,
      })
      collectionId = collection.id
      // A collection with members scans a product grid; an empty one scans an
      // empty-state paragraph and proves much less.
      await api.setCollectionProducts(adminToken, collection.id, [product.id])

      await api.ensureShippingFixture(adminToken, {
        methodName: 'E2E Standard',
        countryCodes: ['US'],
        rates: [{ currency: 'USD', amount: 10 }],
      })

      await api.register(customer)
      await api.markVerified(customer.email)

      // ⚠️ Mint a FRESH refresh cookie per authenticated context. Refresh
      // tokens ROTATE: every new browser context boots `plugins/auth.ts` →
      // `/auth/refresh`, which consumes and replaces the row. Handing the same
      // cookie to a second context therefore replays a spent token, the
      // backend treats it as reuse, and that context lands on /login instead
      // of the page under test.
      //
      // This passed locally and failed in CI, so it is not something to rely
      // on timing for — the landing guard in `runSweep` is what caught it.
      // Rate limits are not a concern: CI runs the backend with
      // E2E_DISABLE_RATE_LIMIT.
      await runSweep<Ctx>({
        browser,
        locale,
        routes: ROUTES,
        ctx: { productId: product.id, productSlug, categorySlug, collectionSlug },
        cookieFor: async (access) => {
          const user = access === 'admin' ? KNOWN_ADMIN : customer
          return (await api.loginViaApi(user.email, user.password)).refreshCookie
        },
      })
    }
    finally {
      if (collectionId) await api.deleteCollection(adminToken, collectionId).catch(() => {})
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      if (categoryId) await api.deleteCategory(adminToken, categoryId).catch(() => {})
      await api.dispose()
    }
  })
}
