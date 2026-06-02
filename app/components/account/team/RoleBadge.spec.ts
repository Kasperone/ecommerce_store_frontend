// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import RoleBadge from './RoleBadge.vue'

/**
 * Role pill. Renders the localized role label (English copy in the Nuxt-env
 * default locale) for each B2B role.
 */
describe('AccountTeamRoleBadge', () => {
  it('renders the admin role label', async () => {
    const wrapper = await mountSuspended(RoleBadge, { props: { role: 'COMPANY_ADMIN' } })
    expect(wrapper.text()).toContain('Admin')
  })

  it('renders the buyer role label', async () => {
    const wrapper = await mountSuspended(RoleBadge, { props: { role: 'BUYER' } })
    expect(wrapper.text()).toContain('Buyer')
  })

  it('renders the viewer role label', async () => {
    const wrapper = await mountSuspended(RoleBadge, { props: { role: 'VIEWER' } })
    expect(wrapper.text()).toContain('Viewer')
  })
})
