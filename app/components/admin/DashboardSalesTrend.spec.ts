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

// Stub the Unovis-backed charts so the spec asserts on the props we hand them
// rather than on the chart's SVG internals — and so Unovis never schedules the
// animation timers that crash happy-dom on teardown. The component selects the
// chart with `<component :is>`, so both names are stubbed.
const CHART_PROPS = [
  'data', 'yAxis', 'categories', 'xFormatter', 'yFormatter', 'height',
  'curveType', 'lineWidth', 'radius', 'barPadding', 'hideLegend', 'minMaxTicksOnly',
]
const BarChartStub = defineComponent({
  name: 'BarChart',
  props: CHART_PROPS,
  template: '<div data-testid="trend-bar" />',
})
const LineChartStub = defineComponent({
  name: 'LineChart',
  props: CHART_PROPS,
  template: '<div data-testid="trend-line" />',
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
    global: { stubs: { BarChart: BarChartStub, LineChart: LineChartStub } },
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

const MULTI_CURRENCY: SalesTrendPoint[] = [
  point('2026-05-01', 1, { USD: 30, EUR: 25 }),
  point('2026-05-02', 2, { USD: 40, EUR: 10 }),
]

describe('DashboardSalesTrend', () => {
  it('defaults to a line chart keyed by the active currency, with the windowed total', async () => {
    const wrapper = await mountTrend({
      points: WITH_REVENUE,
      currencies: ['USD'],
      defaultCurrency: 'USD',
      windowDays: 3,
    })
    const chart = wrapper.findComponent(LineChartStub)
    expect(chart.exists()).toBe(true)
    expect(wrapper.findComponent(BarChartStub).exists()).toBe(false)
    expect(chart.props('data')).toHaveLength(3)
    // Series are keyed by currency now (not a generic "revenue").
    expect(Object.keys(chart.props('categories'))).toEqual(['USD'])
    // Line mode keeps the real 0 so the series stays continuous.
    const rows = chart.props('data') as Array<Record<string, unknown>>
    expect(rows[0]!.USD).toBe(0) // 2026-05-01 had no revenue
    // Summary sums 40 + 20 = 60 in the selected currency.
    expect(wrapper.text()).toContain('60.00')
  })

  it('switches to a bar chart (zero days → null, no baseline nub) on the bar toggle', async () => {
    const wrapper = await mountTrend({
      points: WITH_REVENUE,
      currencies: ['USD'],
      defaultCurrency: 'USD',
      windowDays: 3,
    })
    await wrapper.get('[aria-label="Bar chart"]').trigger('click')
    const chart = wrapper.findComponent(BarChartStub)
    expect(chart.exists()).toBe(true)
    expect(wrapper.findComponent(LineChartStub).exists()).toBe(false)
    expect(chart.props('yAxis')).toEqual(['USD'])
    const rows = chart.props('data') as Array<Record<string, unknown>>
    expect(rows[0]!.USD).toBeNull() // zero day → null → no bar
    expect(rows[1]!.USD).toBe(40)
  })

  it('plots only the default currency until more are selected, then overlays a series each', async () => {
    const wrapper = await mountTrend({
      points: MULTI_CURRENCY,
      currencies: ['USD', 'EUR'],
      defaultCurrency: 'USD',
      windowDays: 2,
    })
    // Default selection is the store default only: single series, legend hidden.
    let chart = wrapper.findComponent(LineChartStub)
    expect(Object.keys(chart.props('categories'))).toEqual(['USD'])
    expect(chart.props('hideLegend')).toBe(true)

    // Select both currencies through the multiselect's v-model.
    const select = wrapper.findComponent({ name: 'USelectMenu' })
    expect(select.exists()).toBe(true)
    select.vm.$emit('update:modelValue', ['USD', 'EUR'])
    await wrapper.vm.$nextTick()

    chart = wrapper.findComponent(LineChartStub)
    expect(Object.keys(chart.props('categories'))).toEqual(['USD', 'EUR'])
    // Multiple series → legend shown.
    expect(chart.props('hideLegend')).toBe(false)
  })

  it('shows the empty note and renders no chart when there is no revenue', async () => {
    const wrapper = await mountTrend({
      points: [point('2026-05-01', 3, {}), point('2026-05-02', 0, {})],
      currencies: [],
      defaultCurrency: 'USD',
      windowDays: 7,
    })
    expect(wrapper.findComponent(BarChartStub).exists()).toBe(false)
    expect(wrapper.findComponent(LineChartStub).exists()).toBe(false)
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
