// Hand-written accessible-name assertions — the half of a11y that axe cannot see.
//
// WHY THIS EXISTS NEXT TO THE PAGE SWEEP
//
// `wcag.storefront.spec.ts` / `wcag.admin.spec.ts` run axe over 48 routes and
// catch anything with a rule id. But axe checks whether an accessible name is
// PRESENT, not whether it is CORRECT — a control named "UHeader's #title slot
// already links to home…" is, to axe, perfectly labelled. So a polluted name is
// invisible to the sweep and needs a literal assertion instead.
//
// That is not hypothetical. Finding F1 (2026-06-08) was exactly this bug, it was
// recorded as fixed by a PR that was CLOSED rather than merged, and it therefore
// sat live on main for ~2.5 months while every axe run reported the header clean.
// This spec is what makes that class of regression fail loudly.
import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

/** Substrings that only ever appear in source-code prose, never in a brand name.
 *  If one of these reaches an accessible name, a comment or raw markup has been
 *  serialized into it. */
const CODE_PROSE = ['#title', 'UHeader', 'slot', 'vnode', 'hydration', '<a>', 'TODO']

for (const locale of ['en', 'pl'] as const) {
  test(`header home link is announced as the store name (${locale}) @smoke`, async ({ page }) => {
    await page.goto(locale === 'en' ? '/' : '/pl')
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 60_000 })

    // UHeader marks its home anchor with data-slot="title".
    const homeLink = page.locator('a[data-slot="title"]').first()
    await expect(homeLink).toBeVisible()
    const name = (await homeLink.getAttribute('aria-label'))?.trim() ?? ''

    expect(name, 'home link must have an accessible name').not.toBe('')

    for (const needle of CODE_PROSE) {
      expect(
        name.toLowerCase(),
        `home link aria-label leaked source prose (${needle}): ${JSON.stringify(name)}`,
      ).not.toContain(needle.toLowerCase())
    }

    // The Nuxt UI default. Reaching it means the #title slot rendered no text and
    // no `title` prop was passed — which is what happens once a store uploads a
    // `logo_url` and the SVG+wordmark lockup is replaced by a bare <img>.
    expect(name, 'home link fell back to the Nuxt UI default name').not.toBe('Nuxt UI')

    // A name that long is prose, not a brand.
    expect(name.length, `home link aria-label is implausibly long: ${JSON.stringify(name)}`)
      .toBeLessThan(60)
  })
}
