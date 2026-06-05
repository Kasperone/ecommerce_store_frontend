// @vitest-environment nuxt
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import ProductGridBlock from './ProductGridBlock.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

// `useBlockProducts` is the SSR fetch seam — it's an explicit import in the
// block (not a Nuxt auto-import), so mock the module directly rather than via
// `mockNuxtImport`. Each test shapes the resolved list without hitting network.
const productsRef = ref<unknown[]>([])
vi.mock('../useBlockProducts', () => ({
  useBlockProducts: () => ({ data: productsRef }),
}))

function product(id: number, name: string) {
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
    is_active: true,
    is_featured: false,
    category_id: null,
    images: [],
    created_at: '',
    updated_at: '',
    in_stock: true,
  }
}

function settings(over: Record<string, unknown> = {}) {
  return {
    heading: 'Featured',
    source: 'featured' as const,
    collection_slug: null,
    product_ids: [],
    columns: 4,
    limit: 8,
    show_price: true,
    show_rating: true,
    show_badge: true,
    ...over,
  }
}

beforeEach(() => {
  productsRef.value = []
})

describe('ProductGridBlock', () => {
  it('renders the heading + a card per resolved product', async () => {
    productsRef.value = [product(1, 'Alpha'), product(2, 'Bravo')]
    const wrapper = await mountSuspended(ProductGridBlock, {
      props: { settings: settings() },
    })
    expect(wrapper.text()).toContain('Featured')
    expect(wrapper.text()).toContain('Alpha')
    expect(wrapper.text()).toContain('Bravo')
  })

  it('renders no product section when the list resolves empty', async () => {
    productsRef.value = []
    const wrapper = await mountSuspended(ProductGridBlock, {
      props: { settings: settings() },
    })
    expect(wrapper.find('.c-product-grid-block').exists()).toBe(false)
  })

  it('is axe-clean with products', async () => {
    productsRef.value = [product(1, 'Alpha')]
    const wrapper = await mountSuspended(ProductGridBlock, {
      props: { settings: settings() },
    })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
