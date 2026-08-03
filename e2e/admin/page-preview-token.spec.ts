// CMS preview tokens — `POST /admin/pages/{id}/preview-token` traded at
// `GET /pages/{slug}/preview?token=` for a page's DRAFT layout.
//
// This is the one place in the CMS where an **unauthenticated** request is
// allowed to read content the store has not published. So the file is written
// around the refusals, not the happy path: a spec that only proved "a valid
// token opens the draft" would pass just as well against a route that opened
// the draft for *anyone*.
//
// Four ways a token must fail, and each is a different mechanism:
//
//   * tampered signature  -> the HMAC itself
//   * page A's token on page B  -> the `pid` binding
//   * expired token  -> the `exp` claim
//   * any of the above on a slug that does not exist  -> must be
//     indistinguishable from the rest (anti-enumeration: a preview link never
//     confirms a page exists, which is why the route 404s rather than 401/403)
//
// ⚠️ Negatives are worthless without a positive control, and this file needs
// TWO. See `signPreviewToken` in the fixture: the expired token is signed by the
// spec (the admin API has no ttl knob), which duplicates the backend's scheme —
// and because `verify_preview_token` checks the signature FIRST, any drift turns
// the "expired" token into a merely malformed one that still 404s, leaving the
// test green and empty. Control B closes that hole by signing a FUTURE-dated
// token the same way and requiring a 200.
//
// The token is NOT bound to draft content or version — editing the draft does
// not kill an outstanding link (see the docstring correction in BE #231). That
// is deliberate, and test 1 depends on it: the Preview button flushes unsaved
// edits and then mints, i.e. the feature is "show me my working draft".
import { expect, test, type Locator, type Page } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(240_000)

// File-owned prefix, so the purge can never eat a sibling spec's fixtures.
// Purged at test START as well as in `finally` — a test-timeout kill never runs
// `finally`, and `pages.slug` is unique per locale.
const SLUG_PREFIX = 'e2e-preview-'

/**
 * Inject the refresh cookie so the auth plugin's boot `/auth/refresh` restores
 * the session — skips the login form and spares the slowapi per-email budget.
 * Returns the access token for API seeding.
 */
async function signInAdmin(page: Page, api: ApiClient): Promise<string> {
  const { accessToken, refreshCookie } = await api.loginViaApi(
    KNOWN_ADMIN.email,
    KNOWN_ADMIN.password,
  )
  await page.context().addCookies([{
    name: refreshCookie.name,
    value: refreshCookie.value,
    domain: refreshCookie.domain,
    path: refreshCookie.path,
    httpOnly: refreshCookie.httpOnly,
    secure: refreshCookie.secure,
    sameSite: refreshCookie.sameSite,
  }])
  return accessToken
}

/** The Hero block's `Heading` text input in the settings pane (the #357 seam). */
function headingField(page: Page): Locator {
  return page.getByLabel('Heading', { exact: true })
}

