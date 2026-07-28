import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { ApiClient } from '../fixtures/apiClient'
import { KNOWN_ADMIN } from '../fixtures/testUser'

test.use({ storageState: { cookies: [], origins: [] } })

// SEO artifacts — the machine-readable surface no human ever looks at, which is
// exactly why it rots silently. Everything here is served by @nuxtjs/seo modules
// wired in `nuxt.config.ts`; a module upgrade or a stray routeRule can flip the
// whole crawl policy without a single visible symptom.
//
// Two env quirks shape these assertions (both verified against a dev run):
//
//  1. `NUXT_SITE_ENV != 'production'` makes nuxt-robots serve a disallow-all
//     robots.txt and stamp `<meta name="robots" content="noindex, nofollow">` on
//     every page (staging safety). The *production* answer is still observable:
//     `/robots.txt?mockProductionEnv` renders the real groups, and the meta tag
//     carries the production value in `data-production-content`. E2E always runs
//     the dev server, so we assert the production policy through those seams —
//     `productionRobots()` below falls back to `content` so the spec still holds
//     if the run ever happens to be production-flagged.
//  2. Sitemap output is cached server-side (`cacheMaxAgeSeconds: 600`), so a
//     product created mid-run is NOT reliably in `/__sitemap__/en-US.xml`. The
//     dynamic wiring is asserted at its uncached origin instead: the Nitro source
//     endpoint `/api/__sitemap__/urls`, which proxies the backend's slim sitemap
//     feed. The cached XML is asserted for structure only.

/** The production index-control value, whichever env the run happens to be in. */
function productionRobots(content: string | null, productionContent: string | null): string {
  return productionContent ?? content ?? ''
}

