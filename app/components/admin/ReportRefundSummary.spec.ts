// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import type { RefundSummaryRow } from '~/composables/queries/useReportQueries'
import ReportRefundSummary from './ReportRefundSummary.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

const ROWS: RefundSummaryRow[] = [
  { currency: 'USD', refunded: 50, refund_count: 2, revenue: 500, rate: 0.1 },
  { currency: 'EUR', refunded: 10, refund_count: 1, revenue: 200, rate: 0.05 },
]

describe('ReportRefundSummary', () => {
  it('renders one row per currency with refunded, revenue and rate', async () => {
    const wrapper = await mountSuspended(ReportRefundSummary, {
      props: { refundCount: 3, rows: ROWS },
    })
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    const text = wrapper.text()
    expect(text).toContain('USD')
    expect(text).toContain('EUR')
    // Rate is rendered as a percentage (0.1 -> 10.0%, 0.05 -> 5.0%).
    expect(text).toContain('10.0%')
    expect(text).toContain('5.0%')
  })

  it('shows the total refund count badge', async () => {
    const wrapper = await mountSuspended(ReportRefundSummary, {
      props: { refundCount: 3, rows: ROWS },
    })
    expect(wrapper.text()).toContain('3 refunds')
  })

  it('shows the empty state when there are no refunds', async () => {
    const wrapper = await mountSuspended(ReportRefundSummary, {
      props: { refundCount: 0, rows: [] },
    })
    expect(wrapper.find('tbody').exists()).toBe(false)
    expect(wrapper.text()).toContain('No refunds in this date range')
  })

  it('has no accessibility violations', async () => {
    const wrapper = await mountSuspended(ReportRefundSummary, {
      props: { refundCount: 3, rows: ROWS },
    })
    expect(await axe(wrapper.element as HTMLElement, AXE_OPTIONS)).toHaveNoViolations()
  })
})
