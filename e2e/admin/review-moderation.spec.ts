// Admin review moderation (`/admin/reviews`) — the back-office half of the
// review trust path. `account/reviews.spec.ts` already covers the customer
// submit → approve → public leg through the storefront; what was unspecced is
// everything else the moderation dialog can do, and the list's filters.
//
// Two tests:
//   1. the full moderation lifecycle over one review — reject → approve → save
//      a public store reply (which must render on the PDP) → clear it → delete
//      (first click only arms the confirm). Every step is asserted against the
//      `reviews` row in pg, not against the toast: the dialog's flashes are
//      transient and prove only that a mutation resolved.
//   2. the status / rating / search filters.
//
// Reviews are seeded through the API (`createReview`) rather than the PDP —
// the UI submit path is the other spec's job, and one review per (product,
// user) means each extra review needs its own product anyway.
//
// ⚠️ Every filter assertion pairs an ABSENCE with a row that must be PRESENT.
// An absence assertion alone is unfalsifiable on a Pinia Colada table: changing
// the query key clears `data`, so the table is briefly empty and `toHaveCount(0)`
// passes against a filter that ignores its argument entirely.
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { fieldControl, selectOption } from '../helpers/nuxtUiSelect'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(240_000)

test.describe('Admin review moderation', () => {
  test('reject → approve → public reply → clear reply → delete', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const user = randomEphemeralUser()
    const productName = `E2E Moderation ${runId}`
    const slug = `e2e-moderation-${runId}`
    const reviewBody = `Solid product, would buy again — E2E ${runId}.`
    const replyText = `Thanks for the kind words! — E2E ${runId}`
    let adminToken = ''
    let productId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const product = await api.createProduct(adminToken, {
        name: productName,
        slug,
        price_usd: 30,
        price_pln: 120,
        price_eur: 27,
        stock: 5,
      })
      productId = product.id

      await api.register(user)
      await api.markVerified(user.email)
      const customer = await api.loginViaApi(user.email, user.password)
      const review = await api.createReview(customer.accessToken, productId, {
        rating: 4,
        title: `E2E moderation ${runId}`,
        body: reviewBody,
      })
      expect((await api.getReviewRow(review.id))?.status).toBe('pending')

      await page.context().addCookies([admin.refreshCookie])
      await page.goto('/admin/reviews')
      await expect(page).toHaveURL(/\/admin\/reviews/, { timeout: 60_000 })

      // Scope the table to this run's review. The search box is also the first
      // interaction after a cookie-injection goto, so it absorbs the admin-chrome
      // cold-compile hydration race: re-fill until the row actually lands.
      const search = await fieldControl(page, 'Search')
      const row = page.getByRole('row').filter({ hasText: productName })
      await expect(async () => {
        await search.fill(productName)
        await expect(row).toBeVisible({ timeout: 3_000 })
      }).toPass({ timeout: 90_000 })

      const dialog = page.getByRole('dialog')
      const openDialog = async () => {
        await row.getByRole('button', { name: 'Moderate' }).click()
        await expect(dialog.getByText('Moderate review')).toBeVisible({ timeout: 15_000 })
      }

      // ---- reject ----
      await openDialog()
      await expect(dialog.getByText(reviewBody)).toBeVisible()
      await dialog.getByRole('button', { name: 'Reject' }).click()
      await expect.poll(
        async () => (await api.getReviewRow(review.id))?.status,
        { timeout: 15_000 },
      ).toBe('rejected')
      // The list refetches after the mutation — gate on the badge so the next
      // dialog opens over fresh data (a rejected review offers Approve only).
      await expect(row.getByText('Rejected')).toBeVisible({ timeout: 15_000 })

      // ---- approve ----
      await openDialog()
      await dialog.getByRole('button', { name: 'Approve' }).click()
      await expect.poll(
        async () => (await api.getReviewRow(review.id))?.status,
        { timeout: 15_000 },
      ).toBe('approved')
      await expect(row.getByText('Approved')).toBeVisible({ timeout: 15_000 })

      // ---- store reply ----
      await openDialog()
      await (await fieldControl(dialog, 'Store response')).fill(replyText)
      await dialog.getByRole('button', { name: 'Save reply' }).click()
      await expect.poll(
        async () => {
          const r = await api.getReviewRow(review.id)
          return { body: r?.admin_response, stamped: r?.admin_response_at !== null }
        },
        { timeout: 15_000 },
      ).toEqual({ body: replyText, stamped: true })

      // ---- the reply is public on the PDP (anonymous) ----
      await page.context().clearCookies()
      await page.goto(`/products/${slug}`)
      await expect(page.getByText(reviewBody).first()).toBeVisible({ timeout: 60_000 })
      await expect(page.getByText('Store response').first()).toBeVisible()
      await expect(page.getByText(replyText).first()).toBeVisible()

      // ---- clear the reply → it leaves the PDP, the review stays ----
      await page.context().addCookies([admin.refreshCookie])
      await page.goto('/admin/reviews')
      await expect(async () => {
        await search.fill(productName)
        await expect(row).toBeVisible({ timeout: 3_000 })
      }).toPass({ timeout: 90_000 })
      await openDialog()
      await dialog.getByRole('button', { name: 'Remove reply' }).click()
      await expect.poll(
        async () => {
          const r = await api.getReviewRow(review.id)
          return { body: r?.admin_response, stamped: r?.admin_response_at !== null }
        },
        { timeout: 15_000 },
      ).toEqual({ body: null, stamped: false })

      // ---- delete: first click only arms the confirm ----
      await openDialog()
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
      const confirm = dialog.getByRole('button', { name: 'Confirm delete' })
      await expect(confirm).toBeVisible({ timeout: 10_000 })
      // Proving a click did NOT do something needs a settled window, not an
      // immediate read: a mutant that deletes on the arming click still passes
      // both "the button says Confirm delete" (it flips synchronously) and a pg
      // read fired before the DELETE round-trip lands. Wait, then require the
      // dialog to still be open AND the row to still exist.
      await page.waitForTimeout(1_500)
      await expect(dialog.getByText('Moderate review')).toBeVisible()
      expect(await api.getReviewRow(review.id)).not.toBeNull()

      await confirm.click()
      await expect.poll(
        async () => await api.getReviewRow(review.id),
        { timeout: 15_000 },
      ).toBeNull()
      // …and the moderation table no longer offers it.
      await expect(row).toHaveCount(0, { timeout: 15_000 })
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })

  test('status, rating and search filters narrow the moderation list', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const user = randomEphemeralUser()
    // Three reviews that differ in exactly one filterable dimension each, over
    // products sharing a search prefix so one search pins the working set.
    const prefix = `E2E RevFilter ${runId}`
    const seeds = [
      { label: 'Alpha', rating: 5, approve: true },
      { label: 'Bravo', rating: 2, approve: false },
      { label: 'Charlie', rating: 5, approve: false },
    ] as const
    const productIds: number[] = []
    let adminToken = ''

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      await api.register(user)
      await api.markVerified(user.email)
      const customer = await api.loginViaApi(user.email, user.password)

      const names: Record<string, string> = {}
      for (const seed of seeds) {
        const name = `${prefix} ${seed.label}`
        names[seed.label] = name
        const product = await api.createProduct(adminToken, {
          name,
          slug: `e2e-revfilter-${runId}-${seed.label.toLowerCase()}`,
          price_usd: 15,
          price_pln: 60,
          price_eur: 14,
          stock: 3,
        })
        productIds.push(product.id)
        const review = await api.createReview(customer.accessToken, product.id, {
          rating: seed.rating,
          body: `Filter fixture ${seed.label} — E2E ${runId}.`,
        })
        if (seed.approve) await api.moderateReview(adminToken, review.id, { status: 'approved' })
      }

      const rowFor = (label: string) => page.getByRole('row').filter({ hasText: names[label] })

      // Picking a `USelect` option is not reliably one click: the listbox
      // re-positions over its trigger as it opens (Reka scrolls the selected
      // item into view), so a click computed against the pre-scroll layout can
      // land on nothing — `selectOption` resolves happily and the model never
      // changes. Observed on the third select of the run, with the trigger
      // still reading the previous value. Assert the trigger's displayed value
      // and re-pick until it takes.
      const setFilter = async (label: string, option: string) => {
        const trigger = await fieldControl(page, label)
        await expect(async () => {
          await selectOption(page, page, label, option)
          await expect(trigger).toContainText(option, { timeout: 2_000 })
        }).toPass({ timeout: 30_000 })
      }

      await page.context().addCookies([admin.refreshCookie])
      await page.goto('/admin/reviews')
      await expect(page).toHaveURL(/\/admin\/reviews/, { timeout: 60_000 })

      // Baseline: the shared prefix brings all three in (also absorbs the
      // post-cookie-injection hydration race).
      const search = await fieldControl(page, 'Search')
      await expect(async () => {
        await search.fill(prefix)
        await expect(rowFor('Alpha')).toBeVisible({ timeout: 3_000 })
      }).toPass({ timeout: 90_000 })
      await expect(rowFor('Bravo')).toBeVisible({ timeout: 15_000 })
      await expect(rowFor('Charlie')).toBeVisible()

      // Status: only the approved one survives. Alpha is the control that must
      // stay PRESENT — without it, a filter that dropped every row would pass.
      await setFilter('Status', 'Approved')
      await expect(rowFor('Alpha')).toBeVisible({ timeout: 15_000 })
      await expect(rowFor('Bravo')).toHaveCount(0)
      await expect(rowFor('Charlie')).toHaveCount(0)

      // Rating: back to all statuses, then the 2-star review is the only match
      // (and now it is the control).
      await setFilter('Status', 'All statuses')
      await setFilter('Rating', '2 stars')
      await expect(rowFor('Bravo')).toBeVisible({ timeout: 15_000 })
      await expect(rowFor('Alpha')).toHaveCount(0)
      await expect(rowFor('Charlie')).toHaveCount(0)

      // Search: narrowing the term to one product name pins that row alone.
      await setFilter('Rating', 'All ratings')
      await search.fill(names['Charlie'])
      await expect(rowFor('Charlie')).toBeVisible({ timeout: 15_000 })
      await expect(rowFor('Alpha')).toHaveCount(0)
      await expect(rowFor('Bravo')).toHaveCount(0)
    }
    finally {
      for (const id of productIds) await api.deleteProduct(adminToken, id).catch(() => {})
      await api.dispose()
    }
  })
})
