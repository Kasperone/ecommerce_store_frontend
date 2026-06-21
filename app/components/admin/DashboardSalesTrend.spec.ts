// @vitest-environment nuxt
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import type { CurrencyCode } from '#shared/utils/money'
import type { SalesTrendPoint } from '#shared/types/api'
import DashboardSalesTrend from './DashboardSalesTrend.vue'

// `region` is a page-level landmark rule — N/A to an isolated card.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

// Stub the Unovis-backed <BarChart> so the spec asserts on the props we hand it
// rather than on the chart's SVG internals — and so Unovis never schedules the
// animation timers that crash happy-dom on teardown.
const BarChartStub = defineComponent({
  name: 'BarChartStub',
  props: ['data', 'yAxis', 'categories', 'xFormatter', 'yFormatter', 'height'],
  template: '<div data-testid="trend-chart" />',
})

interface TrendProps {
  points: SalesTrendPoint[]
  currencies: CurrencyCode[]
  defaultCurrency: CurrencyCode
  windowDays: number
}

function mountTrend(props: TrendProps) {
  return mountSuspended(DashboardSalesTrend, {
    props,
    global: { stubs: { BarChart: BarChartStub } },
  })
}

function point(date: string, orderCount: number, revenue: Record<string, number>): SalesTrendPoint {
  return { date, order_count: orderCount, revenue }
}

const WITH_REVENUE: SalesTrendPoint[] = [
  point('2026-05-01', 0, {}),
  point('2026-05-02', 2, { USD: 40 }),
  point('2026-05-03', 1, { USD: 20 }),
]

describe('DashboardSalesTrend', () => {
  it('feeds one chart row per point and shows the windowed revenue total', async () => {
    const wrapper = await mountTrend({
      points: WITH_REVENUE,
      currencies: ['USD'],
      defaultCurrency: 'USD',
      windowDays: 3,
    })
    const chart = wrapper.findComponent(BarChartStub)
    expect(chart.exists()).toBe(true)
    expect(chart.props('data')).toHaveLength(3)
    expect(chart.props('yAxis')).toEqual(['revenue'])
    // Summary sums 40 + 20 = 60 in the selected currency.
    expect(wrapper.text()).toContain('60.00')
  })

  it('shows the empty note and renders no chart when there is no revenue', async () => {
    const wrapper = await mountTrend({
      points: [point('2026-05-01', 3, {}), point('2026-05-02', 0, {})],
      currencies: [],
      defaultCurrency: 'USD',
      windowDays: 7,
    })
    expect(wrapper.findComponent(BarChartStub).exists()).toBe(false)
    expect(wrapper.text()).toContain('No revenue in the last 7 days')
  })

  it('has no accessibility violations', async () => {
    const wrapper = await mountTrend({
      points: WITH_REVENUE,
      currencies: ['USD'],
      defaultCurrency: 'USD',
      windowDays: 3,
    })
    expect(await axe(wrapper.element as HTMLElement, AXE_OPTIONS)).toHaveNoViolations()
  })
})
