/**
 * Authed, client-only orders CSV export download.
 *
 * Mirrors useDownloadInvoice: `GET /api/v1/orders/export` is Bearer-authed, so
 * a plain `<a href>` can't carry the in-memory token — we fetch the CSV as a
 * Blob through `useApi` and trigger a browser download via an object URL. The
 * server picks the filename (it reflects the active filters), so we read it from
 * Content-Disposition and fall back to `orders.csv`. Returns a `ProblemDetails`
 * on failure (null on success) so the caller can surface it (e.g. a toast).
 */

import { ref } from 'vue'
import { filenameFromDisposition } from '#shared/utils/contentDisposition'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ProblemDetails } from '#shared/utils/problemDetails'

export interface ExportOrdersParams {
  status?: string
  dateFrom?: string
  dateTo?: string
}

export function useExportOrders() {
  const { apiFetch } = useApi()
  const isExporting = ref(false)

  async function exportOrders(params: ExportOrdersParams = {}): Promise<ProblemDetails | null> {
    isExporting.value = true
    let filename = 'orders.csv'
    try {
      const blob = await apiFetch<Blob>('/api/v1/orders/export', {
        query: {
          status: params.status,
          date_from: params.dateFrom,
          date_to: params.dateTo,
        },
        responseType: 'blob',
        onResponse({ response }) {
          const fromHeader = filenameFromDisposition(response.headers.get('content-disposition'))
          if (fromHeader) filename = fromHeader
        },
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      return null
    }
    catch (err) {
      // `responseType: 'blob'` makes ofetch parse the *error* body as a Blob
      // too, so `err.data` isn't the `{ detail }` JSON parseProblem expects —
      // read + reparse it so a 403/5xx surfaces a real message, not garbage.
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
      isExporting.value = false
    }
  }

  return { exportOrders, isExporting }
}
