// Shared harness for the page-level WCAG 2.2 AA sweeps.
//
// WHY THIS EXISTS ALONGSIDE THE COMPONENT-LEVEL AXE SPECS
//
// `axe-core` + `vitest-axe` already run against 30+ components, which is more
// than most codebases do. But a component mounted in isolation structurally
// cannot exhibit the failures that matter most:
//
//   - landmark structure (is there one `main`? is nav labelled?)
//   - heading order across a composed page (h1 → h3 skips)
//   - duplicate ids where two components collide on the same page
//   - focus order through a multi-step form
//   - real-theme colour contrast (tokens resolve differently in the app shell)
//
// Every one of those is a whole-page property. This sweep is the only thing
// that can see them. Colour contrast in particular is invisible to the
// component specs at ANY count: jsdom does not lay out or cascade, so
// `color-contrast` is skipped there. A contrast bug can only be caught here.
//
// WHY TWO SPEC FILES AND NOT ONE
//
// `wcag.storefront.spec.ts` and `wcag.admin.spec.ts` both call `runSweep`.
// They are separate FILES, not two tests in one file, because CI shards the
// suite 3× and `fullyParallel: false` makes a file the unit of sharding — all
// tests in one file land in one shard no matter how many there are. Splitting
// the ~44 routes across two files is what keeps the widened sweep off a single
// shard's critical path.
//
// HOW IT STAYS GREEN WHILE THE BACKLOG BURNS DOWN
//
// The target is WCAG 2.2 AA. This is a RATCHET, exactly like
// `scripts/typecheck-ratchet.mjs`: `wcag-baseline.json` records the rule ids
// currently failing per route, and the sweep fails only on a rule that is NEW
// for that route. Fixing something is always safe; regressing is not.
//
// The baseline is a debt ledger, not a target. Shrinking it is the work — see
// the plan under `.claude/notes/plans/a11y/`.
//
// Granularity is the RULE ID per route, not the violation count. Counts move
// with fixture data (three products vs four) and would make the ratchet
// flap; the set of rules broken on a page is the stable, meaningful unit.
//
// REGENERATING THE BASELINE
//
//   A11Y_WRITE_BASELINE=1 npm run e2e -- e2e/a11y
//
// writes what it finds and always passes. Run it over the WHOLE directory, not
// one file: each sweep merges its own keys over what is on disk, so a
// single-file run is safe but only refreshes that file's half. Review the diff
// before committing — a growing baseline is a regression that has been waved
// through, and the whole point of the ratchet is that this takes a deliberate
// act.
//
// A shrinking `*:search` baseline usually means Meilisearch was down during
// `A11Y_WRITE_BASELINE=1` — CI runs Meili in the e2e job, so match that stack.
//
// TRIAGING A VIOLATION
//
//   A11Y_DETAIL=1 npm run e2e -- e2e/a11y
//
// adds every failing node to the output — axe's failure summary, which for
// `color-contrast` includes the measured ratio and both hex values, plus the
// element's HTML. Combine with A11Y_WRITE_BASELINE=1 to triage and re-baseline
// in a single run.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Browser, Page } from '@playwright/test'

// WCAG 2.2 AA = every A and AA success criterion from 2.0, 2.1 and 2.2.
// axe tags are cumulative, so all six must be listed.
const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']

export type Access = 'anon' | 'customer' | 'admin'
export type Locale = 'en' | 'pl'

export interface Route<Ctx> {
  /** Stable key into the baseline. Never derive it from the live URL — a
   *  fixture slug changes every run and would orphan the baseline entry. */
  key: string
  /** May carry a query string; the landing guard compares pathnames only. */
  path: (ctx: Ctx) => string
  access: Access
  /** Something that proves the page actually rendered before axe runs.
   *  Scanning a spinner produces a clean, meaningless pass — and scanning an
   *  empty `main` produces a clean, meaningless FAIL: the element exists from
   *  the first paint but has no bounding box until its content lands, so
   *  `expect(main).toBeVisible()` is not a readiness signal. Wait on rendered
   *  content instead. */
  ready: (page: Page) => Promise<void>
  /** Optional pre-navigation setup on the fresh page (init scripts, etc). */
  prepare?: (page: Page, ctx: Ctx) => Promise<void>
}

const WRITE_BASELINE = !!process.env.A11Y_WRITE_BASELINE
const DETAIL = !!process.env.A11Y_DETAIL
const BASELINE_PATH = fileURLToPath(new URL('./wcag-baseline.json', import.meta.url))

/** Generic readiness: the first rendered heading. True of every route in the
 *  tables, storefront and admin alike, and unlike `main` it only becomes
 *  visible once the page has actually painted something. */
export async function headingReady(page: Page, timeout = 60_000): Promise<void> {
  await expect(page.getByRole('heading').first()).toBeVisible({ timeout })
}

