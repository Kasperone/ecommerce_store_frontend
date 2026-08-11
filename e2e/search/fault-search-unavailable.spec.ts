// Fault injection: the search backend is down (Meilisearch 503).
//
// The audit's open question was "does search degrade, or blank?". Nothing
// answered it: `search/search.spec.ts` is skipped in CI because it needs a
// running, seeded Meilisearch, so the storefront's single search surface has
// had ZERO CI coverage in either direction.
//
// Fault injection fixes that asymmetry. Fulfilling a 503 at the network edge
// needs no Meilisearch at all, so unlike the happy-path spec this one runs
// everywhere, unconditionally.
//
// The contract asserted here: search failure is CONTAINED. The results region
// is replaced by an error alert, and the rest of the page — header, nav, the
// search input itself — keeps working, so the shopper can retype or navigate
// away rather than facing a white screen.
//
// NOTE ON WHY THE NAVIGATION IS CLIENT-SIDE: `useSearchResults` is a
// `useAsyncData` call, so a hard load fetches during SSR — inside the Nuxt
// server, where `page.route` (a browser-level intercept) cannot see it. Driving
// the header search box instead produces a client-side route change, which
// fetches from the browser and therefore hits the fault. A `page.goto` here
// would silently bypass the whole mechanism and test nothing.
import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(120_000)

const QUERY = 'widget'

test.describe('Search fault injection', () => {
  test('search 503: results degrade to a contained error, page stays usable, recovers when the API returns', async ({ page }) => {
    let failSearch = true
    let searchAttempts = 0

    // Autocomplete is pinned to a valid empty payload throughout. It is not the
    // subject of this test, and without it the suggest call would 503 off the
    // real backend (no Meilisearch locally or in CI), making the dropdown's
    // behaviour — and therefore the Enter keypress — nondeterministic.
    await page.route('**/api/v1/search/suggest**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ products: [], categories: [], query: QUERY }),
    }))

    await page.route('**/api/v1/search?**', async (route) => {
      searchAttempts += 1
      if (!failSearch) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [],
            total: 0,
            page: 1,
            page_size: 24,
            pages: 0,
            facets: {},
            query: QUERY,
            processing_time_ms: 1,
          }),
        })
      }
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Search is temporarily unavailable' }),
      })
    })

    await page.goto('/')

    // Client-side navigation into /search (see the note at the top).
    // SearchBar's Enter handler is a Vue listener, so it does nothing until the
    // header hydrates — re-press until the route changes, the same recovery
    // pattern the cart specs use for Add to Cart.
    const input = page.getByRole('textbox', { name: /search products/i }).first()
    await expect(input).toBeVisible()
    await expect(async () => {
      await input.fill(QUERY)
      await input.press('Enter')
      await expect(page).toHaveURL(new RegExp(`/search\\?q=${QUERY}`), { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })

    // --- the failure is surfaced as an alert, not swallowed and not fatal
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 30_000 })
    // Proves the fault actually fired rather than the alert coming from
    // somewhere else entirely.
    expect(searchAttempts).toBeGreaterThan(0)

    // --- containment: no results rendered ...
    await expect(page.locator('article a[href*="/products/"]')).toHaveCount(0)

    // --- ... but the page is still a working page, not a white screen. The
    // header search box still accepts input, so the shopper can retry.
    await expect(input).toBeVisible()
    await expect(input).toBeEditable()
    await expect(page.getByRole('link', { name: 'Products' }).first()).toBeVisible()

    // --- POSITIVE CONTROL: the alert is caused by the 503 specifically, not by
    // this page always erroring. Serve a valid (empty) payload and the alert
    // must clear and give way to the normal no-results state. Without this the
    // assertions above would pass just as happily against a permanently broken
    // page.
    failSearch = false
    const attemptsBeforeRecovery = searchAttempts

    // Re-run the query client-side so the refetch goes through the browser.
    await expect(async () => {
      await input.fill(`${QUERY} again`)
      await input.press('Enter')
      await expect(page).toHaveURL(/\/search\?q=widget\+again/, { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })

    await expect(page.getByRole('alert')).toBeHidden({ timeout: 30_000 })
    expect(searchAttempts).toBeGreaterThan(attemptsBeforeRecovery)
    // The normal results region is back: heading plus the empty-state copy
    // (`search.noResults` — "No matches for “…”"), not the error alert.
    await expect(page.getByRole('heading', { name: /search results/i }))
      .toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/no matches for/i).first()).toBeVisible({ timeout: 30_000 })
  })
})
