// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import type {
  EuDistanceSellingStatus,
  EuThresholdYear,
} from '~/composables/queries/useReportQueries'
import ReportEuThreshold from './ReportEuThreshold.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function year(overrides: Partial<EuThresholdYear> = {}): EuThresholdYear {
  return {
    year: 2026,
    total_eur: 0,
    pct: 0,
    remaining_eur: 10000,
    status: 'not_approaching',
    unconvertible_count: 0,
    ...overrides,
  }
}

function status(overrides: Partial<EuDistanceSellingStatus> = {}): EuDistanceSellingStatus {
  return {
    threshold_eur: 10000,
    current: year(),
    prior: year({ year: 2025 }),
    liable: false,
    effective_status: 'not_approaching',
    ...overrides,
  }
}

describe('ReportEuThreshold', () => {
  it('renders the current total against the threshold with a percentage', async () => {
    const wrapper = await mountSuspended(ReportEuThreshold, {
      props: {
        status: status({
          current: year({ total_eur: 2500, pct: 0.25, remaining_eur: 7500 }),
        }),
      },
    })
    const text = wrapper.text()
    expect(text).toContain('€2,500.00')
    expect(text).toContain('€10,000.00')
    expect(text).toContain('25%')
  })

  it('shows the remaining amount below the threshold', async () => {
    const wrapper = await mountSuspended(ReportEuThreshold, {
      props: {
        status: status({
          current: year({ total_eur: 2500, pct: 0.25, remaining_eur: 7500 }),
        }),
      },
    })
    expect(wrapper.text()).toContain('€7,500.00 remaining')
  })

  it('shows the reached note (not the remaining line) when the threshold is met', async () => {
    const wrapper = await mountSuspended(ReportEuThreshold, {
      props: {
        status: status({
          current: year({ total_eur: 11000, pct: 1.1, remaining_eur: 0, status: 'threshold_met' }),
          liable: true,
          effective_status: 'threshold_met',
        }),
      },
    })
    const text = wrapper.text()
    expect(text).toContain('reached the €10,000 threshold')
    expect(text).not.toContain('remaining before')
  })

  it('shows the prior-year line only when the prior year carried sales', async () => {
    const without = await mountSuspended(ReportEuThreshold, { props: { status: status() } })
    expect(without.text()).not.toContain('Preceding year')

    const withPrior = await mountSuspended(ReportEuThreshold, {
      props: {
        status: status({
          prior: year({ year: 2025, total_eur: 12000, pct: 1.2, status: 'threshold_met' }),
          liable: true,
        }),
      },
    })
    const text = withPrior.text()
    expect(text).toContain('Preceding year (2025)')
    expect(text).toContain('€12,000.00')
  })

  it('surfaces the unconvertible-orders caveat when some orders lack an EUR rate', async () => {
    const wrapper = await mountSuspended(ReportEuThreshold, {
      props: { status: status({ current: year({ unconvertible_count: 3 }) }) },
    })
    expect(wrapper.text()).toContain('3 orders excluded')
  })

  it('omits the caveat when every order converted', async () => {
    const wrapper = await mountSuspended(ReportEuThreshold, { props: { status: status() } })
    expect(wrapper.text()).not.toContain('excluded')
  })

  it('has no accessibility violations', async () => {
    const wrapper = await mountSuspended(ReportEuThreshold, {
      props: {
        status: status({ current: year({ total_eur: 8500, pct: 0.85, status: 'approaching' }) }),
      },
    })
    expect(await axe(wrapper.element as HTMLElement, AXE_OPTIONS)).toHaveNoViolations()
  })
})
