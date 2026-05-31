// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import type { SalesBucket } from '~/composables/queries/useReportQueries'
import ReportSalesChart from './ReportSalesChart.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function bucket(b: string, orders: number, revenue: Record<string, number>): SalesBucket {
  return { bucket: b, orders, revenue }
}

const WITH_REVENUE: SalesBucket[] = [
  bucket('2026-05-01', 0, {}),
  bucket('2026-05-02', 2, { USD: 40 }),
  bucket('2026-05-03', 1, { USD: 20 }),
]

describe('ReportSalesChart', () => {
  it('renders one bar per bucket and the range revenue total', async () => {
    const wrapper = await mountSuspended(ReportSalesChart, {
      props: { buckets: WITH_REVENUE, currencies: ['USD'], defaultCurrency: 'USD', granularity: 'day' },
    })
    expect(wrapper.findAll('[data-testid="report-bar"]')).toHaveLength(3)
    // Summary sums 40 + 20 = 60 in the selected currency.
    expect(wrapper.text()).toContain('60.00')
  })

  it('shows the empty note when there is no revenue in the range', async () => {
    const wrapper = await mountSuspended(ReportSalesChart, {
      props: {
        buckets: [bucket('2026-05-01', 3, {}), bucket('2026-05-02', 0, {})],
        currencies: [],
        defaultCurrency: 'USD',
        granularity: 'day',
      },
    })
    expect(wrapper.findAll('[data-testid="report-bar"]')).toHaveLength(0)
    expect(wrapper.text()).toContain('No revenue in this date range')
  })

  it('shows a currency picker only when more than one currency has revenue', async () => {
    // Nuxt UI's USelect is a button[role=combobox], so count the component, not a
    // native <select>. The `v-if="currencyItems.length > 1"` gates rendering.
    const single = await mountSuspended(ReportSalesChart, {
      props: { buckets: WITH_REVENUE, currencies: ['USD'], defaultCurrency: 'USD', granularity: 'day' },
    })
    expect(single.findAllComponents({ name: 'USelect' })).toHaveLength(0)

    const multi = await mountSuspended(ReportSalesChart, {
      props: {
        buckets: [bucket('2026-05-02', 2, { USD: 40, EUR: 30 })],
        currencies: ['USD', 'EUR'],
        defaultCurrency: 'USD',
        granularity: 'day',
      },
    })
    expect(multi.findAllComponents({ name: 'USelect' })).toHaveLength(1)
  })

  it('has no accessibility violations', async () => {
    const wrapper = await mountSuspended(ReportSalesChart, {
      props: { buckets: WITH_REVENUE, currencies: ['USD'], defaultCurrency: 'USD', granularity: 'day' },
    })
    expect(await axe(wrapper.element as HTMLElement, AXE_OPTIONS)).toHaveNoViolations()
  })
})
