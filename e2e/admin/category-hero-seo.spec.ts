import path from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

/**
 * The two halves of the category form that `category-crud.spec.ts` leaves
 * alone: the collapsed **SEO meta** block (per-locale `meta_title` /
 * `meta_description`) and the **hero image** staging block.
 *
 * The hero is not a plain field — the page runs a multi-step orchestration
 * (`app/pages/admin/categories/index.vue`): POST the category, then POST the
 * hero, then PATCH the alt; and if the hero POST fails on a *newly created*
 * row it compensates by DELETEing the orphan category. That compensation is
 * the reason this file exists — it is the only rollback in the admin catalog
 * and nothing proved it ran.
 *
 * NOT covered here: drag-reorder of the tree. Unlike the CMS canvas
 * (`admin.cms.visual.dragHint` documents an `Alt+Arrow` fallback), the
 * category tree's `@formkit/drag-and-drop` sortable exposes no keyboard
 * affordance, so a spec would have to drive native HTML5 drag —
 * see `plans/test/pending/2026-08-02-deliberately-uncovered-e2e-brief.md` §4.
 */

// Shared with nothing: this file owns the prefix, so its purge can never eat a
// sibling spec's fixtures. Purged at the START of each test too — a
// test-timeout kill never runs `finally`.
const SLUG_PREFIX = 'e2e-cathero-'

const HERO_PNG = path.join(process.cwd(), 'e2e', 'fixtures', 'images', 'gallery-red.png')

/**
 * Inject the refresh cookie so the auth plugin's boot `/auth/refresh` restores
 * the Pinia session on page load — skips the UI login form and spares the
 * slowapi per-email/-IP budget. Returns the access token for API seeding.
 */
async function signInAdmin(page: Page, api: ApiClient): Promise<string> {
  const { accessToken, refreshCookie } = await api.loginViaApi(
    KNOWN_ADMIN.email,
    KNOWN_ADMIN.password,
  )
  await page.context().addCookies([{
    name: refreshCookie.name,
    value: refreshCookie.value,
    domain: refreshCookie.domain,
    path: refreshCookie.path,
    httpOnly: refreshCookie.httpOnly,
    secure: refreshCookie.secure,
    sameSite: refreshCookie.sameSite,
  }])
  return accessToken
}

/** Navigate to the category admin and wait for a hydrated page. */
async function gotoCategoriesAdmin(page: Page): Promise<void> {
  await page.goto('/admin/categories')
  // 60 s: e2e runs against `npm run dev` (Vite), so the first hit on this
  // heavy admin route pays an on-demand compile.
  await expect(page.getByRole('heading', { name: 'Categories', exact: true }))
    .toBeVisible({ timeout: 60_000 })
  // Bounded + swallowed: against the dev server `networkidle` can never settle
  // (HMR + the auth plugin's refresh timer + Colada keep the network warm).
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
}

/** The tree row (`<li>`) for a category id. */
function row(page: Page, id: number): Locator {
  return page.locator(`li[data-category-id="${id}"]`)
}

/** A row's own header strip — its action buttons live here. */
function rowHeader(page: Page, id: number): Locator {
  return row(page, id).locator('> div').first()
}

/**
 * Click a row action, retrying until its dialog opens. On an admin page authed
 * by cookie injection the first click can land before Vue binds the handler —
 * the button takes focus and nothing happens, silently.
 */
async function openRowDialog(page: Page, id: number, action: string): Promise<Locator> {
  const dialog = page.getByRole('dialog')
  await expect(async () => {
    await rowHeader(page, id).getByRole('button', { name: action }).click({ timeout: 5_000 })
    await expect(dialog).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 30_000 })
  return dialog
}

/** Open the create modal, retrying for the same pre-hydration reason. */
async function openCreateDialog(page: Page): Promise<Locator> {
  const dialog = page.getByRole('dialog')
  await expect(async () => {
    await page.getByRole('button', { name: 'New category' }).click({ timeout: 5_000 })
    await expect(dialog).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 30_000 })
  return dialog
}

