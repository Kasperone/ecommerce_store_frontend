// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import type { TopProductRow } from '~/composables/queries/useReportQueries'
import ReportTopProducts from './ReportTopProducts.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

const ROWS: TopProductRow[] = [
  { product_id: 8, name: 'Test Phone X', slug: 'test-phone-x', units: 3, order_count: 3, revenue_by_currency: { USD: 300, EUR: 90 } },
  { product_id: 6, name: 'Deleted Product', slug: null, units: 1, order_count: 1, revenue_by_currency: { USD: 20 } },
]

describe('ReportTopProducts', () => {
  it('renders ranked rows with units and per-currency revenue lines', async () => {
    const wrapper = await mountSuspended(ReportTopProducts, { props: { rows: ROWS } })
    const text = wrapper.text()
    expect(text).toContain('Test Phone X')
    expect(text).toContain('3 sold')
    // Both currencies on the first row are shown — never summed across currencies.
    expect(text).toContain('300.00')
    expect(text).toContain('90.00')
  })

  it('links rows with a slug to the product edit page', async () => {
    const wrapper = await mountSuspended(ReportTopProducts, { props: { rows: ROWS } })
    expect(wrapper.find('a[href="/admin/products/8/edit"]').exists()).toBe(true)
  })

  it('does not link a deleted product (null slug)', async () => {
    const wrapper = await mountSuspended(ReportTopProducts, { props: { rows: ROWS } })
    expect(wrapper.find('a[href="/admin/products/6/edit"]').exists()).toBe(false)
  })

  it('shows the empty state when nothing has sold', async () => {
    const wrapper = await mountSuspended(ReportTopProducts, { props: { rows: [] } })
    expect(wrapper.text()).toContain('No sales in this date range')
  })

  it('has no accessibility violations', async () => {
    const wrapper = await mountSuspended(ReportTopProducts, { props: { rows: ROWS } })
    expect(await axe(wrapper.element as HTMLElement, AXE_OPTIONS)).toHaveNoViolations()
  })
})
