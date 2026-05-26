// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import StatusBadge from './StatusBadge.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

describe('OrdersStatusBadge', () => {
  it('renders the localized status label', async () => {
    const wrapper = await mountSuspended(StatusBadge, { props: { status: 'pending' } })
    expect(wrapper.text()).toContain('Pending')
  })

  it('renders a different status', async () => {
    const wrapper = await mountSuspended(StatusBadge, { props: { status: 'delivered' } })
    expect(wrapper.text()).toContain('Delivered')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(StatusBadge, { props: { status: 'paid' } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
