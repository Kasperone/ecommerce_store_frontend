import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Locating a Nuxt UI `USelect` / `USelectMenu` — neither obvious locator works.
 *
 * The trigger is a plain `<button>`, not a `role="combobox"`, so
 * `getByRole('combobox')` finds nothing. And although `UFormField` does emit
 * `<label for="…">` pointing at the trigger's `id`, the button carries
 * `aria-label="Show popup"`, which by ARIA precedence *overrides* the label —
 * so `getByLabel('Status')` matches nothing either, and every select on the
 * page shares one useless accessible name.
 *
 * The `for`/`id` pair is the only thing that says which select is which, so
 * resolve it explicitly.
 */
export async function fieldControl(scope: Page | Locator, label: string): Promise<Locator> {
  const labelEl = scope
    .locator('label')
    .filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) })
    .first()
  const controlId = await labelEl.getAttribute('for')
  if (!controlId) throw new Error(`no control bound to the "${label}" label`)
  return scope.locator(`#${controlId}`)
}

/**
 * Open the select in the `UFormField` with the given label.
 *
 * Scope to a dialog when one is open — pages often repeat the same field labels
 * behind the overlay (the shipping rates tab does exactly this).
 */
export async function openSelect(scope: Page | Locator, label: string): Promise<void> {
  await (await fieldControl(scope, label)).click()
}

/**
 * Open the select and pick an option by its visible text.
 *
 * The listbox is portalled to the document body, so options are matched on
 * `page`, never inside `scope`.
 */
export async function selectOption(
  page: Page,
  scope: Page | Locator,
  label: string,
  optionName: string,
): Promise<void> {
  await openSelect(scope, label)
  const option = page.getByRole('option', { name: optionName, exact: true })
  await expect(option).toBeVisible({ timeout: 10_000 })
  await option.click()
}
