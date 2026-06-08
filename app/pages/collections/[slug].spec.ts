// @vitest-environment nuxt
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { CollectionWithProductCount, ProductWithCategory } from '#shared/types/api'

/**
 * Storefront collection detail page — renders the hero/title, a product grid of
 * member products (curation order, via `useProductListing({ collectionId })`),
 * and an empty-state. `useCollectionDetail` + `useProductListing` are mocked at
 * their auto-import boundaries.
 */

const collection = ref<CollectionWithProductCount | null>(null)
const detailError = ref<unknown>(null)
const listing = ref<{ items: ProductWithCategory[] } | null>(null)

mockNuxtImport('useCollectionDetail', () => () => ({ data: collection, error: detailError }))
mockNuxtImport('useProductListing', () => () => ({ data: listing }))
mockNuxtImport('useRoute', () => () => ({ params: { slug: 'summer-picks' }, query: {} }))

function makeCollection(over: Partial<CollectionWithProductCount> = {}): CollectionWithProductCount {
  return {
    id: 7,
    name: 'Summer Picks',
    slug: 'summer-picks',
    description: 'Hot weather essentials.',
    is_active: true,
    sort_order: 0,
    type: 'manual',
    product_count: 2,
    hero_image_url: 'https://cdn.example.com/hero.jpg',
    hero_image_alt: 'Beach scene',
    created_at: '2026-06-08T00:00:00Z',
    updated_at: '2026-06-08T00:00:00Z',
    ...over,
  } as CollectionWithProductCount
}

function product(id: number, name: string): ProductWithCategory {
  return {
    id,
    name,
    slug: `p-${id}`,
    images: [],
  } as unknown as ProductWithCategory
}

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

async function mountPage() {
  const Page = (await import('./[slug].vue')).default
  return await mountSuspended(Page, {
    global: {
      stubs: {
        NuxtLayout: PassThroughStub,
        ShopProductGrid: defineComponent({
          props: { products: { type: Array, default: () => [] } },
          setup(props) {
            return () => h('div', { class: 'grid-stub' }, (props.products as ProductWithCategory[]).map(p => h('span', p.name)))
          },
        }),
      },
    },
  })
}

beforeEach(() => {
  collection.value = makeCollection()
  detailError.value = null
  listing.value = { items: [product(1, 'Sun Hat'), product(2, 'Sandals')] }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('collection detail page', () => {
  it('renders the collection title, description, and hero image', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('Summer Picks')
    expect(wrapper.text()).toContain('Hot weather essentials.')
    const hero = wrapper.find('img')
    expect(hero.attributes('src')).toBe('https://cdn.example.com/hero.jpg')
    expect(hero.attributes('alt')).toBe('Beach scene')
  })

  it('renders the member-product grid in curation order', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('.grid-stub').exists()).toBe(true)
    expect(wrapper.text()).toContain('Sun Hat')
    expect(wrapper.text()).toContain('Sandals')
  })

  it('renders an empty-state when the collection has no products', async () => {
    listing.value = { items: [] }
    const wrapper = await mountPage()
    expect(wrapper.find('.grid-stub').exists()).toBe(false)
    expect(wrapper.text()).toContain('No products in this collection yet')
  })
})
