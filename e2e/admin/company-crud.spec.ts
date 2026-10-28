// Admin company directory (`/admin/companies`) — the B2B account back-office.
// The *money* legs that hang off a company (price lists, net terms, quote
// conversion) each have their own spec; what was unspecced is the directory
// itself: creating an account, editing it (including binding its primary
// contact), deleting it, and the list's status/search filters.
//
// Two tests:
//   1. create → edit (rename, re-status, bind a primary contact) → delete,
//      every step asserted against the `companies` row in pg rather than the
//      toast or the admin list endpoint — a broken writer and a broken reader
//      would cancel out, and the flashes only prove a mutation resolved.
//      The delete leg also proves *Cancel* does nothing: the modal is checked
//      shut and the row re-read after a settled window, because an immediate
//      re-read races the DELETE it claims did not happen.
//   2. the status filter and the name/tax-id search.
//
// ⚠️ Every filter assertion pairs an ABSENCE with a row that must be PRESENT.
// An absence assertion alone is unfalsifiable on a Pinia Colada table: changing
// the query key clears `data`, so the table is briefly empty and `toHaveCount(0)`
// passes against a filter that ignores its argument entirely.
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

test.describe('Admin company directory', () => {
  test('create → edit (rename, status, primary contact) → delete', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const name = `E2E Company ${runId}`
    const renamed = `${name} Renamed`
    const taxId = `PL${runId}`
    const email = `billing-${runId}@e2e.example.com`
    const phone = '+48 555 010 020'
    const accountManager = `AM ${runId}`
    const notes = `Seeded by the company-crud e2e run ${runId}.`
    const contact = randomEphemeralUser()
    let adminToken = ''

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      // The primary contact must be a real customer — the picker searches the
      // existing `GET /admin/customers?search=` rather than a bespoke endpoint.
      await api.register(contact)
      await api.markVerified(contact.email)
      const contactUserId = await api.getUserId(contact.email)

      await page.context().addCookies([admin.refreshCookie])
      await page.goto('/admin/companies')
      await expect(page).toHaveURL(/\/admin\/companies/, { timeout: 60_000 })

      const dialog = page.getByRole('dialog')

      // ---- create ----
      // The admin route cold-compiles; a click fired before hydration is lost
      // and the modal never opens. Re-click until a modal field appears.
      const newBtn = page.getByRole('button', { name: 'New company' })
      await expect(newBtn).toBeVisible({ timeout: 60_000 })
      await expect(async () => {
        await newBtn.click()
        await expect(field(dialog, 'Name')).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 90_000 })

      await field(dialog, 'Name').fill(name)
      await field(dialog, 'Tax ID').fill(taxId)
      await field(dialog, 'Email').fill(email)
      await field(dialog, 'Phone').fill(phone)
      await field(dialog, 'Account manager').fill(accountManager)
      await field(dialog, 'Notes').fill(notes)
      await selectOption(page, dialog, 'Status', 'Approved')
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()

      // pg is the ground truth. Every field the form claims to send is checked,
      // including the ones the table never renders (phone, notes).
      await expect.poll(
        async () => (await api.getCompanyRowByName(name))?.status,
        { timeout: 20_000 },
      ).toBe('approved')
      const created = await api.getCompanyRowByName(name)
      expect(created).not.toBeNull()
      expect(created?.tax_id).toBe(taxId)
      expect(created?.email).toBe(email)
      expect(created?.phone).toBe(phone)
      expect(created?.account_manager).toBe(accountManager)
      expect(created?.notes).toBe(notes)
      expect(created?.primary_user_id).toBeNull()

      // ---- edit: rename, re-status, bind the primary contact ----
      const row = page.getByRole('row').filter({ hasText: name })
      await expect(row).toBeVisible({ timeout: 20_000 })
      await expect(async () => {
        await row.getByRole('button', { name: 'Edit' }).click()
        await expect(field(dialog, 'Name')).toHaveValue(name, { timeout: 2_000 })
      }).toPass({ timeout: 60_000 })

      await field(dialog, 'Name').fill(renamed)
      await selectOption(page, dialog, 'Status', 'Rejected')

      // The contact picker is a searchable `USelectMenu` (portalled listbox,
      // 250 ms-debounced remote search), so both the open click and the search
      // round-trip are retried rather than awaited blind.
      const contactOption = page.getByRole('option', { name: contact.email, exact: true })
      await expect(async () => {
        if (!(await contactOption.isVisible())) {
          await dialog.locator('[data-testid="company-primary-contact"]').click()
        }
        await page.getByPlaceholder('Search customers by email or name').fill(contact.email)
        await expect(contactOption).toBeVisible({ timeout: 3_000 })
      }).toPass({ timeout: 60_000 })
      await contactOption.click()

      await dialog.getByRole('button', { name: 'Save', exact: true }).click()

      await expect.poll(
        async () => (await api.getCompanyRowByName(renamed))?.primary_user_id,
        { timeout: 20_000 },
      ).toBe(contactUserId)
      const edited = await api.getCompanyRowByName(renamed)
      expect(edited?.id).toBe(created?.id)
      expect(edited?.status).toBe('rejected')
      // The rename is a rename, not a second company.
      expect(await api.getCompanyRowByName(name)).toBeNull()

      // ---- delete: cancel first, then confirm ----
      const renamedRow = page.getByRole('row').filter({ hasText: renamed })
      await expect(renamedRow).toBeVisible({ timeout: 20_000 })
      const deleteHeading = page.getByText('Delete company', { exact: true })
      const openDeleteModal = async () => {
        await expect(async () => {
          await renamedRow.getByRole('button', { name: 'Delete' }).click()
          await expect(deleteHeading).toBeVisible({ timeout: 2_000 })
        }).toPass({ timeout: 30_000 })
      }

      await openDeleteModal()
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      // "Nothing happened" needs a settled window: a mutant that deleted on the
      // *arming* click would beat an immediate pg read (~10 ms)
      // and pass.
      await expect(deleteHeading).toBeHidden({ timeout: 10_000 })
      await page.waitForTimeout(1_500)
      expect(await api.getCompanyRowByName(renamed)).not.toBeNull()

      await openDeleteModal()
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect.poll(
        async () => await api.getCompanyRowByName(renamed),
        { timeout: 20_000 },
      ).toBeNull()
      await expect(renamedRow).toHaveCount(0, { timeout: 15_000 })
    }
    finally {
      for (const id of await api.getCompanyIdsByNamePrefix(`E2E Company ${runId}`)) {
        await api.deleteCompany(adminToken, id).catch(() => {})
      }
      await api.dispose()
    }
  })

  test('status and name/tax-id search narrow the directory', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    // Three companies differing in exactly one filterable dimension, sharing a
    // name prefix so one search pins the working set.
    const prefix = `E2E CoFilter ${runId}`
    const alphaTaxId = `TAXALPHA${runId}`
    const seeds = [
      { label: 'Alpha', status: 'approved' as const, taxId: alphaTaxId },
      { label: 'Bravo', status: 'pending' as const, taxId: `TAXBRAVO${runId}` },
      { label: 'Charlie', status: 'rejected' as const, taxId: `TAXCHARLIE${runId}` },
    ]
    const names: Record<string, string> = {}
    const companyIds: number[] = []
    let adminToken = ''

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      for (const seed of seeds) {
        const name = `${prefix} ${seed.label}`
        names[seed.label] = name
        const company = await api.createCompanyAsAdmin(adminToken, {
          name,
          taxId: seed.taxId,
          status: seed.status,
        })
        companyIds.push(company.id)
      }

      const rowFor = (label: string) => page.getByRole('row').filter({ hasText: names[label]! })
      // The table's DATA rows — the falsifiable half of every assertion below.
      // A named row alone is not enough: `toBeVisible` is satisfied by the
      // *stale* table Pinia Colada still shows while the new query is in
      // flight, so a filter that never reached the wire would pass. Pinning the
      // total forces the assertion to wait for the refetch. (`tbody tr`, not
      // `getByRole('row')` — the latter also counts the header.)
      const rows = page.locator('tbody tr')

      await page.context().addCookies([admin.refreshCookie])
      await page.goto('/admin/companies')
      await expect(page).toHaveURL(/\/admin\/companies/, { timeout: 60_000 })

      // Baseline: the shared prefix narrows the directory to exactly these
      // three. The retry absorbs the post-cookie-injection hydration race — a
      // `fill` landing before Vue binds the handler is silently lost, and the
      // unfiltered list would still show all three — and it re-resolves the
      // control each pass, since the `UFormField` id is only guaranteed stable
      // within one render of the page.
      await expect(async () => {
        await (await fieldControl(page, 'Search')).fill(prefix)
        await expect(rows).toHaveCount(seeds.length, { timeout: 5_000 })
      }).toPass({ timeout: 90_000 })
      await expect(rowFor('Alpha')).toBeVisible()
      await expect(rowFor('Bravo')).toBeVisible()
      await expect(rowFor('Charlie')).toBeVisible()

      // Status: only the approved one survives. Alpha is the control that must
      // stay PRESENT — without it, a filter that dropped every row would pass.
      await selectOption(page, page, 'Status', 'Approved')
      await expect(rows).toHaveCount(1, { timeout: 15_000 })
      await expect(rowFor('Alpha')).toBeVisible()
      await expect(rowFor('Bravo')).toHaveCount(0)
      await expect(rowFor('Charlie')).toHaveCount(0)

      // Rejected is the mirror: now Charlie is the control.
      await selectOption(page, page, 'Status', 'Rejected')
      await expect(rows).toHaveCount(1, { timeout: 15_000 })
      await expect(rowFor('Charlie')).toBeVisible()
      await expect(rowFor('Alpha')).toHaveCount(0)
      await expect(rowFor('Bravo')).toHaveCount(0)

      // Search matches the tax id too, not just the name — the placeholder
      // promises it and nothing else covers it.
      await selectOption(page, page, 'Status', 'All')
      await expect(rows).toHaveCount(seeds.length, { timeout: 15_000 })
      await (await fieldControl(page, 'Search')).fill(alphaTaxId)
      await expect(rows).toHaveCount(1, { timeout: 15_000 })
      await expect(rowFor('Alpha')).toBeVisible()
    }
    finally {
      for (const id of companyIds) await api.deleteCompany(adminToken, id).catch(() => {})
      await api.dispose()
    }
  })
})
