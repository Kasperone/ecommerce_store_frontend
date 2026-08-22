// Page-level accessibility sweep — WCAG 2.2 AA.
//
// WHY THIS EXISTS ALONGSIDE THE COMPONENT-LEVEL AXE SPECS
//
// `axe-core` + `vitest-axe` already run against 20+ components, which is more
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
// that can see them.
//
// HOW IT STAYS GREEN WHILE THE BACKLOG BURNS DOWN
//
// The target is WCAG 2.2 AA, which the app does not meet today. Rather than
// land red (useless) or assert only `critical` (toothless), this is a RATCHET,
// exactly like `scripts/typecheck-ratchet.mjs`: `wcag-baseline.json` records the
// rule ids currently failing per route, and the spec fails only on a rule that
// is NEW for that route. Fixing something is always safe; regressing is not.
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
//   A11Y_WRITE_BASELINE=1 npm run e2e -- e2e/a11y/wcag.spec.ts
//
// writes what it finds and always passes. Review the diff before committing —
// a growing baseline is a regression that has been waved through, and the whole
// point of the ratchet is that this takes a deliberate act.
//
// TRIAGING A VIOLATION
//
//   A11Y_DETAIL=1 npm run e2e -- e2e/a11y/wcag.spec.ts
//
// adds every failing node to the output — axe's failure summary, which for
// `color-contrast` includes the measured ratio and both hex values, plus the
// element's HTML. Combine with A11Y_WRITE_BASELINE=1 to triage and re-baseline
// in a single run.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'
import baseline from './wcag-baseline.json' with { type: 'json' }

test.use({ storageState: { cookies: [], origins: [] } })

// A cold Vite compile per route, times ~10 routes, twice over.
test.setTimeout(600_000)

// WCAG 2.2 AA = every A and AA success criterion from 2.0, 2.1 and 2.2.
// axe tags are cumulative, so all six must be listed.
const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']

type Access = 'anon' | 'customer' | 'admin'

interface Route {
  /** Stable key into the baseline. Never derive it from the live URL — a
   *  fixture slug changes every run and would orphan the baseline entry. */
  key: string
  path: (ctx: { slug: string }) => string
  access: Access
  /** Something that proves the page actually rendered before axe runs.
   *  Scanning a spinner produces a clean, meaningless pass — and scanning an
   *  empty `main` produces a clean, meaningless FAIL: the element exists from
   *  the first paint but has no bounding box until its content lands, so
   *  `expect(main).toBeVisible()` is not a readiness signal. Wait on rendered
   *  content instead. */
  ready: (page: Page) => Promise<void>
}

const ROUTES: Route[] = [
  {
    key: 'home',
    path: () => '/',
    access: 'anon',
    ready: page => headingReady(page),
  },
  {
    key: 'products',
    path: () => '/products',
    access: 'anon',
    ready: page => headingReady(page),
  },
  {
    key: 'pdp',
    path: ({ slug }) => `/products/${slug}`,
    access: 'anon',
    ready: async page => void await expect(
      page.getByRole('heading', { name: 'E2E A11y Widget' }),
    ).toBeVisible(),
  },
  {
    key: 'login',
    path: () => '/login',
    access: 'anon',
    ready: async (page) => {
      await headingReady(page)
      await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: 60_000 })
    },
  },
  {
    key: 'cart',
    path: () => '/cart',
    access: 'anon',
    ready: page => headingReady(page),
  },
  {
    key: 'checkout',
    path: () => '/checkout',
    access: 'customer',
    // Locale-agnostic on purpose: this sweep runs in both EN and PL, so a
    // label-text locator ('Address' / 'Adres') would only ever be right for
    // one of them. The shipping form having painted its first input is the
    // same signal without the copy dependency.
    ready: async (page) => {
      await headingReady(page, 120_000)
      await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: 120_000 })
    },
  },
  {
    key: 'account',
    path: () => '/account',
    access: 'customer',
    ready: page => headingReady(page),
  },
  {
    key: 'account-orders',
    path: () => '/account/orders',
    access: 'customer',
    ready: page => headingReady(page),
  },
  {
    key: 'admin-dashboard',
    path: () => '/admin',
    access: 'admin',
    ready: page => headingReady(page, 120_000),
  },
  {
    key: 'admin-products',
    path: () => '/admin/products',
    access: 'admin',
    ready: page => headingReady(page, 120_000),
  },
]

const KNOWN: Record<string, string[]> = baseline as Record<string, string[]>
const WRITE_BASELINE = !!process.env.A11Y_WRITE_BASELINE
const DETAIL = !!process.env.A11Y_DETAIL
const BASELINE_PATH = fileURLToPath(new URL('./wcag-baseline.json', import.meta.url))

