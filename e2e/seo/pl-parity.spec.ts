// Polish-locale render parity — does any English fallback actually reach the
// screen on /pl/?
//
// WHY THIS CANNOT BE A BACKEND CHECK
//
// The pre-deploy gate `python -m app.scripts.audit_translations` checks the
// DATA layer: it walks the translatable-resource registry and reports
// `*_pl` columns that are empty. That is necessary and it is not sufficient.
// The EN-fallback path lives in vue-i18n: a missing *UI message key* (not a DB
// column) silently renders the English string, and no amount of database
// auditing can see that. It is a browser assertion by construction — which is
// exactly why the audit flagged PL parity as only partially covered.
//
// HOW IT WORKS
//
// Rather than hand-listing phrases (which rots the moment copy changes), the
// expected-English set is DERIVED from the locale files themselves:
//
//   1. flatten `i18n/locales/{en,pl}/*.json` to key -> string
//   2. keep keys where EN and PL genuinely differ — if a string is identical in
//      both (brand names, "OK", "PayU"), seeing it on a /pl/ page proves nothing
//   3. drop anything short or parameterised: ICU placeholders (`{count}`),
//      pluralisation pipes and vue-i18n linked messages (`@:`) do not render
//      verbatim, so matching on them would produce noise, not signal
//   4. render each /pl/ route and assert none of the surviving EN strings appear
//
// A hit means a real user reading Polish sees English text on that page.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN, randomEphemeralUser } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

test.setTimeout(300_000)

const LOCALES_DIR = fileURLToPath(new URL('../../i18n/locales', import.meta.url))

/** Minimum EN length to consider. Short strings ("Cart", "Save") collide with
 *  Polish words, product data and URL fragments far too easily to be evidence. */
const MIN_LENGTH = 14

function flatten(value: unknown, prefix = '', out: Record<string, string> = {}) {
  if (typeof value === 'string') {
    out[prefix] = value
    return out
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out)
    }
  }
  return out
}

function loadLocale(locale: string): Record<string, string> {
  const dir = `${LOCALES_DIR}/${locale}`
  const out: Record<string, string> = {}
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const ns = file.replace(/\.json$/, '')
    flatten(JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')), ns, out)
  }
  return out
}

/** EN strings whose appearance on a /pl/ page is unambiguous evidence of a
 *  fallback: translated differently in PL, long enough to be distinctive, and
 *  rendered verbatim (no ICU/plural/link syntax). */
function englishOnlyStrings(): Array<{ key: string, en: string }> {
  const en = loadLocale('en')
  const pl = loadLocale('pl')
  return Object.entries(en)
    .filter(([key, value]) => {
      const plValue = pl[key]
      if (typeof plValue !== 'string' || plValue.trim() === '') return false
      // Identical in both locales — proves nothing either way.
      if (plValue.trim() === value.trim()) return false
      if (value.trim().length < MIN_LENGTH) return false
      // Not rendered verbatim: ICU params, plural pipes, linked messages.
      if (/[{}|]/.test(value) || value.includes('@:')) return false
      return true
    })
    .map(([key, value]) => ({ key, en: value }))
}

const CANDIDATES = englishOnlyStrings()

/** Normalise typographic variance so a curly-quote mismatch is not read as a
 *  translation gap. */
const norm = (s: string) =>
  s.replace(/[‘’]/g, '\'').replace(/[“”]/g, '"').replace(/\s+/g, ' ')

async function englishLeaksOn(page: Page): Promise<Array<{ key: string, en: string }>> {
  const text = norm(await page.locator('body').innerText())
  return CANDIDATES.filter(c => text.includes(norm(c.en)))
}

