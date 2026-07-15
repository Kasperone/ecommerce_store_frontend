/**
 * B2B negotiated price for the storefront product page (Shopify-gap P2 #14).
 *
 * The public PDP fetch (`useProductDetail`) is anonymous, so the backend's
 * `b2b_price_*` fields are never populated on it. This composable does a
 * **client-only, authed** companion fetch of the same product so an active
 * company member sees their negotiated price. It is gated on `isB2B` (from
 * `useCompanyContext`) so a regular authed customer never triggers the extra
 * request — for them there is no B2B price to show.
 *
 * Returns the raw authed product ref; the page selects the currency-specific
 * price reactively (product-grain only — variant-grain negotiated prices apply
 * at checkout but aren't surfaced on the PDP in the MVP).
 */

import { useQuery } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { components } from '#shared/types/api.gen'

type ProductDetail = components['schemas']['ProductWithCategory']

export function useB2bProductPrice(slug: MaybeRefOrGetter<string>) {
  const { apiFetch } = useApi()
  const { isB2B } = useCompanyContext()

  const query = useQuery({
    key: () => ['b2bProductPrice', toValue(slug)],
    query: () => apiFetch<ProductDetail>(`/api/v1/products/slug/${toValue(slug)}`),
    // Client-only (authed, SSR-hydration rule #87) and B2B-only (skip the fetch
    // entirely for guests and non-B2B customers).
    enabled: () => import.meta.client && isB2B.value,
    staleTime: 1000 * 60,
    retry: false,
  })

  return { product: query.data }
}
