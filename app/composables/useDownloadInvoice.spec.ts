import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Client-only invoice download over `useApi`. Specs assert the URL + blob
 * request, the named browser-download trigger, and that error bodies — which
 * arrive as a Blob under `responseType: 'blob'` — are reparsed into
 * ProblemDetails.
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

describe('useDownloadInvoice', () => {
  it('fetches the PDF as a blob and triggers a named download', async () => {
    apiFetch.mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' }))
    const { useDownloadInvoice } = await import('./useDownloadInvoice')

    const result = await useDownloadInvoice().download(7, 'ORD-20260527-ABC123', 'en')

    expect(result).toBeNull()
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/orders/7/invoice', {
      query: { lang: 'en' },
      responseType: 'blob',
    })
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(clickSpy).toHaveBeenCalledOnce()
    expect((clickSpy.mock.instances[0] as HTMLAnchorElement).download).toBe(
      'invoice-ORD-20260527-ABC123.pdf',
    )
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })

  it('passes the requested language through', async () => {
    apiFetch.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }))
    const { useDownloadInvoice } = await import('./useDownloadInvoice')
    await useDownloadInvoice().download(3, 'ORD-X', 'pl')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/orders/3/invoice', {
      query: { lang: 'pl' },
      responseType: 'blob',
    })
  })

  it('reparses a Blob error body into ProblemDetails (no download)', async () => {
    const body = new Blob([JSON.stringify({ detail: 'Order not found' })], {
      type: 'application/json',
    })
    apiFetch.mockRejectedValue({ data: body, status: 404 })
    const { useDownloadInvoice } = await import('./useDownloadInvoice')

    const result = await useDownloadInvoice().download(7, 'ORD-X', 'en')

    expect(result?.title).toBe('Order not found')
    expect(result?.status).toBe(404)
    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('parses a plain-object error body into ProblemDetails', async () => {
    apiFetch.mockRejectedValue({ data: { detail: 'Boom' }, status: 500 })
    const { useDownloadInvoice } = await import('./useDownloadInvoice')
    const result = await useDownloadInvoice().download(7, 'ORD-X', 'en')
    expect(result?.title).toBe('Boom')
  })

  it('toggles isDownloading around the request', async () => {
    let resolve: (v: Blob) => void = () => {}
    apiFetch.mockReturnValue(new Promise<Blob>((r) => {
      resolve = r
    }))
    const { useDownloadInvoice } = await import('./useDownloadInvoice')
    const { download, isDownloading } = useDownloadInvoice()

    const pending = download(7, 'ORD-X', 'en')
    expect(isDownloading.value).toBe(true)
    resolve(new Blob(['%PDF'], { type: 'application/pdf' }))
    await pending
    expect(isDownloading.value).toBe(false)
  })
})
