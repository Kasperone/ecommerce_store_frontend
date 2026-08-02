// Active-sessions list + revocation from /account/security.
//
// The spec is built on the CONTRAST between the two revoke controls, because
// that contrast is the whole security promise and nothing else asserts it:
//
//   DELETE /auth/sessions/{id}  kills one *refresh* row. The other session's
//                               already-issued ACCESS token keeps working
//                               until it expires — only its /auth/refresh dies.
//   POST   /auth/logout-all     revokes the whole family AND bumps
//                               `password_changed_at`, which moves the `iat`
//                               floor in get_current_user — so already-issued
//                               access tokens stop validating EVERYWHERE.
//
// Asserting the per-session case honestly (the access token survives) is what
// makes the logout-all assertion mean something: without it, "B is locked out"
// could just be the probe being broken.
//
// Two live sessions, one browser: the browser holds session A (its refresh
// cookie is injected), while session B is held over the API — `loginViaApi`
// returns both halves of a real session, so B is a genuine second login, not a
// simulation. Each login carries a distinct User-Agent, which the backend
// persists onto `refresh_tokens.user_agent` and the table renders in the Device
// column, so B's row is locatable by name rather than by position.
//
// ⚠️ Only B's. The BROWSER's row identity is not stable: an SSR-side
// `/auth/refresh` rotates it, revoking the original row and inserting a
// replacement whose user-agent is the Nuxt server's ("node"). Whether that
// happens is environment-dependent — it does in CI, it did not against a local
// dev server, which is exactly how a first cut of this spec passed locally and
// failed on CI. The browser's row is therefore always addressed by its "This
// device" badge, and pg claims about it are counted over LIVE rows rather than
// pinned to a total.
//
// Ground truth is pg, never the response body or a toast (toasts are transient
// and `GET /auth/sessions` filters revoked rows out, so a row's disappearance
// there is indistinguishable from a deleted row — `revoked_at` is the fact).
//
// Not covered here on purpose: the 404-not-403 anti-enumeration contract for a
// foreign/unknown/already-revoked session id, which backend
// `tests/integration/test_auth_sessions.py` already covers at the route level.
import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(120_000)

const ME = '/api/v1/auth/me'

