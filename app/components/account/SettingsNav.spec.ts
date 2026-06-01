// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import SettingsNav from './SettingsNav.vue'

/**
 * The settings nav exposes all five sub-routes as real anchor links with
 * accessible labels, regardless of whether each target page exists yet. This
 * is the contract B-fe / C-fe / D-fe consume.
 */
describe('AccountSettingsNav', () => {
  it('renders all five sub-route links', async () => {
    const wrapper = await mountSuspended(SettingsNav)
    const links = wrapper.findAll('a')
    const hrefs = links.map(l => l.attributes('href'))
    expect(hrefs).toContain('/account/settings/profile')
    expect(hrefs).toContain('/account/settings/security')
    expect(hrefs).toContain('/account/settings/addresses')
    expect(hrefs).toContain('/account/settings/preferences')
    expect(hrefs).toContain('/account/settings/privacy')
  })

  it('renders exactly five nav links', async () => {
    const wrapper = await mountSuspended(SettingsNav)
    expect(wrapper.findAll('a').length).toBe(5)
  })

  it('labels each link with its localized section name', async () => {
    const wrapper = await mountSuspended(SettingsNav)
    const text = wrapper.text()
    expect(text).toContain('Profile')
    expect(text).toContain('Security')
    expect(text).toContain('Addresses')
    expect(text).toContain('Preferences')
    expect(text).toContain('Privacy')
  })

  it('exposes an accessible nav landmark', async () => {
    const wrapper = await mountSuspended(SettingsNav)
    const nav = wrapper.find('nav')
    expect(nav.exists()).toBe(true)
    expect(nav.attributes('aria-label')).toBeTruthy()
  })
})
