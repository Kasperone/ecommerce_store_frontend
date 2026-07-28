// Admin shipping CRUD — zones, methods and rates, the rows that literally set
// what checkout charges for delivery.
//
// This is the highest-leverage untested admin surface: a regression here does
// not throw, it silently misprices every order. The spec walks the full
// lifecycle through the three tabs — create a zone, a method and a rate, edit
// the rate's amount, prove the rates filter slices the matrix, then delete all
// three — cross-checking `shipping_zones` / `shipping_methods` /
// `shipping_rates` in pg at every step.
//
// ⚠️ Fixture isolation: the storefront auto-selects the *cheapest* method in a
// zone, and the e2e DB's US zone is shared by every checkout spec — adding a
// method or rate there would hijack that auto-select suite-wide. So this spec
// claims a country no other fixture uses (FR; US/DE/PL are taken) and builds an
// entirely throwaway zone/method/rate triple, which it deletes as part of the
// flow under test. `shipping_zone_countries.country_code` is globally UNIQUE,
// so the claim is exclusive — and the `finally` block reclaims it even if an
// assertion fails mid-flow.
import { test, expect, type Locator, type Page } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

// FR is deliberately unused by every other fixture (US = shared checkout zone,
// DE = reverse-charge, PL = pl-money-path).
const COUNTRY_CODE = 'FR'
const COUNTRY_LABEL = 'France'
const ZONE_NAME_PREFIX = 'E2E CRUD Zone '
const METHOD_NAME_PREFIX = 'E2E CRUD Method '

/**
 * Click a "New …" button until its dialog is actually up.
 *
 * Two separate races make a bare click unreliable here: a cookie-authed admin
 * page can be clicked before Vue binds handlers, and switching `UTabs` swaps the
 * panel's DOM, so a click fired right after the tab change lands on a button
 * that is about to be replaced. Re-clicking only when the dialog is *not* up
 * keeps the retry idempotent (a second click would otherwise hit the overlay).
 */
async function openDialog(page: Page, buttonName: string): Promise<void> {
  const dialog = page.getByRole('dialog')
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await page.getByRole('button', { name: buttonName }).click()
    }
    await expect(dialog).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 25_000 })
}

/**
 * Open the `USelectMenu` / `USelect` in the `UFormField` with the given label.
 *
 * Neither of the obvious locators works. The trigger is a plain `<button>`, not
 * a `role="combobox"`, so `getByRole('combobox')` finds nothing; and although
 * `UFormField` does emit `<label for="…">` pointing at the trigger's `id`, the
 * button carries `aria-label="Show popup"`, which by ARIA precedence *overrides*
 * the label — so `getByLabel('Countries')` matches nothing either, and every
 * select on the page shares one useless accessible name.
 *
 * The `for`/`id` pair is the only thing that identifies which select is which,
 * so resolve it explicitly. Scope to the dialog when one is open: the rates tab
 * repeats Zone/Method/Currency as filter labels on the page behind it.
 */
async function fieldControl(scope: Page | Locator, label: string): Promise<Locator> {
  const labelEl = scope
    .locator('label')
    .filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) })
    .first()
  const controlId = await labelEl.getAttribute('for')
  if (!controlId) throw new Error(`no control bound to the "${label}" label`)
  return scope.locator(`#${controlId}`)
}

async function openSelect(scope: Page | Locator, label: string): Promise<void> {
  await (await fieldControl(scope, label)).click()
}

/**
 * Set the rate dialog's Amount without Tab-ing out of it.
 *
 * The shared `setUInputNumber` helper commits by pressing Tab — which here
 * moves focus into the *optional* "Free above subtotal" field. Touching that
 * field makes it validate as `Invalid input: expected number, received
 * undefined`, and the form then refuses to submit with no page-level alert to
 * explain why. Blur onto the dialog heading instead. (The underlying validation
 * behaviour looks like a real bug in the rate form, not a test artefact.)
 */