/**
 * Wait for a mutation dialog to close, which it only does once its request has
 * come back. 30 s, not the 5 s default: against the Vite dev server the first
 * write on a route routinely takes several seconds.
 */
async function expectDialogClosed(dialog: Locator): Promise<void> {
  await expect(dialog).toBeHidden({ timeout: 30_000 })
}

/**
 * Type a name and let its auto-derived slug LAND before overwriting it.
 * Skipping the blur wedges the two together: `fill()` selects the field's
 * content and inserts, and Vue patches the derived value in between, so the
 * row saves with `<derived><typed>` concatenated — a silent wrong-slug pass.
 */
async function fillNameAndSlug(
  pane: Locator,
  namePlaceholder: string,
  slugPlaceholder: string,
  name: string,
  derivedSlug: string,
  slug: string,
): Promise<void> {
  const nameInput = pane.getByPlaceholder(namePlaceholder, { exact: true })
  const slugInput = pane.getByPlaceholder(slugPlaceholder, { exact: true })
  await nameInput.fill(name)
  await nameInput.blur()
  await expect(slugInput).toHaveValue(derivedSlug)
  await slugInput.fill(slug)
  await expect(slugInput).toHaveValue(slug)
}

/**
 * Open the collapsed SEO block. It is a native `<details>`, so its panes are
 * present in the DOM but `display: none` until the summary is clicked —
 * filling them while closed fails the visibility check rather than silently
 * writing nowhere.
 */
