// Admin Translations workspace (`/admin/translations`) — the digest lifecycle.
//
// The workspace is a Shopify "Translate & Adapt"-style surface over the
// per-locale `*_pl` columns. Its CRUD half is uninteresting; the half worth a
// spec is **outdated detection**, which is not stored state but a *computed*
// one: saving a translation stamps a SHA-256 digest of the English source into
// the `translation_meta` sidecar, and a field is "Needs review" precisely when
// that stored digest no longer matches a rehash of the live source. Nothing
// writes the flag — it falls out of a comparison — so the only way to break it
// is to stamp the wrong digest, at the wrong time, for the wrong field.
//
// Both tests therefore assert the sidecar in pg, not just the badge. The
// segments spec taught the lesson the hard way: a broken writer paired with a
// broken reader cancels out, and the UI stays green. Here the digests are
// compared *across steps* ("this one moved", "this one did not") rather than
// recomputed, so the assertions survive a change of hash function.
//
// Two slices:
//
//   1. The full round trip through the real UI — translate a product, move its
//      English source underneath it, watch it turn "Needs review", reconcile it.
//      Includes a two-sided check of the status filter (the row must be absent
//      under "Untranslated" and present under "Needs review"): a filter that
//      quietly returned everything would pass a one-sided assertion.
//
//   2. The subtle one — re-saving *one* field must not silently reconcile a
//      *sibling* that is genuinely stale. `update_resource` skips fields whose
//      value did not change, which is what preserves the pending flag; a writer
//      that re-stamped every submitted field would clear a real translator TODO
//      and nobody would ever see it.
//
// Fixtures are a product the spec creates and deletes, so the unique-per-run
// name makes every row/count assertion unambiguous.
import { expect, test, type Locator, type Page } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(120_000)

/**
 * The editor modal renders one block per registry field, in registry order —
 * for a product: name, description, meta_title, meta_description. The field
 * label is a plain `<p>`, *not* a `<label for>`, so `getByLabel()` matches
 * nothing and the textboxes have no accessible name at all. Index into them.
 *
 * The index is safe because it is proven downstream rather than assumed: what
 * each fill lands on is checked against the `name_pl` / `description_pl`
 * columns in pg, which would fail loudly if the order ever shifted.
 */
const FIELD_INDEX = { name: 0, description: 1 } as const

function fieldInput(dialog: Locator, key: keyof typeof FIELD_INDEX): Locator {
  return dialog.getByRole('textbox').nth(FIELD_INDEX[key])
}

/**
 * Pick a value in the status filter.
 *
 * It is a bare `USelect` with no `UFormField` around it, so the shared
 * `selectOption` helper — which resolves a select through its `<label for>` —
 * cannot see it. A plain `USelect` does expose `role="combobox"` (unlike a
 * `USelectMenu`, whose trigger is a `<button aria-label="Show popup">`), but
 * with no label there is no accessible name to match on, and the page's other
 * combobox is the language picker. The only discriminator is the currently
 * selected value the trigger renders as its text.
 *
 * The open click is retried for the usual reason: on a cookie-authed admin page
 * the first click can land before Vue binds the handler, taking focus without
 * opening anything and reporting no error.
 */
