import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'

/**
 * Wait for the Media section, the readiness signal for the admin product-edit
 * route (and the precondition for `setInputFiles` targeting a stable DOM).
 *
 * The timeout has to be explicit and generous: that route cold-compiles on
 * first hit and stays slow even warm, so the 5s default is a latent flake. It
 * goes red whenever lint/unit/typecheck share a CI host with e2e — FE #344
 * fixed exactly this pattern in the order specs, but this spec predates the
 * rule and kept the default until a longer e2e run finally tipped it over.
 */
async function waitForMediaSection(page: Page): Promise<void> {
  const heading = page.getByRole('heading', { name: 'Media', exact: true })
  await expect(heading).toBeVisible({ timeout: 60_000 })
}

const FIXTURE_DIR = path.join(process.cwd(), 'e2e', 'fixtures', 'images')
const RED_PNG = path.join(FIXTURE_DIR, 'gallery-red.png')
const BLUE_PNG = path.join(FIXTURE_DIR, 'gallery-blue.png')

test.skip(!process.env.E2E_R2_ENABLED, 'requires real R2 dev creds; set E2E_R2_ENABLED=1')
test.use({ storageState: { cookies: [], origins: [] } })

// Covers the gallery's real-R2 path end-to-end via two test.step phases:
// upload (POST → R2) and set-primary (PATCH). Alt-text, drag-reorder, and
// the delete-popover UI flows are documented inline as known E2E gaps and
// stay covered by Vitest specs against the same Vue source.
test('admin product image gallery lifecycle (real R2)', async ({ page }) => {
  // Real-R2 round-trips dominate runtime — a typical pass is ~4s. The budget is
  // 120s (the admin-spec convention) rather than 60s so that the generous
  // per-navigation waits above can actually spend their allowance on a
  // contended runner instead of silently eating the whole test's timeout.
  test.setTimeout(120_000)

  const api = await ApiClient.create()
  let productId = 0
  let adminToken = ''

  try {
    // Preflight: surface a clearer error than a mid-test 503 if the backend
    // isn't up or R2 vars aren't loaded.
    const backendUrl = process.env.E2E_BACKEND_URL ?? 'http://localhost:8000'
    const health = await fetch(`${backendUrl}/health`)
    if (!health.ok) {
      throw new Error(`backend /health returned ${health.status} — start uvicorn with R2 creds in .env`)
    }

    const { accessToken, refreshCookie } = await api.loginViaApi(
      KNOWN_ADMIN.email,
      KNOWN_ADMIN.password,
    )
    adminToken = accessToken

    const slug = `e2e-gallery-${Date.now()}`
    const product = await api.createProduct(adminToken, {
      name: `E2E Gallery ${slug}`,
      slug,
      price_usd: 1,
      price_pln: 1,
      price_eur: 1,
    })
    productId = product.id

    // Inject the refresh cookie so the auth plugin's boot /auth/refresh
    // populates the Pinia store on page load — skips the UI login form
    // entirely. Without this we'd burn one /auth/login per spec run from
    // the browser's IP (::1), and slowapi caps that at 5/15min per email.
    // Omitting `expires` makes it a session cookie, which is what we want.
    await page.context().addCookies([{
      name: refreshCookie.name,
      value: refreshCookie.value,
      domain: refreshCookie.domain,
      path: refreshCookie.path,
      httpOnly: refreshCookie.httpOnly,
      secure: refreshCookie.secure,
      sameSite: refreshCookie.sameSite,
    }])

    await page.goto(`/admin/products/${productId}/edit`)
    // Wait for useProductQuery to resolve so the uploader is mounted, then
    // let in-flight requests settle so setInputFiles targets a stable DOM.
    await waitForMediaSection(page)
    await page.waitForLoadState('networkidle')

    // Scope to the Media <section> — the gallery <ul> is the only list there.
    // (Filtering on getByRole('img') doesn't work: the gallery's <img> has
    // alt="" until alt-text is saved, which makes it presentational with no
    // implicit role.)
    const mediaSection = page.locator('section', {
      has: page.getByRole('heading', { name: 'Media', exact: true }),
    })
    const tiles = mediaSection.getByRole('list').locator('> li')

    await test.step('uploads two images via the drop-zone file input', async () => {
      const fileInput = page.locator('input[type="file"]')
      await fileInput.setInputFiles([RED_PNG, BLUE_PNG])

      // Two real R2 round-trips; the uploader processes files sequentially.
      await expect(tiles).toHaveCount(2, { timeout: 30_000 })
      await expect(tiles.first().getByText(/16\s*×\s*16/)).toBeVisible()
      await expect(tiles.nth(1).getByText(/16\s*×\s*16/)).toBeVisible()

      const dbImages = await api.listProductImages(productId)
      expect(dbImages).toHaveLength(2)
    })

    await test.step('sets the second tile as primary', async () => {
      const patchPromise = page.waitForResponse(
        r => /\/images\/\d+$/.test(r.url()) && r.request().method() === 'PATCH',
      )
      await tiles.nth(1).getByRole('button', { name: 'Set as primary' }).click()
      await patchPromise

      await page.reload()
      await waitForMediaSection(page)
      // The primary tile renders "Primary" twice (badge + label replacing the
      // "Set as primary" button) — take the first match.
      await expect(tiles.nth(1).getByText('Primary', { exact: true }).first()).toBeVisible()
      await expect(tiles.nth(0).getByRole('button', { name: 'Set as primary' })).toBeVisible()
    })

    // Alt-text persistence is intentionally NOT covered here. Driving a
    // value into Nuxt UI's UInput from Playwright is unreliable — neither
    // .fill(), pressSequentially, dispatched input events, nor the native
    // value-setter override consistently triggers UInput's
    // @update:model-value emit (the v-model proxy seems to filter our
    // externally-applied mutations). Vitest covers the alt-text save +
    // PATCH path in app/components/admin/ProductImageGallery.spec.ts
    // against the same Vue source. Revisit when Nuxt UI 4 ships a stable
    // testid attribute on the native input or when Playwright's
    // interaction model evolves.

    // Drag-reorder is intentionally NOT covered here.
    // @formkit/drag-and-drop uses native HTML5 drag events (draggable=true
    // + drag*/drop events). Playwright's dragTo() and manual pointer
    // sequences don't reliably trip the library's drag-start threshold in
    // headless Chromium — no PATCH /sort_order ever fires. Vitest covers
    // the gallery's onSort handler + PATCH wiring in
    // app/components/admin/ProductImageGallery.spec.ts. Revisit when
    // Playwright adds first-class HTML5-drag support or the library exposes
    // a programmatic reorder hook.

    // Delete via UPopover doesn't open reliably in headless Playwright —
    // the trigger sits inside a draggable <li>, so the UPopover toggle
    // races with @formkit/drag-and-drop's pointer hooks and never mounts
    // the confirm content. We exercise the real DELETE + R2 cleanup path
    // via the API instead, then verify the gallery reactively shrinks.
    await test.step('deletes an image via API and gallery reactively shrinks', async () => {
      const beforeRows = await api.listProductImages(productId)
      expect(beforeRows).toHaveLength(2)
      const survivorId = beforeRows[1].id
      const deletedId = beforeRows[0].id

      await api.deleteProductImage(adminToken, productId, deletedId)

      await page.reload()
      await waitForMediaSection(page)
      await expect(tiles).toHaveCount(1)

      const after = await api.listProductImages(productId)
      expect(after).toHaveLength(1)
      expect(after[0].id).toBe(survivorId)
    })
  }
  finally {
    if (productId > 0 && adminToken) {
      try {
        const remaining = await api.listProductImages(productId)
        for (const img of remaining) {
          await api.deleteProductImage(adminToken, productId, img.id)
        }
        await api.deleteProduct(adminToken, productId)
      }
      catch {
        // Cleanup is best-effort; orphans land at products/<productId>/<uuid>.
      }
    }
    await api.dispose()
  }
})
