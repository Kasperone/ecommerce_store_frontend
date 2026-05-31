/**
 * Authed, client-only sales-report CSV export download.
 *
 * Mirrors useExportInventory / useExportOrders: `GET /api/v1/admin/reports/sales.csv`
 * is Bearer-authed, so a plain `<a href>` can't carry the in-memory token — we fetch
 * the CSV as a Blob through `useApi` and trigger a download via an object URL. The
 * server names the file (it reflects the range/granularity); we read it from
 * Content-Disposition and fall back to `sales-report.csv`. Returns a `ProblemDetails`
 * on failure (null on success) so the caller can surface it (e.g. a toast).
 *
 * `start`/`end` are required by the endpoint — the caller only enables the button
 * once a complete range is present.
 */

import { ref } from 'vue'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ProblemDetails } from '#shared/utils/problemDetails'

export interface ExportSalesParams {
  start?: string
  end?: string
  granularity?: 'day' | 'week' | 'month'
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null
  const match = /filename="?([^";]+)"?/i.exec(header)
  if (!match || !match[1]) return null
  return match[1]
}

export function useExportSalesReport() {
  const { apiFetch } = useApi()
  const isExporting = ref(false)

  async function exportSalesReport(params: ExportSalesParams = {}): Promise<ProblemDetails | null> {
    isExporting.value = true
    let filename = 'sales-report.csv'
    try {
      const blob = await apiFetch<Blob>('/api/v1/admin/reports/sales.csv', {
        query: {
          start: params.start,
          end: params.end,
          granularity: params.granularity ?? 'day',
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
      // `responseType: 'blob'` makes ofetch parse the *error* body as a Blob too,
      // so `err.data` isn't the `{ detail }` JSON parseProblem expects — read +
      // reparse it so a 403/5xx surfaces a real message.
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

  return { exportSalesReport, isExporting }
}
