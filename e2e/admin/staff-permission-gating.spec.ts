// Admin staff permission gating — the RBAC surface. All staff share role=ADMIN
// (the coarse "any staff" gate the admin middleware uses); granular
// `capabilities[]` + `is_owner` drive `auth.can(cap)`, which filters the admin
// sidebar (`app/components/admin/sidebarMenu.ts`). This spec proves that
// capability filtering is real end-to-end: a scoped staffer with ONLY
// `catalog:write` sees the catalog sections but not the ones gated behind
// capabilities they lack.
//
// The frontend admin middleware is UX-only (isAdmin), so the browser-observable
// truth of per-capability gating is the sidebar itself. Backend enforcement
// (`require_capability`) is unit-tested separately.
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(120_000)

test.describe('Admin staff permission gating', () => {
  test('a scoped staffer sees only capability-permitted sidebar sections', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const staffer = randomEphemeralUser()

    try {
      await api.register(staffer)
      await api.markVerified(staffer.email)
      // Scoped staffer (not an owner): catalog:write ONLY. → can('catalog:write')
      // is true (Products/Categories/Collections/Reviews), but orders:write
      // (Orders) and staff:write (Staff & Roles) are false → filtered out.
      await api.makeScopedStaff(staffer.email, ['catalog:write'])

      const session = await api.loginViaApi(staffer.email, staffer.password)
      await page.context().addCookies([session.refreshCookie])

      await page.goto('/admin')
      await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 })

      // The sidebar UNavigationMenu renders the (possibly nested) nav landmark;
      // .first() anchors the outermost so each link resolves once.
      const nav = page.getByRole('navigation').first()

      // Permitted (catalog:write) — present. Doubles as the authed-render gate.
      await expect(nav.getByRole('link', { name: 'Products' })).toBeVisible({ timeout: 60_000 })

      // Lacked capabilities — filtered out of the sidebar entirely. If filtering
      // were broken/absent, every link would render and these would be > 0.
      await expect(nav.getByRole('link', { name: 'Orders', exact: true })).toHaveCount(0)
      await expect(nav.getByRole('link', { name: 'Staff & Roles' })).toHaveCount(0)
    }
    finally {
      await api.dispose()
    }
  })
})
