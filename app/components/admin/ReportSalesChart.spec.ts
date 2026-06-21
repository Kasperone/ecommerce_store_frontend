// @vitest-environment nuxt
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import type { CurrencyCode } from '#shared/utils/money'
import type { SalesBucket } from '~/composables/queries/useReportQueries'
import ReportSalesChart from './ReportSalesChart.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

interface ChartProps {
  buckets: SalesBucket[]
  currencies: CurrencyCode[]
  defaultCurrency: CurrencyCode
  granularity: 'day' | 'week' | 'month'
}

// Stub the Unovis-backed <BarChart> so the spec asserts on the props we hand it
// rather than on the chart's SVG internals — and so Unovis never schedules the
// animation timers that crash happy-dom on teardown.
const BarChartStub = defineComponent({
  name: 'BarChartStub',
  props: ['data', 'yAxis', 'categories', 'xFormatter', 'yFormatter', 'height'],
  template: '<div data-testid="sales-chart" />',
})

function mountChart(props: ChartProps) {
  return mountSuspended(ReportSalesChart, {
    props,
    global: { stubs: { BarChart: BarChartStub } },
  })
}

function bucket(b: string, orders: number, revenue: Record<string, number>): SalesBucket {
  return { bucket: b, orders, revenue }
}

const WITH_REVENUE: SalesBucket[] = [
  bucket('2026-05-01', 0, {}),
  bucket('2026-05-02', 2, { USD: 40 }),
  bucket('2026-05-03', 1, { USD: 20 }),
]

describe('ReportSalesChart', () => {
  it('feeds one chart row per bucket and shows the range revenue total', async () => {
    const wrapper = await mountChart({
      buckets: WITH_REVENUE, currencies: ['USD'], defaultCurrency: 'USD', granularity: 'day',
    })
    const chart = wrapper.findComponent(BarChartStub)
    expect(chart.exists()).toBe(true)
    expect(chart.props('data')).toHaveLength(3)
    expect(chart.props('yAxis')).toEqual(['revenue'])
    // Summary sums 40 + 20 = 60 in the selected currency.
    expect(wrapper.text()).toContain('60.00')
  })

  it('shows the empty note and renders no chart when there is no revenue', async () => {
    const wrapper = await mountChart({
      buckets: [bucket('2026-05-01', 3, {}), bucket('2026-05-02', 0, {})],
      currencies: [],
      defaultCurrency: 'USD',
      granularity: 'day',
    })
    expect(wrapper.findComponent(BarChartStub).exists()).toBe(false)
    expect(wrapper.text()).toContain('No revenue in this date range')
  })

  it('shows a currency picker only when more than one currency has revenue', async () => {
    // Nuxt UI's USelect is a button[role=combobox], so count the component, not a
    // native <select>. The `v-if="currencyItems.length > 1"` gates rendering.
    const single = await mountChart({
      buckets: WITH_REVENUE, currencies: ['USD'], defaultCurrency: 'USD', granularity: 'day',
    })
    expect(single.findAllComponents({ name: 'USelect' })).toHaveLength(0)

    const multi = await mountChart({
      buckets: [bucket('2026-05-02', 2, { USD: 40, EUR: 30 })],
      currencies: ['USD', 'EUR'],
      defaultCurrency: 'USD',
      granularity: 'day',
    })
    expect(multi.findAllComponents({ name: 'USelect' })).toHaveLength(1)
  })

  it('has no accessibility violations', async () => {
    const wrapper = await mountChart({
      buckets: WITH_REVENUE, currencies: ['USD'], defaultCurrency: 'USD', granularity: 'day',
    })
    expect(await axe(wrapper.element as HTMLElement, AXE_OPTIONS)).toHaveNoViolations()
  })
})