async function setRateAmount(dialog: Locator, value: number): Promise<void> {
  const input = dialog.getByRole('spinbutton', { name: /^Amount/ })
  await input.click()
  await input.press('ControlOrMeta+a')
  await input.press('Delete')
  await input.pressSequentially(String(value))
  await dialog.getByRole('heading').first().click()
  await expect(input).toHaveValue(String(value))
}

test.describe('Admin shipping CRUD', () => {
  test('zone → method → rate: create, edit, filter and delete, with pg as the source of truth', async ({ page }) => {
    // The full three-tab lifecycle is long; the default 30s is not enough.
    test.setTimeout(180_000)
    const api = await ApiClient.create()
    const runId = Date.now()
    const zoneName = `${ZONE_NAME_PREFIX}${runId}`
    const methodName = `${METHOD_NAME_PREFIX}${runId}`
    const methodCode = `e2e-crud-${runId}`
    let adminToken = ''

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken

      // Self-heal: a run killed by the *test timeout* never finishes its
      // `finally`, so FR can still be claimed by a previous run's zone. Reclaim
      // it — but only from a zone this spec authored, never from a real fixture.
      const stale = await api.getShippingZoneByCountry(COUNTRY_CODE)
      if (stale?.name.startsWith(ZONE_NAME_PREFIX)) {
        await api.deleteShippingZone(adminToken, stale.id)
      }

      await page.context().addCookies([admin.refreshCookie])
      await page.goto('/admin/shipping')
      await expect(page.getByRole('heading', { name: 'Shipping' })).toBeVisible()

      // ----------------------------------------------------------------- zone
      await openDialog(page, 'New zone')

      const zoneDialog = page.getByRole('dialog')
      await zoneDialog.getByLabel('Name', { exact: true }).fill(zoneName)
      await openSelect(zoneDialog, 'Countries')
      await page.keyboard.type(COUNTRY_LABEL)
      await page.getByRole('option', { name: COUNTRY_LABEL, exact: true }).click()
      await page.keyboard.press('Escape')
      await zoneDialog.getByRole('button', { name: 'Save', exact: true }).click()

      await expect(zoneDialog).toBeHidden({ timeout: 15_000 })
      await expect(page.getByRole('row').filter({ hasText: zoneName })).toBeVisible()

      const zone = await api.getShippingZoneByName(zoneName)
      expect(zone).not.toBeNull()
      expect(zone!.countryCodes).toEqual([COUNTRY_CODE])
      expect(zone!.isActive).toBe(true)

      // --------------------------------------------------------------- method
      // Clicking a tab must work: SSR-rendered, this UTabs used to never hydrate
      // its interactivity, so the trigger emitted nothing and clicks were inert
      // while the markup looked correct. This is the regression guard for that
      // (<ClientOnly> around the tab bar).
      await page.getByRole('tab', { name: 'Methods' }).click()
      await expect(page).toHaveURL(/[?&]tab=methods/, { timeout: 10_000 })
      await expect(page.getByRole('button', { name: 'New method' })).toBeVisible()
      await openDialog(page, 'New method')
      const methodDialog = page.getByRole('dialog')
      await methodDialog.getByLabel('Name', { exact: true }).fill(methodName)
      await methodDialog.getByLabel('Code', { exact: true }).fill(methodCode)
      await methodDialog.getByRole('button', { name: 'Save', exact: true }).click()

      await expect(methodDialog).toBeHidden({ timeout: 15_000 })
      const method = await api.getShippingMethodByName(methodName)
      expect(method).not.toBeNull()
      expect(method!.code).toBe(methodCode)

      // ----------------------------------------------------------------- rate
      await page.goto('/admin/shipping?tab=rates')
      await openDialog(page, 'New rate')
      const rateDialog = page.getByRole('dialog')
      await openSelect(rateDialog, 'Zone')
      await page.getByRole('option', { name: zoneName, exact: true }).click()
      await openSelect(rateDialog, 'Method')
      await page.getByRole('option', { name: methodName, exact: true }).click()
      // Currency already defaults to USD; assert rather than re-pick it (this
      // one is a `USelect`, whose popup does not survive a scripted click).
      await expect(await fieldControl(rateDialog, 'Currency')).toContainText('USD')
      await setRateAmount(rateDialog, 42)
      await rateDialog.getByRole('button', { name: 'Save', exact: true }).click()

      await expect(rateDialog).toBeHidden({ timeout: 15_000 })
      const created = await api.getShippingRateRow(zone!.id, method!.id, 'USD')
      expect(created).not.toBeNull()
      expect(created!.amount).toBe(42)
      // No free-above and no tiers → the UI's "flat" pricing kind.
      expect(created!.freeAbove).toBeNull()

      // --- edit: a re-price is the single most consequential mutation here
      const rateRow = page.getByRole('row').filter({ hasText: methodName })
      await expect(rateRow).toBeVisible()
      await rateRow.getByRole('button', { name: 'Edit' }).click()
      await setRateAmount(rateDialog, 55)
      await rateDialog.getByRole('button', { name: 'Save', exact: true }).click()

      await expect(rateDialog).toBeHidden({ timeout: 15_000 })
      await expect(async () => {
        const edited = await api.getShippingRateRow(zone!.id, method!.id, 'USD')
        expect(edited!.amount).toBe(55)
      }).toPass({ timeout: 10_000 })

      // --- filter: narrowing to our zone must hide every other zone's rates.
      // This leg is the regression guard for the `set(key, value)` bug: the page
      // was calling `useUrlFilters`' `set` with two args instead of one patch
      // object, so the merge was a no-op and the filter silently never applied.
      await openSelect(page, 'Zone')
      await page.getByRole('option', { name: zoneName, exact: true }).click()
      await expect(page).toHaveURL(/[?&]zoneId=\d+/, { timeout: 10_000 })
      await expect(rateRow).toBeVisible()
      // toHaveCount (not toBeHidden): the shared US zone owns several rate rows,
      // so the locator is deliberately non-strict, and the count retries while
      // the filtered query refetches.
      await expect(page.getByRole('row').filter({ hasText: 'E2E Standard zone' }))
        .toHaveCount(0, { timeout: 15_000 })

      // --------------------------------------------------------------- delete
      await rateRow.getByRole('button', { name: 'Delete' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(rateRow).toBeHidden({ timeout: 15_000 })
      // The row vanishing is the optimistic cache update; give the DELETE a beat
      // to land before reading pg.
      await expect(async () => {
        expect(await api.getShippingRateRow(zone!.id, method!.id, 'USD')).toBeNull()
      }).toPass({ timeout: 10_000 })

      await page.goto('/admin/shipping?tab=methods')
      const methodRow = page.getByRole('row').filter({ hasText: methodName })
      await methodRow.getByRole('button', { name: 'Delete' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(methodRow).toBeHidden({ timeout: 15_000 })
      await expect(async () => {
        expect(await api.getShippingMethodByName(methodName)).toBeNull()
      }).toPass({ timeout: 10_000 })

      await page.goto('/admin/shipping?tab=zones')
      const zoneRow = page.getByRole('row').filter({ hasText: zoneName })
      await zoneRow.getByRole('button', { name: 'Delete' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(zoneRow).toBeHidden({ timeout: 15_000 })
      // The zone is gone and FR is released for the next run.
      await expect(async () => {
        expect(await api.getShippingZoneByName(zoneName)).toBeNull()
      }).toPass({ timeout: 10_000 })
    }
    finally {
      // Idempotent reclaim: a mid-flow failure must not leave FR (or a stray
      // UNIQUE name) claimed for the next run.
      const leftoverMethod = await api.getShippingMethodByName(methodName).catch(() => null)
      if (leftoverMethod) {
        await api.deleteShippingMethod(adminToken, leftoverMethod.id).catch(() => {})
      }
      const leftoverZone = await api.getShippingZoneByName(zoneName).catch(() => null)
      if (leftoverZone) await api.deleteShippingZone(adminToken, leftoverZone.id).catch(() => {})
      await api.dispose()
    }
  })
})
