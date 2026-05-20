import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

const apiFetch = vi.fn()

vi.mock('~/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function runInComponent(setupFn: () => unknown) {
  let captured: unknown
  const harness = defineComponent({
    setup() {
      captured = setupFn()
      return () => h('div')
    },
  })
  const pinia = createPinia()
  setActivePinia(pinia)
  mount(harness, {
    global: {
      plugins: [pinia, PiniaColada],
    },
  })
  await nextTick()
  return captured
}

describe('useUploadProductImage', () => {
  it('POSTs FormData to /api/v1/products/{id}/images', async () => {
    apiFetch.mockResolvedValue({ id: 1, url: 'https://r2/img.jpg' })
    const { useUploadProductImage } = await import('./useProductImageQueries')

    const formData = new FormData()
    formData.append('file', new Blob(['x'], { type: 'image/jpeg' }), 'img.jpg')

    const result = await runInComponent(() => useUploadProductImage()) as any
    await result.mutateAsync({ productId: 5, formData })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/products/5/images')
    expect(options.method).toBe('POST')
    expect(options.body).toBeInstanceOf(FormData)
  })
})

describe('useUpdateProductImage', () => {
  it('PATCHes /api/v1/products/{id}/images/{imageId}', async () => {
    apiFetch.mockResolvedValue({ id: 1, is_primary: true })
    const { useUpdateProductImage } = await import('./useProductImageQueries')

    const result = await runInComponent(() => useUpdateProductImage()) as any
    await result.mutateAsync({ productId: 5, imageId: 9, patch: { is_primary: true } })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/products/5/images/9')
    expect(options.method).toBe('PATCH')
    expect(options.body).toMatchObject({ is_primary: true })
  })

  it('PATCHes alt_text and sort_order', async () => {
    apiFetch.mockResolvedValue({ id: 1, alt_text: 'A book' })
    const { useUpdateProductImage } = await import('./useProductImageQueries')

    const result = await runInComponent(() => useUpdateProductImage()) as any
    await result.mutateAsync({
      productId: 5,
      imageId: 9,
      patch: { alt_text: 'A book', sort_order: 2 },
    })

    const [, options] = apiFetch.mock.calls[0]
    expect(options.body).toMatchObject({ alt_text: 'A book', sort_order: 2 })
  })
})

describe('useDeleteProductImage', () => {
  it('DELETEs /api/v1/products/{id}/images/{imageId}', async () => {
    apiFetch.mockResolvedValue(undefined)
    const { useDeleteProductImage } = await import('./useProductImageQueries')

    const result = await runInComponent(() => useDeleteProductImage()) as any
    await result.mutateAsync({ productId: 5, imageId: 9 })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/products/5/images/9')
    expect(options.method).toBe('DELETE')
  })
})
