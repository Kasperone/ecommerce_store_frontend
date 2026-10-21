// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import Nav from './Nav.vue'

/**
 * The account nav (widened from the old settings-only SettingsNav, redesign
 * Phase 1) renders the grouped IA: primary transactional entries
 * (Overview / Orders, + B2B Quotes), the labelled Account group, the B2B
 * Company group, and Privacy at the bottom — every existing /account route
 * reachable from a single persistent rail.
 *
 * The company context is mocked: it defaults to non-B2B and is flipped per-test
 * for the B2B coverage (Quotes / Company / Team).
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

function hrefsOf(wrapper: VueWrapper) {
  return wrapper.findAll('a').map(l => l.attributes('href'))
}

describe('AccountNav — grouped IA', () => {
  it('leads with the Overview and Orders primary entries', async () => {
    const wrapper = await mountSuspended(Nav)
    const hrefs = hrefsOf(wrapper)
    expect(hrefs).toContain('/account')
    expect(hrefs).toContain('/account/orders')
  })

  it('renders all account-management settings links', async () => {
    const wrapper = await mountSuspended(Nav)
    const hrefs = hrefsOf(wrapper)
    expect(hrefs).toContain('/account/profile')
    expect(hrefs).toContain('/account/security')
    expect(hrefs).toContain('/account/addresses')
    expect(hrefs).toContain('/account/wishlist')
    expect(hrefs).toContain('/account/preferences')
  })

  it('demotes Privacy to the rail (still reachable)', async () => {
    const wrapper = await mountSuspended(Nav)
    expect(hrefsOf(wrapper)).toContain('/account/privacy')
  })

  it('renders exactly eight links for a non-B2B account', async () => {
    // Overview, Orders, Profile, Addresses, Wishlist, Security, Preferences,
    // Privacy.
    const wrapper = await mountSuspended(Nav)
    expect(wrapper.findAll('a').length).toBe(8)
  })

  it('labels the core links with their localized section names', async () => {
    const wrapper = await mountSuspended(Nav)
    const text = wrapper.text()
    expect(text).toContain('Overview')
    expect(text).toContain('Orders')
    expect(text).toContain('Profile')
    expect(text).toContain('Security')
    expect(text).toContain('Addresses')
    expect(text).toContain('Preferences')
    expect(text).toContain('Privacy')
  })

  it('renders the Account group heading', async () => {
    const wrapper = await mountSuspended(Nav)
    expect(wrapper.text()).toContain('Account')
  })

  it('exposes an accessible nav landmark', async () => {
    const wrapper = await mountSuspended(Nav)
    const nav = wrapper.find('nav')
    expect(nav.exists()).toBe(true)
    expect(nav.attributes('aria-label')).toBeTruthy()
  })
})

describe('AccountNav — B2B gating', () => {
  it('hides Quotes and the company entry for non-members', async () => {
    const wrapper = await mountSuspended(Nav)
    const hrefs = hrefsOf(wrapper)
    expect(hrefs).not.toContain('/account/quotes')
    expect(hrefs).not.toContain('/account/company')
  })

  it('reveals Quotes and Company for company members', async () => {
    isB2B.value = true
    const wrapper = await mountSuspended(Nav)
    const hrefs = hrefsOf(wrapper)
    expect(hrefs).toContain('/account/quotes')
    expect(hrefs).toContain('/account/company')
  })

  it('shows the Team link for a COMPANY_ADMIN business account', async () => {
    isB2B.value = true
    companyRef.value = { role: 'COMPANY_ADMIN' }
    const wrapper = await mountSuspended(Nav)
    const hrefs = hrefsOf(wrapper)
    expect(hrefs).toContain('/account/team')
    expect(wrapper.text()).toContain('Team')
  })

  it('hides the Team link for a non-admin business account', async () => {
    isB2B.value = true
    companyRef.value = { role: 'BUYER' }
    const wrapper = await mountSuspended(Nav)
    expect(hrefsOf(wrapper)).not.toContain('/account/team')
  })

  it('hides the Team link for a non-business account', async () => {
    isB2B.value = false
    companyRef.value = null
    const wrapper = await mountSuspended(Nav)
    expect(hrefsOf(wrapper)).not.toContain('/account/team')
  })
})