async function pickStatus(page: Page, current: string, next: string): Promise<void> {
  const trigger = page.getByRole('combobox').filter({ hasText: current })
  const option = page.getByRole('option', { name: next, exact: true })
  await expect(async () => {
    if (!(await option.isVisible())) await trigger.click()
    await expect(option).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await option.click()
  await expect(option).toBeHidden({ timeout: 10_000 })
}

/**
 * Land on the workspace, switch to the Products tab, and narrow the list with
 * the search box.
 *
 * The tab and the search box are driven as real controls rather than deep-linked
 * through the query string. FE #334 was a filter whose `set()` call was simply
 * wrong; a spec that navigated straight to `?type=product&q=…` would have
 * sailed past it. Asserting the URL after each interaction is what proves the
 * control actually reached `useUrlFilters` instead of only painting the DOM.
 */
async function showTranslations(page: Page, searchTerm: string): Promise<void> {
  await page.goto('/admin/translations')
  await expect(page).toHaveURL(/\/admin\/translations/, { timeout: 30_000 })

  const productsTab = page.getByRole('tab', { name: /^Products/ })
  await expect(productsTab).toBeVisible({ timeout: 60_000 })
  await expect(async () => {
    await productsTab.click()
    await expect(page).toHaveURL(/type=product/, { timeout: 3_000 })
  }).toPass({ timeout: 60_000 })

  // Search terms here are deliberately space-free so they round-trip through the
  // query string untouched and the URL assertion needs no encoding guesswork.
  const search = page.getByPlaceholder('Search by name')
  await expect(search).toBeVisible({ timeout: 30_000 })
  await expect(async () => {
    await search.fill(searchTerm)
    await expect(page).toHaveURL(new RegExp(`q=${searchTerm}`), { timeout: 3_000 })
  }).toPass({ timeout: 60_000 })
}

/** The one table row for a product, by its unique-per-run name. */
function productRow(page: Page, productName: string): Locator {
  return page.getByRole('row').filter({ hasText: productName })
}

/** Open a row's editor modal, retrying the click through hydration. */
async function openEditor(page: Page, row: Locator): Promise<Locator> {
  const dialog = page.getByRole('dialog')
  await expect(async () => {
    await row.getByRole('button', { name: 'Edit' }).click()
    await expect(dialog).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 60_000 })
  return dialog
}

test.describe('Admin translations workspace', () => {
  test('saving a translation stamps its digest; moving the English source flags it for review', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    // A shared, space-free prefix so one search returns both the product under
    // test and its control.
    const prefix = `E2E-TR-${runId}`
    const enName = `${prefix}-A`
    const controlName = `${prefix}-B`
    const enDescription = `English description ${runId}`
    const plName = `Polska nazwa ${runId}`
    const plDescription = `Polski opis ${runId}`
    let productId: number | null = null
    let controlId: number | null = null
    let adminToken: string | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const created = await api.createProduct(admin.accessToken, {
        name: enName,
        slug: `e2e-tr-${runId}-a`,
        price_usd: 10,
        price_pln: 40,
        price_eur: 9,
        stock: 5,
        description: enDescription,
      })
      productId = created.id
      // The control is never translated. It is what makes each status filter
      // falsifiable: on the side where the product under test must be absent,
      // the control must be *present*, so the assertion cannot be satisfied by
      // an empty table mid-refetch. (Both a "row is gone" and an "empty state
      // is showing" assertion pass during the blank moment after a query key
      // changes — mutation-testing caught both.)
      const control = await api.createProduct(admin.accessToken, {
        name: controlName,
        slug: `e2e-tr-${runId}-b`,
        price_usd: 10,
        price_pln: 40,
        price_eur: 9,
        stock: 5,
        description: `Control description ${runId}`,
      })
      controlId = control.id
      await page.context().addCookies([admin.refreshCookie])

      // --- Untranslated ---
      // Only source-present fields count as applicable, so a product with a
      // name and a description (and no SEO copy) is "0 of 2", never "0 of 4".
      let row = productRow(page, enName)
      await showTranslations(page, prefix)
      await expect(row).toHaveCount(1, { timeout: 30_000 })
      await expect(row.getByText('0 of 2 translated')).toBeVisible({ timeout: 20_000 })
      await expect(row.getByText('Incomplete')).toBeVisible({ timeout: 10_000 })

      // --- Translate it through the modal ---
      let dialog = await openEditor(page, row)
      // The English source sits read-only beside each field; the description's
      // is unique text, so seeing it proves the source pane is really populated
      // (the name also appears in the modal header, so it is a weaker probe).
      const sourcePane = dialog.getByText(enDescription, { exact: true })
      await expect(sourcePane).toBeVisible({ timeout: 10_000 })

      await fieldInput(dialog, 'name').fill(plName)
      await fieldInput(dialog, 'description').fill(plDescription)
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(dialog).toBeHidden({ timeout: 20_000 })

      // The save invalidates the list query, so the row refreshes in place.
      await expect(row.getByText('2 of 2 translated')).toBeVisible({ timeout: 20_000 })
      await expect(row.getByText('Complete')).toBeVisible({ timeout: 10_000 })

      // --- What actually landed in the columns and the sidecar ---
      const columns = await api.getProductTranslationColumns(productId)
      expect(columns.name_pl).toBe(plName)
      expect(columns.description_pl).toBe(plDescription)

      const stamped = await api.getTranslationDigests('product', productId)
      // Exactly the two translated fields get a digest row — the blank SEO
      // fields are submitted by the modal as empty strings and must not stamp.
      expect(Object.keys(stamped).sort()).toEqual(['description', 'name'])

      // --- Move the English source underneath the translation ---
      const rewritten = `${enDescription} REWRITTEN`
      await api.updateProduct(admin.accessToken, productId, { description: rewritten })

      // The edit happened outside the app, so nothing invalidated the cache.
      await page.reload()
      row = productRow(page, enName)
      const controlRow = productRow(page, controlName)
      await expect(row.getByText('Needs review')).toBeVisible({ timeout: 60_000 })
      // Still complete: every field has a translation, one is merely stale.
      await expect(row.getByText('2 of 2 translated')).toBeVisible({ timeout: 20_000 })

      // --- The status filter is a server-side predicate, so check both sides ---
      // Each side is anchored on a row that must be *there*: the control proves
      // the list has settled with real data, and only then does the absence of
      // the other row mean anything.
      await pickStatus(page, 'All', 'Untranslated')
      await expect(page).toHaveURL(/status=missing/, { timeout: 20_000 })
      await expect(controlRow).toHaveCount(1, { timeout: 20_000 })
      await expect(row).toHaveCount(0)

      await pickStatus(page, 'Untranslated', 'Needs review')
      await expect(page).toHaveURL(/status=outdated/, { timeout: 20_000 })
      await expect(row).toHaveCount(1, { timeout: 20_000 })
      await expect(controlRow).toHaveCount(0)

      // --- Reconcile it ---
      dialog = await openEditor(page, row)
      // Exactly one field is stale, and the source pane shows the *new* English.
      await expect(dialog.getByText('Source changed')).toHaveCount(1, { timeout: 10_000 })
      await expect(dialog.getByText(rewritten, { exact: true })).toBeVisible({ timeout: 10_000 })

      await fieldInput(dialog, 'description').fill(`${plDescription} poprawiony`)
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(dialog).toBeHidden({ timeout: 20_000 })

      // Back to "All", where both rows are present — a settled list — and the
      // badge is simply gone from the reconciled one.
      await pickStatus(page, 'Needs review', 'All')
      await expect(page).not.toHaveURL(/status=/, { timeout: 20_000 })
      await expect(controlRow).toHaveCount(1, { timeout: 20_000 })
      await expect(row.getByText('2 of 2 translated')).toBeVisible({ timeout: 20_000 })
      await expect(row.getByText('Needs review')).toHaveCount(0)

      const reconciled = await api.getTranslationDigests('product', productId)
      expect(reconciled.description).not.toBe(stamped.description)
      expect(reconciled.name).toBe(stamped.name)
    }
    finally {
      if (controlId && adminToken) await api.deleteProduct(adminToken, controlId).catch(() => {})
      if (productId && adminToken) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })

  test('editing one field leaves a sibling field still flagged for review', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const enName = `E2E-TRSIB-${runId}`
    const enDescription = `Sibling description ${runId}`
    const plName = `Polska nazwa ${runId}`
    const plDescription = `Polski opis ${runId}`
    let productId: number | null = null
    let adminToken: string | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const created = await api.createProduct(admin.accessToken, {
        name: enName,
        slug: `e2e-trsib-${runId}`,
        price_usd: 10,
        price_pln: 40,
        price_eur: 9,
        stock: 5,
        description: enDescription,
      })
      productId = created.id

      // Set up the starting state over the API — the UI save path is covered by
      // the first test, and what this one is about begins after the flag exists.
      await api.setTranslations(admin.accessToken, 'product', productId, {
        name: plName,
        description: plDescription,
      })
      const before = await api.getTranslationDigests('product', productId)
      expect(Object.keys(before).sort()).toEqual(['description', 'name'])

      // Only the description's source moves, so only it goes stale.
      await api.updateProduct(admin.accessToken, productId, {
        description: `${enDescription} REWRITTEN`,
      })
      await page.context().addCookies([admin.refreshCookie])

      await showTranslations(page, enName)
      const row = productRow(page, enName)
      await expect(row).toHaveCount(1, { timeout: 30_000 })
      await expect(row.getByText('Needs review')).toBeVisible({ timeout: 30_000 })

      const dialog = await openEditor(page, row)
      await expect(dialog.getByText('Source changed')).toHaveCount(1, { timeout: 10_000 })

      // Edit the *name* only. The modal always submits every field, so the
      // description arrives unchanged — the backend must recognise that and
      // leave its stamped digest alone.
      await fieldInput(dialog, 'name').fill(`${plName} v2`)
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(dialog).toBeHidden({ timeout: 20_000 })

      // The translator's TODO survives the unrelated edit.
      await expect(row.getByText('Needs review')).toBeVisible({ timeout: 30_000 })

      const after = await api.getTranslationDigests('product', productId)
      // The whole point: the description digest still describes the *old*
      // source. A writer that re-stamped every submitted field would move it
      // here and silently mark a stale translation as reconciled.
      expect(after.description).toBe(before.description)
      expect(after.name).toBe(before.name)

      const columns = await api.getProductTranslationColumns(productId)
      expect(columns.name_pl).toBe(`${plName} v2`)
      expect(columns.description_pl).toBe(plDescription)
    }
    finally {
      if (productId && adminToken) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
