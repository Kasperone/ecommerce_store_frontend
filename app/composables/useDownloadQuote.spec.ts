import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Client-only quote-PDF download over `useApi`. Mirrors
 * `useDownloadInvoice.spec.ts`: the request shape, the named browser-download
 * trigger, and the Blob-error reparse.
 */

const apiFetch = vi.fn()

vi.mock('~/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

const createObjectURL = vi.fn(() => 'blob:mock')
const revokeObjectURL = vi.fn()
let clickSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  // happy-dom doesn't implement URL.createObjectURL / anchor navigation.
  Object.assign(globalThis.URL, { createObjectURL, revokeObjectURL })
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useDownloadQuote', () => {
  it('fetches the PDF as a blob and triggers a download', async () => {
    apiFetch.mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' }))
    const { useDownloadQuote } = await import('./useDownloadQuote')

    const result = await useDownloadQuote().download(12, 'pl')

    expect(result).toBeNull()
    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/quotes/12/quote.pdf')
    expect(options.responseType).toBe('blob')
    expect(options.query).toEqual({ lang: 'pl' })
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })

  // The server names this after the derived quote number; the client-built
  // `quote-QT-<row id>` name leaked a raw database id to the customer instead.
  it('names the download from Content-Disposition when present', async () => {
    apiFetch.mockImplementation((_url: string, options: any) => {
      options?.onResponse?.({
        response: {
          headers: new Headers({
            'content-disposition': 'attachment; filename="quote-QT-2026-0031.pdf"',
          }),
        },
      })
      return Promise.resolve(new Blob(['%PDF'], { type: 'application/pdf' }))
    })
    const { useDownloadQuote } = await import('./useDownloadQuote')

    await useDownloadQuote().download(12, 'en')

    expect((clickSpy.mock.instances[0] as HTMLAnchorElement).download).toBe(
      'quote-QT-2026-0031.pdf',
    )
  })

  it('falls back to the row id when no Content-Disposition header', async () => {
    apiFetch.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }))
    const { useDownloadQuote } = await import('./useDownloadQuote')

    await useDownloadQuote().download(12, 'en')

    expect((clickSpy.mock.instances[0] as HTMLAnchorElement).download).toBe('quote-QT-12.pdf')
  })

  it('reparses a Blob error body into ProblemDetails (no download)', async () => {
    const body = new Blob([JSON.stringify({ detail: 'Not found' })], { type: 'application/json' })
    apiFetch.mockRejectedValue({ data: body, status: 404 })
    const { useDownloadQuote } = await import('./useDownloadQuote')

    const result = await useDownloadQuote().download(99, 'en')

    expect(result?.title).toBe('Not found')
    expect(result?.status).toBe(404)
    expect(clickSpy).not.toHaveBeenCalled()
  })
})
