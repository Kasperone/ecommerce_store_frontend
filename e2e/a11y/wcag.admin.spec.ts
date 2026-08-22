// Page-level WCAG 2.2 AA sweep — the admin back-office.
//
// The harness, the ratchet contract and the regenerate/triage commands all
// live in `./sweep.ts`. Read that first; this file is just the route table.
//
// Its sibling `wcag.storefront.spec.ts` covers the storefront and the customer
// account. They are separate files so CI's 3× sharding can put them on
// different shards — `fullyParallel: false` makes a FILE the sharding unit, so
// splitting into two tests within one file would not have distributed anything.
//
// COVERAGE: every admin route that is reachable without a fixture — all 28
// sidebar landing pages plus the product-create form, which is the largest
// single form the back-office ships and so the densest a11y surface in it.
// Detail routes (`/admin/orders/[id]`, `/admin/products/[id]/edit`, …) are
// deliberately absent: each needs its own seeded row, and the shared page
// chrome they exercise is already covered by their list page.
//
// The seeded admin is an OWNER (`promoteAdmin` sets `is_owner`), so every
// capability is implicitly held and no route bounces on RBAC. If one of these
// ever starts landing on /admin instead of itself, the landing guard in
// `runSweep` will say so rather than silently scanning the dashboard 28 times.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'
import { headingReady, runSweep } from './sweep'
import type { Route } from './sweep'

test.use({ storageState: { cookies: [], origins: [] } })

// A cold Vite compile per route, times 29 routes, twice over. The admin bundle
// is the heavy half of the app, so this is the larger of the two sweeps.
test.setTimeout(1_800_000)

type Ctx = Record<string, never>

/** Admin pages are code-split and data-heavy; 60s is not enough on a cold
 *  compile in CI, where these are the first routes to touch the admin chunk. */
const adminReady = (page: Page) => headingReady(page, 120_000)

/** `key` doubles as the baseline key, so it must stay stable — it is NOT
 *  derived from the path. `admin-dashboard` and `admin-products` predate the
 *  widening and keep their original keys. */
const ADMIN_PATHS: Array<[key: string, path: string]> = [
  ['admin-dashboard', '/admin'],
  ['admin-audit-log', '/admin/audit-log'],
  ['admin-banners', '/admin/banners'],
  ['admin-campaigns', '/admin/campaigns'],
  ['admin-categories', '/admin/categories'],
  ['admin-collections', '/admin/collections'],
  ['admin-companies', '/admin/companies'],
  ['admin-coupons', '/admin/coupons'],
  ['admin-customers', '/admin/customers'],
  ['admin-draft-orders', '/admin/draft-orders'],
  ['admin-gift-cards', '/admin/gift-cards'],
  ['admin-inventory', '/admin/inventory'],
  ['admin-inventory-movements', '/admin/inventory/movements'],
  ['admin-orders', '/admin/orders'],
  ['admin-pages', '/admin/pages'],
  ['admin-payment-terms', '/admin/payment-terms'],
  ['admin-price-lists', '/admin/price-lists'],
  ['admin-products', '/admin/products'],
  ['admin-product-new', '/admin/products/new'],
  ['admin-quotes', '/admin/quotes'],
  ['admin-reports', '/admin/reports'],
  ['admin-returns', '/admin/returns'],
  ['admin-reviews', '/admin/reviews'],
  ['admin-segments', '/admin/segments'],
  ['admin-settings', '/admin/settings'],
  ['admin-shipping', '/admin/shipping'],
  ['admin-staff', '/admin/staff'],
  ['admin-tax', '/admin/tax'],
  ['admin-translations', '/admin/translations'],
  ['admin-warehouses', '/admin/warehouses'],
]

/** Routes where "a heading has painted" is NOT a sufficient readiness signal.
 *
 *  ⚠️ `admin-product-new`'s locale tab bar lives inside `<ClientOnly>`, so it is
 *  absent from the SSR output entirely and only appears after hydration. A
 *  heading-only wait lets axe scan the page BEFORE the tabs paint — which would
 *  report the tab bar clean by never having seen it. That is the same class of
 *  meaningless pass as scanning a spinner, and it would have silently hidden the
 *  very violation (B3) that this route was added to catch. */
const EXTRA_READY: Record<string, (page: Page) => Promise<void>> = {
  'admin-product-new': async (page) => {
    await adminReady(page)
    await expect(page.getByRole('tab').first()).toBeVisible({ timeout: 120_000 })
  },
}

const ROUTES: Route<Ctx>[] = ADMIN_PATHS.map(([key, path]) => ({
  key,
  path: () => path,
  access: 'admin' as const,
  ready: EXTRA_READY[key] ?? adminReady,
}))

for (const locale of ['en', 'pl'] as const) {
  test(`WCAG 2.2 AA sweep — admin (${locale})`, async ({ browser }) => {
    const api = await ApiClient.create()
    try {
      await runSweep<Ctx>({
        browser,
        locale,
        routes: ROUTES,
        ctx: {},
        // ⚠️ Mint a FRESH refresh cookie per authenticated context. Refresh
        // tokens ROTATE: every new browser context boots `plugins/auth.ts` →
        // `/auth/refresh`, which consumes and replaces the row. Handing the
        // same cookie to a second context replays a spent token, the backend
        // treats it as reuse, and that context lands on /login instead of the
        // page under test. This passed locally and failed in CI — the landing
        // guard is what caught it. Rate limits are not a concern: CI runs the
        // backend with E2E_DISABLE_RATE_LIMIT.
        cookieFor: async () =>
          (await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)).refreshCookie,
      })
    }
    finally {
      await api.dispose()
    }
  })
}
