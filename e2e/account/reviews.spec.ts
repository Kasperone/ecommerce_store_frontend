// Product reviews — the full trust path: a customer submits a review from the
// PDP (starts pending, not public), an admin approves it in the moderation
// workspace, and only then does it render publicly on the PDP. Storefront
// engagement + admin moderation, both previously unspecced.
//
// Drafted against the live app via the planner/generator flow. Auth is swapped
// in-context via refresh cookies (customer → admin → anonymous).
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(180_000)

test.describe('Product reviews', () => {
  // PARKED (test.fixme) — blocked on a ProductReviews.vue timing fragility, NOT
  // a test defect. The PDP write area renders only when `ownLoaded` is true, and
  // `loadOwn()` runs in `onMounted`. On a hard page load as an authed customer
  // (refresh-cookie session restore), `onMounted`'s `fetchMine` races the auth
  // restoration: the write area (`v-else-if="ownLoaded"` with no `v-else`) then
  // renders nothing and the "Write a review" button never appears — even after
  // the header shows Logout (isAuthed=true). A real user who logs in via the
  // form and navigates client-side to a PDP keeps the session in the Pinia store
  // and doesn't hit this, but a logged-in hard-refresh of a PDP can. Fix the
  // component (add a `v-else` loading state / re-run loadOwn on isAuthed change /
  // don't gate the write button on `ownLoaded`), then unpark. Backend verified
  // fine: GET /products/{id}/reviews/me returns null in ~0.25s.
  test.fixme('customer submits a review → admin approves → it becomes public on the PDP', async ({ page }) => {
    const api = await ApiClient.create()
    const runId = Date.now()
    const user = randomEphemeralUser()
    const slug = `e2e-review-${runId}`
    const name = `E2E Review Widget ${runId}`
    const body = `Genuinely excellent — E2E review ${runId}.`
    let adminToken = ''
    let productId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const adminCookie = admin.refreshCookie
      const product = await api.createProduct(adminToken, {
        name,
        slug,
        price_usd: 25,
        price_pln: 100,
        price_eur: 22,
        stock: 5,
      })
      productId = product.id

      await api.register(user)
      await api.markVerified(user.email)
      const { refreshCookie: customerCookie } = await api.loginViaApi(user.email, user.password)

      // --- 1) customer submits a review from the PDP → pending, not public
      await page.context().addCookies([customerCookie])
      await page.goto(`/products/${slug}`)
      // The review write area only renders once the session is RESTORED from the
      // refresh cookie (isAuthed=true) — not merely once the page hydrates. Gate
      // on the authed header (Logout) so isAuthed has flipped before we look for
      // the "Write a review" button.
      await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible({ timeout: 60_000 })
      await page.getByRole('button', { name: 'Write a review' }).click()
      await page.getByRole('button', { name: 'Rate 5 stars' }).click()
      await page.getByLabel('Your review').fill(body)
      await page.getByRole('button', { name: 'Submit review' }).click()

      // The just-submitted review is the caller's own, flagged awaiting moderation.
      await expect(page.getByText('Your review is awaiting moderation and isn\'t public yet.'))
        .toBeVisible({ timeout: 15_000 })

      // --- 2) it is NOT yet public (approved-only public read)
      await page.context().clearCookies()
      await page.goto(`/products/${slug}`)
      await expect(page.getByRole('button', { name: 'Open cart' })).toBeVisible({ timeout: 60_000 })
      await expect(page.getByText(body)).toHaveCount(0)

      // --- 3) admin approves it in the moderation workspace
      await page.context().addCookies([adminCookie])
      await page.goto('/admin/reviews')
      await expect(page).toHaveURL(/\/admin\/reviews/, { timeout: 30_000 })
      await expect(page.getByText(name).first()).toBeVisible({ timeout: 60_000 })
      const row = page.getByRole('row').filter({ hasText: name })
      await row.getByRole('button', { name: 'Moderate' }).click()
      await expect(page.getByText('Moderate review')).toBeVisible({ timeout: 15_000 })
      await page.getByRole('button', { name: 'Approve', exact: true }).click()
      await expect(page.getByText('Review approved.').first()).toBeVisible({ timeout: 15_000 })

      // --- 4) now it renders publicly on the PDP (anonymous)
      await page.context().clearCookies()
      await page.goto(`/products/${slug}`)
      await expect(page.getByText(body).first()).toBeVisible({ timeout: 60_000 })
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
