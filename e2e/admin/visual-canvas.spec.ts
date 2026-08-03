// The CMS visual canvas (`/admin/pages/[id]` → Visual mode) — specifically the
// **ordering** operations, which are the only thing this surface can do that the
// form mode cannot.
//
// Worth stating why this is not redundant with `cms-page-builder.spec.ts` (#357),
// because the uncovered-surface brief assumed it was: that spec works with a
// SINGLE section and every assertion in it reads `sections[0]`. It never moves,
// inserts, or removes anything. So `moveSection` / `addSectionAt` /
// `removeSection` are uncovered by any e2e, in either mode — this file covers the
// ordering contract itself, reached through the only UI that exposes it.
//
// Equally worth stating what this file deliberately does NOT do: re-prove
// `usePageEditorState`. Its unit spec already covers the bounds check, the
// `addSectionAt` clamp, and `reorder()` never dropping or duplicating on a stale
// list. Asserting that logic again through a browser would be pure cost. What
// unit tests cannot reach, and what this file is for:
//
//   1. the WIRING — a real key event on a focused block, through the `move`
//      emit's cid + direction, the page handler, the editor, `toLayoutSections`
//      stripping `__cid`, the PATCH, and finally the order stored in
//      `pages.draft_layout`;
//   2. the `add-at` COMPOSITION — drop-zone index → `openAddAt(index)` → the
//      shared add-section modal → an insert at *that* index (nothing unit-tests
//      the modal round-trip);
//   3. that the canvas works at all in a real browser.
//
// NOT covered: the vuedraggable drop path (the `reorder` emit carrying a full cid
// order). It is a different code path from `move`, and reaching it needs native
// HTML5 drag — the same thing that blocks §4 of the brief. `reorder()` is
// unit-tested, including the partial/stale-list case.
import { expect, test, type Locator, type Page } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(240_000)

// File-owned prefix. Purged at test START as well as in `finally` — a
// test-timeout kill never runs `finally`, and `pages.slug` is unique per locale.
const SLUG_PREFIX = 'e2e-canvas-'

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

/**
 * Open the editor in Visual mode and wait until the canvas is genuinely
 * INTERACTIVE — not merely visible.
 *
 * ⚠️ The distinction is the whole reason this helper is more than two lines, and
 * it cost several runs to pin down. Blocks being present is not the same as the
 * canvas being wired: the visual pane sits behind `v-else-if` inside
 * `<ClientOnly>`, so clicking the Visual tab is what first pulls its chunk, and
 * against the Vite dev server that compile lands *after* the markup does. A key
 * event fired into that window is simply lost — the order never changes, which
 * is indistinguishable from "the shortcut is broken".
 *
 * The evidence: the first execution after a fresh dev server takes ~15 s while
 * repeats inside the same server take ~3 s, and **every** observed failure was on
 * a 15 s run, never on a warm one.
 *
 * So readiness is proven positively, with a round-trip that only completes if the
 * component's events are live: click a block's select overlay and require
 * `data-selected="true"` to come back — click → `select` emit → page handler →
 * prop back down → DOM. Clicking select is idempotent, so retrying is safe
 * (unlike retrying a move, which would reorder twice).
 */
async function openVisualCanvas(
  page: Page,
  pageId: number,
  blockCount: number,
): Promise<Locator> {
  await page.goto(`/admin/pages/${pageId}`)
  // 120 s: this editor pulls in the whole block registry plus the rich-text
  // editor, and against the Vite dev server the first hit pays that compile
  // before anything renders (the #357 lesson).
  const toggle = page.getByTestId('edit-mode-toggle')
  await expect(toggle).toBeVisible({ timeout: 120_000 })
  await toggle.getByRole('tab', { name: 'Visual' }).click()

  const canvas = page.getByTestId('visual-canvas')
  await expect(canvas).toBeVisible({ timeout: 60_000 })
  await expect(canvas.locator('[data-testid^="canvas-block-"]'))
    .toHaveCount(blockCount, { timeout: 60_000 })

  await expect(async () => {
    await page.getByTestId('canvas-select-0').click({ timeout: 5_000 })
    await expect(page.getByTestId('canvas-block-0'))
      .toHaveAttribute('data-selected', 'true', { timeout: 3_000 })
  }).toPass({ timeout: 60_000 })

  return canvas
}

/** The headings currently rendered by the canvas, in canvas order. */
async function canvasOrder(canvas: Locator): Promise<string[]> {
  return await canvas.locator('[data-testid^="canvas-block-"]').allInnerTexts()
}

