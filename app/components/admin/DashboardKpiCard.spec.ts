// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import DashboardKpiCard from './DashboardKpiCard.vue'

// `region` is a page-level landmark rule — N/A to an isolated card.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

describe('DashboardKpiCard', () => {
  it('renders the label, value, secondary lines, and hint', async () => {
    const wrapper = await mountSuspended(DashboardKpiCard, {
      props: {
        label: 'Revenue',
        value: '$1,497.01',
        lines: ['zł 800.00'],
        hint: '11 in the last 30 days',
        icon: 'i-lucide-banknote',
        accent: 'success',
      },
    })
    const text = wrapper.text()
    expect(text).toContain('Revenue')
    expect(text).toContain('$1,497.01')
    expect(text).toContain('zł 800.00')
    expect(text).toContain('11 in the last 30 days')
  })

  it('renders without secondary lines or hint', async () => {
    const wrapper = await mountSuspended(DashboardKpiCard, {
      props: { label: 'Orders', value: '11' },
    })
    expect(wrapper.text()).toContain('Orders')
    expect(wrapper.text()).toContain('11')
  })

  it('has no accessibility violations', async () => {
    const wrapper = await mountSuspended(DashboardKpiCard, {
      props: { label: 'Customers', value: '10', icon: 'i-lucide-users' },
    })
    expect(await axe(wrapper.element as HTMLElement, AXE_OPTIONS)).toHaveNoViolations()
  })
})
