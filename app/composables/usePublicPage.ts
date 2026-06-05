import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { components } from '#shared/types/api.gen'

/**
 * Public CMS page fetcher.
 *
 * Mirrors the catalog data layer (`useCatalog.ts`): SEO-critical, so it fetches
 * the published layout via Nuxt's native `useAsyncData` + `useApi().apiFetch`
 * (server-rendered, payload-hydrated) — NOT an authed Pinia-Colada query (the
 * hydration-mismatch rule). The endpoint is public, so `useApi` sends no bearer.
 *
 * A 404 (no published page at that slug) resolves to `null` rather than
 * throwing, so a caller can render a fallback / its own 404 without a crash.
 * The `key` is parameterised on slug + locale so distinct pages and locales
 * don't share a cache entry.
 */
export type PagePublic = components['schemas']['PagePublic']

export function usePublicPage(
  slug: MaybeRefOrGetter<string>,
  locale?: MaybeRefOrGetter<string | undefined>,
) {
  const { apiFetch } = useApi()

  return useAsyncData<PagePublic | null>(
    () => `public-page-${toValue(slug)}-${toValue(locale) ?? ''}`,
    async () => {
      const s = toValue(slug)
      const loc = toValue(locale)
      try {
        return await apiFetch<PagePublic>(
          `/api/v1/pages/${encodeURIComponent(s)}`,
          loc ? { query: { locale: loc } } : {},
        )
      }
      catch (err: unknown) {
        // A missing/unpublished page is an expected, non-fatal outcome — render
        // a fallback rather than surfacing an error boundary on the whole route.
        if (isNotFound(err)) return null
        throw err
      }
    },
    {
      default: () => null,
      watch: [() => toValue(slug), () => toValue(locale)],
    },
  )
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === 'object'
    && err !== null
    && 'statusCode' in err
    && (err as { statusCode?: number }).statusCode === 404
  )
}
