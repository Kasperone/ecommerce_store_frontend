// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import SearchResultCard from './SearchResultCard.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function result(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    slug: 'blue-phone',
    name: 'Blue Phone',
    name_highlight: '<em>Blue</em> Phone',
    description: null,
    sku: null,
    image_url: null,
    in_stock: true,
    category_id: null,
    category_name: null,
    price_usd: 99,
    price_pln: null,
    price_eur: null,
    ...overrides,
  }
}

describe('ShopSearchResultCard', () => {
  it('renders the highlighted name, a price, and a product link', async () => {
    const wrapper = await mountSuspended(SearchResultCard, { props: { result: result() } })
    expect(wrapper.text()).toContain('Blue Phone')
    expect(wrapper.find('em').text()).toBe('Blue')
    expect(wrapper.text()).toContain('$')
    expect(wrapper.html()).toContain('/products/blue-phone')
  })

  it('shows an out-of-stock badge when not in stock', async () => {
    const wrapper = await mountSuspended(SearchResultCard, {
      props: { result: result({ in_stock: false }) },
    })
    expect(wrapper.text()).toContain('Out of Stock')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(SearchResultCard, { props: { result: result() } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
