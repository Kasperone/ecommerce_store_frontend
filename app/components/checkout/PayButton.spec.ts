// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import PayButton from './PayButton.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

const { mockMutateAsync, mockNavigate, isLoading } = vi.hoisted(() => ({
  mockMutateAsync: vi.fn(),
  mockNavigate: vi.fn(),
  isLoading: { value: false },
}))

mockNuxtImport('useStartPayuCheckout', () => () => ({
  mutateAsync: mockMutateAsync,
  isLoading,
}))
mockNuxtImport('navigateTo', () => mockNavigate)

beforeEach(() => {
  vi.clearAllMocks()
  isLoading.value = false
})

async function flush(wrapper: { vm: { $nextTick: () => Promise<void> } }) {
  await new Promise(r => setTimeout(r, 0))
  await wrapper.vm.$nextTick()
}

describe('CheckoutPayButton', () => {
  it('renders the pay button', async () => {
    const wrapper = await mountSuspended(PayButton, { props: { orderId: 7 } })
    expect(wrapper.text()).toContain('Pay now')
  })

  it('starts checkout and redirects to the PayU hosted page on click', async () => {
    mockMutateAsync.mockResolvedValue({ redirect_uri: 'https://secure.snd.payu.com/pay/abc' })
    const wrapper = await mountSuspended(PayButton, { props: { orderId: 7 } })

    await wrapper.find('button').trigger('click')
    await flush(wrapper)

    expect(mockMutateAsync).toHaveBeenCalledWith(7)
    expect(mockNavigate).toHaveBeenCalledWith(
      'https://secure.snd.payu.com/pay/abc',
      { external: true },
    )
  })

  it('shows an error alert and does not redirect when checkout fails', async () => {
    mockMutateAsync.mockRejectedValue({ data: { detail: 'Payments are not configured' } })
    const wrapper = await mountSuspended(PayButton, { props: { orderId: 7 } })

    await wrapper.find('button').trigger('click')
    await flush(wrapper)

    expect(mockNavigate).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Payments are not configured')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(PayButton, { props: { orderId: 7 } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
