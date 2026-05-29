// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import type { SalesTrendPoint } from '#shared/types/api'
import DashboardSalesTrend from './DashboardSalesTrend.vue'

// `region` is a page-level landmark rule — N/A to an isolated card.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function point(date: string, orderCount: number, revenue: Record<string, number>): SalesTrendPoint {
  return { date, order_count: orderCount, revenue }
}

const WITH_REVENUE: SalesTrendPoint[] = [
  point('2026-05-01', 0, {}),
  point('2026-05-02', 2, { USD: 40 }),
  point('2026-05-03', 1, { USD: 20 }),
]

describe('DashboardSalesTrend', () => {
  it('renders one bar per point and the windowed revenue total', async () => {
    const wrapper = await mountSuspended(DashboardSalesTrend, {
      props: {
        points: WITH_REVENUE,
        currencies: ['USD'],
        defaultCurrency: 'USD',
        windowDays: 3,
      },
    })
    expect(wrapper.findAll('[data-testid="trend-bar"]')).toHaveLength(3)
    // Summary sums 40 + 20 = 60 in the selected currency.
    expect(wrapper.text()).toContain('60.00')
  })

  it('shows the empty note when there is no revenue in the window', async () => {
    const wrapper = await mountSuspended(DashboardSalesTrend, {
      props: {
        points: [point('2026-05-01', 3, {}), point('2026-05-02', 0, {})],
        currencies: [],
        defaultCurrency: 'USD',
        windowDays: 7,
      },
    })
    expect(wrapper.findAll('[data-testid="trend-bar"]')).toHaveLength(0)
    expect(wrapper.text()).toContain('No revenue in the last 7 days')
  })

  it('has no accessibility violations', async () => {
    const wrapper = await mountSuspended(DashboardSalesTrend, {
      props: {
        points: WITH_REVENUE,
        currencies: ['USD'],
        defaultCurrency: 'USD',
        windowDays: 3,
      },
    })
    expect(await axe(wrapper.element as HTMLElement, AXE_OPTIONS)).toHaveNoViolations()
  })
})
