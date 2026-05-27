/**
 * Authed, client-only order-invoice download.
 *
 * The endpoint (`GET /api/v1/orders/{id}/invoice`) is Bearer-authed, so a plain
 * `<a href>` can't carry the in-memory token — we fetch the PDF as a Blob
 * through `useApi` (which keeps the bearer + 401-retry) and trigger a browser
 * download via an object URL. Returns a `ProblemDetails` on failure (null on
 * success) so the caller can surface it (e.g. a toast).
 */

import { ref } from 'vue'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ProblemDetails } from '#shared/utils/problemDetails'

export function useDownloadInvoice() {
  const { apiFetch } = useApi()
  const isDownloading = ref(false)

  async function download(
    orderId: number,
    orderNumber: string,
    lang: string,
  ): Promise<ProblemDetails | null> {
    isDownloading.value = true
    try {
      const blob = await apiFetch<Blob>(`/api/v1/orders/${orderId}/invoice`, {
        query: { lang },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `invoice-${orderNumber}.pdf`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      return null
    }
    catch (err) {
      // `responseType: 'blob'` makes ofetch parse the *error* body as a Blob
      // too, so `err.data` isn't the `{ detail }` JSON parseProblem expects —
      // read + reparse it so a 404/5xx surfaces a real message, not garbage.
      const e = err as { data?: unknown }
      if (e.data instanceof Blob) {
        try {
          e.data = JSON.parse(await e.data.text())
        }
        catch {
          // non-JSON error body — leave it for parseProblem's fallback
        }
      }
      return parseProblem(err)
    }
    finally {
      isDownloading.value = false
    }
  }

  return { download, isDownloading }
}
