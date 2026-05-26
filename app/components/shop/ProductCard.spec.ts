// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ProductCard from './ProductCard.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Blue Mug',
    slug: 'blue-mug',
    description: null,
    sku: null,
    price_usd: 12,
    price_pln: 48,
    price_eur: 11,
    stock: 5,
    low_stock_threshold: null,
    is_active: true,
    is_featured: false,
    category_id: null,
    images: [],
    created_at: '',
    updated_at: '',
    in_stock: true,
    ...overrides,
  }
}

describe('ShopProductCard', () => {
  it('renders the name, a price, and links to the product page', async () => {
    const wrapper = await mountSuspended(ProductCard, { props: { product: product() } })
    expect(wrapper.text()).toContain('Blue Mug')
    expect(wrapper.text()).toContain('$')
    expect(wrapper.html()).toContain('/products/blue-mug')
  })

  it('shows an out-of-stock badge when stock is 0', async () => {
    const wrapper = await mountSuspended(ProductCard, { props: { product: product({ stock: 0 }) } })
    expect(wrapper.text()).toContain('Out of Stock')
  })

  it('renders an enabled add-to-cart button for in-stock products', async () => {
    const wrapper = await mountSuspended(ProductCard, { props: { product: product() } })
    expect(wrapper.text()).toContain('Add to Cart')
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(ProductCard, { props: { product: product() } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
