/**
 * Pinia Colada query/mutation layer for the admin Translations workspace.
 *
 * Backs the registry-driven `/api/v1/admin/translations` API (Shopify
 * "Translate & Adapt"-style surface over the per-locale `*_pl` columns). Cache
 * keys live under `['translations', …]`: the resource-type summary, and per
 * `(type, locale, params)` lists. A successful update invalidates the whole
 * `['translations']` namespace so both the edited list and the completeness
 * summary refetch (the edit changes a per-type count).
 *
 * Authed queries gate `enabled: () => import.meta.client` per the project-wide
 * SSR-hydration rule (Colada's cache isn't SSR-serialised).
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type {
  TranslationResourceListResponse,
  TranslationResourceRow,
  TranslationResourceTypesResponse,
  TranslationUpdateRequest,
} from '#shared/types/api'

const TRANSLATIONS_NAMESPACE = ['translations'] as const

// The only translation locale exposed today (EN is the source). Mirrors the
// backend's TRANSLATION_LOCALES; widen here when a locale column is added.
export const TRANSLATION_LOCALES = ['pl'] as const
export type TranslationLocale = (typeof TRANSLATION_LOCALES)[number]

export type TranslationStatusFilter = 'all' | 'missing' | 'outdated'

export interface TranslationListParams {
  locale?: TranslationLocale
  status?: TranslationStatusFilter
  q?: string
  page?: number
  pageSize?: number
}

export function useTranslationResourceTypesQuery(
  locale: MaybeRefOrGetter<TranslationLocale> = 'pl',
) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...TRANSLATIONS_NAMESPACE, 'resource-types', toValue(locale)],
    query: () =>
      apiFetch<TranslationResourceTypesResponse>('/api/v1/admin/translations/resource-types', {
        query: { locale: toValue(locale) },
      }),
    enabled: () => import.meta.client,
    staleTime: 1000 * 60,
  })
}

export function useTranslationListQuery(
  resourceType: MaybeRefOrGetter<string | null>,
  params: MaybeRefOrGetter<TranslationListParams> = {},
) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [
      ...TRANSLATIONS_NAMESPACE,
      'list',
      toValue(resourceType),
      toValue(params),
    ],
    query: () => {
      const p = toValue(params)
      return apiFetch<TranslationResourceListResponse>(
        `/api/v1/admin/translations/${toValue(resourceType)}`,
        {
          query: {
            locale: p.locale ?? 'pl',
            status: p.status ?? 'all',
            q: p.q || undefined,
            page: p.page ?? 1,
            page_size: p.pageSize ?? 50,
          },
        },
      )
    },
    enabled: () => import.meta.client && toValue(resourceType) !== null,
    staleTime: 1000 * 60,
  })
}

export interface TranslationUpdateInput {
  resourceType: string
  id: number
  locale: TranslationLocale
  fields: TranslationUpdateRequest['fields']
}

export function useUpdateTranslation() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ resourceType, id, locale, fields }: TranslationUpdateInput) =>
      apiFetch<TranslationResourceRow>(
        `/api/v1/admin/translations/${resourceType}/${id}`,
        {
          method: 'PUT',
          query: { locale },
          body: { fields },
        },
      ),
    // An edit changes the per-type completeness count, so invalidate both the
    // lists and the summary under the shared namespace.
    onSuccess: () => queryCache.invalidateQueries({ key: [...TRANSLATIONS_NAMESPACE] }),
  })
}
