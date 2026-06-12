/**
 * Pinia Colada query/mutation layer for product variants (variants F1).
 *
 * The matrix PUT (`/api/v1/products/{id}/options`) is the one structural
 * writer — it takes the product's full desired option/variant state and the
 * backend reconciles it in one transaction. Saving invalidates the product
 * detail (it embeds `options`/`variants`/`has_variants`), the product list
 * (stock/price columns), and the admin variants list.
 *
 * Draft shapes + the body builder live here so the options editor, the
 * variants matrix, and the edit page share one vocabulary.
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { buildApiUrl } from '#shared/constants/api'
import type {
  ProductOptionResponse,
  ProductOptionsMatrixResponse,
  ProductOptionsMatrixUpdate,
  ProductVariantResponse,
} from '#shared/types/api'

const PRODUCTS_NAMESPACE = ['products'] as const

/** Server caps (mirrored client-side): ≤3 options, ≤100 variant rows. */
export const MAX_OPTIONS = 3
export const MAX_VARIANTS = 100

/** One draft value of an option axis (EN required, PL optional). */
export interface OptionValueDraft {
  value: string
  valuePl: string
}

/** One draft option axis (position derives from array index). */
export interface OptionDraft {
  name: string
  namePl: string
  values: OptionValueDraft[]
}

/** One draft matrix row (a cartesian combination of option values). */
export interface VariantRowDraft {
  /** Existing variant id, `null` for a row not yet persisted. */
  id: number | null
  /** Chosen EN value per option, in option order — the row's identity. */
  optionValues: string[]
  sku: string
  /** `null` = inherit the product's price in that currency. */
  priceUsd: number | null
  pricePln: number | null
  priceEur: number | null
  imageId: number | null
  isActive: boolean
  /** Seeded stock — NEW rows only (existing stock is inventory-owned). */
  initialStock: number | null
  /** Read-only stock display for existing rows. */
  stock: number | null
}

/** Join key identifying a combination (option order matters). */
export function comboKey(values: string[]): string {
  return values.join('\u0000')
}

/** Seed option drafts from the product detail's `options`. */
export function optionsToDrafts(options: ProductOptionResponse[]): OptionDraft[] {
  return [...options]
    .sort((a, b) => a.position - b.position)
    .map(option => ({
      name: option.name,
      namePl: option.name_pl ?? '',
      values: [...(option.values ?? [])]
        .sort((a, b) => a.position - b.position)
        .map(value => ({ value: value.value, valuePl: value.value_pl ?? '' })),
    }))
}

/**
 * Seed matrix row drafts from the admin variants list. `option_value_ids`
 * are resolved to EN value strings (in option order) via the product's
 * options — the same identity the matrix body uses.
 */
export function variantsToDrafts(
  variants: ProductVariantResponse[],
  options: ProductOptionResponse[],
): VariantRowDraft[] {
  const sorted = [...options].sort((a, b) => a.position - b.position)
  const valueById = new Map<number, { optionIndex: number, value: string }>()
  sorted.forEach((option, optionIndex) => {
    for (const value of option.values ?? []) {
      valueById.set(value.id, { optionIndex, value: value.value })
    }
  })
  return [...variants]
    .sort((a, b) => a.position - b.position)
    .map((variant) => {
      const optionValues = new Array<string>(sorted.length).fill('')
      for (const id of variant.option_value_ids ?? []) {
        const entry = valueById.get(id)
        if (entry) optionValues[entry.optionIndex] = entry.value
      }
      return {
        id: variant.id,
        optionValues,
        sku: variant.sku ?? '',
        priceUsd: variant.price_usd ?? null,
        pricePln: variant.price_pln ?? null,
        priceEur: variant.price_eur ?? null,
        imageId: variant.image_id ?? null,
        isActive: variant.is_active,
        initialStock: null,
        stock: variant.stock,
      }
    })
}

/**
 * Assemble the matrix PUT body from the drafts. Blank option names/values
 * are dropped; positions derive from array order; `initial_stock` rides
 * along only on NEW rows (no `id`).
 */
export function buildMatrixBody(
  options: OptionDraft[],
  rows: VariantRowDraft[],
): ProductOptionsMatrixUpdate {
  return {
    options: options
      .filter(option => option.name.trim() !== '')
      .map((option, optionIndex) => ({
        name: option.name.trim(),
        name_pl: option.namePl.trim() || null,
        position: optionIndex,
        values: option.values
          .filter(value => value.value.trim() !== '')
          .map((value, valueIndex) => ({
            value: value.value.trim(),
            value_pl: value.valuePl.trim() || null,
            position: valueIndex,
          })),
      })),
    variants: rows.map((row, rowIndex) => ({
      id: row.id,
      option_values: row.optionValues,
      sku: row.sku.trim() || null,
      price_usd: row.priceUsd,
      price_pln: row.pricePln,
      price_eur: row.priceEur,
      image_id: row.imageId,
      is_active: row.isActive,
      position: rowIndex,
      initial_stock: row.id === null ? row.initialStock : null,
    })),
  }
}

/** Admin list of a product's variants — includes inactive, raw prices. */
export function useProductVariantsQuery(productId: MaybeRefOrGetter<number | undefined>) {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...PRODUCTS_NAMESPACE, 'variants', toValue(productId)],
    query: () => {
      const value = toValue(productId)
      if (value === undefined) {
        return Promise.reject(new Error('Product id is required'))
      }
      return apiFetch<ProductVariantResponse[]>(buildApiUrl.productVariants(value))
    },
    // Client-only (+ id present) — see useOrderQueries.ts for the SSR rationale.
    enabled: () => import.meta.client && toValue(productId) !== undefined,
    // Mutations invalidate this namespace; 60s just absorbs back-nav refetch churn.
    staleTime: 1000 * 60,
  })
}

/** The ONE save mutation — reconcile the full options/variants matrix. */
export function useUpdateOptionsMatrix() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ productId, matrix }: {
      productId: number
      matrix: ProductOptionsMatrixUpdate
    }) =>
      apiFetch<ProductOptionsMatrixResponse>(buildApiUrl.productOptionsMatrix(productId), {
        method: 'PUT',
        body: matrix,
      }),
    onSuccess: (_data, { productId }) => {
      void queryCache.invalidateQueries({
        key: [...PRODUCTS_NAMESPACE, 'detail', productId],
      })
      void queryCache.invalidateQueries({ key: [...PRODUCTS_NAMESPACE, 'list'] })
      void queryCache.invalidateQueries({
        key: [...PRODUCTS_NAMESPACE, 'variants', productId],
      })
    },
  })
}
