// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ProductGrid from './ProductGrid.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

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
    low_stock_threshold: null,
    is_active: true,
    is_featured: false,
    category_id: null,
    images: [],
    created_at: '',
    updated_at: '',
    in_stock: true,
  }
}

describe('ShopProductGrid', () => {
  it('renders a card per product', async () => {
    const wrapper = await mountSuspended(ProductGrid, {
      props: { products: [product(1, 'Alpha'), product(2, 'Bravo')] },
    })
    expect(wrapper.text()).toContain('Alpha')
    expect(wrapper.text()).toContain('Bravo')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(ProductGrid, {
      props: { products: [product(1, 'Alpha')] },
    })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
