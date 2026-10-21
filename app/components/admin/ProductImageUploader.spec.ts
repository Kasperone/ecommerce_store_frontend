// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ProductImageUploader from './ProductImageUploader.vue'

// Stub the upload mutation so we can assert on what the uploader pushes.
const mutateAsync = vi.fn()
vi.mock('~/composables/queries/useProductImageQueries', () => ({
  useUploadProductImage: () => ({
    isLoading: { value: false },
    mutateAsync,
  }),
}))

beforeEach(() => {
  mutateAsync.mockReset()
})

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File([new Uint8Array(sizeBytes)], name, { type })
  // Force the size — some happy-dom versions compute from the array length.
  Object.defineProperty(file, 'size', { value: sizeBytes })
  return file
}

describe('ProductImageUploader', () => {
  it('renders the drop zone copy', async () => {
    const wrapper = await mountSuspended(ProductImageUploader, {
      props: { productId: 1 },
    })
    expect(wrapper.html()).toContain('Drop images here')
    expect(wrapper.html()).toContain('JPEG, PNG, WebP')
    expect(wrapper.html()).toContain('5 MB')
  })

  it('rejects an oversize file without calling the upload mutation', async () => {
    const wrapper = await mountSuspended(ProductImageUploader, {
      props: { productId: 1 },
    })
    const input = wrapper.find('input[type="file"]').element as HTMLInputElement
    const tooBig = makeFile('huge.jpg', 'image/jpeg', 6 * 1024 * 1024)
    Object.defineProperty(input, 'files', { value: [tooBig], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))

    expect(mutateAsync).not.toHaveBeenCalled()
    expect(wrapper.html()).toContain('huge.jpg')
    expect(wrapper.html()).toMatch(/larger than|5 MB/)
  })

  it('rejects an unsupported MIME type without calling the upload mutation', async () => {
    const wrapper = await mountSuspended(ProductImageUploader, {
      props: { productId: 1 },
    })
    const input = wrapper.find('input[type="file"]').element as HTMLInputElement
    const bad = makeFile('vector.svg', 'image/svg+xml', 1024)
    Object.defineProperty(input, 'files', { value: [bad], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))

    expect(mutateAsync).not.toHaveBeenCalled()
    expect(wrapper.html()).toContain('vector.svg')
    expect(wrapper.html()).toMatch(/not a supported|JPEG/)
  })

  it('POSTs valid files and emits "uploaded" on success', async () => {
    mutateAsync.mockResolvedValue({ id: 99, url: 'https://r2/img.jpg' })
    const wrapper = await mountSuspended(ProductImageUploader, {
      props: { productId: 42 },
    })
    const input = wrapper.find('input[type="file"]').element as HTMLInputElement
    const ok = makeFile('photo.jpg', 'image/jpeg', 200_000)
    Object.defineProperty(input, 'files', { value: [ok], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    await new Promise(r => setTimeout(r, 0))

    expect(mutateAsync).toHaveBeenCalledTimes(1)
    const call = mutateAsync.mock.calls[0][0]
    expect(call.productId).toBe(42)
    expect(call.formData).toBeInstanceOf(FormData)
    const uploadedFile = call.formData.get('file') as File
    expect(uploadedFile?.name).toBe('photo.jpg')
    expect(wrapper.emitted('uploaded')).toBeTruthy()
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(ProductImageUploader, {
      props: { productId: 1 },
    })
    // `region` is a page-level rule; doesn't apply to component fragments.
    expect(await axe(wrapper.html(), {
      rules: { region: { enabled: false } },
    })).toHaveNoViolations()
  })

  it('records an upload error and does not emit "uploaded" when the request rejects', async () => {
    mutateAsync.mockRejectedValue(new Error('500 boom'))
    const wrapper = await mountSuspended(ProductImageUploader, {
      props: { productId: 42 },
    })
    const input = wrapper.find('input[type="file"]').element as HTMLInputElement
    const ok = makeFile('photo.jpg', 'image/jpeg', 200_000)
    Object.defineProperty(input, 'files', { value: [ok], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    await new Promise(r => setTimeout(r, 0))

    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('uploaded')).toBeUndefined()
    expect(wrapper.html()).toMatch(/photo\.jpg|failed/)
  })
})
