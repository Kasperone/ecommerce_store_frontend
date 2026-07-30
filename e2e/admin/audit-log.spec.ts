// Admin audit log — the compliance record that has to actually record.
//
// `/admin/audit-log` is a read-only view over `admin_audit_events`, which the
// backend's AuditWriter appends to on every admin create/update/delete. Nothing
// in the app breaks if it silently stops writing, which is exactly why it needs
// a spec: the failure mode is an empty trail discovered during an audit.
//
// What these tests pin down:
//   - a write is recorded, attributed to the acting admin, and reaches the page;
//   - the payload is a real field-level diff (price 10 → 19.99), not a blob;
//   - the recorded sides are asymmetric on purpose — `{after}` on create,
//     `{before, after}` (changed fields only) on update, `{before}` on delete —
//     and the details dialog renders exactly the sides that exist;
//   - the trail OUTLIVES its subject: the product is deleted, its history isn't.
//
// Ground truth is pg, not the admin list endpoint: asserting the API against
// itself would let a broken writer and a broken reader cancel out.
//
// Ordering assumption: `playwright.config.ts` pins `workers: 1` +
// `fullyParallel: false`, so no sibling spec can interleave an audit row between
// the write and the assertion — "my event is the newest of its kind" is sound.
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'
import { selectOption } from '../helpers/nuxtUiSelect'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(150_000)

/** Data rows only. UTable renders a cell-less separator `<tr>` inside the header
 *  rowgroup, so positional `nth()` over `getByRole('row')` lands on the wrong
 *  element; filtering on "has a cell" drops both header and separator. */
function dataRows(page: import('@playwright/test').Page) {
  return page.getByRole('row').filter({ has: page.getByRole('cell') })
}

/** The audit row for one entity. `#123` must not match `#1234`, so anchor on a
 *  non-digit boundary rather than a bare substring. */
function rowForResource(page: import('@playwright/test').Page, resourceId: number) {
  return dataRows(page).filter({ hasText: new RegExp(`#${resourceId}(?!\\d)`) })
}

async function gotoAuditLog(page: import('@playwright/test').Page) {
  await page.goto('/admin/audit-log')
  await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible({ timeout: 60_000 })
}

