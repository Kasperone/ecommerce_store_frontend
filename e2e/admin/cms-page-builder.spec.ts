// Admin CMS page builder (`/admin/pages`, `/admin/pages/[id]`) — the
// draft/published split, which is the only *computed* contract on this surface
// (everything else is a CRUD round-trip over a JSONB blob).
//
// The invariant the whole feature rests on: `draft_layout` is what admins edit,
// `published_layout` is what the storefront serves, and the two only converge at
// publish. Three things follow from it, and each is a separate way to ship a
// half-edited page to customers if it regresses:
//
//   1. saving a draft NEVER touches the live layout,
//   2. publishing snapshots the draft into an append-only `page_versions` row
//      and swaps it live,
//   3. rollback restores a version into the DRAFT ONLY — the live page keeps
//      serving whatever was published until the admin re-publishes.
//
// Two tests:
//   1. the full lifecycle through the editor UI (create → add a Hero section →
//      save → publish v1 → edit → publish v2 → restore v1), pg-asserted at every
//      step.
//   2. the storefront half of the same invariant: an API-seeded page whose draft
//      has moved on still renders its PUBLISHED heading on `/{slug}`.
//
// ⚠️ Assertions read the JSONB columns from pg, not the API response: the
// response model expands a section's settings with an explicit `null` for every
// unset field, so a body-based assertion tests the serialiser, not the store.
//
// Deliberately NOT covered: the visual (drag) canvas — reorder-by-drag is the
// one interaction here that is genuinely flaky to drive, and the ordering
// contract it exercises is the same JSONB array the form mode writes; the
// preview-token route (a signed short-lived token whose consumption is a public
// read path, not a builder concern); and image/product picker fields (they reach
// R2 and the catalog respectively).
import { expect, test, type Locator, type Page } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { selectOption } from '../helpers/nuxtUiSelect'
import { KNOWN_ADMIN } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(240_000)

/** The heading of a stored layout's first section, or `undefined`. */
function heading(
  layout: { sections: Array<{ settings: Record<string, unknown> }> } | null,
): unknown {
  return layout?.sections[0]?.settings?.heading
}

/** The Hero block's `Heading` text input in the settings pane. */
function headingField(page: Page): Locator {
  return page.getByLabel('Heading', { exact: true })
}

