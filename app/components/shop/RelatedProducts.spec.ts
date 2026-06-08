// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import type { ProductResponse } from '#shared/types/api'
import RelatedProducts from './RelatedProducts.vue'

/**
 * The PDP "You may also like" rail. It self-hides when the related query has no
 * data and renders a `<ShopProductGrid>` of tiles when cards arrive.
 */

const relatedData = ref<ProductResponse[] | undefined>(undefined)

mockNuxtImport('useRelatedProductsQuery', () => () => ({ data: relatedData }))

function product(id: number, name: string): ProductResponse {
  return {
    id,
    name,
    slug: `p-${id}`,
    description: null,
    sku: null,
    price_usd: 10,
    price_pln: 40,
    price_eur: 9,
    stock: 5,
    low_stock_threshold: null,
    is_active: true,
    is_featured: false,
    category_id: null,
    images: [],
    created_at: '',
    updated_at: '',
    in_stock: true,
  } as unknown as ProductResponse
}

describe('ShopRelatedProducts', () => {
  it('renders the heading and a tile per related product', async () => {
    relatedData.value = [product(1, 'Alpha'), product(2, 'Bravo')]
    const wrapper = await mountSuspended(RelatedProducts, {
      props: { slug: 'current' },
    })

    expect(wrapper.find('section').exists()).toBe(true)
    expect(wrapper.text()).toContain('You may also like')
    expect(wrapper.text()).toContain('Alpha')
    expect(wrapper.text()).toContain('Bravo')
  })

  it('renders nothing when there are no related products', async () => {
    relatedData.value = []
    const wrapper = await mountSuspended(RelatedProducts, {
      props: { slug: 'current' },
    })

    expect(wrapper.find('section').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('You may also like')
  })

  it('renders nothing while the query is still loading (no data)', async () => {
    relatedData.value = undefined
    const wrapper = await mountSuspended(RelatedProducts, {
      props: { slug: 'current' },
    })

    expect(wrapper.find('section').exists()).toBe(false)
  })
})