test.describe('SEO artifacts', () => {
  test('robots.txt publishes the production crawl policy and blocks indexing outside production', async ({ request }) => {
    // Staging safety: any non-production deploy must be uncrawlable. E2E runs
    // `npm run dev` with no NUXT_SITE_ENV, so this is the non-production answer.
    const dev = await request.get('/robots.txt')
    expect(dev.status()).toBe(200)
    expect(dev.headers()['content-type']).toContain('text/plain')
    const devBody = await dev.text()
    expect(devBody).toContain('User-agent: *')
    expect(devBody).toContain('Disallow: /')

    // The real policy, rendered through the module's production-mock seam.
    const prod = await request.get('/robots.txt?mockProductionEnv')
    expect(prod.status()).toBe(200)
    const body = await prod.text()

    // The D5 crawl-control set. The module is i18n-aware and emits the /pl/
    // twins itself — asserting both proves that generation still happens
    // (a regression there would silently expose the Polish tree).
    for (const path of [
      '/admin', '/account', '/cart', '/checkout', '/search',
      '/orders/track', '/login', '/sign-up',
      '/password-recovery', '/password-reset', '/verify-email', '/api/',
    ]) {
      expect(body, `robots.txt must disallow ${path}`).toContain(`Disallow: ${path}`)
      expect(body, `robots.txt must disallow the /pl twin of ${path}`)
        .toContain(`Disallow: /pl${path}`)
    }

    // Abusive-crawler block + AI-policy signals (blueprint D5).
    expect(body).toContain('User-agent: Bytespider')
    expect(body).toContain('Content-Signal:')
    expect(body).toContain('Content-Usage:')

    // The sitemap module owns the route so it can append this line — losing it
    // is how a sitemap goes undiscovered.
    expect(body).toMatch(/^Sitemap: https?:\/\/\S+\/sitemap_index\.xml$/m)
  })

  test('a published product reaches the sitemap tree and its PDP emits Product JSON-LD', async ({ page, request }) => {
    // Generous budget: dev-server cold compile on the PDP route.
    test.setTimeout(90_000)

    const api = await ApiClient.create()
    const runId = randomBytes(4).toString('hex')
    const productName = `E2E SEO Widget ${runId}`
    const productSlug = `e2e-seo-widget-${runId}`

    let accessToken = ''
    let productId = 0

    try {
      ;({ accessToken } = await api.loginViaApi(KNOWN_ADMIN.email, KNOWN_ADMIN.password))
      ;({ id: productId } = await api.createProduct(accessToken, {
        name: productName,
        slug: productSlug,
        price_usd: 42,
        price_pln: 168,
        price_eur: 39,
        stock: 25,
      }))

      // --- Sitemap: index → per-locale trees ---
      const index = await request.get('/sitemap_index.xml')
      expect(index.status()).toBe(200)
      expect(index.headers()['content-type']).toContain('xml')
      const indexBody = await index.text()
      expect(indexBody).toContain('<sitemapindex')
      // One sitemap per configured locale — the i18n-aware split.
      expect(indexBody).toContain('/__sitemap__/en-US.xml')
      expect(indexBody).toContain('/__sitemap__/pl-PL.xml')

      const enSitemap = await request.get('/__sitemap__/en-US.xml')
      expect(enSitemap.status()).toBe(200)
      const enBody = await enSitemap.text()
      expect(enBody).toContain('<urlset')
      // Every entry must carry its cross-locale alternates; without these the
      // EN and PL trees compete as duplicates instead of pairing up.
      expect(enBody).toContain('hreflang="pl-PL"')
      expect(enBody).toContain('hreflang="x-default"')
      // Port-agnostic: CI overrides the dev port via E2E_WEB_PORT.
      expect(enBody).toMatch(/<loc>https?:\/\/[^<]+\/<\/loc>/)

      const plSitemap = await request.get('/__sitemap__/pl-PL.xml')
      expect(plSitemap.status()).toBe(200)
      const plBody = await plSitemap.text()
      expect(plBody).toContain('<urlset')
      expect(plBody).toContain('/pl')

      // --- Dynamic wiring at its uncached origin (see header note) ---
      const source = await request.get('/api/__sitemap__/urls')
      expect(source.status()).toBe(200)
      const urls = await source.json() as Array<{
        loc: string
        lastmod?: string
        _i18nTransform?: boolean
      }>
      const entry = urls.find(u => u.loc === `/products/${productSlug}`)
      expect(entry, `the new product must reach the sitemap source feed; got ${urls.length} urls`)
        .toBeTruthy()
      // `_i18nTransform` is what fans a single backend URL out into both locale
      // trees with alternates — the backend feed emits bare EN paths.
      expect(entry!._i18nTransform).toBe(true)
      expect(entry!.lastmod).toBeTruthy()

      // --- PDP structured data ---
      await page.goto(`/products/${productSlug}`)
      await expect(page.getByRole('heading', { name: productName, level: 1 }))
        .toBeVisible({ timeout: 30_000 })

      const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
      expect(blocks.length).toBeGreaterThan(0)
      const graph = blocks.flatMap((raw) => {
        const parsed = JSON.parse(raw) as { '@graph'?: unknown[] }
        return (parsed['@graph'] ?? [parsed]) as Array<Record<string, any>>
      })

      const typeOf = (node: Record<string, any>): string[] =>
        Array.isArray(node['@type']) ? node['@type'] : [node['@type']]

      // The rich-result payload: a Product with a priced, in-stock Offer. Google
      // drops the whole result if price/currency/availability go missing.
      const product = graph.find(n => typeOf(n).includes('Product'))
      expect(product, 'PDP must emit a Product node').toBeTruthy()
      expect(product!.name).toBe(productName)
      const offer = Array.isArray(product!.offers) ? product!.offers[0] : product!.offers
      expect(offer.price).toBe(42)
      expect(offer.priceCurrency).toBe('USD')
      expect(offer.availability).toBe('https://schema.org/InStock')
      expect(offer.url).toContain(`/products/${productSlug}`)

      // Site-level identity nodes the Product references (@id joins break
      // silently when the graph loses a node).
      expect(graph.find(n => typeOf(n).includes('WebSite')), 'WebSite node').toBeTruthy()
      const org = graph.find(n => typeOf(n).includes('Organization'))
      expect(org, 'Organization node').toBeTruthy()
      // Merchant return policy rides on the identity node — required for the
      // Shopping/merchant-listing experience.
      expect(org!.hasMerchantReturnPolicy).toBeTruthy()

      // --- Canonical + hreflang (useLocaleHead, wired once in app.vue) ---
      const canonical = page.locator('link[rel="canonical"]')
      await expect(canonical).toHaveAttribute('href', new RegExp(`/products/${productSlug}$`))

      for (const lang of ['en-US', 'pl-PL', 'x-default']) {
        await expect(
          page.locator(`link[rel="alternate"][hreflang="${lang}"]`),
          `hreflang ${lang} alternate`,
        ).toHaveCount(1)
      }
      await expect(page.locator('link[rel="alternate"][hreflang="pl-PL"]'))
        .toHaveAttribute('href', new RegExp(`/pl/products/${productSlug}$`))

      // The PL twin must self-canonicalize, not point back at EN.
      await page.goto(`/pl/products/${productSlug}`)
      await expect(page.locator('link[rel="canonical"]'))
        .toHaveAttribute('href', new RegExp(`/pl/products/${productSlug}$`))

      // --- Index control (meta robots, the half robots.txt can't do) ---
      const pdpRobots = await page.locator('meta[name="robots"]').first()
      expect(productionRobots(
        await pdpRobots.getAttribute('content'),
        await pdpRobots.getAttribute('data-production-content'),
      )).toContain('index, follow')

      // …and a D5 noindex section stays noindex in production.
      await page.goto('/cart')
      const cartRobots = await page.locator('meta[name="robots"]').first()
      expect(productionRobots(
        await cartRobots.getAttribute('content'),
        await cartRobots.getAttribute('data-production-content'),
      )).toContain('noindex')
    }
    finally {
      if (productId) await api.deleteProduct(accessToken, productId)
      await api.dispose()
    }
  })
})