async function openSeoSection(dialog: Locator): Promise<void> {
  const summary = dialog.locator('summary', { hasText: 'SEO meta' })
  await expect(async () => {
    if (!(await dialog.locator('[data-seo-pane="en"], [data-seo-pane="pl"]').first().isVisible())) {
      await summary.click({ timeout: 5_000 })
    }
    await expect(dialog.locator('[data-seo-pane="en"], [data-seo-pane="pl"]').first())
      .toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
}

/**
 * Fill one locale's SEO pair. Both panes carry identical labels ("Meta title"
 * / "Meta description"), so the pane wrapper — not the label — is what
 * disambiguates them; inside a pane the `UInput` is the only `<input>` and the
 * `UTextarea` the only `<textarea>`.
 */
async function fillSeoPane(
  dialog: Locator,
  locale: 'en' | 'pl',
  metaTitle: string,
  metaDescription: string,
): Promise<void> {
  const pane = dialog.locator(`[data-seo-pane="${locale}"]`)
  await pane.locator('input').fill(metaTitle)
  await pane.locator('textarea').fill(metaDescription)
}

/** Stage a hero file through the real (sr-only) picker input and set its alt. */
async function stageHero(dialog: Locator, alt: string): Promise<void> {
  await dialog.locator('[data-hero-file-input]').setInputFiles(HERO_PNG)
  // The preview only renders once the component accepted the file (it rejects
  // on size/type) — assert it before typing the alt, whose input is rendered
  // by the same `v-if="!isEmpty"`.
  await expect(dialog.locator('[data-hero-preview]')).toBeVisible()
  await dialog.locator('[data-hero-alt-input]').fill(alt)
}

// The straight-through path: SEO meta in both locales plus a staged hero on
// create, then the two edit paths that only exist once a hero is present
// (alt-only PATCH, and Remove → DELETE /hero). Asserted in pg at every step —
// reading the admin API back instead would let a broken writer and a broken
// reader cancel out.
test('category SEO meta and hero image round-trip through the form', async ({ page }) => {
  test.setTimeout(300_000)

  const api = await ApiClient.create()
  const run = Date.now().toString(36)
  const slug = `${SLUG_PREFIX}${run}-main`
  const controlSlug = `${SLUG_PREFIX}${run}-control`
  const name = `E2E Hero Cat ${run}`

  try {
    await api.purgeCategories(SLUG_PREFIX)
    const token = await signInAdmin(page, api)

    // The control row: it never gets a hero and is never edited, so it proves
    // the tree still renders (and that no step below deleted more than it
    // meant to) independently of the row under test.
    const control = await api.createCategory(token, {
      name: `E2E Hero Control ${run}`,
      slug: controlSlug,
    })

    await gotoCategoriesAdmin(page)
    await expect(row(page, control.id)).toBeVisible()

    let categoryId = 0

    await test.step('create persists both locales of SEO meta and the staged hero', async () => {
      const dialog = await openCreateDialog(page)

      const enPane = dialog.locator('[data-locale-pane="en"]')
      await fillNameAndSlug(
        enPane,
        'Books',
        'books',
        name,
        `e2e-hero-cat-${run}`,
        slug,
      )

      await openSeoSection(dialog)
      await fillSeoPane(dialog, 'en', `Meta ${run} EN`, `Meta description ${run} EN`)

      // The PL SEO pane shares the locale tab with the PL name/slug pane —
      // both are `v-show`-hidden until the Polski tab is active.
      await dialog.getByRole('tab', { name: 'Polski' }).click()
      const plPane = dialog.locator('[data-locale-pane="pl"]')
      await fillNameAndSlug(
        plPane,
        'Książki',
        'ksiazki',
        `E2E Kat Hero ${run}`,
        `e2e-kat-hero-${run}`,
        `${slug}-pl`,
      )
      await fillSeoPane(dialog, 'pl', `Meta ${run} PL`, `Meta description ${run} PL`)

      await stageHero(dialog, `Hero alt ${run}`)

      await dialog.getByRole('button', { name: 'Save', exact: true }).click()
      await expectDialogClosed(dialog)

      const created = await api.getCategoryRow(slug)
      expect(created, 'the create modal must persist a categories row').not.toBeNull()
      expect(created!.meta_title).toBe(`Meta ${run} EN`)
      expect(created!.meta_description).toBe(`Meta description ${run} EN`)
      expect(created!.meta_title_pl).toBe(`Meta ${run} PL`)
      expect(created!.meta_description_pl).toBe(`Meta description ${run} PL`)
      // The hero is a second request the page fires only after the row lands;
      // a URL here proves the whole orchestration ran, not just the POST.
      expect(created!.hero_image_url, 'the staged hero must be uploaded after create')
        .toBeTruthy()
      expect(created!.hero_image_alt).toBe(`Hero alt ${run}`)
      categoryId = created!.id

      await expect(row(page, categoryId)).toBeVisible()
    })

    await test.step('reopening the form shows the stored hero and SEO values', async () => {
      const dialog = await openRowDialog(page, categoryId, 'Edit category')

      // The existing hero renders as a preview (not the empty drop zone) —
      // the tree node has to carry `hero_image_url` for this to work at all.
      await expect(dialog.locator('[data-hero-preview]')).toBeVisible()
      await expect(dialog.locator('[data-hero-drop-zone]')).toHaveCount(0)
      await expect(dialog.locator('[data-hero-alt-input]')).toHaveValue(`Hero alt ${run}`)

      await openSeoSection(dialog)
      await expect(dialog.locator('[data-seo-pane="en"] input')).toHaveValue(`Meta ${run} EN`)

      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expectDialogClosed(dialog)
    })

    await test.step('an alt-only edit PATCHes the hero without re-uploading it', async () => {
      const before = await api.getCategoryRow(slug)
      const dialog = await openRowDialog(page, categoryId, 'Edit category')

      await dialog.locator('[data-hero-alt-input]').fill(`Hero alt ${run} v2`)
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()
      await expectDialogClosed(dialog)

      const after = await api.getCategoryRow(slug)
      expect(after!.hero_image_alt).toBe(`Hero alt ${run} v2`)
      // Same object, new metadata: an alt edit that silently re-uploaded (or
      // dropped) the image would move this URL.
      expect(after!.hero_image_url).toBe(before!.hero_image_url)
    })

    await test.step('Remove clears the hero columns and leaves the category standing', async () => {
      const dialog = await openRowDialog(page, categoryId, 'Edit category')

      await dialog.getByRole('button', { name: 'Remove', exact: true }).click()
      // Removing an existing hero flips the component back to its empty state,
      // which is what tells us the click registered before we save.
      await expect(dialog.locator('[data-hero-drop-zone]')).toBeVisible()
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()
      await expectDialogClosed(dialog)

      const cleared = await api.getCategoryRow(slug)
      // DELETE /hero clears the columns; the row itself must survive — the
      // whole point of the separate hero endpoint.
      expect(cleared, 'removing a hero must not delete the category').not.toBeNull()
      expect(cleared!.hero_image_url).toBeNull()
      expect(cleared!.hero_image_alt).toBeNull()
      expect(cleared!.name).toBe(name)
      expect(cleared!.meta_title).toBe(`Meta ${run} EN`)
    })

    await expect(row(page, control.id)).toBeVisible()
  }
  finally {
    await api.purgeCategories(SLUG_PREFIX)
    await api.dispose()
  }
})

// The compensation. `onCreate()` catches a failed hero upload and DELETEs the
// category it just created, so a hero that cannot be stored never leaves a
// half-made row behind. Driven by failing the hero POST at the network edge —
// the only way to reach the path, since the endpoint itself is healthy.
test('a failed hero upload rolls back the category it just created', async ({ page }) => {
  test.setTimeout(300_000)

  const api = await ApiClient.create()
  const run = Date.now().toString(36)
  const slug = `${SLUG_PREFIX}${run}-orphan`
  const controlSlug = `${SLUG_PREFIX}${run}-ctl`

  try {
    await api.purgeCategories(SLUG_PREFIX)
    const token = await signInAdmin(page, api)

    const control = await api.createCategory(token, {
      name: `E2E Hero Ctl ${run}`,
      slug: controlSlug,
    })

    // Fail ONLY the upload. PATCH/DELETE share this URL, and the compensating
    // DELETE goes to `/categories/{id}` — intercepting by method keeps the
    // rollback path itself live.
    let heroPostAttempts = 0
    await page.route('**/api/v1/categories/*/hero', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      heroPostAttempts += 1
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'hero storage unavailable' }),
      })
    })

    await gotoCategoriesAdmin(page)
    await expect(row(page, control.id)).toBeVisible()

    const dialog = await openCreateDialog(page)

    // Capture the id the POST actually minted. Without this the "row is gone"
    // assertion below is unfalsifiable — it would pass just as happily if the
    // create had never fired at all.
    const createdResponse = page.waitForResponse(
      r => r.url().includes('/api/v1/categories/')
        && r.request().method() === 'POST'
        && !r.url().includes('/hero'),
      { timeout: 60_000 },
    )

    const enPane = dialog.locator('[data-locale-pane="en"]')
    await fillNameAndSlug(
      enPane,
      'Books',
      'books',
      `E2E Hero Orphan ${run}`,
      `e2e-hero-orphan-${run}`,
      slug,
    )
    await stageHero(dialog, `Orphan alt ${run}`)
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()

    const created = await createdResponse
    expect(created.status(), 'the category POST must succeed before the hero fails').toBe(201)
    const createdId = (await created.json()).id as number

    // The failure has to be *visible* to the admin: the modal stays open and
    // surfaces the error rather than closing as if the save had worked.
    await expect(dialog.getByText('hero storage unavailable')).toBeVisible({ timeout: 30_000 })
    await expect(dialog).toBeVisible()
    expect(heroPostAttempts, 'the hero upload must have been attempted').toBe(1)

    // THE assertion: the row that provably existed a moment ago is gone.
    await expect
      .poll(async () => await api.getCategoryRow(slug), { timeout: 30_000 })
      .toBeNull()
    expect(await api.getCategoryRowById(createdId)).toBeNull()

    // …and the rollback deleted exactly that row. A compensation that took the
    // whole prefix with it would satisfy the assertion above on its own.
    expect(await api.getCategoryRow(controlSlug)).not.toBeNull()
  }
  finally {
    await api.purgeCategories(SLUG_PREFIX)
    await api.dispose()
  }
})
