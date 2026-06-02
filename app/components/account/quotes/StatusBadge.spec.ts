// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import StatusBadge from './StatusBadge.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

describe('AccountQuotesStatusBadge', () => {
  it('renders the localized `requested` label', async () => {
    const wrapper = await mountSuspended(StatusBadge, { props: { status: 'requested' } })
    expect(wrapper.text()).toContain('Requested')
  })

  it('renders the `sent` label', async () => {
    const wrapper = await mountSuspended(StatusBadge, { props: { status: 'sent' } })
    expect(wrapper.text()).toContain('Sent')
  })

  it('renders the `accepted` label', async () => {
    const wrapper = await mountSuspended(StatusBadge, { props: { status: 'accepted' } })
    expect(wrapper.text()).toContain('Accepted')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(StatusBadge, { props: { status: 'requested' } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
