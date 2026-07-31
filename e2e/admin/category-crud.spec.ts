import { expect, test, type Locator, type Page } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

// Every category this file creates carries this slug prefix. The e2e categories
// table is never truncated and `slug` is unique, so leftovers from a previous
// run would collide — `purgeCategories(SLUG_PREFIX)` runs at the START of each
// test as well as in `finally`, because a test-timeout kill never runs
// `finally`.
const SLUG_PREFIX = 'e2e-cat-'

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
  // heavy admin route pays an on-demand compile — and lint/unit/typecheck run
  // concurrently with e2e on the same box.
  await expect(page.getByRole('heading', { name: 'Categories', exact: true }))
    .toBeVisible({ timeout: 60_000 })
  // Best-effort settle so the first click lands on a compiled+hydrated page.
  // BOUNDED + swallowed: against the dev server `networkidle` can never settle
  // (HMR + the auth plugin's refresh timer + Colada keep the network warm).
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
}

/** The tree row (`<li>`) for a category id — nested rows live inside it. */
function row(page: Page, id: number): Locator {
  return page.locator(`li[data-category-id="${id}"]`)
}

/**
 * A row's own header strip. Scoping to the direct child `<div>` matters for a
 * parent row: its action buttons and its descendants' are all inside the same
 * `<li>`, so an unscoped `getByRole('button')` is ambiguous.
 */
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
    // Bounded click: the config sets no `actionTimeout`, so an unactionable
    // click (the previous modal's dismissable overlay still animating out, say)
    // would block until the whole test budget expires instead of retrying.
    await rowHeader(page, id).getByRole('button', { name: action }).click({ timeout: 5_000 })
    await expect(dialog).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 30_000 })
  return dialog
}

/**
 * Wait for a mutation dialog to close, which it only does once its request has
 * come back. 30 s, not the 5 s default: against the Vite dev server the first
 * write on a route routinely takes several seconds (the dialog's Cancel and
 * confirm buttons sit `disabled` meanwhile) — measured at just over 5 s for
 * both the create modal and the delete confirm, i.e. the default budget failed
 * on a perfectly healthy mutation.
 */
async function expectDialogClosed(dialog: Locator): Promise<void> {
  await expect(dialog).toBeHidden({ timeout: 30_000 })
}

/**
 * Pick an option in the page's active/inactive `USelectMenu`. It is a bare
 * select with no `UFormField`, so `helpers/nuxtUiSelect` can't resolve it by
 * label — the trigger is the page's only `aria-label="Show popup"` button.
 * Same retry rationale as `openRowDialog`.
 */
