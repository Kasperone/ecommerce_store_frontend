// Admin payment terms (`/admin/payment-terms`) — the named net-terms templates
// assigned to B2B companies. The *money* leg (an on-account order picking up a
// term's due date) is `checkout/net-terms-money-path.spec.ts`'s job; the
// template CRUD behind it was unspecced.
//
// One test walks the whole lifecycle, because the interesting behaviour is what
// happens BETWEEN the states: a term's `term_type` decides which parameter
// field exists (`net_days` / `due_date` / neither), the form mirrors that as
// client-side validation, and the DB backs it with a CHECK
// (`ck_payment_terms_shape`).
//
// Switching type must also CLEAR the parameter that no longer applies, and that
// clearing is the FORM's job: `buildBody()` sends `net_days: null` whenever the
// type is not `net_days`. The backend does not do it — a PATCH that merely omits
// `net_days` leaves the old value in the row (only the *response* looks clean,
// because `PaymentTermResponse` inherits the shape validator that nulls it on
// serialisation), and `ck_payment_terms_shape` is an OR that tolerates the
// stale column. So the pg assertion below is a guard on the form, and it is the
// only place the behaviour is visible at all — the field is hidden once the
// type changes.
//
// ⚠️ Delete here is a NATIVE `confirm()`, not a modal. Playwright auto-DISMISSES
// dialogs unless a handler is registered, so without `page.on('dialog', …)` the
// delete silently no-ops and a spec that only checked "the row is gone" would
// fail for a reason that looks nothing like the cause.
import { expect, test, type Locator, type Page } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { fieldControl, selectOption } from '../helpers/nuxtUiSelect'
import { KNOWN_ADMIN } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(240_000)

/**
 * A `UFormField`'s text input. `getByLabel` resolves the `for`/`id` pair (unlike
 * a select trigger, a `UInput` has no `aria-label` overriding it); the optional
 * `*` absorbs the required marker.
 */
function field(scope: Page | Locator, label: string): Locator {
  return scope.getByLabel(new RegExp(`^${label}\\s*\\*?$`))
}

/**
 * Picking a `USelect` option is not reliably one click: the listbox re-positions
 * over its trigger as it opens, so a click computed against the pre-scroll
 * layout can land on nothing while `selectOption` resolves happily. Assert the
 * trigger's displayed value and re-pick until it takes.
 */
async function setSelect(
  page: Page,
  scope: Page | Locator,
  label: string,
  option: string,
): Promise<void> {
  const trigger = await fieldControl(scope, label)
  await expect(async () => {
    await selectOption(page, scope, label, option)
    await expect(trigger).toContainText(option, { timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
}

test.describe('Admin payment terms', () => {
  test('create Net-N → switch to fixed date (refused without one) → deactivate → delete', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const name = `E2E Term ${runId}`
    const dueDate = '2027-09-30'
    let adminToken = ''

    // Native confirm() — Playwright dismisses dialogs by default, which would
    // turn the delete into a silent no-op.
    page.on('dialog', dialog => void dialog.accept())

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken

      await page.context().addCookies([admin.refreshCookie])
      await page.goto('/admin/payment-terms')
      await expect(page).toHaveURL(/\/admin\/payment-terms/, { timeout: 60_000 })

      const dialog = page.getByRole('dialog')

      // ---- create a Net 14 term ----
      // The admin route cold-compiles; a click fired before hydration is lost.
      const newBtn = page.getByTestId('payment-term-create')
      await expect(newBtn).toBeVisible({ timeout: 60_000 })
      await expect(async () => {
        await newBtn.click()
        await expect(field(dialog, 'Name')).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 90_000 })

      await field(dialog, 'Name').fill(name)
      // `net_days` defaults to 30 and the type defaults to Net days — set the
      // number explicitly so the assertion below is about what was typed.
      await dialog.getByTestId('payment-term-net-days').fill('14')
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()

      await expect.poll(
        async () => (await api.getPaymentTermRowByName(name))?.term_type,
        { timeout: 20_000 },
      ).toBe('net_days')
      const created = await api.getPaymentTermRowByName(name)
      expect(created?.net_days).toBe(14)
      expect(created?.due_date).toBeNull()
      expect(created?.is_active).toBe(true)

      // ---- switch to a fixed date, first without supplying one ----
      const row = page.getByRole('row').filter({ hasText: name })
      await expect(row).toBeVisible({ timeout: 20_000 })
      const openEditor = async () => {
        await expect(async () => {
          await row.getByRole('button', { name: 'Edit' }).click()
          await expect(field(dialog, 'Name')).toHaveValue(name, { timeout: 2_000 })
        }).toPass({ timeout: 60_000 })
      }
      await openEditor()

      await setSelect(page, dialog, 'Term type', 'Fixed date')
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(dialog.getByText('Pick a due date')).toBeVisible({ timeout: 15_000 })
      // "Nothing was written" needs a settled window — an immediate pg read
      // races the PATCH it claims was never sent.
      await page.waitForTimeout(1_500)
      expect((await api.getPaymentTermRowByName(name))?.term_type).toBe('net_days')

      // ---- now with a date ----
      await dialog.getByTestId('payment-term-due-date').fill(dueDate)
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()
      await expect.poll(
        async () => (await api.getPaymentTermRowByName(name))?.term_type,
        { timeout: 20_000 },
      ).toBe('fixed_date')
      const switched = await api.getPaymentTermRowByName(name)
      expect(switched?.id).toBe(created?.id)
      expect(switched?.due_date).toBe(dueDate)
      // The parameter that no longer applies is CLEARED, not left stale — the
      // form's doing, not the backend's (see the header). Only pg shows it: the
      // form hides `net_days` once the type changes, so a UI-only assertion
      // would happily pass over a term carrying both parameters.
      expect(switched?.net_days).toBeNull()

      // ---- deactivate ----
      await openEditor()
      await dialog.getByRole('switch').click()
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()
      await expect.poll(
        async () => (await api.getPaymentTermRowByName(name))?.is_active,
        { timeout: 20_000 },
      ).toBe(false)
      await expect(row.getByText('Inactive', { exact: true })).toBeVisible({ timeout: 15_000 })

      // ---- delete (native confirm, accepted by the handler above) ----
      await expect(async () => {
        await row.getByRole('button', { name: 'Delete' }).click()
        await expect
          .poll(async () => await api.getPaymentTermRowByName(name), { timeout: 5_000 })
          .toBeNull()
      }).toPass({ timeout: 60_000 })
      await expect(row).toHaveCount(0, { timeout: 15_000 })
    }
    finally {
      for (const id of await api.getPaymentTermIdsByNamePrefix(`E2E Term ${runId}`)) {
        await api.deletePaymentTerm(adminToken, id).catch(() => {})
      }
      await api.dispose()
    }
  })
})
