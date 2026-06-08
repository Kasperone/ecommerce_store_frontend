// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import DashboardLowStockBadge from './DashboardLowStockBadge.vue'

/**
 * Dashboard tile: renders the threshold-aware low/out-of-stock counts and
 * deep-links into the inventory list pre-filtered to `?status=low_stock`.
 */

// Declared post-imports (a vi.hoisted factory can't reference `ref` — it's
// hoisted above the vue import). The mockNuxtImport factory runs lazily.
const summaryRef = ref<unknown>(null)

mockNuxtImport('useLowStockSummary', () => () => ({ data: summaryRef }))

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

describe('DashboardLowStockBadge', () => {
  beforeEach(() => {
    summaryRef.value = { low_stock_count: 5, out_of_stock_count: 2, backorder_count: 0 }
  })

  it('renders the low-stock and out-of-stock counts', async () => {
    const wrapper = await mountSuspended(DashboardLowStockBadge)
    const text = wrapper.text()
    expect(text).toContain('5')
    expect(text).toContain('2')
    // Combined badge total.
    expect(text).toContain('7')
    // Labels resolve (not raw keys).
    expect(text).not.toContain('admin.inventory.lowStock')
  })

  it('deep-links to the inventory list filtered by status=low_stock', async () => {
    const wrapper = await mountSuspended(DashboardLowStockBadge)
    const lowLink = wrapper
      .findAll('a')
      .find(a => a.attributes('href')?.includes('status=low_stock'))
    expect(lowLink).toBeTruthy()
    expect(lowLink!.attributes('href')).toContain('/admin/inventory')
  })

  it('links to the out-of-stock filter too', async () => {
    const wrapper = await mountSuspended(DashboardLowStockBadge)
    const outLink = wrapper
      .findAll('a')
      .find(a => a.attributes('href')?.includes('status=out_of_stock'))
    expect(outLink).toBeTruthy()
  })

  it('renders zeros when there is no summary yet', async () => {
    summaryRef.value = null
    const wrapper = await mountSuspended(DashboardLowStockBadge)
    expect(wrapper.text()).toContain('0')
  })

  it('has no accessibility violations', async () => {
    const wrapper = await mountSuspended(DashboardLowStockBadge)
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
