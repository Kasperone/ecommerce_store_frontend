// Admin email campaigns (`/admin/campaigns`) — the one back-office surface that
// dispatches outward-facing email, and the last of the Tier 3 "content & config"
// CRUD pages with no coverage at all.
//
// Two tests:
//   1. the lifecycle — create a draft → try to schedule it WITHOUT a date (the
//      one invariant the page enforces client-side, mirroring the backend's
//      422) → schedule it properly → send it → delete it. Every step is
//      asserted against the `campaigns` row in pg, never the toast.
//   2. the status / audience / name-search filters.
//
// ⚠️ BLAST RADIUS. `POST /send` mails every address the audience resolves to.
// Both tests therefore use `audience='segment'` over a segment the run owns:
// test 1's resolves to the single ephemeral customer it registered, test 2's to
// a tag nobody holds (zero recipients). No spec here may use `all` / `customers`
// / `b2b`, which resolve to every user or company in the database.
//
// ⚠️ Filter assertions pin the table's DATA-ROW COUNT before reading a named
// row. A named row alone is unfalsifiable: `toBeVisible` is satisfied by the
// stale table Pinia Colada still shows while the new query is in flight, so a
// filter whose request never left the browser passes anyway.
import { expect, test, type Locator, type Page } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { fieldControl, selectOption } from '../helpers/nuxtUiSelect'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(240_000)

/**
 * A `UFormField`'s text input. `getByLabel` resolves the `for`/`id` pair (unlike
 * a select trigger, a `UInput` has no `aria-label` overriding it); the optional
 * `*` absorbs the required marker so one helper serves both kinds of field.
 */
function field(scope: Page | Locator, label: string): Locator {
  return scope.getByLabel(new RegExp(`^${label}\\s*\\*?$`))
}

