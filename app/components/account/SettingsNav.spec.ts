// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import SettingsNav from './SettingsNav.vue'

/**
 * The settings nav exposes all five core sub-routes as real anchor links with
 * accessible labels, regardless of whether each target page exists yet. This
 * is the contract B-fe / C-fe / D-fe consume.
 *
 * Wave D adds a B2B-gated section: `company` for any company member (Comp-fe)
 * and `team` for COMPANY_ADMIN only (Team-fe). The company context is mocked;
 * it defaults to non-B2B and is flipped per-test for the B2B coverage.
 */

const isB2B = ref(false)
const companyRef = ref<{ role: string } | null>(null)

mockNuxtImport('useCompanyContext', () => () => ({
  company: companyRef,
  isB2B,
  isResolving: ref(false),
  error: ref(null),
}))

beforeEach(() => {
  isB2B.value = false
  companyRef.value = null
})

describe('AccountSettingsNav', () => {
  it('renders all five core sub-route links', async () => {
    const wrapper = await mountSuspended(SettingsNav)
    const links = wrapper.findAll('a')
    const hrefs = links.map(l => l.attributes('href'))
    expect(hrefs).toContain('/account/settings/profile')
    expect(hrefs).toContain('/account/settings/security')
    expect(hrefs).toContain('/account/settings/addresses')
    expect(hrefs).toContain('/account/settings/preferences')
    expect(hrefs).toContain('/account/settings/privacy')
  })

  it('renders exactly five core nav links for a non-B2B account', async () => {
    const wrapper = await mountSuspended(SettingsNav)
    expect(wrapper.findAll('a').length).toBe(5)
  })

  it('hides the B2B company entry for non-members', async () => {
    const wrapper = await mountSuspended(SettingsNav)
    const hrefs = wrapper.findAll('a').map(l => l.attributes('href'))
    expect(hrefs).not.toContain('/account/settings/company')
  })

  it('reveals the B2B company entry for company members', async () => {
    isB2B.value = true
    const wrapper = await mountSuspended(SettingsNav)
    const hrefs = wrapper.findAll('a').map(l => l.attributes('href'))
    expect(hrefs).toContain('/account/settings/company')
  })

  it('labels each core link with its localized section name', async () => {
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

describe('AccountSettingsNav — B2B team entry (Team-fe)', () => {
  it('shows the Team link for a COMPANY_ADMIN business account', async () => {
    isB2B.value = true
    companyRef.value = { role: 'COMPANY_ADMIN' }
    const wrapper = await mountSuspended(SettingsNav)
    const hrefs = wrapper.findAll('a').map(l => l.attributes('href'))
    expect(hrefs).toContain('/account/settings/team')
    expect(wrapper.text()).toContain('Team')
  })

  it('hides the Team link for a non-admin business account', async () => {
    isB2B.value = true
    companyRef.value = { role: 'BUYER' }
    const wrapper = await mountSuspended(SettingsNav)
    const hrefs = wrapper.findAll('a').map(l => l.attributes('href'))
    expect(hrefs).not.toContain('/account/settings/team')
  })

  it('hides the Team link for a non-business account', async () => {
    isB2B.value = false
    companyRef.value = null
    const wrapper = await mountSuspended(SettingsNav)
    const hrefs = wrapper.findAll('a').map(l => l.attributes('href'))
    expect(hrefs).not.toContain('/account/settings/team')
  })
})
