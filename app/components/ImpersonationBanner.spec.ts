// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ImpersonationBanner from './ImpersonationBanner.vue'

// `region` is a page-level landmark rule — N/A to an isolated banner.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

const { mockNavigate, stopImpersonation, storeState } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  stopImpersonation: vi.fn(),
  storeState: {
    isImpersonating: true,
    impersonating: { id: 7, email: 'shopper@example.com', first_name: 'Sam', last_name: 'Shopper' } as
    | { id: number, email: string, first_name: string, last_name: string }
    | null,
  },
}))

mockNuxtImport('navigateTo', () => mockNavigate)
mockNuxtImport('useAuthStore', () => () => ({
  get isImpersonating() {
    return storeState.isImpersonating
  },
  get impersonating() {
    return storeState.impersonating
  },
  stopImpersonation,
}))

beforeEach(() => {
  storeState.isImpersonating = true
  stopImpersonation.mockResolvedValue(true)
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('ImpersonationBanner', () => {
  it('shows the customer name, the view-only badge, and an exit control', async () => {
    const wrapper = await mountSuspended(ImpersonationBanner)
    const text = wrapper.text()
    expect(text).toContain('Sam Shopper')
    expect(text).toContain('View-only')
    expect(text).toContain('Exit')
  })

  it('renders nothing when not impersonating', async () => {
    storeState.isImpersonating = false
    const wrapper = await mountSuspended(ImpersonationBanner)
    expect(wrapper.text()).toBe('')
  })

  it('exits impersonation and returns to the customers list on click', async () => {
    const wrapper = await mountSuspended(ImpersonationBanner)
    await wrapper.find('button').trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(stopImpersonation).toHaveBeenCalledOnce()
    expect(mockNavigate).toHaveBeenCalledWith('/admin/customers')
  })

  it('has no accessibility violations', async () => {
    const wrapper = await mountSuspended(ImpersonationBanner)
    expect(await axe(wrapper.element as HTMLElement, AXE_OPTIONS)).toHaveNoViolations()
  })
})
