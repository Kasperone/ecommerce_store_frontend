// @vitest-environment nuxt
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { ProductWithCategory } from '#shared/types/api'

/**
 * Product detail page — focused on the P2 merchandising tag chips: `product.tags`
 * render as chip links to `/search?tag={name}` and the row self-hides when the
 * product carries no tags. The heavy storefront child components are stubbed;
 * `useProductDetail` + `useProductReviews` are mocked at the auto-import boundary.
 */

const product = ref<ProductWithCategory | null>(null)
const productError = ref<unknown>(null)

mockNuxtImport('useProductDetail', () => () => ({ data: product, error: productError }))
mockNuxtImport('useProductReviews', () => () => ({ data: ref(null) }))
mockNuxtImport('useRoute', () => () => ({ params: { slug: 'widget' }, query: {} }))

function makeProduct(over: Partial<ProductWithCategory> = {}): ProductWithCategory {
  return {
    id: 1,
    name: 'Widget',
    slug: 'widget',
    description: 'A fine widget.',
    price_usd: 10,
    price_pln: 40,
    price_eur: 9,
    stock: 5,
    is_active: true,
    has_variants: false,
    allow_backorder: false,
    images: [],
    variants: [],
    options: [],
    category: null,
    tags: [],
    created_at: '2026-06-08T00:00:00Z',
    updated_at: '2026-06-08T00:00:00Z',
    ...over,
  } as unknown as ProductWithCategory
}

// Pass-through / no-op stubs for the heavy storefront children so we mount fast.
const Stub = defineComponent({ setup: (_p, { slots }) => () => h('div', slots.default?.()) })

async function mountPage() {
  const Page = (await import('./[slug].vue')).default
  return await mountSuspended(Page, {
    global: {
      stubs: {
        NuxtLayout: Stub,
        ShopProductGallery: true,
        ShopPriceDisplay: true,
        ShopOmnibusPrice: true,
        ShopVariantSelector: true,
        ShopAddToCartButton: true,
        ShopWishlistButton: true,
        LazyShopProductReviews: true,
        LazyShopRelatedProducts: true,
      },
    },
  })
}

beforeEach(() => {
  product.value = makeProduct()
  productError.value = null
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('PDP merchandising tag chips', () => {
  it('renders a chip link per tag pointing at the faceted search', async () => {
    product.value = makeProduct({
      tags: [
        { id: 1, name: 'eco', color: '#10b981' },
        { id: 2, name: 'new', color: null },
      ],
    } as Partial<ProductWithCategory>)
    const wrapper = await mountPage()
    const text = wrapper.text()
    expect(text).toContain('eco')
    expect(text).toContain('new')

    const ecoLink = wrapper.findAll('a').find(a => a.text().includes('eco'))
    expect(ecoLink).toBeTruthy()
    expect(ecoLink!.attributes('href')).toContain('/search')
    expect(ecoLink!.attributes('href')).toContain('tag=eco')
  })

  it('hides the tag row when the product has no tags', async () => {
    product.value = makeProduct({ tags: [] } as Partial<ProductWithCategory>)
    const wrapper = await mountPage()
    const tagLinks = wrapper.findAll('a').filter(a => a.attributes('href')?.includes('tag='))
    expect(tagLinks.length).toBe(0)
  })
})