test.describe('Admin email campaigns', () => {
  test('draft → schedule (rejected without a date) → send → delete', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const name = `E2E Campaign ${runId}`
    const subject = `Autumn drop — E2E ${runId}`
    const body = `<p>Seeded by the campaign-crud e2e run ${runId}.</p>`
    const segmentName = `E2E CampSeg ${runId}`
    const tagName = `e2e-camp-${runId}`
    const scheduledLocal = '2027-03-14T09:30'
    const recipient = randomEphemeralUser()
    let adminToken = ''
    let segmentId: number | null = null
    let tagId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken

      // Bound the blast radius: one ephemeral customer, tagged, behind a
      // segment. A send from this campaign can only ever reach that address.
      await api.register(recipient)
      await api.markVerified(recipient.email)
      const recipientId = await api.getUserId(recipient.email)
      tagId = await api.assignCustomerTag(adminToken, recipientId, tagName)
      const segment = await api.createSegmentWithTags(adminToken, {
        name: segmentName,
        tagIds: [tagId],
      })
      segmentId = segment.id
      expect((await api.previewSegment(adminToken, segmentId)).count).toBe(1)

      await page.context().addCookies([admin.refreshCookie])
      await page.goto('/admin/campaigns')
      await expect(page).toHaveURL(/\/admin\/campaigns/, { timeout: 60_000 })

      const dialog = page.getByRole('dialog')

      // ---- create a draft ----
      // The admin route cold-compiles; a click fired before hydration is lost
      // and the modal never opens. Re-click until a modal field appears.
      const newBtn = page.getByRole('button', { name: 'New campaign' })
      await expect(newBtn).toBeVisible({ timeout: 60_000 })
      await expect(async () => {
        await newBtn.click()
        await expect(field(dialog, 'Name')).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 90_000 })

      await field(dialog, 'Name').fill(name)
      await field(dialog, 'Subject').fill(subject)
      await field(dialog, 'Body').fill(body)
      await selectOption(page, dialog, 'Audience', 'Segment')
      // The segment picker only exists once the audience is `segment`, and it
      // resolves the recipient count through the live preview endpoint — proof
      // the campaign is aimed at the one address this run owns.
      await selectOption(page, dialog, 'Segment', segmentName)
      await expect(dialog.getByText('1 recipient', { exact: true })).toBeVisible({ timeout: 15_000 })
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()

      await expect.poll(
        async () => (await api.getCampaignRowByName(name))?.status,
        { timeout: 20_000 },
      ).toBe('draft')
      const created = await api.getCampaignRowByName(name)
      expect(created?.subject).toBe(subject)
      expect(created?.body).toBe(body)
      expect(created?.audience).toBe('segment')
      expect(created?.segment_id).toBe(segmentId)
      expect(created?.scheduled_at).toBeNull()
      expect(created?.sent_at).toBeNull()

      // ---- schedule without a date: refused ----
      const row = page.getByRole('row').filter({ hasText: name })
      await expect(row).toBeVisible({ timeout: 20_000 })
      const openEditor = async () => {
        await expect(async () => {
          await row.getByRole('button', { name: 'Edit' }).click()
          await expect(field(dialog, 'Name')).toHaveValue(name, { timeout: 2_000 })
        }).toPass({ timeout: 60_000 })
      }
      await openEditor()

      await selectOption(page, dialog, 'Status', 'Scheduled')
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(
        dialog.getByText('A scheduled date is required when the status is Scheduled.'),
      ).toBeVisible({ timeout: 15_000 })
      // The row must still be a draft — and "nothing was written" needs a
      // settled window, since an immediate pg read races the PATCH it claims
      // was never sent.
      await page.waitForTimeout(1_500)
      expect((await api.getCampaignRowByName(name))?.status).toBe('draft')

      // ---- schedule properly ----
      await field(dialog, 'Scheduled at').fill(scheduledLocal)
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()
      await expect.poll(
        async () => (await api.getCampaignRowByName(name))?.status,
        { timeout: 20_000 },
      ).toBe('scheduled')
      expect((await api.getCampaignRowByName(name))?.scheduled_at).not.toBeNull()

      // ---- send ----
      const sendHeading = page.getByText('Send campaign', { exact: true })
      await expect(async () => {
        await row.getByRole('button', { name: 'Send', exact: true }).click()
        await expect(sendHeading).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 30_000 })
      // The dialog states the stakes before dispatching.
      await expect(dialog.getByText('This sends real email')).toBeVisible()
      await dialog.getByRole('button', { name: 'Send now', exact: true }).click()

      await expect.poll(
        async () => (await api.getCampaignRowByName(name))?.status,
        { timeout: 30_000 },
      ).toBe('sent')
      expect((await api.getCampaignRowByName(name))?.sent_at).not.toBeNull()
      // A sent campaign can never be sent twice: the row swaps its Send button
      // for the Sent badge, leaving Edit + Delete.
      //
      // ⚠️ Counting the REMAINING buttons, not asserting the Send button is
      // gone. `row.getByRole('button', {name: 'Send'})).toHaveCount(0)` is
      // unfalsifiable: the table refetches after the send mutation, and while
      // the row is briefly absent the row-scoped locator resolves to nothing
      // and the assertion passes. Proven — a mutant that kept the Send button
      // on a sent campaign (`v-if="true"`) sailed through it.
      const actionButtons = row.locator('td').last().getByRole('button')
      await expect(actionButtons).toHaveCount(2, { timeout: 15_000 })
      // Two "Sent" badges by design — the status column and the one that
      // replaced the action button.
      await expect(row.getByText('Sent', { exact: true }).first()).toBeVisible()

      // ---- delete ----
      const deleteHeading = page.getByText('Delete campaign', { exact: true })
      await expect(async () => {
        await row.getByRole('button', { name: 'Delete' }).click()
        await expect(deleteHeading).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 30_000 })
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect.poll(
        async () => await api.getCampaignRowByName(name),
        { timeout: 20_000 },
      ).toBeNull()
      await expect(row).toHaveCount(0, { timeout: 15_000 })
    }
    finally {
      for (const id of await api.getCampaignIdsByNamePrefix(`E2E Campaign ${runId}`)) {
        await api.deleteCampaign(adminToken, id).catch(() => {})
      }
      if (segmentId != null) await api.deleteSegment(adminToken, segmentId).catch(() => {})
      if (tagId != null) await api.deleteTag(adminToken, tagId).catch(() => {})
      await api.dispose()
    }
  })

  test('status, audience and search narrow the campaign list', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const prefix = `E2E CampFilter ${runId}`
    const emptySegmentName = `E2E CampFilterSeg ${runId}`
    const emptyTagName = `e2e-campfilter-nobody-${runId}`
    const names: Record<string, string> = {}
    const campaignIds: number[] = []
    let adminToken = ''
    let segmentId: number | null = null
    let tagId: number | null = null

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken

      // Charlie has to reach `sent`, and the only way there is a real send — so
      // it fires at a segment built on a freshly minted tag that is attached to
      // NOBODY. The preview below is the guard that keeps it that way.
      tagId = await api.createTag(adminToken, emptyTagName)
      const segment = await api.createSegmentWithTags(adminToken, {
        name: emptySegmentName,
        tagIds: [tagId],
      })
      segmentId = segment.id
      expect((await api.previewSegment(adminToken, segmentId)).count).toBe(0)

      // Three campaigns differing in exactly one filterable dimension each,
      // sharing a name prefix so one search pins the working set.
      const seeds = [
        { label: 'Alpha', audience: 'customers' as const, status: 'draft' as const },
        {
          label: 'Bravo',
          audience: 'b2b' as const,
          status: 'scheduled' as const,
          scheduledAt: '2027-04-01T08:00:00',
        },
        { label: 'Charlie', audience: 'segment' as const, status: 'draft' as const, send: true },
      ]
      for (const seed of seeds) {
        const campaignName = `${prefix} ${seed.label}`
        names[seed.label] = campaignName
        const campaign = await api.createCampaignAsAdmin(adminToken, {
          name: campaignName,
          subject: `${seed.label} subject — E2E ${runId}`,
          audience: seed.audience,
          status: seed.status,
          scheduledAt: seed.scheduledAt,
          segmentId: seed.audience === 'segment' ? segmentId : undefined,
        })
        campaignIds.push(campaign.id)
        // Only ever on the zero-recipient segment campaign.
        if (seed.send) await api.sendCampaign(adminToken, campaign.id)
      }
      expect((await api.getCampaignRowByName(names['Charlie']!))?.status).toBe('sent')

      const rowFor = (label: string) => page.getByRole('row').filter({ hasText: names[label]! })
      // `tbody tr`, not `getByRole('row')` — the latter counts the header.
      const rows = page.locator('tbody tr')

      await page.context().addCookies([admin.refreshCookie])
      await page.goto('/admin/campaigns')
      await expect(page).toHaveURL(/\/admin\/campaigns/, { timeout: 60_000 })

      // Baseline: the shared prefix narrows the list to exactly these three.
      // The retry absorbs the post-cookie-injection hydration race (a `fill`
      // landing before Vue binds the handler is silently lost, and the
      // unfiltered list would still contain all three) and re-resolves the
      // control each pass, since the `UFormField` id is only guaranteed stable
      // within one render of the page.
      await expect(async () => {
        await (await fieldControl(page, 'Search')).fill(prefix)
        await expect(rows).toHaveCount(seeds.length, { timeout: 5_000 })
      }).toPass({ timeout: 90_000 })
      await expect(rowFor('Alpha')).toBeVisible()
      await expect(rowFor('Bravo')).toBeVisible()
      await expect(rowFor('Charlie')).toBeVisible()

      // Status: only the sent one survives. Charlie is the control that must
      // stay PRESENT — without it, a filter that dropped every row would pass.
      await selectOption(page, page, 'Status', 'Sent')
      await expect(rows).toHaveCount(1, { timeout: 15_000 })
      await expect(rowFor('Charlie')).toBeVisible()
      await expect(rowFor('Alpha')).toHaveCount(0)
      await expect(rowFor('Bravo')).toHaveCount(0)

      // Scheduled is the mirror: now Bravo is the control.
      await selectOption(page, page, 'Status', 'Scheduled')
      await expect(rows).toHaveCount(1, { timeout: 15_000 })
      await expect(rowFor('Bravo')).toBeVisible()
      await expect(rowFor('Alpha')).toHaveCount(0)
      await expect(rowFor('Charlie')).toHaveCount(0)

      // Audience is a second, independent axis over the same working set.
      await selectOption(page, page, 'Status', 'All')
      await expect(rows).toHaveCount(seeds.length, { timeout: 15_000 })
      await selectOption(page, page, 'Audience', 'Customers')
      await expect(rows).toHaveCount(1, { timeout: 15_000 })
      await expect(rowFor('Alpha')).toBeVisible()
      await expect(rowFor('Bravo')).toHaveCount(0)
      await expect(rowFor('Charlie')).toHaveCount(0)

      // Search narrows to one name on its own.
      await selectOption(page, page, 'Audience', 'All')
      await expect(rows).toHaveCount(seeds.length, { timeout: 15_000 })
      await (await fieldControl(page, 'Search')).fill(names['Bravo']!)
      await expect(rows).toHaveCount(1, { timeout: 15_000 })
      await expect(rowFor('Bravo')).toBeVisible()
    }
    finally {
      for (const id of campaignIds) await api.deleteCampaign(adminToken, id).catch(() => {})
      if (segmentId != null) await api.deleteSegment(adminToken, segmentId).catch(() => {})
      if (tagId != null) await api.deleteTag(adminToken, tagId).catch(() => {})
      await api.dispose()
    }
  })
})