/** Generic readiness: the first rendered heading. True of every route in the
 *  table, storefront and admin alike, and unlike `main` it only becomes
 *  visible once the page has actually painted something. */
async function headingReady(page: Page, timeout = 60_000): Promise<void> {
  await expect(page.getByRole('heading').first()).toBeVisible({ timeout })
}

async function scan(page: Page, key: string): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze()

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

for (const locale of ['en', 'pl'] as const) {
  test(`WCAG 2.2 AA sweep (${locale})`, async ({ browser }) => {
    const api = await ApiClient.create()
    const runId = Date.now()
    const customer = randomEphemeralUser()
    let adminToken = ''
    let productId: number | null = null
    const regressions: string[] = []
    const fixed: string[] = []
    const observed: Record<string, string[]> = {}

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const slug = `e2e-a11y-${locale}-${runId}`
      const product = await api.createProduct(adminToken, {
        name: 'E2E A11y Widget',
        slug,
        price_usd: 100,
        price_pln: 400,
        price_eur: 90,
        stock: 5,
      })
      productId = product.id
      await api.ensureShippingFixture(adminToken, {
        methodName: 'E2E Standard',
        countryCodes: ['US'],
        rates: [{ currency: 'USD', amount: 10 }],
      })

      await api.register(customer)
      await api.markVerified(customer.email)

      // ⚠️ Mint a FRESH refresh cookie per authenticated context. Refresh
      // tokens ROTATE: every new browser context boots `plugins/auth.ts` →
      // `/auth/refresh`, which consumes and replaces the row. Handing the same
      // cookie to a second context therefore replays a spent token, the
      // backend treats it as reuse, and that context lands on /login instead
      // of the page under test.
      //
      // This passed locally and failed in CI, so it is not something to rely
      // on timing for — the landing guard below is what caught it. Rate limits
      // are not a concern: CI runs the backend with E2E_DISABLE_RATE_LIMIT.
      const freshCustomerCookie = async () =>
        (await api.loginViaApi(customer.email, customer.password)).refreshCookie
      const freshAdminCookie = async () =>
        (await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)).refreshCookie

      // `prefix_except_default`: English is unprefixed, Polish gets /pl/.
      const localize = (p: string) => (locale === 'en' ? p : `/pl${p === '/' ? '' : p}`)

      for (const route of ROUTES) {
        // A fresh context per route keeps auth state honest — an admin cookie
        // left over from a previous route would silently redirect the customer
        // surfaces (admins are bounced to /admin) and scan the wrong page.
        const context = await browser.newContext()
        try {
          if (route.access === 'customer') {
            await context.addCookies([await freshCustomerCookie()])
          }
          else if (route.access === 'admin') {
            await context.addCookies([await freshAdminCookie()])
          }

          const scanPage = await context.newPage()

          // Checkout renders an empty-cart placeholder unless there is a cart.
          // Seeding localStorage pre-navigation scans the REAL checkout form
          // rather than a stub with almost no interactive content.
          if (route.key === 'checkout') {
            await scanPage.addInitScript((item) => {
              localStorage.setItem('cart', JSON.stringify([item]))
            }, {
              productId: product.id,
              variantId: null,
              slug,
              name: 'E2E A11y Widget',
              imageUrl: null,
              price_usd: 100,
              price_pln: 400,
              price_eur: 90,
              stock: 5,
              allowBackorder: false,
              quantity: 1,
            })
          }

          const target = localize(route.path({ slug }))
          await scanPage.goto(target)
          await route.ready(scanPage)

          // GUARD: prove we scanned the page we meant to. Auth surfaces bounce
          // (an unauthenticated /admin lands on /login, and admins are pushed
          // off customer routes), and every generic readiness signal — a
          // heading, a textbox — is satisfied just as well by the page we got
          // redirected TO. Without this, a broken cookie would silently turn
          // half the sweep into repeat scans of /login and report them clean.
          expect(
            new URL(scanPage.url()).pathname.replace(/\/$/, ''),
            `${locale}:${route.key} did not land on ${target}`,
          ).toBe(target.replace(/\/$/, ''))

          const found = await scan(scanPage, `${locale}:${route.key}`)
          observed[`${locale}:${route.key}`] = found
          const known = KNOWN[`${locale}:${route.key}`] ?? []

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
        // The en and pl tests each own half the keys, so merge rather than
        // overwrite — whichever runs second would otherwise erase the first.
        // Re-read from DISK, not from `KNOWN`: that import is frozen at module
        // load, so merging against it would silently drop the sibling test's
        // fresh entries. Safe under `workers: 1`; this path is a local
        // maintenance tool that CI never runs.
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
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
}
