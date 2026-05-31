// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import type { CategoryRevenueRow } from '~/composables/queries/useReportQueries'
import ReportByCategory from './ReportByCategory.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

const ROWS: CategoryRevenueRow[] = [
  { category_id: 3, name: 'Phones', units: 5, revenue_by_currency: { USD: 500, EUR: 100 } },
  { category_id: null, name: 'Uncategorized', units: 2, revenue_by_currency: { USD: 40 } },
]

describe('ReportByCategory', () => {
  it('renders rows in order with units and per-currency revenue', async () => {
    const wrapper = await mountSuspended(ReportByCategory, { props: { rows: ROWS } })
    const text = wrapper.text()
    expect(text).toContain('Phones')
    expect(text).toContain('5 sold')
    expect(text).toContain('500.00')
    expect(text).toContain('100.00')
  })

  it('renders the null-category bucket via the Uncategorized locale key', async () => {
    const wrapper = await mountSuspended(ReportByCategory, { props: { rows: ROWS } })
    expect(wrapper.text()).toContain('Uncategorized')
  })

  it('shows the empty state when there are no sales', async () => {
    const wrapper = await mountSuspended(ReportByCategory, { props: { rows: [] } })
    expect(wrapper.text()).toContain('No sales in this date range')
  })

  it('has no accessibility violations', async () => {
    const wrapper = await mountSuspended(ReportByCategory, { props: { rows: ROWS } })
    expect(await axe(wrapper.element as HTMLElement, AXE_OPTIONS)).toHaveNoViolations()
  })
})
