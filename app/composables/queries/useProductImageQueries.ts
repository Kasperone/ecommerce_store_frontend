/**
 * Pinia Colada mutation layer for product images.
 *
 * Image mutations all invalidate the parent product's cache so the embedded
 * `images` array refreshes after upload/reorder/primary/delete. The product
 * list cache is also invalidated so thumbnail columns reflect new primaries.
 */

import { useMutation, useQueryCache } from '@pinia/colada'
import type {
  ProductImageResponse,
  ProductImageUpdate,
} from '#shared/types/api'

const PRODUCTS_NAMESPACE = ['products'] as const

function invalidateProduct(productId: number) {
  const queryCache = useQueryCache()
  void queryCache.invalidateQueries({ key: [...PRODUCTS_NAMESPACE, 'detail', productId] })
  void queryCache.invalidateQueries({ key: [...PRODUCTS_NAMESPACE, 'list'] })
}

export function useUploadProductImage() {
  const { apiFetch } = useApi()
  return useMutation({
    mutation: ({ productId, formData }: { productId: number, formData: FormData }) =>
      apiFetch<ProductImageResponse>(`/api/v1/products/${productId}/images`, {
        method: 'POST',
        body: formData,
      }),
    onSuccess: (_data, { productId }) => invalidateProduct(productId),
  })
}

export function useUpdateProductImage() {
  const { apiFetch } = useApi()
  return useMutation({
    mutation: ({ productId, imageId, patch }: {
      productId: number
      imageId: number
      patch: ProductImageUpdate
    }) =>
      apiFetch<ProductImageResponse>(`/api/v1/products/${productId}/images/${imageId}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: (_data, { productId }) => invalidateProduct(productId),
  })
}

export function useDeleteProductImage() {
  const { apiFetch } = useApi()
  return useMutation({
    mutation: ({ productId, imageId }: { productId: number, imageId: number }) =>
      apiFetch<unknown>(`/api/v1/products/${productId}/images/${imageId}`, {
        method: 'DELETE',
      }),
    onSettled: (_data, _error, { productId }) => invalidateProduct(productId),
  })
}
