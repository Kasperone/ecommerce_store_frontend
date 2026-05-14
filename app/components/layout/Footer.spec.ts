// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import Footer from './Footer.vue'

const { mockToastAdd } = vi.hoisted(() => ({
  mockToastAdd: vi.fn(),
}))

mockNuxtImport('useToast', () => () => ({ add: mockToastAdd }))

describe('LayoutFooter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the current year in the copyright line', async () => {
    const wrapper = await mountSuspended(Footer)
    expect(wrapper.text()).toContain(String(new Date().getFullYear()))
  })

  it('renders links to all existing public routes', async () => {
    const wrapper = await mountSuspended(Footer)
    const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'))
    expect(hrefs).toContain('/terms-of-service')
    expect(hrefs).toContain('/privacy-policy')
    expect(hrefs).toContain('/login')
    expect(hrefs).toContain('/sign-up')
    expect(hrefs).toContain('/account')
    expect(hrefs).toContain('/contact')
    expect(hrefs).toContain('/shipping-returns')
    expect(hrefs).toContain('/about')
  })

  it('shows an inline error for an invalid newsletter email', async () => {
    const wrapper = await mountSuspended(Footer)
    await wrapper.find('input[type="email"]').setValue('not-an-email')
    await wrapper.find('form').trigger('submit')
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    expect(wrapper.text().toLowerCase()).toMatch(/valid email/)
    expect(mockToastAdd).not.toHaveBeenCalled()
  })

  it('clears the input and toasts on a valid newsletter submit', async () => {
    const wrapper = await mountSuspended(Footer)
    const input = wrapper.find('input[type="email"]')
    await input.setValue('user@example.com')
    await wrapper.find('form').trigger('submit')
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    expect(mockToastAdd).toHaveBeenCalledTimes(1)
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('renders all four social icons with accessible labels', async () => {
    const wrapper = await mountSuspended(Footer)
    expect(wrapper.find('[aria-label="Instagram"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Facebook"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="TikTok"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="YouTube"]').exists()).toBe(true)
  })
})