test.describe('CMS preview tokens', () => {
  test('the Preview button opens the unsaved draft of a page the public cannot reach', async ({ page, context }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const slug = `${SLUG_PREFIX}${runId}-live`
    const savedHeading = `E2E saved heading ${runId}`
    const unsavedHeading = `E2E unsaved heading ${runId}`

    try {
      await api.purgePagesBySlugPrefix(SLUG_PREFIX)
      const token = await signInAdmin(page, api)
      const { id: pageId } = await api.createPage(token, {
        slug,
        type: 'landing',
        sections: [{ type: 'hero', settings: { heading: savedHeading } }],
      })

      // The control that gives the rest of the test its meaning: the page is a
      // draft, so the public route does not serve it at all. Whatever the
      // preview tab shows later cannot be "it was public anyway".
      expect((await api.fetchPublicPage(slug)).status).toBe(404)

      await page.goto(`/admin/pages/${pageId}`)
      // 120 s: a heavy admin route's first client-side hit pays an on-demand
      // Vite compile (this editor pulls in the whole block registry), and the
      // URL does not move until it lands — the #357 lesson.
      await expect(headingField(page)).toHaveValue(savedHeading, { timeout: 120_000 })

      // Edit WITHOUT saving. `onPreviewDraft` calls `flushDraft()` before it
      // mints, so the preview must show this text — that flush is the whole
      // reason the button exists rather than a plain link, and nothing else
      // asserts it.
      await headingField(page).fill(unsavedHeading)

      // The button opens a new tab via `window.open`.
      const popupPromise = context.waitForEvent('page')
      await page.getByTestId('preview-draft').click()
      const preview = await popupPromise
      await preview.waitForLoadState('domcontentloaded')

      await expect(preview.getByText(unsavedHeading)).toBeVisible({ timeout: 120_000 })
      expect(new URL(preview.url()).searchParams.get('token')).toBeTruthy()

      // Previewing is not publishing. Without this, a regression that published
      // the page in order to show it would sail through the assertion above.
      const row = await api.getPageRow(slug)
      expect(row?.status).toBe('draft')
      expect(row?.published_layout).toBeNull()
      // ...and the flush really did persist the edit, rather than the preview
      // having been served from some in-memory copy.
      expect(row?.draft_layout.sections[0]?.settings.heading).toBe(unsavedHeading)

      // Still unreachable without a token, now that it has been previewed.
      expect((await api.fetchPublicPage(slug)).status).toBe(404)
    }
    finally {
      await api.purgePagesBySlugPrefix(SLUG_PREFIX)
      await api.dispose()
    }
  })

  test('a preview token is refused when tampered, reused across pages, or expired', async ({ page }) => {
    const api = await ApiClient.create()
    const runId = Date.now()
    const slugA = `${SLUG_PREFIX}${runId}-a`
    const slugB = `${SLUG_PREFIX}${runId}-b`
    const headingA = `E2E draft A ${runId}`
    const headingB = `E2E draft B ${runId}`

    try {
      await api.purgePagesBySlugPrefix(SLUG_PREFIX)
      const token = await signInAdmin(page, api)
      const { id: idA } = await api.createPage(token, {
        slug: slugA,
        sections: [{ type: 'hero', settings: { heading: headingA } }],
      })
      await api.createPage(token, {
        slug: slugB,
        sections: [{ type: 'hero', settings: { heading: headingB } }],
      })

      // ---- Control A: a real token from the admin API works, and serves the
      // DRAFT (neither page is published, so "200" alone would not show which
      // layout came back).
      const { token: validToken } = await api.mintPreviewToken(token, idA)
      const ok = await api.previewPage(slugA, validToken)
      expect(ok.status).toBe(200)
      expect(ok.heading).toBe(headingA)

      // ---- Control B: the spec's own signing matches the backend's.
      // Mandatory. The expiry case below is only meaningful if a token this
      // function signs is otherwise acceptable — otherwise "expired -> 404"
      // could just be "malformed -> 404". If the backend's scheme changes, this
      // is the assertion that says so.
      const selfSigned = await api.previewPage(
        slugA,
        api.signPreviewToken(idA, { expiresInSeconds: 600 }),
      )
      expect(selfSigned.status).toBe(200)
      expect(selfSigned.heading).toBe(headingA)

      // ---- Negative 1: tampered signature. Flip one character of the sig half
      // (no key needed) and the constant-time compare must reject it.
      const [body, sig] = validToken.split('.')
      const tampered = `${body}.${sig[0] === 'A' ? 'B' : 'A'}${sig.slice(1)}`
      expect((await api.previewPage(slugA, tampered)).status).toBe(404)

      // ---- Negative 2: page A's perfectly valid token against page B. This is
      // the `pid` binding, and it is the one that matters most in practice —
      // preview links get pasted around, and one leaking into a different
      // page's draft would be a real disclosure.
      const crossPage = await api.previewPage(slugB, validToken)
      expect(crossPage.status).toBe(404)
      expect(crossPage.heading).toBeNull()

      // ---- Negative 3: correctly signed, past `exp`.
      const expired = await api.previewPage(
        slugA,
        api.signPreviewToken(idA, { expiresInSeconds: -60 }),
      )
      expect(expired.status).toBe(404)

      // ---- Negative 4: anti-enumeration. A well-formed token against a slug
      // that does not exist must be indistinguishable from a bad token against
      // one that does — same status AND same detail, or the 404 becomes an
      // existence oracle.
      const missing = await api.previewPage(`${SLUG_PREFIX}${runId}-nope`, validToken)
      expect(missing.status).toBe(404)
      expect(missing.detail).toBe(crossPage.detail)

      // Nothing above published or mutated either page — the refusals are
      // refusals, not side effects.
      for (const [slug, heading] of [[slugA, headingA], [slugB, headingB]] as const) {
        const row = await api.getPageRow(slug)
        expect(row?.status).toBe('draft')
        expect(row?.published_layout).toBeNull()
        expect(row?.draft_layout.sections[0]?.settings.heading).toBe(heading)
      }
    }
    finally {
      await api.purgePagesBySlugPrefix(SLUG_PREFIX)
      await api.dispose()
    }
  })
})
