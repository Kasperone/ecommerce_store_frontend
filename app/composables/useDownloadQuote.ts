/**
 * Authed, client-only quote-PDF download.
 *
 * Mirrors {@link useDownloadInvoice}. The endpoint
 * (`GET /api/v1/quotes/{id}/quote.pdf?lang=`) is Bearer-authed, so a plain
 * `<a href>` can't carry the in-memory token — we fetch the PDF as a Blob
 * through `useApi` (which keeps the bearer + 401-retry) and trigger a browser
 * download via an object URL. Returns a `ProblemDetails` on failure (null on
 * success) so the caller can surface it (e.g. a toast).
 *
 * The server names the file after the derived *quote number*; we honour that
 * and fall back to the raw row id only if the header is missing.
 */

import { ref } from 'vue'
import { filenameFromDisposition } from '#shared/utils/contentDisposition'
import { parseProblem } from '#shared/utils/problemDetails'
import type { ProblemDetails } from '#shared/utils/problemDetails'

export function useDownloadQuote() {
  const { apiFetch } = useApi()
  const isDownloading = ref(false)

  async function download(
    quoteId: number,
    lang: string,
  ): Promise<ProblemDetails | null> {
    isDownloading.value = true
    let filename = `quote-QT-${quoteId}.pdf`
    try {
      const blob = await apiFetch<Blob>(`/api/v1/quotes/${quoteId}/quote.pdf`, {
        query: { lang },
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