test.describe('Admin audit log', () => {
  test('records a create → update → delete trail with a field-level diff', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const name = `E2E Audit Widget ${runId}`
    let adminToken = ''

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const adminId = await api.userIdByEmail(KNOWN_ADMIN.email)

      const product = await api.createProduct(adminToken, {
        name,
        slug: `e2e-audit-${runId}`,
        price_usd: 10,
        price_pln: 40,
        price_eur: 9,
        stock: 5,
      })
      await api.updateProduct(adminToken, product.id, { price_usd: 19.99 })
      await api.deleteProduct(adminToken, product.id)

      // --- Server truth: three rows, right order, right actor ----------------
      const events = await api.getAuditEvents('product', product.id)
      expect(events.map(e => e.action)).toEqual(['create', 'update', 'delete'])
      expect(events.every(e => e.actor_id === adminId)).toBe(true)

      // The update payload is a diff of the CHANGED field only — not a snapshot.
      // If the writer ever starts dumping the whole row here, this fails.
      expect(Object.keys(events[1].payload?.before ?? {})).toEqual(['price_usd'])
      expect(events[1].payload?.after).toMatchObject({ price_usd: 19.99 })
      expect(events[1].payload?.before).toMatchObject({ price_usd: 10 })
      // Create records only the resulting state; delete only the prior state.
      expect(events[0].payload?.before).toBeUndefined()
      expect(events[2].payload?.after).toBeUndefined()

      // The product is gone, but its history is not.
      expect(await api.getProductStock(product.id)).toBe(-1)

      // --- The page surfaces the update, attributed --------------------------
      await page.context().addCookies([admin.refreshCookie])
      await gotoAuditLog(page)

      await selectOption(page, page, 'Resource', 'Product')
      await expect(page).toHaveURL(/resourceType=product/, { timeout: 15_000 })
      await selectOption(page, page, 'Action', 'Updated')
      await expect(page).toHaveURL(/action=update/, { timeout: 15_000 })

      // Newest first, and nothing else wrote a product update in between
      // (workers: 1), so our event leads the filtered list.
      const newest = dataRows(page).first()
      await expect(newest).toContainText(`#${product.id}`, { timeout: 15_000 })
      await expect(newest).toContainText(KNOWN_ADMIN.email)
      await expect(newest).toContainText('Updated')

      // --- The diff is inspectable -------------------------------------------
      await expect(async () => {
        await newest.getByRole('button', { name: 'Details' }).click()
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 30_000 })

      const dialog = page.getByRole('dialog')
      await expect(dialog).toContainText('Change details')
      await expect(dialog).toContainText(KNOWN_ADMIN.email)
      // Both sides present on an update ⇒ both column headers render.
      await expect(dialog.getByRole('columnheader', { name: 'Before' })).toBeVisible()
      await expect(dialog.getByRole('columnheader', { name: 'After' })).toBeVisible()
      const diffRow = dialog.getByRole('row').filter({ hasText: 'price_usd' })
      await expect(diffRow).toContainText('10')
      await expect(diffRow).toContainText('19.99')
    }
    finally {
      await api.dispose()
    }
  })

  test('the action filter slices the trail, and create/delete record opposite sides', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const name = `E2E Audit Sides ${runId}`
    let adminToken = ''

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken

      const product = await api.createProduct(adminToken, {
        name,
        slug: `e2e-audit-sides-${runId}`,
        price_usd: 12,
        price_pln: 48,
        price_eur: 11,
        stock: 3,
      })
      await api.deleteProduct(adminToken, product.id)
      expect((await api.getAuditEvents('product', product.id)).map(e => e.action))
        .toEqual(['create', 'delete'])

      await page.context().addCookies([admin.refreshCookie])
      await gotoAuditLog(page)
      await selectOption(page, page, 'Resource', 'Product')
      await expect(page).toHaveURL(/resourceType=product/, { timeout: 15_000 })

      // --- Deleted: a "before" side and no "after" ---------------------------
      await selectOption(page, page, 'Action', 'Deleted')
      await expect(page).toHaveURL(/action=delete/, { timeout: 15_000 })
      const deleteRow = dataRows(page).first()
      await expect(deleteRow).toContainText(`#${product.id}`, { timeout: 15_000 })
      await expect(deleteRow).toContainText('Deleted')

      await expect(async () => {
        await deleteRow.getByRole('button', { name: 'Details' }).click()
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 30_000 })
      let dialog = page.getByRole('dialog')
      await expect(dialog.getByRole('columnheader', { name: 'Before' })).toBeVisible()
      await expect(dialog.getByRole('columnheader', { name: 'After' })).toBeHidden()
      // The deleted row's state is what got captured. Scope by an EXACT field
      // cell — a `hasText: 'name'` filter also matches the `name_pl` row.
      const nameRow = dialog
        .getByRole('row')
        .filter({ has: page.getByRole('cell', { name: 'name', exact: true }) })
      await expect(nameRow).toContainText(name)
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden({ timeout: 10_000 })

      // --- Created: an "after" side and no "before" --------------------------
      await selectOption(page, page, 'Action', 'Created')
      await expect(page).toHaveURL(/action=create/, { timeout: 15_000 })
      // The filter must actually re-slice: the delete event has to fall out and
      // the create event take its place, both for the same resource id.
      const createRow = rowForResource(page, product.id)
      await expect(createRow).toContainText('Created', { timeout: 15_000 })
      await expect(createRow).not.toContainText('Deleted')

      await expect(async () => {
        await createRow.getByRole('button', { name: 'Details' }).click()
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 30_000 })
      dialog = page.getByRole('dialog')
      await expect(dialog.getByRole('columnheader', { name: 'After' })).toBeVisible()
      await expect(dialog.getByRole('columnheader', { name: 'Before' })).toBeHidden()
    }
    finally {
      await api.dispose()
    }
  })
})
