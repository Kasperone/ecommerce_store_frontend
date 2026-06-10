import type { components } from '#shared/types/api.gen'

/**
 * Public storefront banners (`GET /api/v1/banners/`).
 *
 * Mirrors the catalog data layer (`usePublicPage` / `useCatalog`): the endpoint
 * is public + SEO-adjacent, so it fetches via Nuxt's native `useAsyncData` +
 * `useApi().apiFetch` (server-rendered, payload-hydrated) — NOT an authed
 * Pinia-Colada query (the hydration-mismatch rule). `useApi` sends no bearer on
 * a public route.
 *
 * The backend already returns only **active, in-window** banners (slim
 * `BannerPublic` shape, ordered by `sort_order` then newest). An empty list ⇒
 * the homepage renders nothing — the consumer must be empty-safe. Closes F8:
 * admin-created banners had no storefront consumer after the homepage moved to
 * the CMS `<PageRenderer>`.
 */
export type BannerPublic = components['schemas']['BannerPublic']

export function useHomeBanners() {
  const { apiFetch } = useApi()

  return useAsyncData<BannerPublic[]>(
    'public-banners',
    () => apiFetch<BannerPublic[]>('/api/v1/banners/'),
    { default: () => [] },
  )
}
