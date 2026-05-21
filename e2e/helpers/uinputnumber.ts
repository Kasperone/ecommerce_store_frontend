/**
 * Playwright helpers for Nuxt UI `UInputNumber`.
 *
 * The component renders an `input[role="spinbutton"]` whose value is kept in
 * sync with Vue state through the component's own keyboard handler. Mutating
 * the spinbutton's DOM `.value` (e.g. `locator.fill('')`) updates the
 * displayed text but does NOT propagate to the v-model — submitting the form
 * then sends the stale value. Always drive UInputNumber through real key
 * events so the component's handler runs.
 *
 * The corresponding `input[name="..."]` is a hidden form-state mirror; you
 * can read it after this helper runs to assert state synced.
 */
import type { Locator, Page } from '@playwright/test'

/**
 * Find the `UInputNumber` spinbutton belonging to the field with the given
 * accessible label. Returns the locator for the visible spinbutton input,
 * not the hidden `input[name=...]` form mirror.
 */
export function uInputNumberByLabel(page: Page, label: string): Locator {
  return page.locator('label').filter({ hasText: label }).locator('..').locator('input[role="spinbutton"]')
}

/**
 * Clear a `UInputNumber`. Focuses the spinbutton, selects everything, deletes,
 * then blurs via Tab so the component commits the empty state to v-model.
 *
 * After this resolves, both the visible spinbutton and the hidden
 * `input[name=...]` form mirror read empty, AND the underlying Vue ref has
 * updated.
 */
export async function clearUInputNumber(locator: Locator): Promise<void> {
  await locator.click()
  await locator.press('ControlOrMeta+a')
  await locator.press('Delete')
  await locator.press('Tab')
}

/**
 * Set a `UInputNumber` to a specific value. Clears first (see above), then
 * types the new value, then blurs so the component commits to v-model.
 */
export async function setUInputNumber(locator: Locator, value: number | string): Promise<void> {
  await clearUInputNumber(locator)
  await locator.click()
  await locator.pressSequentially(String(value))
  await locator.press('Tab')
}
