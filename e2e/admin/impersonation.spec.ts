// Admin customer impersonation — the one audit event that is purely a security
// control.
//
// An admin can assume a customer's session to debug/support. That is a
// privilege-escalation surface by construction, so the promises around it are
// the whole feature:
//
//   1. it is VIEW-ONLY   — `ImpersonationWriteGuardMiddleware` rejects every
//                          non-safe HTTP method presented with an impersonation
//                          token, so the admin can see what the customer sees
//                          and never act for them;
//   2. it is LOGGED      — one `admin_audit_events` row attributing the session
//                          to the acting admin;
//   3. it is BOUNDED     — the token is short-lived, carries an
//                          `impersonator_id` claim, and is issued with NO
//                          refresh cookie, so the session cannot outlive the
//                          impersonation: a reload restores the admin;
//   4. it is SCOPED      — an admin cannot impersonate a peer admin, nor a
//                          deactivated account.
//
// Division of labour with the other suites: the frontend *also* disables the
// write controls while impersonating, but that is component behaviour and is
// already unit-tested (`AddToCartButton.spec.ts` — "is disabled and does not add
// to cart while impersonating"). It is not re-proven here, because **a disabled
// button proves nothing about the security boundary** — anyone holding the token
// can skip the UI entirely. So the browser tests cover the session lifecycle and
// the audit trail, and the third test presents a real token to the API to pin
// the middleware that actually enforces view-only.
//
// ⚠️ These tests navigate ONLY client-side once impersonation has started. The
// impersonation token is held in memory and the admin's own refresh cookie is
// left untouched, so any full document load (`page.goto`, `reload`) re-runs the
// auth plugin and restores the ADMIN. That is the feature (test 2 asserts it) —
// but it means a stray `page.goto` in test 1 would silently end the session
// under test.
//
// Ground truth for the audit trail is pg, not the admin list endpoint: asserting
// the API against itself would let a broken writer and a broken reader cancel
// out.
//
// Ordering assumption: `playwright.config.ts` pins `workers: 1` +
// `fullyParallel: false`, so no sibling spec can interleave rows between a write
// and its assertion.
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(180_000)

const IMPERSONATE_BUTTON = 'View as customer'
const VIEW_ONLY_BLOCKED = 'This action is not allowed while impersonating a customer (view-only).'

/** The persistent impersonation banner (`ImpersonationBanner.vue`, role=status). */
function banner(page: import('@playwright/test').Page) {
  return page.getByRole('status').filter({ hasText: 'Viewing as' })
}