test.describe('Admin CMS page builder', () => {
  test('create → publish → edit draft → publish again → restore a version', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const slug = `e2e-cms-${runId}`
    const v1Heading = `E2E live heading ${runId}`
    const v2Heading = `E2E second heading ${runId}`
    let adminToken = ''
    let pageId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      await page.context().addCookies([admin.refreshCookie])

      await page.goto('/admin/pages')
      await expect(page).toHaveURL(/\/admin\/pages/, { timeout: 60_000 })

      const dialog = page.getByRole('dialog')

      // ---- create (the Type select is DRIVEN, not left at its default) ----
      // `createState.type` defaults to 'standard', so picking it would prove
      // nothing about the binding; 'Landing' + the pg assertion below does.
      const newPageBtn = page.getByRole('button', { name: 'New page' })
      await expect(newPageBtn).toBeVisible({ timeout: 60_000 })
      await expect(async () => {
        await newPageBtn.click()
        await expect(dialog.getByRole('textbox')).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 90_000 })

      await dialog.getByLabel(/^Slug\s*\*?$/).fill(slug)
      await selectOption(page, dialog, 'Type', 'Landing')
      await dialog.getByRole('button', { name: 'Create', exact: true }).click()

      // Creating navigates straight into the editor for the new page. It is a
      // CLIENT-side navigation, so the URL only moves once the route chunk has
      // loaded. On a cold dev server that load used to discover `vuedraggable`
      // and full-reload the tab back onto /admin/pages, dropping the navigation
      // for good (no timeout was ever enough). nuxt.config.ts pre-bundles it now.
      await expect(page).toHaveURL(/\/admin\/pages\/\d+/, { timeout: 60_000 })
      const created = await api.getPageRow(slug)
      expect(created).not.toBeNull()
      pageId = created!.id
      expect(created!.type).toBe('landing')
      expect(created!.status).toBe('draft')
      expect(created!.draft_layout.sections).toEqual([])
      expect(created!.published_layout).toBeNull()

      // ---- add a Hero section and give it a heading ----
      const sectionsPane = page.locator('section').filter({
        has: page.getByRole('heading', { name: 'Sections', exact: true }),
      })
      await expect(sectionsPane).toBeVisible({ timeout: 60_000 })
      await expect(async () => {
        await sectionsPane.getByRole('button', { name: 'Add', exact: true }).click()
        await expect(page.getByRole('list', { name: 'Add a section' })).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 60_000 })

      // Each preset button renders the preset name over the block name, so its
      // accessible name is "Hero Hero" — filter the list item instead.
      await page.getByRole('list', { name: 'Add a section' })
        .locator('li')
        .filter({ hasText: 'Hero' })
        .getByRole('button')
        .click()

      // Picking a preset selects the new section, so its settings form is live.
      await expect(headingField(page)).toBeVisible({ timeout: 20_000 })
      await headingField(page).fill(v1Heading)

      // ---- save the draft: the live layout must stay untouched ----
      await page.getByRole('button', { name: 'Save draft' }).click()
      await expect.poll(
        async () => heading((await api.getPageRow(slug))!.draft_layout),
        { timeout: 20_000 },
      ).toBe(v1Heading)

      const afterSave = await api.getPageRow(slug)
      expect(afterSave!.status).toBe('draft')
      expect(afterSave!.published_layout).toBeNull()
      expect(afterSave!.published_version_id).toBeNull()
      expect(await api.getPageVersionRows(pageId)).toHaveLength(0)

      // ---- publish v1 ----
      const toolbar = page.locator('header')
      await toolbar.getByRole('button', { name: 'Publish', exact: true }).click()
      const publishDialog = dialog.filter({ hasText: 'Publish page' })
      await expect(publishDialog).toBeVisible({ timeout: 20_000 })
      await publishDialog.getByLabel('Version label', { exact: true }).fill('first cut')
      await publishDialog.getByRole('button', { name: 'Publish', exact: true }).click()

      await expect.poll(
        async () => (await api.getPageRow(slug))!.status,
        { timeout: 20_000 },
      ).toBe('published')

      const afterPublish = await api.getPageRow(slug)
      expect(heading(afterPublish!.published_layout)).toBe(v1Heading)
      const versionsV1 = await api.getPageVersionRows(pageId)
      expect(versionsV1).toHaveLength(1)
      expect(versionsV1[0].version_no).toBe(1)
      expect(versionsV1[0].label).toBe('first cut')
      expect(heading(versionsV1[0].layout)).toBe(v1Heading)
      expect(afterPublish!.published_version_id).toBe(versionsV1[0].id)

      // ---- edit the draft: live must NOT follow ----
      await expect(headingField(page)).toBeVisible({ timeout: 20_000 })
      await headingField(page).fill(v2Heading)
      await page.getByRole('button', { name: 'Save draft' }).click()
      await expect.poll(
        async () => heading((await api.getPageRow(slug))!.draft_layout),
        { timeout: 20_000 },
      ).toBe(v2Heading)

      const diverged = await api.getPageRow(slug)
      expect(heading(diverged!.published_layout)).toBe(v1Heading)
      expect(await api.getPageVersionRows(pageId)).toHaveLength(1)

      // ---- publish v2 ----
      await toolbar.getByRole('button', { name: 'Publish', exact: true }).click()
      await expect(publishDialog).toBeVisible({ timeout: 20_000 })
      await publishDialog.getByLabel('Version label', { exact: true }).fill('second cut')
      await publishDialog.getByRole('button', { name: 'Publish', exact: true }).click()

      await expect.poll(
        async () => (await api.getPageVersionRows(pageId!)).length,
        { timeout: 20_000 },
      ).toBe(2)
      const versionsV2 = await api.getPageVersionRows(pageId)
      expect(versionsV2.map(v => v.version_no)).toEqual([1, 2])
      expect(versionsV2[1].label).toBe('second cut')
      expect(heading((await api.getPageRow(slug))!.published_layout)).toBe(v2Heading)

      // ---- restore v1: DRAFT only, live stays on v2 ----
      await toolbar.getByRole('button', { name: 'History' }).click()
      const historyDialog = dialog.filter({ hasText: 'Version history' })
      await expect(historyDialog).toBeVisible({ timeout: 20_000 })
      await expect(historyDialog.locator('li')).toHaveCount(2)
      await historyDialog.locator('li')
        .filter({ hasText: 'Version 1' })
        .getByRole('button', { name: 'Restore' })
        .click()

      await expect.poll(
        async () => heading((await api.getPageRow(slug))!.draft_layout),
        { timeout: 20_000 },
      ).toBe(v1Heading)

      const afterRollback = await api.getPageRow(slug)
      // The point of the whole test: rolling back does not un-publish anything.
      expect(heading(afterRollback!.published_layout)).toBe(v2Heading)
      expect(afterRollback!.status).toBe('published')
      expect(afterRollback!.published_version_id).toBe(versionsV2[1].id)
      // Versions are append-only — a rollback must not rewrite or drop one.
      const versionsAfter = await api.getPageVersionRows(pageId)
      expect(versionsAfter.map(v => [v.version_no, v.label])).toEqual([[1, 'first cut'], [2, 'second cut']])
      expect(heading(versionsAfter[0].layout)).toBe(v1Heading)
      expect(heading(versionsAfter[1].layout)).toBe(v2Heading)
    }
    finally {
      if (pageId !== null && adminToken) await api.deletePage(adminToken, pageId)
      await api.dispose()
    }
  })

  test('the storefront serves the published layout, never the newer draft', async ({ page }) => {
    const api = await ApiClient.create()
    const runId = Date.now()
    const slug = `e2e-cms-live-${runId}`
    const publishedHeading = `E2E published ${runId}`
    const draftHeading = `E2E unpublished draft ${runId}`
    let adminToken = ''
    let pageId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken

      // Seeded through the API: this test is about what the PUBLIC route
      // serves, and the editing half is already covered above.
      const created = await api.createPage(adminToken, {
        slug,
        sections: [{ type: 'hero', settings: { heading: publishedHeading } }],
      })
      pageId = created.id
      await api.publishPage(adminToken, pageId, 'live')
      await api.savePageDraft(adminToken, pageId, [
        { type: 'hero', settings: { heading: draftHeading } },
      ])

      const seeded = await api.getPageRow(slug)
      expect(heading(seeded!.published_layout)).toBe(publishedHeading)
      expect(heading(seeded!.draft_layout)).toBe(draftHeading)

      await page.goto(`/${slug}`)
      // The published heading renders; the draft one is nowhere on the page.
      await expect(page.getByText(publishedHeading)).toBeVisible({ timeout: 60_000 })
      await expect(page.getByText(draftHeading)).toHaveCount(0)
    }
    finally {
      if (pageId !== null && adminToken) await api.deletePage(adminToken, pageId)
      await api.dispose()
    }
  })
})
