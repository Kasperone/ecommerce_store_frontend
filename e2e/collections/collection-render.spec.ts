import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

// Storefront smoke for the public manual-collection page (`/collections/[slug]`).
// It guards two things a per-component Vitest spec can't: that the page-level
// components resolve through Nuxt's auto-import graph (the `Failed to resolve
// component` class of bug that silently blanks a whole page), and that the
// membership set through the admin API actually surfaces the member product in
// the storefront grid — the full curate → render path end to end.
//
// Seeded entirely via the admin API (no admin UI here — that's covered by the
// admin CRUD smokes); the page itself is public, so it's viewed anonymously.
test('storefront collection page renders its member product', async ({ page }) => {
  // Generous budget: e2e runs against `npm run dev` (Vite) and this route
  // cold-compiles on first hit.
  test.setTimeout(90_000)

  const api = await ApiClient.create()

  // A `Failed to resolve component` warning means an auto-import name is wrong.
  // Attach before navigation so warnings from the initial render are caught.
  const resolveWarnings: string[] = []
  page.on('console', (msg) => {
    if (msg.text().includes('Failed to resolve component')) {
      resolveWarnings.push(msg.text())
    }
  })

  const runId = randomBytes(4).toString('hex')
  const productName = `E2E Collection Member ${runId}`
  const productSlug = `e2e-coll-member-${runId}`
  const collectionName = `E2E Featured ${runId}`
  const collectionSlug = `e2e-featured-${runId}`

  let accessToken = ''
  let productId = 0
  let collectionId = 0

  try {
    ;({ accessToken } = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password))

    ;({ id: productId } = await api.createProduct(accessToken, {
      name: productName,
      slug: productSlug,
      price_usd: 42,
      price_pln: 168,
      price_eur: 39,
      stock: 25,
    }))

    ;({ id: collectionId } = await api.createCollection(accessToken, {
      name: collectionName,
      slug: collectionSlug,
      description: `Curated for run ${runId}`,
    }))
    await api.setCollectionProducts(accessToken, collectionId, [productId])

    await page.goto(`/collections/${collectionSlug}`)

    // The collection title (h1) proves the page shell rendered, not a 404 shell.
    await expect(page.getByRole('heading', { name: collectionName, exact: true }))
      .toBeVisible({ timeout: 30_000 })

    // THE end-to-end assertion: the product set as a member through the admin
    // API surfaces in the storefront grid. Each card renders two links to the
    // same PDP (the aria-labelled image link + the product-name link) — `.first()`
    // disambiguates; both carry the same href.
    const memberLink = page.getByRole('link', { name: productName }).first()
    await expect(memberLink).toBeVisible({ timeout: 15_000 })
    await expect(memberLink).toHaveAttribute('href', `/products/${productSlug}`)

    expect(resolveWarnings, `Vue failed to resolve components:\n${resolveWarnings.join('\n')}`)
      .toEqual([])
  }
  finally {
    // Order matters: drop the collection first (its membership join cascades),
    // then the product. Both cleanups are 404-tolerant.
    if (collectionId) await api.deleteCollection(accessToken, collectionId)
    if (productId) await api.deleteProduct(accessToken, productId)
    await api.dispose()
  }
})