test.describe('Admin customer impersonation', () => {
  test('impersonating from the customer page is audited and exits cleanly', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const customer = randomEphemeralUser()

    try {
      await api.register(customer)
      await api.markVerified(customer.email)
      const customerId = await api.userIdByEmail(customer.email)

      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      const adminId = await api.userIdByEmail(KNOWN_ADMIN.email)
      await page.context().addCookies([admin.refreshCookie])

      // --- Drive the real control on the real page -------------------------
      await page.goto(`/admin/customers/${customerId}`)
      await expect(
        page.getByRole('heading', { name: `${customer.firstName} ${customer.lastName}` }),
      ).toBeVisible({ timeout: 90_000 })
      await page.getByRole('button', { name: IMPERSONATE_BUTTON }).click()

      // --- The session is now the customer's, and says so -------------------
      // The page takes itself to /account client-side on success.
      await page.waitForURL(/\/account(\/|$)/, { timeout: 90_000 })
      await expect(banner(page)).toBeVisible({ timeout: 60_000 })
      await expect(banner(page)).toContainText(`${customer.firstName} ${customer.lastName}`)
      await expect(banner(page)).toContainText('View-only')

      // Identity, observed positively rather than inferred from the banner copy:
      // /account renders the *session's* email. Reaching it at all is itself a
      // signal — the `user` middleware bounces an admin off /account to /admin,
      // so an unswapped session could not be standing here.
      await expect(page.getByText(customer.email).first()).toBeVisible({ timeout: 60_000 })

      // --- Logged: exactly one row, attributed to the acting admin ----------
      const events = await api.getAuditEvents('customer', customerId)
      const impersonations = events.filter(e => e.action === 'impersonate')
      expect(impersonations).toHaveLength(1)
      expect(impersonations[0]!.actor_id).toBe(adminId)
      expect(impersonations[0]!.payload?.after).toMatchObject({
        impersonator_id: adminId,
        impersonator_email: KNOWN_ADMIN.email,
        customer_email: customer.email,
      })

      // --- Exit restores the admin ------------------------------------------
      await banner(page).getByRole('button', { name: 'Exit' }).click()
      // Positive observation: an admin-only page renders again. "Banner gone"
      // alone would also be true of a logged-out session.
      await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible({ timeout: 90_000 })
      await expect(banner(page)).toHaveCount(0)
    }
    finally {
      await api.dispose()
    }
  })

  test('the impersonated session cannot outlive the impersonation — a reload restores the admin', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const customer = randomEphemeralUser()

    try {
      await api.register(customer)
      await api.markVerified(customer.email)
      const customerId = await api.userIdByEmail(customer.email)

      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      await page.context().addCookies([admin.refreshCookie])

      await page.goto(`/admin/customers/${customerId}`)
      await expect(
        page.getByRole('heading', { name: `${customer.firstName} ${customer.lastName}` }),
      ).toBeVisible({ timeout: 90_000 })
      await page.getByRole('button', { name: IMPERSONATE_BUTTON }).click()
      await page.waitForURL(/\/account(\/|$)/, { timeout: 90_000 })
      await expect(banner(page)).toBeVisible({ timeout: 60_000 })

      // The impersonation token lives in memory only — the endpoint issues no
      // refresh cookie (asserted directly in the third test), and the frontend
      // leaves the ADMIN's cookie untouched. So a hard reload of this very page
      // must come back as the admin, not as the customer.
      await page.reload()

      // Settle on a POSITIVE signal before asserting the banner is gone: the
      // `user` middleware bounces an admin off /account, so landing on /admin
      // means the session was restored AS THE ADMIN. "Banner not visible" on its
      // own would also be true of a page that simply hasn't hydrated yet, and
      // equally true of a logged-out session.
      await page.waitForURL(/\/admin(\/|$)/, { timeout: 90_000 })
      // `exact` — the admin layout header also renders an "Admin Dashboard" h1.
      await expect(
        page.getByRole('heading', { name: 'Dashboard', exact: true }),
      ).toBeVisible({ timeout: 90_000 })
      await expect(banner(page)).toHaveCount(0)
    }
    finally {
      await api.dispose()
    }
  })

  test('the view-only guard and the impersonation refusals are enforced server-side', async () => {
    const api = await ApiClient.create()
    const customer = randomEphemeralUser()
    const inactive = randomEphemeralUser()

    try {
      await api.register(customer)
      await api.markVerified(customer.email)
      const customerId = await api.userIdByEmail(customer.email)

      await api.register(inactive)
      await api.markVerified(inactive.email)
      await api.setUserActive(inactive.email, false)
      const inactiveId = await api.userIdByEmail(inactive.email)

      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      const adminId = await api.userIdByEmail(KNOWN_ADMIN.email)

      const session = await api.impersonate(admin.accessToken, customerId)
      expect(session.status).toBe(200)
      expect(session.customer?.id).toBe(customerId)
      // Bounded blast radius: nothing persists this session.
      expect(session.setCookie).toBe('')
      const impToken = session.token!

      // Control: safe methods still work, so the 403s below mean "writes are
      // blocked", not "this token is simply dead".
      expect(await api.apiProbe(impToken, 'GET', '/api/v1/orders/')).toMatchObject({ status: 200 })

      // The guard is METHOD-based in middleware, which is what makes it cover
      // every current and future mutating route without per-route opt-in.
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
        expect(
          await api.apiProbe(impToken, method, '/api/v1/cart/items', { product_id: 1, quantity: 1 }),
          `${method} /cart/items must be refused while impersonating`,
        ).toEqual({ status: 403, detail: VIEW_ONLY_BLOCKED })
      }

      // Identity-destructive actions are the point of the guard: an impersonating
      // admin must not be able to edit the customer or revoke their sessions.
      expect(await api.apiProbe(impToken, 'PATCH', '/api/v1/auth/me', { first_name: 'Hijacked' }))
        .toEqual({ status: 403, detail: VIEW_ONLY_BLOCKED })
      expect(await api.apiProbe(impToken, 'POST', '/api/v1/auth/logout-all'))
        .toEqual({ status: 403, detail: VIEW_ONLY_BLOCKED })

      // No privilege carry-over: the token's `sub` is the customer, so admin
      // routes refuse it on the role check, before the middleware is involved.
      expect(await api.apiProbe(impToken, 'GET', '/api/v1/admin/customers/'))
        .toMatchObject({ status: 403 })

      // --- Scoped: peers and deactivated accounts are refused ---------------
      const peer = await api.impersonate(admin.accessToken, adminId)
      expect(peer.status).toBe(403)
      expect(peer.detail).toBe('Cannot impersonate another admin')
      expect(peer.token).toBeNull()

      const deactivated = await api.impersonate(admin.accessToken, inactiveId)
      expect(deactivated.status).toBe(400)
      expect(deactivated.detail).toBe('Cannot impersonate an inactive customer')
      expect(deactivated.token).toBeNull()

      // A refusal is not a session, so it leaves no trail — while the successful
      // one above did. Asserting both sides keeps this falsifiable.
      const impersonationsOf = async (id: number) =>
        (await api.getAuditEvents('customer', id)).filter(e => e.action === 'impersonate')
      expect(await impersonationsOf(customerId)).toHaveLength(1)
      expect(await impersonationsOf(adminId)).toHaveLength(0)
      expect(await impersonationsOf(inactiveId)).toHaveLength(0)
    }
    finally {
      await api.dispose()
    }
  })
})
