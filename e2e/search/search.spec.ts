import { expect, test } from '@playwright/test'

// CI has no Meilisearch, so this is skipped there — same pattern as the R2
// gallery spec. To run locally: bring up Meilisearch, point the backend at it
// (MEILISEARCH_URL/MASTER_KEY), seed it (`python -m app.scripts.reindex_search`),
// then set MEILISEARCH_E2E_ENABLED=1. The dev DB must contain at least one
// active product whose name matches SEARCH_TERM below.
test.skip(
  !process.env.MEILISEARCH_E2E_ENABLED,
  'requires a running + seeded Meilisearch; set MEILISEARCH_E2E_ENABLED=1',
)
test.use({ storageState: { cookies: [], origins: [] } })

const SEARCH_TERM = process.env.MEILISEARCH_E2E_TERM ?? 'phone'

test('header search → autocomplete → faceted /search page', async ({ page }) => {
  test.setTimeout(60_000)

  await page.goto('/')

  // The header search input (icon-only collapse not used on desktop).
  const input = page.getByRole('textbox', { name: /search products/i }).first()
  await input.fill(SEARCH_TERM)

  // Autocomplete dropdown surfaces a product section + a "see all" row.
  await expect(page.getByText(/see all results/i)).toBeVisible()

  // Enter navigates to the faceted results page.
  await input.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/search\\?q=${SEARCH_TERM}`))

  // The results page renders the heading + at least one result card.
  await expect(page.getByRole('heading', { name: /search results/i })).toBeVisible()
  const firstResult = page.locator('article a[href*="/products/"]').first()
  await expect(firstResult).toBeVisible()

  // The category facet (if any matched) narrows the result set.
  const facetButton = page.locator('aside button[aria-pressed]').first()
  if (await facetButton.count()) {
    await facetButton.click()
    await expect(page).toHaveURL(/categoryId=/)
  }
})