test.describe('Account sessions', () => {
  test('revoking one session kills its refresh, not its access token', async ({ page }) => {
    const api = await ApiClient.create()
    const user = randomEphemeralUser()
    const runId = randomBytes(3).toString('hex')
    const uaA = `E2E-Session-A-${runId}`
    const uaB = `E2E-Session-B-${runId}`
    try {
      await api.register(user)
      await api.markVerified(user.email)
      const userId = await api.userIdByEmail(user.email)

      // A = the browser's session (cookie injected), B = held over the API.
      const a = await api.loginViaApi(user.email, user.password, uaA)
      const b = await api.loginViaApi(user.email, user.password, uaB)
      await page.context().addCookies([a.refreshCookie])

      // Control: B's access token works BEFORE anything is revoked, so a later
      // 401/200 is a statement about the revoke rather than about the probe.
      expect((await api.apiProbe(b.accessToken, 'GET', ME)).status).toBe(200)

      await page.goto('/account/security')
      // Hydration gate — the sessions query is client-gated, so the rows only
      // exist once the client has taken over.
      await expect(page.getByRole('button', { name: 'Open cart' })).toBeVisible({ timeout: 60_000 })

      const rows = page.locator('.c-sessions-table tbody tr')
      await expect(rows).toHaveCount(2, { timeout: 30_000 })
      // The browser's row is located by its "This device" badge, NOT by uaA.
      // Session A's row identity is not stable: an SSR-side `/auth/refresh`
      // ROTATES it — revoking the original row and inserting a replacement
      // carrying the Nuxt server's own user-agent ("node"). That happens in CI
      // but not against a local dev server, so `filter({ hasText: uaA })` is a
      // locator that passes on one machine and finds nothing on another. The
      // badge tracks whichever row the browser currently holds, by definition.
      // Session B never rotates — it is held over the API and only ever read —
      // so uaB stays a valid handle on it.
      const rowCurrent = rows.filter({ hasText: 'This device' })
      const rowB = rows.filter({ hasText: uaB })

      // The asymmetry is free and falsifiable: the caller's own row is badged
      // and has no Revoke button, every other row has one. B's button being
      // PRESENT is what makes the current row's lacking one a real observation.
      await expect(rowCurrent).toHaveCount(1)
      await expect(rowB.getByRole('button', { name: 'Revoke this session' })).toBeVisible()
      await expect(rowCurrent.getByRole('button', { name: 'Revoke this session' })).toHaveCount(0)

      await rowB.getByRole('button', { name: 'Revoke this session' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toContainText('Revoke this session?')
      await dialog.getByRole('button', { name: 'Revoke', exact: true }).click()

      // The list refetches after the mutation. Pin the COUNT and keep the
      // browser's own row as one that must be PRESENT — "B is gone" on its own
      // would also be true of a table that failed to render, and the count
      // alone would not catch it either: the empty state is itself a single
      // <tr> reading "No active sessions.", so `toHaveCount(1)` passes against
      // an empty table. (Observed — this is what the over-revocation mutation
      // did, and only the badge assertion caught it.)
      await expect(rows).toHaveCount(1, { timeout: 30_000 })
      await expect(rows).toContainText('This device')

      // pg is the fact: B revoked, the browser's session untouched. Both sides
      // — a revoke_all bug would satisfy the B half on its own.
      //
      // Counted by LIVE rows rather than by total, because rotation leaves
      // revoked ancestors behind (see the locator note above) and their number
      // is environment-dependent. Exactly one live row must remain, and it must
      // not be B's: that is "one session was revoked, the other survived",
      // stated in a way rotation cannot perturb.
      const tokenRows = await api.getRefreshTokenRows(userId)
      expect(tokenRows.find(r => r.user_agent === uaB)?.revoked_at).not.toBeNull()
      const live = tokenRows.filter(r => r.revoked_at === null)
      expect(live).toHaveLength(1)
      expect(live[0]!.user_agent).not.toBe(uaB)

      // What a per-session revoke actually costs B: the refresh dies…
      expect(await api.probeRefresh(b.refreshCookie.value)).toBe(401)
      // …while the access token it already holds keeps working. This is the
      // documented behaviour, not an oversight — asserting it stops the spec
      // from quietly encoding a stronger promise than the endpoint makes.
      expect((await api.apiProbe(b.accessToken, 'GET', ME)).status).toBe(200)
    }
    finally {
      await api.dispose()
    }
  })

  test('signing out everywhere invalidates access tokens already issued elsewhere', async ({ page }) => {
    const api = await ApiClient.create()
    const user = randomEphemeralUser()
    const runId = randomBytes(3).toString('hex')
    const uaA = `E2E-Session-A-${runId}`
    const uaB = `E2E-Session-B-${runId}`
    try {
      await api.register(user)
      await api.markVerified(user.email)
      const userId = await api.userIdByEmail(user.email)
      const before = await api.getUserAuthRow(user.email)

      const a = await api.loginViaApi(user.email, user.password, uaA)
      const b = await api.loginViaApi(user.email, user.password, uaB)
      await page.context().addCookies([a.refreshCookie])

      expect((await api.apiProbe(b.accessToken, 'GET', ME)).status).toBe(200)

      await page.goto('/account/security')
      await expect(page.getByRole('button', { name: 'Open cart' })).toBeVisible({ timeout: 60_000 })
      const rows = page.locator('.c-sessions-table tbody tr')
      await expect(rows).toHaveCount(2, { timeout: 30_000 })

      await page.getByRole('button', { name: 'Sign out everywhere' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toContainText('Sign out of all devices?')
      await dialog.getByRole('button', { name: 'Sign out everywhere' }).click()

      // Assert the logged-out surface POSITIVELY. "The panel is gone" would
      // also be true of a blank page or a crashed render.
      await expect(page).toHaveURL(/\/login/, { timeout: 30_000 })
      await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible()

      // pg: the whole family is revoked, not just the caller's own row. The
      // total is a FLOOR, not a pin — an SSR-side refresh may have rotated the
      // browser's row and left an extra (also-revoked) ancestor behind. The
      // floor keeps "every row is revoked" from passing vacuously.
      const tokenRows = await api.getRefreshTokenRows(userId)
      expect(tokenRows.length).toBeGreaterThanOrEqual(2)
      expect(tokenRows.every(r => r.revoked_at !== null)).toBe(true)

      // The promise, asserted BEFORE its mechanism: B's already-issued access
      // token stops validating. Deliberately ahead of the `password_changed_at`
      // check below, so that dropping the bump fails the test on the user-
      // visible guarantee rather than on the column that implements it.
      //
      // Polled because the backend sets the floor to now + 1s deliberately (JWT
      // `iat` is whole seconds, so a token minted in the same second must die
      // too) — a dropped bump never resolves, it doesn't merely arrive late.
      await expect.poll(
        async () => (await api.apiProbe(b.accessToken, 'GET', ME)).status,
        { timeout: 15_000 },
      ).toBe(401)
      expect(await api.probeRefresh(b.refreshCookie.value)).toBe(401)

      // …and the mechanism behind it: the iat floor actually moved.
      const after = await api.getUserAuthRow(user.email)
      expect(after?.password_changed_at).not.toBeNull()
      if (before?.password_changed_at != null) {
        expect(after!.password_changed_at!.getTime())
          .toBeGreaterThan(before.password_changed_at.getTime())
      }
    }
    finally {
      await api.dispose()
    }
  })
})
