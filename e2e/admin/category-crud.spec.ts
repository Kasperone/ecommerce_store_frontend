import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

// Smoke guard for the category admin UI. Its single most important job is to
// fail loudly if the page-level components stop resolving — the exact class of
// bug (pathPrefix bare-name vs `Admin*` auto-import name) that left the whole
// category admin page silently dead in production until 2026-05-25. A bare
// `<CategoryFormModal>` renders nothing and only emits a Vue *warning*, so unit
// specs (which mount each component directly) can't catch it; only a real
// page render through Nuxt's auto-import resolver does.
//
// Deliberately NOT covered here (kept in Vitest against the same Vue source):
//   - create → row-appears: the collection POST relies on the `/api/v1/categories/`
//     trailing slash to dodge a 307 through the h3 dev proxy (a fix that ships
//     in a separate PR), and the e2e category tables aren't truncated between
//     runs, so a real create would also need a category-cleanup helper that
//     doesn't exist yet. The form modal's submit/validation paths are covered
//     by app/components/admin/CategoryFormModal.spec.ts.
//   - edit / move / delete dialogs: same render-resolution mechanism as the
//     create modal, so this smoke transitively guards them; their behavior is
//     covered by the per-component Vitest specs.
test('admin category page renders and opens the create modal', async ({ page }) => {
  // Generous budget: e2e runs against `npm run dev` (Vite), and this spec sorts
  // first, so it eats the *cold* on-demand compile of a heavy admin page (tree +
  // drag-and-drop + modals). That cold compile is what made the old 30 s budget
  // flake — both via a hung `networkidle` and via a too-short retry loop.
  test.setTimeout(90_000)

  const api = await ApiClient.create()

  // Any `Failed to resolve component` warning means an auto-import name is
  // wrong — assert the page produced none. Attach before navigation so we
  // catch warnings emitted during the initial render.
  const resolveWarnings: string[] = []
  page.on('console', (msg) => {
    if (msg.text().includes('Failed to resolve component')) {
      resolveWarnings.push(msg.text())
    }
  })

  try {
    // Inject the refresh cookie so the auth plugin's boot /auth/refresh restores
    // the Pinia session on page load — skips the UI login form and spares the
    // slowapi per-email/-IP budget. Mirrors e2e/admin/product-gallery.spec.ts.
    const { refreshCookie } = await api.loginViaApi(
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

    await page.goto('/admin/categories')

    // Page shell rendered (tree query may resolve to an empty DB — that's fine).
    // 30 s because a cold Vite dev compile of this route can be slow on the first hit.
    await expect(page.getByRole('heading', { name: 'Categories', exact: true }))
      .toBeVisible({ timeout: 30_000 })
    // Best-effort settle so the retry loop below starts on a compiled+hydrated page
    // (the click only opens the modal once the component graph has compiled). It's
    // BOUNDED + `.catch`-swallowed: against the dev server `networkidle` can never
    // settle (HMR + the auth plugin's proactive-refresh timer + Colada keep the
    // network warm), and an unbounded wait there used to eat the whole budget and
    // time the test out. So we give it a head start, then fall through to the loop.
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    await test.step('clicking "New category" opens the form modal', async () => {
      const dialog = page.getByRole('dialog')

      // THE assertion that fails on the F1 bug: a bare-named <CategoryFormModal>
      // never mounts, so no dialog ever appears no matter how many times we click.
      //
      // Retry the click because in this SPA the "Categories" heading can paint a
      // beat before Vue binds the button's @click handler under the e2e
      // cookie-injection auth path — a single early click lands on the button
      // (it focuses) but is dropped before the handler exists, and there's no
      // second click to recover. Re-clicking until the dialog mounts is robust
      // to that hydration race while still failing hard if the component is
      // unresolved (the regression this smoke guards). Verified by hand that a
      // click on a hydrated page reliably opens *and keeps* the modal open, so
      // this can't mask an open-then-dismiss bug.
      await expect(async () => {
        await page.getByRole('button', { name: 'New category' }).click()
        await expect(dialog).toBeVisible({ timeout: 1000 })
      }).toPass({ timeout: 30_000 })

      // The EN pane's Name + Slug inputs prove the form body rendered, not just
      // an empty shell. (Placeholders are unique to the EN locale pane.)
      const enPane = dialog.locator('[data-locale-pane="en"]')
      await expect(enPane.getByPlaceholder('Books', { exact: true })).toBeVisible()
      await expect(enPane.getByPlaceholder('books', { exact: true })).toBeVisible()
    })

    expect(resolveWarnings, `Vue failed to resolve components:\n${resolveWarnings.join('\n')}`)
      .toEqual([])
  }
  finally {
    await api.dispose()
  }
})