/**
 * Assert the canvas shows exactly these headings, in order.
 *
 * Matches on `toContain` per block rather than equality: a block renders its
 * toolbar label and the block's own content, so its innerText carries more than
 * the heading.
 */
async function expectCanvasOrder(
  canvas: Locator,
  expected: string[],
  timeout = 20_000,
): Promise<void> {
  await expect.poll(async () => {
    const texts = await canvasOrder(canvas)
    return texts.length === expected.length
      && expected.every((h, i) => texts[i]?.includes(h))
  }, { timeout }).toBe(true)
}

/**
 * Focus a canvas block and PROVE it took focus before anything is typed at it.
 * Retrying is safe because focusing is idempotent.
 */
async function focusBlock(block: Locator): Promise<void> {
  await expect(async () => {
    await block.focus()
    await expect(block).toBeFocused({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
}

/**
 * Move the block containing `heading` with Alt+Arrow, retrying until the canvas
 * actually shows `expected`.
 *
 * ⚠️ Why a *guarded* retry rather than a plain one, and why this exists at all.
 * A draft save invalidates the page query; the refetch re-renders the canvas with
 * freshly minted `__cid`s, so the node under the cursor is replaced. A keypress
 * issued in that window lands on a detached node and is silently lost — the order
 * simply does not change, which is indistinguishable from "Alt+Arrow is broken".
 * Measured at ~1 failure in 10 cold runs, always on the step straight after a
 * save. Proving focus first is not enough: focus is true at the moment it is
 * checked and gone a tick later.
 *
 * A move is not idempotent, so the retry is guarded by the order itself — if the
 * canvas already shows `expected`, the press already landed and we must not press
 * again. That keeps the assertion exact (the precise order, not "something
 * changed") while tolerating a lost keystroke.
 */
async function moveBlockUntil(
  page: Page,
  canvas: Locator,
  heading: string,
  direction: 'Up' | 'Down',
  expected: string[],
): Promise<void> {
  await expect(async () => {
    const current = await canvasOrder(canvas)
    const alreadyThere = current.length === expected.length
      && expected.every((h, i) => current[i]?.includes(h))
    if (alreadyThere) return

    const block = canvas.locator('[data-testid^="canvas-block-"]').filter({ hasText: heading })
    await focusBlock(block)
    await page.keyboard.press(`Alt+Arrow${direction}`)
    await expectCanvasOrder(canvas, expected, 5_000)
  }).toPass({ timeout: 60_000 })
}

/** Save the draft and wait for the request to land. */
async function saveDraft(page: Page): Promise<void> {
  const saved = page.waitForResponse(
    r => /\/api\/v1\/admin\/pages\/\d+\/draft$/.test(r.url())
      && r.request().method() === 'PATCH'
      && r.ok(),
    { timeout: 60_000 },
  )
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await saved
}

/** Stored section headings, in stored order. */
function storedOrder(
  layout: { sections: Array<{ settings: Record<string, unknown> }> } | null,
): unknown[] {
  return (layout?.sections ?? []).map(s => s.settings.heading)
}

test.describe('CMS visual canvas', () => {
  test('keyboard reorder persists, and does not wrap past the first block', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const slug = `${SLUG_PREFIX}${runId}-move`
    const [a, b, c] = [`A-${runId}`, `B-${runId}`, `C-${runId}`]

    try {
      await api.purgePagesBySlugPrefix(SLUG_PREFIX)
      const token = await signInAdmin(page, api)
      const { id: pageId } = await api.createPage(token, {
        slug,
        type: 'landing',
        sections: [a, b, c].map(heading => ({ type: 'hero', settings: { heading } })),
      })

      const canvas = await openVisualCanvas(page, pageId, 3)
      await expectCanvasOrder(canvas, [a, b, c])

      // ---- Alt+ArrowDown on the first block, and it survives a save ----
      await moveBlockUntil(page, canvas, a, 'Down', [b, a, c])
      await saveDraft(page)
      expect(storedOrder((await api.getPageRow(slug))!.draft_layout)).toEqual([b, a, c])

      // Move it back. This also re-establishes that the canvas is live *after* a
      // save, which is the window where a keystroke can get eaten.
      await moveBlockUntil(page, canvas, a, 'Up', [a, b, c])

      // ---- the boundary: Alt+ArrowUp on the FIRST block must not wrap ----
      // ⚠️ Deliberately placed here, straight after a proven-live interaction and
      // with NO save in between — a save re-renders the canvas, and a keystroke
      // lost to that re-render would leave the order unchanged, i.e. it would
      // look exactly like the no-op we are trying to prove.
      //
      // Even so, "nothing happened" cannot stand on its own (the #359 rule). So
      // the no-op press is WITNESSED: immediately after it, without re-focusing,
      // Alt+ArrowDown must move the very same block. If the down press works, the
      // up press a moment earlier certainly reached the component too.
      //
      // The witness press is deliberately NOT retried — a retried press would
      // only prove the element works *eventually*, which says nothing about
      // whether it was live during the no-op. Instead the whole sequence retries
      // as a unit, and each attempt re-normalises to [a, b, c] first (a move that
      // is already satisfied returns without pressing, so this is safe). A
      // keystroke lost to a re-render therefore costs one repeat rather than a
      // red run — while a genuinely broken no-op still fails, because the retry
      // always starts from the same known state.
      await expect(async () => {
        await moveBlockUntil(page, canvas, a, 'Up', [a, b, c]) // normalise
        await focusBlock(page.getByTestId('canvas-block-0'))

        await page.keyboard.press('Alt+ArrowUp')
        await expectCanvasOrder(canvas, [a, b, c], 3_000) // the no-op under test

        await page.keyboard.press('Alt+ArrowDown')
        await expectCanvasOrder(canvas, [b, a, c], 5_000) // the witness
      }).toPass({ timeout: 90_000 })

      await moveBlockUntil(page, canvas, a, 'Up', [a, b, c]) // restore

      await saveDraft(page)
      expect(storedOrder((await api.getPageRow(slug))!.draft_layout)).toEqual([a, b, c])

      // Reordering a draft is not publishing it.
      const row = await api.getPageRow(slug)
      expect(row?.status).toBe('draft')
      expect(row?.published_layout).toBeNull()
    }
    finally {
      await api.purgePagesBySlugPrefix(SLUG_PREFIX)
      await api.dispose()
    }
  })

  test('a drop-zone inserts at its own index, and a block can be removed', async ({ page }) => {
    test.slow()
    const api = await ApiClient.create()
    const runId = Date.now()
    const slug = `${SLUG_PREFIX}${runId}-insert`
    const [a, b, c] = [`A-${runId}`, `B-${runId}`, `C-${runId}`]
    const inserted = `NEW-${runId}`

    try {
      await api.purgePagesBySlugPrefix(SLUG_PREFIX)
      const token = await signInAdmin(page, api)
      const { id: pageId } = await api.createPage(token, {
        slug,
        type: 'landing',
        sections: [a, b, c].map(heading => ({ type: 'hero', settings: { heading } })),
      })

      const canvas = await openVisualCanvas(page, pageId, 3)
      await expectCanvasOrder(canvas, [a, b, c])

      // ---- insert BETWEEN A and B via the drop-zone that sits there ----
      // The whole reason drop-zones are per-index: an append would look almost
      // identical in the UI, and only the stored order tells them apart.
      await page.getByTestId('dropzone-1').click()
      const presets = page.getByRole('list', { name: 'Add a section' })
      await expect(presets).toBeVisible({ timeout: 30_000 })
      // Each preset button renders the preset name over the block name, so its
      // accessible name is "Hero Hero" — filter the list item (the #357 note).
      await presets.locator('li').filter({ hasText: 'Hero' }).getByRole('button').first().click()

      // Picking a preset selects the new section, so its settings form is live.
      const headingField = page.getByLabel('Heading', { exact: true })
      await expect(headingField).toBeVisible({ timeout: 30_000 })
      await headingField.fill(inserted)

      await saveDraft(page)
      expect(storedOrder((await api.getPageRow(slug))!.draft_layout))
        .toEqual([a, inserted, b, c])

      // ---- remove B through its toolbar ----
      const blockB = page.locator('[data-testid^="canvas-block-"]').filter({ hasText: b })
      await blockB.hover()
      await blockB.getByRole('button', { name: 'Remove section' }).click()
      await expectCanvasOrder(canvas, [a, inserted, c])

      await saveDraft(page)
      const finalRow = await api.getPageRow(slug)
      expect(storedOrder(finalRow!.draft_layout)).toEqual([a, inserted, c])

      // C is never touched by either operation and must still be last — so
      // "the list changed" cannot be mistaken for "the list broke".
      expect(storedOrder(finalRow!.draft_layout).at(-1)).toBe(c)
      expect(finalRow?.published_layout).toBeNull()
    }
    finally {
      await api.purgePagesBySlugPrefix(SLUG_PREFIX)
      await api.dispose()
    }
  })
})
