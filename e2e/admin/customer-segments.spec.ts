// Admin customers list filters + customer segments.
//
// Two slices, both driven from a pair of ephemeral customers the spec owns
// outright (never the seeded accounts — other specs mutate their tags and
// orders, so any assertion against them is a coin flip):
//
//   1. `/admin/customers` — the search and tag filters. Both are `useUrlFilters`
//      controls, so the URL is half the truth and the narrowed table is the
//      other half. Driven through the real controls rather than deep-linked:
//      FE #334 was a broken filter `set()` call that a deep-link spec would
//      have sailed straight past.
//
//   2. `/admin/segments` — a segment is not a saved list of people, it is a
//      closed typed predicate (`SegmentFilters`) resolved by set-based SQL. So
//      the spec builds a tag rule in the form, watches the live "Matches N
//      customers" counter settle on 1, saves, and then asserts BOTH the stored
//      `filters` JSON in pg AND that `GET /{id}/preview` resolves to exactly
//      the tagged customer. The UI counter alone proves the preview endpoint
//      runs; only the saved-segment preview proves the persisted predicate
//      still resolves — that is the step that would catch a resolver
//      regression.
//
// The unique-per-run tag is what makes "Matches 1 customer" a real number: no
// other customer in the E2E database can carry it.
import { expect, test, type Locator, type Page } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { selectOption } from '../helpers/nuxtUiSelect'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(120_000)

/**
 * Pick one option in the modal's multi-select tag menu.
 *
 * `selectOption` handles the open-click hydration race, but a `multiple`
 * `USelectMenu` keeps its listbox open after a pick — Escape closes it so the
 * portalled overlay stops covering the preview panel underneath.
 */
async function pickTag(page: Page, dialog: Locator, tagName: string): Promise<void> {
  await selectOption(page, dialog, 'Tags', tagName)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('option', { name: tagName, exact: true })).toBeHidden({
    timeout: 10_000,
  })
}

test.describe('Admin customers list + segments', () => {
  test('customers list narrows by search and by tag', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const tagName = `e2e-seg-list-${runId}`
    const tagged = randomEphemeralUser()
    const untagged = randomEphemeralUser()
    let tagId: number | null = null
    let adminToken: string | null = null

    try {
      await api.register(tagged)
      await api.markVerified(tagged.email)
      await api.register(untagged)
      await api.markVerified(untagged.email)
      const taggedId = await api.userIdByEmail(tagged.email)

      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      tagId = await api.assignCustomerTag(adminToken, taggedId, tagName)
      await page.context().addCookies([admin.refreshCookie])

      await page.goto('/admin/customers')
      await expect(page).toHaveURL(/\/admin\/customers/, { timeout: 30_000 })

      const search = page.getByPlaceholder('Email or name')
      await expect(search).toBeVisible({ timeout: 60_000 })

      // --- Search filter ---
      // Cookie-authed admin pages race hydration: a pre-hydration fill lands in
      // the DOM but never reaches `set()`, so retry until the URL proves the
      // filter was actually applied.
      // The router writes the raw value into the query string — `@` and `.` come
      // back unencoded, so match the literal email with only regex specials
      // escaped, not a percent-encoded one.
      const emailPattern = tagged.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      await expect(async () => {
        await search.fill(tagged.email)
        await expect(page).toHaveURL(new RegExp(`search=${emailPattern}`), { timeout: 3_000 })
      }).toPass({ timeout: 60_000 })

      await expect(page.getByText(tagged.email)).toBeVisible({ timeout: 20_000 })
      await expect(page.getByText(untagged.email)).toHaveCount(0, { timeout: 20_000 })

      // --- Tag filter ---
      // Clear the search first so the tag filter is the only thing narrowing
      // the list; otherwise a broken tag filter would still show one row.
      await search.fill('')
      await expect(page).not.toHaveURL(/search=/, { timeout: 20_000 })
      await expect(page.getByText(untagged.email)).toBeVisible({ timeout: 20_000 })

      await selectOption(page, page, 'Tag', tagName)
      await expect(page).toHaveURL(new RegExp(`tagId=${tagId}`), { timeout: 20_000 })
      await expect(page.getByText(tagged.email)).toBeVisible({ timeout: 20_000 })
      await expect(page.getByText(untagged.email)).toHaveCount(0, { timeout: 20_000 })
    }
    finally {
      if (adminToken && tagId) await api.deleteTag(adminToken, tagId)
      await api.dispose()
    }
  })

  test('a tag rule resolves to exactly the tagged customer', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const tagName = `e2e-seg-rule-${runId}`
    const segmentName = `E2E segment ${runId}`
    const member = randomEphemeralUser()
    const outsider = randomEphemeralUser()
    let tagId: number | null = null
    let segmentId: number | null = null
    let adminToken: string | null = null

    try {
      await api.register(member)
      await api.markVerified(member.email)
      await api.register(outsider)
      await api.markVerified(outsider.email)
      const memberId = await api.userIdByEmail(member.email)

      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      tagId = await api.assignCustomerTag(adminToken, memberId, tagName)
      await page.context().addCookies([admin.refreshCookie])

      await page.goto('/admin/segments')
      await expect(page).toHaveURL(/\/admin\/segments/, { timeout: 30_000 })

      const newSegment = page.getByRole('button', { name: 'New segment' })
      await expect(newSegment).toBeVisible({ timeout: 60_000 })

      // The modal is the first interaction on a cookie-authed page — retry the
      // open click until the dialog actually mounts.
      const dialog = page.getByRole('dialog')
      await expect(async () => {
        await newSegment.click()
        await expect(dialog).toBeVisible({ timeout: 3_000 })
      }).toPass({ timeout: 60_000 })

      await dialog.getByLabel(/^Name/).fill(segmentName)
      await pickTag(page, dialog, tagName)

      // The counter is debounced 400ms behind every filter change, so poll it.
      // Copy is a pluralised i18n string — assert the rendered singular, which
      // only appears when the resolver returned exactly one match.
      await expect(dialog.getByText('Matches 1 customer', { exact: true })).toBeVisible({
        timeout: 30_000,
      })
      await expect(dialog.getByText(member.email)).toBeVisible({ timeout: 10_000 })

      await dialog.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.getByText('Segment created.').first()).toBeVisible({ timeout: 20_000 })

      // --- What the backend actually stored ---
      const row = await api.getSegmentRowByName(segmentName)
      expect(row, `no segment row named "${segmentName}"`).not.toBeNull()
      segmentId = row!.id
      expect(row!.is_active).toBe(true)
      // The form's `buildFilters()` omits empty keys, but the backend stores a
      // full `SegmentFilters` dump — every unset field materialises as an
      // explicit null. Assert the whole object so a stray extra key (the schema
      // is `extra="forbid"`) or a leaked default would fail here.
      expect(row!.filters).toEqual({
        tag_ids: [tagId],
        tag_match: 'any',
        min_order_count: null,
        max_order_count: null,
        min_total_spent: null,
        currency: null,
        last_order_after: null,
        last_order_before: null,
        country: null,
        role: null,
      })

      // --- What the persisted predicate resolves to ---
      const resolved = await api.previewSegment(adminToken, segmentId)
      expect(resolved.count).toBe(1)
      expect(resolved.sample.map(c => c.email)).toEqual([member.email])
      expect(resolved.sample.map(c => c.email)).not.toContain(outsider.email)
    }
    finally {
      if (adminToken && segmentId) await api.deleteSegment(adminToken, segmentId)
      if (adminToken && tagId) await api.deleteTag(adminToken, tagId)
      await api.dispose()
    }
  })
})
