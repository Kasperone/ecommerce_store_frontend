// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import type { LowStockItem } from '#shared/types/api'
import DashboardLowStock from './DashboardLowStock.vue'

// `region` is a page-level landmark rule — N/A to an isolated card.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

const ITEMS: LowStockItem[] = [
  { product_id: 4, name: 'Playwright Test Tea', sku: null, stock: 0, low_stock_threshold: null, status: 'backorder' },
  { product_id: 8, name: 'Test Phone X', sku: null, stock: 0, low_stock_threshold: null, status: 'out_of_stock' },
  { product_id: 6, name: 'Test product 1', sku: null, stock: 11, low_stock_threshold: 20, status: 'low_stock' },
]

describe('DashboardLowStock', () => {
  it('renders items with stock and a view-all link', async () => {
    const wrapper = await mountSuspended(DashboardLowStock, {
      props: { items: ITEMS, count: 3 },
    })
    const text = wrapper.text()
    expect(text).toContain('Playwright Test Tea')
    expect(text).toContain('11 in stock')
    // Status labels resolve (not raw keys).
    expect(text).not.toContain('admin.inventory.status')
    expect(wrapper.find('a[href="/admin/inventory"]').exists()).toBe(true)
  })

  it('shows a "+N more" note when the count exceeds the sample', async () => {
    const wrapper = await mountSuspended(DashboardLowStock, {
      props: { items: ITEMS, count: 8 },
    })
    expect(wrapper.text()).toContain('+5 more')
  })

  it('shows the empty state when nothing is low', async () => {
    const wrapper = await mountSuspended(DashboardLowStock, { props: { items: [], count: 0 } })
    expect(wrapper.text()).toContain('well stocked')
  })

  it('has no accessibility violations', async () => {
    const wrapper = await mountSuspended(DashboardLowStock, {
      props: { items: ITEMS, count: 3 },
    })
    expect(await axe(wrapper.element as HTMLElement, AXE_OPTIONS)).toHaveNoViolations()
  })
})