async function pickActiveFilter(page: Page, optionName: string): Promise<void> {
  const trigger = page.getByRole('button', { name: 'Show popup' })
  const option = page.getByRole('option', { name: optionName, exact: true })
  await expect(async () => {
    // Bounded, for the same reason as `openRowDialog`: reka's popup leaves a
    // dismissable layer over the trigger while it animates out, so re-opening
    // the select right after a previous pick can otherwise wedge the run.
    if (!(await option.isVisible())) await trigger.click({ timeout: 5_000 })
    await expect(option).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await option.click()
  // Settle before the next pick: the listbox must be gone, not merely on its
  // way out.
  await expect(page.getByRole('listbox')).toBeHidden()
}

// Smoke guard for the category admin UI. Its single most important job is to
// fail loudly if the page-level components stop resolving — the exact class of
// bug (pathPrefix bare-name vs `Admin*` auto-import name) that left the whole
// category admin page silently dead in production until 2026-05-25. A bare
// `<CategoryFormModal>` renders nothing and only emits a Vue *warning*, so unit
// specs (which mount each component directly) can't catch it; only a real
// page render through Nuxt's auto-import resolver does.
test('admin category page renders and opens the create modal', async ({ page }) => {
  // Generous budget: this spec sorts first, so it eats the *cold* on-demand
  // compile of a heavy admin page (tree + drag-and-drop + modals). That cold
  // compile is what made the old 30 s budget flake — both via a hung
  // `networkidle` and via a too-short retry loop.
  test.setTimeout(90_000)

  const api = await ApiClient.create()

  // Any `Failed to resolve component` warning means an auto-import name is
  // wrong — assert the page produced none. Attach before navigation so we
  // catch warnings emitted during the initial render.
  const resolveWarnings: string[] = []
  page.on('console', (msg) => {
    if (msg.text().includes('Failed to resolve component')) {
      resolveWarnings.push(msg.text())
    }
  })

  try {
    await signInAdmin(page, api)
    await gotoCategoriesAdmin(page)

    await test.step('clicking "New category" opens the form modal', async () => {
      const dialog = page.getByRole('dialog')

      // THE assertion that fails on the F1 bug: a bare-named <CategoryFormModal>
      // never mounts, so no dialog ever appears no matter how many times we click.
      // Verified by hand that a click on a hydrated page reliably opens *and
      // keeps* the modal open, so the retry can't mask an open-then-dismiss bug.
      await expect(async () => {
        await page.getByRole('button', { name: 'New category' }).click({ timeout: 5_000 })
        await expect(dialog).toBeVisible({ timeout: 1000 })
      }).toPass({ timeout: 30_000 })

      // The EN pane's Name + Slug inputs prove the form body rendered, not just
      // an empty shell. (Placeholders are unique to the EN locale pane.)
      const enPane = dialog.locator('[data-locale-pane="en"]')
      await expect(enPane.getByPlaceholder('Books', { exact: true })).toBeVisible()
      await expect(enPane.getByPlaceholder('books', { exact: true })).toBeVisible()
    })

    expect(resolveWarnings, `Vue failed to resolve components:\n${resolveWarnings.join('\n')}`)
      .toEqual([])
  }
  finally {
    await api.dispose()
  }
})

// The full single-row lifecycle, driven entirely through the tree UI and
// cross-checked in pg at every step (asserting the admin list endpoint instead
// would let a broken writer and a broken reader cancel out).
test('category lifecycle: create, edit, move under a parent, delete', async ({ page }) => {
  test.setTimeout(240_000)

  const api = await ApiClient.create()
  const run = Date.now().toString(36)
  const parentSlug = `${SLUG_PREFIX}${run}-parent`
  const childSlug = `${SLUG_PREFIX}${run}-alpha`
  const childName = `E2E Cat Alpha ${run}`
  const renamedName = `E2E Cat Alpha Renamed ${run}`

  try {
    await api.purgeCategories(SLUG_PREFIX)
    const token = await signInAdmin(page, api)

    // Seeded via the API, not the UI: it is the *move target* and doubles as the
    // control row every absence assertion below leans on.
    const parent = await api.createCategory(token, {
      name: `E2E Cat Parent ${run}`,
      slug: parentSlug,
    })

    await gotoCategoriesAdmin(page)
    await expect(row(page, parent.id)).toBeVisible()

    let childId = 0

    await test.step('create writes both locales and the row joins the tree', async () => {
      const dialog = page.getByRole('dialog')
      await expect(async () => {
        await page.getByRole('button', { name: 'New category' }).click({ timeout: 5_000 })
        await expect(dialog).toBeVisible({ timeout: 1_000 })
      }).toPass({ timeout: 30_000 })

      const enPane = dialog.locator('[data-locale-pane="en"]')
      const enName = enPane.getByPlaceholder('Books', { exact: true })
      const enSlug = enPane.getByPlaceholder('books', { exact: true })
      await enName.fill(childName)
      // Blur the name and let its auto-derived slug LAND before typing our own.
      // Skipping this wedges the two together: `fill()` selects the field's
      // content and inserts, and Vue patches the derived value in between, so
      // the row is saved with `<derived><typed>` concatenated — a silent
      // wrong-slug pass, not an error.
      await enName.blur()
      await expect(enSlug).toHaveValue(`e2e-cat-alpha-${run}`)
      await enSlug.fill(childSlug)
      await expect(enSlug).toHaveValue(childSlug)

      // The PL pane is `v-show`-hidden until its tab is active — filling a
      // hidden input would fail, so switch tabs first.
      await dialog.getByRole('tab', { name: 'Polski' }).click()
      const plPane = dialog.locator('[data-locale-pane="pl"]')
      const plName = plPane.getByPlaceholder('Książki', { exact: true })
      const plSlug = plPane.getByPlaceholder('ksiazki', { exact: true })
      await plName.fill(`E2E Kat Alfa ${run}`)
      await plName.blur()
      await expect(plSlug).toHaveValue(`e2e-kat-alfa-${run}`)
      await plSlug.fill(`${childSlug}-pl`)
      await expect(plSlug).toHaveValue(`${childSlug}-pl`)

      await dialog.getByRole('button', { name: 'Save', exact: true }).click()
      await expectDialogClosed(dialog)

      const created = await api.getCategoryRow(childSlug)
      expect(created, 'the create modal must persist a categories row').not.toBeNull()
      expect(created!.name).toBe(childName)
      expect(created!.name_pl).toBe(`E2E Kat Alfa ${run}`)
      expect(created!.slug_pl).toBe(`${childSlug}-pl`)
      expect(created!.is_active).toBe(true)
      // The create modal never sends `parent_id` — nesting is the Move step.
      expect(created!.parent_id).toBeNull()
      childId = created!.id

      // The tree re-queries after the mutation: the new row renders at root.
      await expect(row(page, childId)).toBeVisible()
      await expect(rowHeader(page, childId)).toContainText(childName)
      await expect(rowHeader(page, childId)).toContainText(`/${childSlug}`)
    })

    await test.step('edit renames the row and deactivates it', async () => {
      const dialog = await openRowDialog(page, childId, 'Edit category')

      const enPane = dialog.locator('[data-locale-pane="en"]')
      await expect(enPane.getByPlaceholder('Books', { exact: true })).toHaveValue(childName)
      await enPane.getByPlaceholder('Books', { exact: true }).fill(renamedName)
      await dialog.getByRole('checkbox', { name: 'Active' }).uncheck()
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()
      await expectDialogClosed(dialog)

      const edited = await api.getCategoryRow(childSlug)
      expect(edited!.name).toBe(renamedName)
      expect(edited!.is_active).toBe(false)
      // Editing must not silently drop the PL translation.
      expect(edited!.name_pl).toBe(`E2E Kat Alfa ${run}`)

      await expect(rowHeader(page, childId)).toContainText(renamedName)
      await expect(rowHeader(page, childId)).toContainText('Inactive')
    })

    await test.step('move nests the row under the parent', async () => {
      const dialog = await openRowDialog(page, childId, 'Move under…')
      await dialog.getByRole('radio', { name: new RegExp(`E2E Cat Parent ${run}`) }).check()
      await dialog.getByRole('button', { name: 'Move', exact: true }).click()
      await expectDialogClosed(dialog)

      const moved = await api.getCategoryRow(childSlug)
      expect(moved!.parent_id).toBe(parent.id)

      // Rendered *inside* the parent's children list, one level deeper — the
      // structural re-sync a root-id-only comparison used to miss.
      await expect(
        row(page, parent.id).locator(`ul[data-children-list] li[data-category-id="${childId}"]`),
      ).toBeVisible()
      await expect(row(page, childId)).toHaveAttribute('data-depth', '1')
    })

    await test.step('delete removes the leaf and leaves the parent standing', async () => {
      const dialog = await openRowDialog(page, childId, 'Delete')
      // A leaf with no products: plain delete is the default and the only
      // enabled mode.
      await expect(dialog.getByRole('radio', { name: /Delete \(leaf only\)/ })).toBeChecked()
      await expect(dialog.getByRole('radio', { name: /Delete subtree/ })).toBeDisabled()
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
      await expectDialogClosed(dialog)

      expect(await api.getCategoryRow(childSlug)).toBeNull()
      await expect(row(page, childId)).toHaveCount(0)
      // The control row proves the tree still renders — an empty tree would
      // satisfy the absence assertion above on its own.
      await expect(row(page, parent.id)).toBeVisible()
    })
  }
  finally {
    await api.purgeCategories(SLUG_PREFIX)
    await api.dispose()
  }
})

// The delete-mode contract, which is where the destructive edges live:
// `reparent_to_root` lifts the direct children out before deleting, `cascade`
// takes the whole subtree with it.
test('delete modes: reparent lifts children to root, cascade removes the subtree', async ({ page }) => {
  test.setTimeout(240_000)

  const api = await ApiClient.create()
  const run = Date.now().toString(36)
  const parentSlug = `${SLUG_PREFIX}${run}-p`
  const childSlug = `${SLUG_PREFIX}${run}-c`
  const grandchildSlug = `${SLUG_PREFIX}${run}-g`
  const keeperSlug = `${SLUG_PREFIX}${run}-keep`

  try {
    await api.purgeCategories(SLUG_PREFIX)
    const token = await signInAdmin(page, api)

    const parent = await api.createCategory(token, {
      name: `E2E Cat P ${run}`,
      slug: parentSlug,
    })
    const child = await api.createCategory(token, {
      name: `E2E Cat C ${run}`,
      slug: childSlug,
      parentId: parent.id,
    })
    const grandchild = await api.createCategory(token, {
      name: `E2E Cat G ${run}`,
      slug: grandchildSlug,
      parentId: child.id,
    })
    // Untouched control row: every "row is gone" assertion below is only
    // meaningful while this one is still rendered.
    const keeper = await api.createCategory(token, {
      name: `E2E Cat Keeper ${run}`,
      slug: keeperSlug,
    })

    await gotoCategoriesAdmin(page)
    await expect(row(page, parent.id)).toBeVisible()
    await expect(row(page, keeper.id)).toBeVisible()

    await test.step('reparent_to_root lifts the direct child out, keeping its own subtree', async () => {
      const dialog = await openRowDialog(page, parent.id, 'Delete')
      // A parent is not a leaf, so plain delete is off the table — the guard
      // that stops an admin from orphaning a subtree with one click.
      await expect(dialog.getByRole('radio', { name: /Delete \(leaf only\)/ })).toBeDisabled()
      await dialog.getByRole('radio', { name: /Move children to root/ }).check()
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
      await expectDialogClosed(dialog)

      expect(await api.getCategoryRow(parentSlug)).toBeNull()
      // Only the DIRECT child is re-rooted; the grandchild stays under it.
      expect((await api.getCategoryRow(childSlug))!.parent_id).toBeNull()
      expect((await api.getCategoryRow(grandchildSlug))!.parent_id).toBe(child.id)

      await expect(row(page, parent.id)).toHaveCount(0)
      await expect(row(page, child.id)).toHaveAttribute('data-depth', '0')
    })

    await test.step('cascade deletes the row and every descendant', async () => {
      const dialog = await openRowDialog(page, child.id, 'Delete')
      // The label counts the descendants the confirm is about to take with it.
      await dialog.getByRole('radio', { name: /Delete subtree \(\+1 descendant\)/ }).check()
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
      await expectDialogClosed(dialog)

      expect(await api.getCategoryRow(childSlug)).toBeNull()
      expect(await api.getCategoryRow(grandchildSlug)).toBeNull()

      await expect(row(page, child.id)).toHaveCount(0)
      await expect(row(page, grandchild.id)).toHaveCount(0)
      await expect(row(page, keeper.id)).toBeVisible()
    })
  }
  finally {
    await api.purgeCategories(SLUG_PREFIX)
    await api.dispose()
  }
})

// Both tree filters are client-side over one full-tree query, so a broken
// predicate shows up as the wrong *set* of rows, never as a failed request.
// Each assertion therefore pairs a row that must disappear with one that must
// stay — a filter that matched nothing would pass an absence check alone.
test('tree filters narrow the tree by search and by active state', async ({ page }) => {
  test.setTimeout(240_000)

  const api = await ApiClient.create()
  const run = Date.now().toString(36)
  const alphaSlug = `${SLUG_PREFIX}${run}-alpha`
  const betaSlug = `${SLUG_PREFIX}${run}-beta`
  const gammaSlug = `${SLUG_PREFIX}${run}-gamma`

  try {
    await api.purgeCategories(SLUG_PREFIX)
    const token = await signInAdmin(page, api)

    const alpha = await api.createCategory(token, { name: `E2E Cat Alpha ${run}`, slug: alphaSlug })
    const beta = await api.createCategory(token, {
      name: `E2E Cat Beta ${run}`,
      slug: betaSlug,
      isActive: false,
    })
    const gamma = await api.createCategory(token, { name: `E2E Cat Gamma ${run}`, slug: gammaSlug })

    await gotoCategoriesAdmin(page)
    await expect(row(page, alpha.id)).toBeVisible()
    await expect(row(page, beta.id)).toBeVisible()
    await expect(row(page, gamma.id)).toBeVisible()

    await test.step('search matches the slug and hides the rest', async () => {
      // A slug fragment, not a name fragment: the predicate spans name + slug,
      // and only the slug is unique enough to isolate one row.
      await page.getByPlaceholder('Search categories').fill(`${run}-alpha`)

      await expect(row(page, alpha.id)).toBeVisible()
      await expect(row(page, beta.id)).toHaveCount(0)
      await expect(row(page, gamma.id)).toHaveCount(0)
      // Reordering a partial view would renumber sort_order over a subset, so
      // drag is disabled while filtered and the page says so.
      await expect(page.getByText('Reorder is disabled while filtering')).toBeVisible()
    })

    await test.step('the active filter selects on is_active', async () => {
      await page.getByPlaceholder('Search categories').fill('')
      await expect(row(page, gamma.id)).toBeVisible()

      await pickActiveFilter(page, 'Inactive only')
      await expect(row(page, beta.id)).toBeVisible()
      await expect(row(page, alpha.id)).toHaveCount(0)
      await expect(row(page, gamma.id)).toHaveCount(0)

      await pickActiveFilter(page, 'Active only')
      await expect(row(page, alpha.id)).toBeVisible()
      await expect(row(page, gamma.id)).toBeVisible()
      await expect(row(page, beta.id)).toHaveCount(0)

      await pickActiveFilter(page, 'All')
      await expect(row(page, alpha.id)).toBeVisible()
      await expect(row(page, beta.id)).toBeVisible()
      await expect(row(page, gamma.id)).toBeVisible()
      await expect(page.getByText('Reorder is disabled while filtering')).toBeHidden()
    })
  }
  finally {
    await api.purgeCategories(SLUG_PREFIX)
    await api.dispose()
  }
})