test.describe('Polish render parity', () => {
  test('no English fallback copy renders on /pl/ routes', async ({ browser }) => {
    const api = await ApiClient.create()
    const runId = Date.now()
    const customer = randomEphemeralUser()
    let adminToken = ''
    let productId: number | null = null
    const leaks: string[] = []

    // Guard the derivation itself. If a refactor moved the locale files or
    // changed their shape, `CANDIDATES` would quietly become empty and every
    // assertion below would pass while checking nothing at all.
    expect(
      CANDIDATES.length,
      'derived zero EN-only strings — the locale loader is broken, not the translations',
    ).toBeGreaterThan(50)

    try {
      const admin = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password)
      adminToken = admin.accessToken
      const slug = `e2e-pl-parity-${runId}`
      const product = await api.createProduct(adminToken, {
        name: 'E2E Parity Widget',
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
      // ⚠️ A FRESH cookie per context, not one shared login. Refresh tokens
      // rotate: every new context boots plugins/auth.ts -> /auth/refresh, which
      // consumes the row, so a second context replaying the same cookie is
      // treated as reuse and lands on /login. This spec visits four
      // authenticated contexts (two /pl/ routes plus their English controls),
      // and the identical bug in the a11y sweep passed locally but failed in
      // CI. Rate limits are not a concern: CI sets E2E_DISABLE_RATE_LIMIT.
      const freshCustomerCookie = async () =>
        (await api.loginViaApi(customer.email, customer.password)).refreshCookie

      const routes: Array<{ path: string, authed: boolean }> = [
        { path: '/pl', authed: false },
        { path: '/pl/products', authed: false },
        { path: `/pl/products/${slug}`, authed: false },
        { path: '/pl/cart', authed: false },
        { path: '/pl/login', authed: false },
        { path: '/pl/account', authed: true },
        { path: '/pl/account/orders', authed: true },
      ]

      const visit = async (
        path: string,
        authed: boolean,
        locale: 'en-US' | 'pl-PL',
      ): Promise<Array<{ key: string, en: string }>> => {
        const context = await browser.newContext({ locale })
        try {
          if (authed) await context.addCookies([await freshCustomerCookie()])
          const page = await context.newPage()
          await page.goto(path)
          await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 60_000 })

          // Same guard as the a11y sweep: a redirect to /login would otherwise
          // be scanned as if it were the intended page.
          expect(
            new URL(page.url()).pathname.replace(/\/$/, ''),
            `${path} redirected to ${page.url()}`,
          ).toBe(path.replace(/\/$/, ''))

          return await englishLeaksOn(page)
        }
        finally {
          await context.close()
        }
      }

      // POSITIVE CONTROL, per route.
      //
      // "No English strings on the Polish page" is worthless on its own: it
      // passes just as happily if none of the derived strings are ever rendered
      // on this route, or if the detector is broken outright. So render the
      // ENGLISH twin of every route first and require the same detector to find
      // copy there. Only then does a zero on /pl/ mean the page was translated
      // rather than simply never inspected.
      // The control context must be 'en-US'. A pl-PL browser locale redirects
      // the unprefixed routes into /pl (confirmed while building this: visiting
      // '/' under pl-PL lands on '/pl'), so reusing the Polish context for the
      // control would silently scan the Polish page twice and the control would
      // never fire.
      for (const route of routes) {
        const enPath = route.path.replace(/^\/pl/, '') || '/'
        const enHits = await visit(enPath, route.authed, 'en-US')
        expect(
          enHits.length,
          `control failed: no derived EN copy rendered on ${enPath}, so a clean `
          + `result on ${route.path} would prove nothing`,
        ).toBeGreaterThan(0)

        for (const hit of await visit(route.path, route.authed, 'pl-PL')) {
          leaks.push(`${route.path} → ${hit.key}: "${hit.en}"`)
        }
      }

      expect(
        leaks,
        `English copy rendered on /pl/ (${leaks.length}):\n${leaks.join('\n')}`,
      ).toEqual([])
    }
    finally {
      if (productId) await api.deleteProduct(adminToken, productId).catch(() => {})
      await api.dispose()
    }
  })
})