async function scan(page: Page, key: string): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_22_AA)
    // ⚠️ The suite runs against `npm run dev`, which injects the Nuxt DevTools
    // overlay into the page. axe scans it like any other DOM, and it fails
    // `color-contrast` on its own chrome (#888888 on white at 9.6px, 3.54:1).
    // That is not our app and must never reach the baseline.
    //
    // This is a LATENT FLAKE, not cosmetic noise: the overlay renders lazily, so
    // whether axe catches it depends on how long the route's readiness signal
    // happens to wait. It stayed invisible for three full sweeps and only showed
    // up once `admin-product-new` started waiting for hydration. On a route whose
    // baseline is empty, one late-rendering overlay node would introduce
    // `color-contrast` as a NEW rule id and fail CI for a violation that is not
    // in our code.
    .exclude('nuxt-devtools-frame')
    .exclude('#nuxt-devtools-anchor')
    .analyze()

  // Triage aid. The baseline stores rule ids, which is the right granularity
  // for a ratchet but useless for finding the offending code: axe's own node
  // selectors are generated Tailwind soup (`.py-1`,
  // `.router-link-active > span:nth-child(2)`). `A11Y_DETAIL=1` prints every
  // failing node with axe's failure summary, which for `color-contrast` carries
  // the measured ratio and both resolved hex values — enough to grep for. Off
  // by default: it is pages of output that CI has no use for.
  if (DETAIL) {
    for (const v of violations) {
      for (const node of v.nodes) {
        console.log(
          `  [${key}] ${v.id} — ${node.target.join(' ')}\n`
          + `      ${node.failureSummary?.replace(/\n/g, '\n      ')}\n`
          + `      ${node.html.slice(0, 240)}`,
        )
      }
    }
  }

  return [...new Set(violations.map(v => v.id))].sort()
}

export interface SweepOptions<Ctx> {
  browser: Browser
  locale: Locale
  routes: Route<Ctx>[]
  ctx: Ctx
  /** Mint a FRESH cookie per authenticated context — see the call sites. */
  cookieFor: (access: Exclude<Access, 'anon'>) => Promise<{
    name: string
    value: string
    domain: string
    path: string
  }>
}

export async function runSweep<Ctx>(opts: SweepOptions<Ctx>): Promise<void> {
  const { browser, locale, routes, ctx, cookieFor } = opts
  const onDiskAtStart = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, string[]>
  const regressions: string[] = []
  const fixed: string[] = []
  const observed: Record<string, string[]> = {}

  // `prefix_except_default`: English is unprefixed, Polish gets /pl/.
  const localize = (p: string) => (locale === 'en' ? p : `/pl${p === '/' ? '' : p}`)

  for (const route of routes) {
    // A fresh context per route keeps auth state honest — an admin cookie
    // left over from a previous route would silently redirect the customer
    // surfaces (admins are bounced to /admin) and scan the wrong page.
    const context = await browser.newContext()
    try {
      if (route.access !== 'anon') {
        await context.addCookies([await cookieFor(route.access)])
      }

      const scanPage = await context.newPage()
      await route.prepare?.(scanPage, ctx)

      const target = localize(route.path(ctx))
      await scanPage.goto(target)
      await route.ready(scanPage)

      // GUARD: prove we scanned the page we meant to. Auth surfaces bounce
      // (an unauthenticated /admin lands on /login, and admins are pushed
      // off customer routes), and every generic readiness signal — a
      // heading, a textbox — is satisfied just as well by the page we got
      // redirected TO. Without this, a broken cookie would silently turn
      // half the sweep into repeat scans of /login and report them clean.
      //
      // Pathnames only: a route may carry a query string (`/search?q=…`) and
      // the app is free to add or reorder params without that being a bounce.
      const expectedPath = new URL(target, 'http://localhost').pathname.replace(/\/$/, '')
      expect(
        new URL(scanPage.url()).pathname.replace(/\/$/, ''),
        `${locale}:${route.key} did not land on ${target}`,
      ).toBe(expectedPath)

      const found = await scan(scanPage, `${locale}:${route.key}`)
      observed[`${locale}:${route.key}`] = found
      const known = onDiskAtStart[`${locale}:${route.key}`] ?? []

      const isNew = found.filter(id => !known.includes(id))
      const isGone = known.filter(id => !found.includes(id))

      if (isNew.length > 0) {
        regressions.push(`${locale}:${route.key} → new WCAG 2.2 AA violations: ${isNew.join(', ')}`)
      }
      if (isGone.length > 0) {
        fixed.push(`${locale}:${route.key} → fixed (drop from baseline): ${isGone.join(', ')}`)
      }
    }
    finally {
      await context.close()
    }
  }

  if (WRITE_BASELINE) {
    // Four sweeps (2 files × 2 locales) each own a slice of the keys, so merge
    // rather than overwrite — whichever runs last would otherwise erase the
    // others. Re-read from DISK here rather than reusing `onDiskAtStart`: that
    // snapshot predates any sibling sweep in the same run. Safe under
    // `workers: 1`; this path is a local maintenance tool that CI never runs.
    const onDisk = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, string[]>
    const merged = { ...onDisk, ...observed }
    const sorted = Object.fromEntries(
      Object.keys(merged).sort().map(k => [k, merged[k]]),
    )
    writeFileSync(BASELINE_PATH, `${JSON.stringify(sorted, null, 2)}\n`)
    console.log(`\nWrote a11y baseline for ${locale} (${Object.keys(observed).length} routes)\n`)
    return
  }

  // Fixed rules are reported, never failed — a green run that quietly
  // tightens is the point of a ratchet. Surfacing them keeps the baseline
  // from silently overstating the debt.
  if (fixed.length > 0) console.log(`\nA11y baseline can be tightened:\n${fixed.join('\n')}\n`)

  expect(regressions, regressions.join('\n')).toEqual([])
}
