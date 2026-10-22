import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Client-only inventory CSV export over `useApi`. Specs assert the URL + blob
 * request with the filter query, the named download (from Content-Disposition,
 * else a fallback), and that error bodies (which arrive as a Blob under
 * `responseType: 'blob'`) are reparsed into ProblemDetails.
 */

const apiFetch = vi.fn()

vi.mock('~/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

const createObjectURL = vi.fn(() => 'blob:mock')
const revokeObjectURL = vi.fn()
let clickSpy: ReturnType<typeof vi.spyOn>

function csvBlob() {
  return new Blob(['product_id\r\n'], { type: 'text/csv' })
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(globalThis.URL, { createObjectURL, revokeObjectURL })
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useExportInventory', () => {
  it('fetches the CSV as a blob with the filter query', async () => {
    apiFetch.mockResolvedValue(csvBlob())
    const { useExportInventory } = await import('./useExportInventory')

    const result = await useExportInventory().exportInventory({ status: 'low_stock', search: 'bolt' })

    expect(result).toBeNull()
    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/inventory/export')
    expect(options.responseType).toBe('blob')
    expect(options.query).toMatchObject({ status: 'low_stock', search: 'bolt' })
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(clickSpy).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })

  it('names the download from Content-Disposition when present', async () => {
    apiFetch.mockImplementation((_url: string, options: any) => {
      options?.onResponse?.({
        response: {
          headers: new Headers({
            'content-disposition': 'attachment; filename="inventory-low_stock.csv"',
          }),
        },
      })
      return Promise.resolve(csvBlob())
    })
    const { useExportInventory } = await import('./useExportInventory')

    await useExportInventory().exportInventory({ status: 'low_stock' })

    expect((clickSpy.mock.instances[0] as HTMLAnchorElement).download).toBe(
      'inventory-low_stock.csv',
    )
  })

  it('falls back to inventory.csv when no Content-Disposition header', async () => {
    apiFetch.mockResolvedValue(csvBlob())
    const { useExportInventory } = await import('./useExportInventory')

    await useExportInventory().exportInventory({})

    expect((clickSpy.mock.instances[0] as HTMLAnchorElement).download).toBe('inventory.csv')
  })

  it('reparses a Blob error body into ProblemDetails (no download)', async () => {
    const body = new Blob([JSON.stringify({ detail: 'Forbidden' })], { type: 'application/json' })
    apiFetch.mockRejectedValue({ data: body, status: 403 })
    const { useExportInventory } = await import('./useExportInventory')

    const result = await useExportInventory().exportInventory({})

    expect(result?.title).toBe('Forbidden')
    expect(result?.status).toBe(403)
    expect(clickSpy).not.toHaveBeenCalled()
  })
})
