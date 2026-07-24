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
  // The PDP mounts the reviews section with `hydrate-on-visible`, so its client
  // code (own-review fetch → write form) only runs once it scrolls into view;
  // this spec scrolls it in before engaging the widget. `ProductReviews` also
  // shows a loading state (not a silent blank) while the fetch settles and
  // re-runs it if the session restores after hydration. Fixed 2026-07-24.
  test('customer submits a review → admin approves → it becomes public on the PDP', async ({ page }) => {
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
      // Gate on the authed header (Logout) so the session has restored from the
      // refresh cookie before we engage the review widget.
      await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible({ timeout: 60_000 })
      // The reviews section mounts with `hydrate-on-visible` — its client code
      // (which loads the customer's own review and reveals the write form) does
      // not run until it scrolls into view. Scroll it in, then the button appears.
      await page.getByRole('heading', { name: 'Customer reviews' }).scrollIntoViewIfNeeded()
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
