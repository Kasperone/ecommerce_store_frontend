import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Client-only orders CSV export over `useApi`. Specs assert the URL + blob
 * request with the filter query, the named download (filename read from
 * Content-Disposition via the onResponse hook, else a fallback), and that error
 * bodies — which arrive as a Blob under `responseType: 'blob'` — are reparsed
 * into ProblemDetails.
 */

const apiFetch = vi.fn()

vi.mock('~/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

const createObjectURL = vi.fn(() => 'blob:mock')
const revokeObjectURL = vi.fn()
let clickSpy: ReturnType<typeof vi.spyOn>

function csvBlob() {
  return new Blob(['order_number\r\n'], { type: 'text/csv' })
}

beforeEach(() => {
  vi.clearAllMocks()
  // happy-dom doesn't implement URL.createObjectURL / anchor navigation.
  Object.assign(globalThis.URL, { createObjectURL, revokeObjectURL })
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useExportOrders', () => {
  it('fetches the CSV as a blob with the filter query', async () => {
    apiFetch.mockResolvedValue(csvBlob())
    const { useExportOrders } = await import('./useExportOrders')

    const result = await useExportOrders().exportOrders({
      status: 'paid',
      dateFrom: '2026-05-01',
      dateTo: '2026-05-31',
    })

    expect(result).toBeNull()
    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/orders/export')
    expect(options.responseType).toBe('blob')
    expect(options.query).toMatchObject({
      status: 'paid',
      date_from: '2026-05-01',
      date_to: '2026-05-31',
    })
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(clickSpy).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })

  it('names the download from Content-Disposition when present', async () => {
    apiFetch.mockImplementation((_url: string, options: any) => {
      options?.onResponse?.({
        response: {
          headers: new Headers({ 'content-disposition': 'attachment; filename="orders-paid.csv"' }),
        },
      })
      return Promise.resolve(csvBlob())
    })
    const { useExportOrders } = await import('./useExportOrders')

    await useExportOrders().exportOrders({ status: 'paid' })

    expect((clickSpy.mock.instances[0] as HTMLAnchorElement).download).toBe('orders-paid.csv')
  })

  it('falls back to orders.csv when no Content-Disposition header', async () => {
    apiFetch.mockResolvedValue(csvBlob())
    const { useExportOrders } = await import('./useExportOrders')

    await useExportOrders().exportOrders({})

    expect((clickSpy.mock.instances[0] as HTMLAnchorElement).download).toBe('orders.csv')
  })

  it('reparses a Blob error body into ProblemDetails (no download)', async () => {
    const body = new Blob([JSON.stringify({ detail: 'Forbidden' })], { type: 'application/json' })
    apiFetch.mockRejectedValue({ data: body, status: 403 })
    const { useExportOrders } = await import('./useExportOrders')

    const result = await useExportOrders().exportOrders({})

    expect(result?.title).toBe('Forbidden')
    expect(result?.status).toBe(403)
    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('toggles isExporting around the request', async () => {
    let resolve: (v: Blob) => void = () => {}
    apiFetch.mockReturnValue(new Promise<Blob>((r) => {
      resolve = r
    }))
    const { useExportOrders } = await import('./useExportOrders')
    const { exportOrders, isExporting } = useExportOrders()

    const pending = exportOrders({})
    expect(isExporting.value).toBe(true)
    resolve(csvBlob())
    await pending
    expect(isExporting.value).toBe(false)
  })
})
