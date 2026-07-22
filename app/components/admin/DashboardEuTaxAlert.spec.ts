// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import type { EuTaxLiability } from '#shared/types/api'
import DashboardEuTaxAlert from './DashboardEuTaxAlert.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function liability(overrides: Partial<EuTaxLiability> = {}): EuTaxLiability {
  return { status: 'not_approaching', pct: 0, year: 2026, liable: false, ...overrides }
}

describe('DashboardEuTaxAlert', () => {
  it('renders nothing below the warn band', async () => {
    const wrapper = await mountSuspended(DashboardEuTaxAlert, {
      props: { liability: liability() },
    })
    expect(wrapper.find('[data-testid="dashboard-eu-tax-alert"]').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
  })

  it('renders an approaching nudge (warning) when nearing the threshold', async () => {
    const wrapper = await mountSuspended(DashboardEuTaxAlert, {
      props: { liability: liability({ status: 'approaching', pct: 0.85 }) },
    })
    expect(wrapper.find('[data-testid="dashboard-eu-tax-alert"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Approaching the EU distance-selling threshold')
    expect(wrapper.text()).toContain('View report')
  })

  it('renders a reached nudge (error) once the threshold is met', async () => {
    const wrapper = await mountSuspended(DashboardEuTaxAlert, {
      props: { liability: liability({ status: 'threshold_met', pct: 1.2, liable: true }) },
    })
    expect(wrapper.find('[data-testid="dashboard-eu-tax-alert"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('EU distance-selling threshold reached')
  })

  it('links to the reports page', async () => {
    const wrapper = await mountSuspended(DashboardEuTaxAlert, {
      props: { liability: liability({ status: 'threshold_met', pct: 1.2, liable: true }) },
    })
    const link = wrapper.find('a[href*="/admin/reports"]')
    expect(link.exists()).toBe(true)
  })

  it('has no accessibility violations when shown', async () => {
    const wrapper = await mountSuspended(DashboardEuTaxAlert, {
      props: { liability: liability({ status: 'approaching', pct: 0.85 }) },
    })
    expect(await axe(wrapper.element as HTMLElement, AXE_OPTIONS)).toHaveNoViolations()
  })
})
