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
 *
 * The open click is retried, because on an admin page authed by cookie
 * injection the first click can land before Vue binds the trigger's handler:
 * the control takes focus and nothing opens — no error, no console warning.
 * Specs that happened to touch another control first (a search field, say) hid
 * this by giving hydration time; one whose first interaction IS the select does
 * not. The retry re-clicks only while the trigger reports itself closed, so it
 * can never toggle an already-open listbox shut.
 *
 * "Is it open?" is asked of the trigger (`aria-expanded`), and options are only
 * matched inside the listbox it `aria-controls` while that listbox is
 * `data-state="open"` — never by whether a matching option is merely visible.
 * After a pick the listbox stays mounted for its 100ms `scale-out` exit
 * animation with every option still visible, so picking from the same select
 * again inside that window (e.g. "Disabled" then "All" with only a fast
 * row-count assertion between) used to find the *closing* listbox's option,
 * skip the open click, and click an element that detached mid-click — then
 * wait on a listbox nobody reopened until the test timed out.
 */
export async function selectOption(
  page: Page,
  scope: Page | Locator,
  label: string,
  optionName: string,
): Promise<void> {
  // A handle, not a locator, resolved while the select is still closed: an open
  // select aria-hides everything outside its listbox, so a `getByRole('dialog')`
  // scope stops matching the moment it opens — and a page-wide `#id` is no
  // substitute, since a modal can reuse an id the page behind it already has.
  const trigger = await (await fieldControl(scope, label)).elementHandle()
  // Re-read per use: a `USelectMenu` trigger's `aria-controls` stays empty
  // until its first open mounts the content.
  const openOption = async () => page
    .locator(`[id="${await trigger.getAttribute('aria-controls')}"][data-state="open"]`)
    .getByRole('option', { name: optionName, exact: true })
  await expect(async () => {
    if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
      await trigger.click()
    }
    await expect(await openOption()).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await (await openOption()).click()
}
