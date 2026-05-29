// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import type { TopProductItem } from '#shared/types/api'
import DashboardTopProducts from './DashboardTopProducts.vue'

// `region` is a page-level landmark rule — N/A to an isolated card.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

const ITEMS: TopProductItem[] = [
  { product_id: 8, name: 'Test Phone X', slug: 'test-phone-x', units_sold: 3, order_count: 3 },
  { product_id: 6, name: 'Test product 1', slug: 'test-product-1', units_sold: 1, order_count: 1 },
]

describe('DashboardTopProducts', () => {
  it('renders ranked products with units sold and an edit link', async () => {
    const wrapper = await mountSuspended(DashboardTopProducts, { props: { items: ITEMS } })
    const text = wrapper.text()
    expect(text).toContain('Test Phone X')
    expect(text).toContain('Test product 1')
    expect(text).toContain('3 sold')
    expect(wrapper.find('a[href="/admin/products/8/edit"]').exists()).toBe(true)
  })

  it('shows the empty state when nothing has sold', async () => {
    const wrapper = await mountSuspended(DashboardTopProducts, { props: { items: [] } })
    expect(wrapper.text()).toContain('No sales yet')
  })

  it('has no accessibility violations', async () => {
    const wrapper = await mountSuspended(DashboardTopProducts, { props: { items: ITEMS } })
    expect(await axe(wrapper.element as HTMLElement, AXE_OPTIONS)).toHaveNoViolations()
  })
})
