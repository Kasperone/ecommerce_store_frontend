import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Client-only products CSV export over `useApi`. Mirrors useExportInventory.spec:
 * asserts the URL + blob request with the filter query, the named download
 * (Content-Disposition, else a fallback), and that error bodies (which arrive as
 * a Blob under `responseType: 'blob'`) are reparsed into ProblemDetails.
 */

const apiFetch = vi.fn()

vi.mock('~/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

const createObjectURL = vi.fn(() => 'blob:mock')
const revokeObjectURL = vi.fn()
let clickSpy: ReturnType<typeof vi.spyOn>

function csvBlob() {
  return new Blob(['id,slug,name\r\n'], { type: 'text/csv' })
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(globalThis.URL, { createObjectURL, revokeObjectURL })
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useExportProducts', () => {
  it('fetches the CSV as a blob with the filter query', async () => {
    apiFetch.mockResolvedValue(csvBlob())
    const { useExportProducts } = await import('./useExportProducts')

    const result = await useExportProducts().exportProducts({
      categoryId: 3,
      isActive: true,
      search: 'tea',
    })

    expect(result).toBeNull()
    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/products/export')
    expect(options.responseType).toBe('blob')
    expect(options.query).toMatchObject({ category_id: 3, is_active: true, search: 'tea' })
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(clickSpy).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })

  it('names the download from Content-Disposition when present', async () => {
    apiFetch.mockImplementation((_url: string, options: any) => {
      options?.onResponse?.({
        response: {
          headers: new Headers({
            'content-disposition': 'attachment; filename="products-tea.csv"',
          }),
        },
      })
      return Promise.resolve(csvBlob())
    })
    const { useExportProducts } = await import('./useExportProducts')

    await useExportProducts().exportProducts({ search: 'tea' })

    expect((clickSpy.mock.instances[0] as HTMLAnchorElement).download).toBe('products-tea.csv')
  })

  it('falls back to products.csv when no Content-Disposition header', async () => {
    apiFetch.mockResolvedValue(csvBlob())
    const { useExportProducts } = await import('./useExportProducts')

    await useExportProducts().exportProducts({})

    expect((clickSpy.mock.instances[0] as HTMLAnchorElement).download).toBe('products.csv')
  })

  it('reparses a Blob error body into ProblemDetails (no download)', async () => {
    const body = new Blob([JSON.stringify({ detail: 'Forbidden' })], { type: 'application/json' })
    apiFetch.mockRejectedValue({ data: body, status: 403 })
    const { useExportProducts } = await import('./useExportProducts')

    const result = await useExportProducts().exportProducts({})

    expect(result?.title).toBe('Forbidden')
    expect(result?.status).toBe(403)
    expect(clickSpy).not.toHaveBeenCalled()
  })
})
