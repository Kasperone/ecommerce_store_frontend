// Meilisearch-backed happy path for header search → /search facets.
//
// CI: `.github/workflows/test.yml` runs Meilisearch beside Postgres and sets
// MEILISEARCH_E2E_ENABLED=1. Locally: docker-compose meilisearch, point the
// backend at it (MEILISEARCH_URL / MEILISEARCH_MASTER_KEY), then
// MEILISEARCH_E2E_ENABLED=1.
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'

const meiliReady = process.env.MEILISEARCH_E2E_ENABLED === '1' || process.env.CI === 'true'

test.skip(
  !meiliReady,
  'requires Meilisearch on the backend; set MEILISEARCH_E2E_ENABLED=1 (CI sets this automatically)',
)

test.use({ storageState: { cookies: [], origins: [] } })

const BACKEND_URL = process.env.E2E_BACKEND_URL ?? 'http://localhost:8000'

test('header search → autocomplete → faceted /search page', async ({ page }) => {
  test.setTimeout(60_000)

  const api = await ApiClient.create()
  const runId = Date.now()
  // Unique by default so the result-count assertions stay stable in a shared DB.
  const searchTerm = process.env.MEILISEARCH_E2E_TERM ?? `e2ephone${runId}`
  let productId: number | null = null
  let categoryId: number | null = null
  let adminToken = ''

  try {
    const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
    adminToken = admin.accessToken
    const category = await api.createCategory(adminToken, {
      name: 'E2E Search Category',
      slug: `e2e-search-cat-${runId}`,
    })
    categoryId = category.id
    const product = await api.createProduct(adminToken, {
      name: `E2E Search ${searchTerm}`,
      slug: `e2e-search-${runId}`,
      price_usd: 100,
      price_pln: 400,
      price_eur: 90,
      stock: 5,
      category_id: category.id,
    })
    productId = product.id

    await expect(async () => {
      const res = await page.request.get(
        `${BACKEND_URL}/api/v1/search?q=${encodeURIComponent(searchTerm)}&page_size=20`,
      )
      expect(res.ok()).toBeTruthy()
      const body = (await res.json()) as { total: number }
      expect(body.total).toBeGreaterThanOrEqual(1)
    }).toPass({ timeout: 30_000 })

    await page.goto('/')

    const input = page.getByRole('textbox', { name: /search products/i }).first()
    await input.fill(searchTerm)

    await expect(page.getByText(/see all results/i)).toBeVisible()

    await input.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/search\\?q=${encodeURIComponent(searchTerm).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))

    await expect(page.getByRole('heading', { name: /search results/i })).toBeVisible()
    const firstResult = page.locator('article a[href*="/products/"]').first()
    await expect(firstResult).toBeVisible()

    if (!process.env.MEILISEARCH_E2E_TERM) {
      await expect(page.getByText(/\b1 result for\b/i)).toBeVisible()
      await expect(page.getByText(/^1 product$/i)).toBeVisible()
    }

    const facetButton = page.locator('aside button[aria-pressed]').first()
    if (await facetButton.count()) {
      await facetButton.click()
      await expect(page).toHaveURL(/categoryId=/)
    }
  }
  finally {
    if (adminToken) {
      if (productId !== null) {
        await api.deleteProduct(adminToken, productId)
      }
      if (categoryId !== null) {
        await api.deleteCategory(adminToken, categoryId)
      }
    }
    await api.dispose()
  }
})
