/**
 * Pinia Colada mutation layer for CMS media uploads.
 *
 * `useUploadCmsMedia()` posts a multipart file to the stateless admin media
 * endpoint (`POST /admin/media`, R2-backed, no DB row) and resolves to the
 * public URL plus captured metadata. The page-builder image picker writes
 * `res.url` straight into the `image_picker` field (a plain URL string — no
 * schema change). Mutations are SSR-safe by default (no `enabled` gate needed).
 */

import { useMutation } from '@pinia/colada'
import type { components } from '#shared/types/api.gen'

export type MediaUploadResponse = components['schemas']['MediaUploadResponse']

export function useUploadCmsMedia() {
  const { apiFetch } = useApi()
  return useMutation({
    mutation: ({ formData }: { formData: FormData }) =>
      apiFetch<MediaUploadResponse>('/api/v1/admin/media', {
        method: 'POST',
        body: formData,
      }),
  })
}
