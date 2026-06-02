// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MemberStatusBadge from './MemberStatusBadge.vue'

/**
 * Membership status pill. Renders the localized status label (English copy in
 * the Nuxt-env default locale).
 */
describe('AccountTeamMemberStatusBadge', () => {
  it('renders the active status', async () => {
    const wrapper = await mountSuspended(MemberStatusBadge, { props: { status: 'active' } })
    expect(wrapper.text()).toContain('Active')
  })

  it('renders the invited status', async () => {
    const wrapper = await mountSuspended(MemberStatusBadge, { props: { status: 'invited' } })
    expect(wrapper.text()).toContain('Invited')
  })

  it('renders the suspended status', async () => {
    const wrapper = await mountSuspended(MemberStatusBadge, { props: { status: 'suspended' } })
    expect(wrapper.text()).toContain('Suspended')
  })
})
