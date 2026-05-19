// @vitest-environment nuxt
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import type { ProductImageResponse } from '#shared/types/api'
import ProductImageGallery from './ProductImageGallery.vue'

const updateMutateAsync = vi.fn()
const deleteMutateAsync = vi.fn()

vi.mock('~/composables/queries/useProductImageQueries', () => ({
  useUpdateProductImage: () => ({
    isLoading: { value: false },
    mutateAsync: updateMutateAsync,
  }),
  useDeleteProductImage: () => ({
    isLoading: { value: false },
    mutateAsync: deleteMutateAsync,
  }),
}))

beforeEach(() => {
  updateMutateAsync.mockReset()
  deleteMutateAsync.mockReset()
})

function makeImage(overrides: Partial<ProductImageResponse> = {}): ProductImageResponse {
  return {
    id: 1,
    product_id: 1,
    url: 'https://r2/a.jpg',
    alt_text: null,
    sort_order: 0,
    is_primary: false,
    width: 1200,
    height: 800,
    bytes: 240_000,
    mime: 'image/jpeg',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('ProductImageGallery', () => {
  it('renders one card per image', async () => {
    const images = [
      makeImage({ id: 1, url: 'https://r2/1.jpg' }),
      makeImage({ id: 2, url: 'https://r2/2.jpg', is_primary: true }),
      makeImage({ id: 3, url: 'https://r2/3.jpg' }),
    ]
    const wrapper = await mountSuspended(ProductImageGallery, {
      props: { productId: 99, images },
    })
    const imgs = wrapper.findAll('img')
    expect(imgs.length).toBe(3)
    expect(imgs[0]?.attributes('src')).toBe('https://r2/1.jpg')
    expect(imgs[2]?.attributes('src')).toBe('https://r2/3.jpg')
  })

  it('shows the Primary badge on the primary image only', async () => {
    const images = [
      makeImage({ id: 1, is_primary: false }),
      makeImage({ id: 2, is_primary: true }),
    ]
    const wrapper = await mountSuspended(ProductImageGallery, {
      props: { productId: 99, images },
    })
    const html = wrapper.html()
    // "Primary" appears once for the badge on image #2.
    const primaryMatches = html.match(/Primary/g) ?? []
    expect(primaryMatches.length).toBeGreaterThan(0)
  })

  it('PATCHes is_primary=true when "Set as primary" is clicked', async () => {
    updateMutateAsync.mockResolvedValue({})
    const images = [
      makeImage({ id: 1, is_primary: true }),
      makeImage({ id: 2, is_primary: false }),
    ]
    const wrapper = await mountSuspended(ProductImageGallery, {
      props: { productId: 99, images },
    })
    const setPrimaryBtns = wrapper.findAll('button').filter(b => b.text().includes('Set as primary'))
    expect(setPrimaryBtns.length).toBe(1)
    await setPrimaryBtns[0]!.trigger('click')
    await new Promise(r => setTimeout(r, 0))
    expect(updateMutateAsync).toHaveBeenCalledWith({
      productId: 99,
      imageId: 2,
      patch: { is_primary: true },
    })
  })

  it('does not PATCH the already-primary image when its button is missing', async () => {
    updateMutateAsync.mockResolvedValue({})
    const images = [makeImage({ id: 1, is_primary: true })]
    const wrapper = await mountSuspended(ProductImageGallery, {
      props: { productId: 99, images },
    })
    // The primary image renders the "Primary" label, not a "Set as primary" button.
    const setPrimaryBtns = wrapper.findAll('button').filter(b => b.text().includes('Set as primary'))
    expect(setPrimaryBtns.length).toBe(0)
    expect(updateMutateAsync).not.toHaveBeenCalled()
  })

  it('PATCHes alt_text on input blur when the value changed', async () => {
    updateMutateAsync.mockResolvedValue({})
    const images = [makeImage({ id: 1, alt_text: 'old' })]
    const wrapper = await mountSuspended(ProductImageGallery, {
      props: { productId: 99, images },
    })
    const altInput = wrapper.find('input').element as HTMLInputElement
    expect(altInput).toBeTruthy()
    altInput.value = 'new alt text'
    altInput.dispatchEvent(new Event('input', { bubbles: true }))
    altInput.dispatchEvent(new Event('blur', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    await new Promise(r => setTimeout(r, 0))
    expect(updateMutateAsync).toHaveBeenCalledWith({
      productId: 99,
      imageId: 1,
      patch: { alt_text: 'new alt text' },
    })
  })

  it('does NOT PATCH alt_text when input blurred without change', async () => {
    updateMutateAsync.mockResolvedValue({})
    const images = [makeImage({ id: 1, alt_text: 'unchanged' })]
    const wrapper = await mountSuspended(ProductImageGallery, {
      props: { productId: 99, images },
    })
    const altInput = wrapper.find('input').element as HTMLInputElement
    altInput.dispatchEvent(new Event('blur', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(updateMutateAsync).not.toHaveBeenCalled()
  })

  it('renders the dimensions and file size for each image', async () => {
    const images = [makeImage({ width: 1920, height: 1080, bytes: 512_000 })]
    const wrapper = await mountSuspended(ProductImageGallery, {
      props: { productId: 99, images },
    })
    const html = wrapper.html()
    expect(html).toContain('1920')
    expect(html).toContain('1080')
    expect(html).toContain('500 KB')
  })

  it('is axe-clean', async () => {
    const images = [makeImage({ id: 1 }), makeImage({ id: 2, is_primary: true })]
    const wrapper = await mountSuspended(ProductImageGallery, {
      props: { productId: 99, images },
    })
    expect(await axe(wrapper.html(), {
      rules: {
        'region': { enabled: false },
        'aria-hidden-focus': { enabled: false },
      },
    })).toHaveNoViolations()
  })
})
