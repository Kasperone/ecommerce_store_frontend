import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Client-only sales-report CSV export over `useApi`. Specs assert the URL + blob
 * request with the range/granularity query, the named download (from
 * Content-Disposition, else a fallback), and that error bodies (which arrive as a
 * Blob under `responseType: 'blob'`) are reparsed into ProblemDetails.
 */

const apiFetch = vi.fn()

vi.mock('~/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

const createObjectURL = vi.fn(() => 'blob:mock')
const revokeObjectURL = vi.fn()
let clickSpy: ReturnType<typeof vi.spyOn>

function csvBlob() {
  return new Blob(['bucket,orders\r\n'], { type: 'text/csv' })
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(globalThis.URL, { createObjectURL, revokeObjectURL })
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useExportSalesReport', () => {
  it('fetches the CSV as a blob with the range + granularity query', async () => {
    apiFetch.mockResolvedValue(csvBlob())
    const { useExportSalesReport } = await import('./useExportSalesReport')

    const result = await useExportSalesReport().exportSalesReport({
      start: '2026-05-01',
      end: '2026-05-31',
      granularity: 'week',
    })

    expect(result).toBeNull()
    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/reports/sales.csv')
    expect(options.responseType).toBe('blob')
    expect(options.query).toMatchObject({
      start: '2026-05-01',
      end: '2026-05-31',
      granularity: 'week',
    })
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(clickSpy).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })

  it('defaults granularity to day', async () => {
    apiFetch.mockResolvedValue(csvBlob())
    const { useExportSalesReport } = await import('./useExportSalesReport')

    await useExportSalesReport().exportSalesReport({ start: '2026-05-01', end: '2026-05-31' })

    expect(apiFetch.mock.calls[0]?.[1].query.granularity).toBe('day')
  })

  it('names the download from Content-Disposition when present', async () => {
    apiFetch.mockImplementation((_url: string, options: any) => {
      options?.onResponse?.({
        response: {
          headers: new Headers({
            'content-disposition': 'attachment; filename="sales-2026-05.csv"',
          }),
        },
      })
      return Promise.resolve(csvBlob())
    })
    const { useExportSalesReport } = await import('./useExportSalesReport')

    await useExportSalesReport().exportSalesReport({ start: '2026-05-01', end: '2026-05-31' })

    expect((clickSpy.mock.instances[0] as HTMLAnchorElement).download).toBe('sales-2026-05.csv')
  })

  it('falls back to sales-report.csv when no Content-Disposition header', async () => {
    apiFetch.mockResolvedValue(csvBlob())
    const { useExportSalesReport } = await import('./useExportSalesReport')

    await useExportSalesReport().exportSalesReport({ start: '2026-05-01', end: '2026-05-31' })

    expect((clickSpy.mock.instances[0] as HTMLAnchorElement).download).toBe('sales-report.csv')
  })

  it('reparses a Blob error body into ProblemDetails (no download)', async () => {
    const body = new Blob([JSON.stringify({ detail: 'Forbidden' })], { type: 'application/json' })
    apiFetch.mockRejectedValue({ data: body, status: 403 })
    const { useExportSalesReport } = await import('./useExportSalesReport')

    const result = await useExportSalesReport().exportSalesReport({
      start: '2026-05-01',
      end: '2026-05-31',
    })

    expect(result?.title).toBe('Forbidden')
    expect(result?.status).toBe(403)
    expect(clickSpy).not.toHaveBeenCalled()
  })
})
