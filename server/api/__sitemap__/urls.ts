import type { SitemapUrl } from '#sitemap/types'

/**
 * Dynamic sitemap source (SEO blueprint SEO-2.2 / D7).
 *
 * `nuxt:pages` only auto-discovers static app routes — product/category
 * instances come from the backend's slim public sitemap endpoints
 * (`GET /api/v1/sitemap/{products,categories}`: active-only, slug +
 * honest `updated_at` + product image URLs). The `$fetch` calls traverse
 * the existing `/api/v1/**` Nitro proxy routeRule to FastAPI.
 *
 * `_i18nTransform: true` expands each URL into the EN + /pl/ variants with
 * hreflang alternates — storefront links use the same (EN) slug in both
 * locales, so the plain prefix transform matches real linking (`slug_pl`
 * is admin-side metadata, not a linked URL shape).
 *
 * Output is cached by the sitemap module (`cacheMaxAgeSeconds`), so the
 * backend is hit at most once per TTL.
 */

// Slim row shapes, mirroring the backend's SitemapProductEntry /
// SitemapCategoryEntry response schemas.
type ProductRow = { slug: string, updated_at: string, images: string[] }
type CategoryRow = { slug: string, slug_pl: string | null, updated_at: string }

// Backend datetimes are naive UTC with microseconds ("2026-06-02T17:14:09.625300")
// — not a valid W3C date (the module warns). Suffix the missing Z and round-trip
// through Date for a clean ISO 8601 lastmod.
function toW3CDate(naive: string): string {
  const withZone = /Z$|[+-]\d\d:\d\d$/.test(naive) ? naive : `${naive}Z`
  return new Date(withZone).toISOString()
}

export default defineSitemapEventHandler(async () => {
  const [products, categories] = await Promise.all([
    $fetch<ProductRow[]>('/api/v1/sitemap/products'),
    $fetch<CategoryRow[]>('/api/v1/sitemap/categories'),
  ])

  return [
    ...products.map(p => ({
      loc: `/products/${p.slug}`,
      lastmod: toW3CDate(p.updated_at),
      // Image entries — Google specifically recommends these for CDN-hosted
      // images (our R2 case). Absolute URLs pass through untouched.
      images: p.images.length ? p.images.map(url => ({ loc: url })) : undefined,
      _i18nTransform: true,
    } satisfies SitemapUrl)),
    ...categories.map(c => ({
      loc: `/category/${c.slug}`,
      lastmod: toW3CDate(c.updated_at),
      _i18nTransform: true,
    } satisfies SitemapUrl)),
  ]
})
