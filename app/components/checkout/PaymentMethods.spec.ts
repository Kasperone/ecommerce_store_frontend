// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import { axe } from 'vitest-axe'
import PaymentMethods from './PaymentMethods.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

const { payuMutate, stripeMutate, mockNavigate, payuLoading, stripeLoading } = vi.hoisted(() => ({
  payuMutate: vi.fn(),
  stripeMutate: vi.fn(),
  mockNavigate: vi.fn(),
  payuLoading: { value: false },
  stripeLoading: { value: false },
}))

mockNuxtImport('useStartPayuCheckout', () => () => ({
  mutateAsync: payuMutate,
  isLoading: payuLoading,
}))
mockNuxtImport('useStartStripeCheckout', () => () => ({
  mutateAsync: stripeMutate,
  isLoading: stripeLoading,
}))
mockNuxtImport('navigateTo', () => mockNavigate)

// The wallet child (<CheckoutWalletButton>) is out of scope here — stub its data
// sources so it stays hidden (Stripe unconfigured) and never fires a real query.
// Its own behaviour is covered in WalletButton.spec.ts.
mockNuxtImport('useStripeConfig', () => () => ({
  data: ref({ configured: false, publishable_key: '' }),
}))
mockNuxtImport('useCreateStripePaymentIntent', () => () => ({ mutateAsync: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  payuLoading.value = false
  stripeLoading.value = false
})

async function flush(wrapper: { vm: { $nextTick: () => Promise<void> } }) {
  await new Promise(r => setTimeout(r, 0))
  await wrapper.vm.$nextTick()
}

describe('CheckoutPaymentMethods', () => {
  it('renders both payment methods (PayU advertises BLIK/Przelewy24)', async () => {
    const wrapper = await mountSuspended(PaymentMethods, { props: { orderId: 7, amountMinor: 99800, currency: 'USD', orderNumber: 'ORD-7' } })
    expect(wrapper.text()).toContain('Pay with card')
    // The PayU button names BLIK/Przelewy24 so they aren't buried behind "PayU".
    expect(wrapper.text()).toContain('BLIK, Przelewy24 or card')
    // Accepted-method trust marks.
    expect(wrapper.text()).toContain('Przelewy24')
    expect(wrapper.text()).toContain('Mastercard')
  })

  it('starts Stripe checkout and redirects on the card button', async () => {
    stripeMutate.mockResolvedValue({ checkout_url: 'https://checkout.stripe.com/c/pay/cs_1' })
    const wrapper = await mountSuspended(PaymentMethods, { props: { orderId: 7, amountMinor: 99800, currency: 'USD', orderNumber: 'ORD-7' } })

    // Buttons: [0] = PayU/BLIK (primary, PL-first), [1] = Stripe (card).
    await wrapper.findAll('button')[1]!.trigger('click')
    await flush(wrapper)

    expect(stripeMutate).toHaveBeenCalledWith({ orderId: 7, guestToken: undefined })
    expect(payuMutate).not.toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith(
      'https://checkout.stripe.com/c/pay/cs_1',
      { external: true },
    )
  })

  it('starts PayU checkout and redirects on the PayU button', async () => {
    payuMutate.mockResolvedValue({ redirect_uri: 'https://secure.snd.payu.com/pay/abc' })
    const wrapper = await mountSuspended(PaymentMethods, { props: { orderId: 7, amountMinor: 99800, currency: 'USD', orderNumber: 'ORD-7' } })

    await wrapper.findAll('button')[0]!.trigger('click')
    await flush(wrapper)

    expect(payuMutate).toHaveBeenCalledWith({ orderId: 7, guestToken: undefined })
    expect(mockNavigate).toHaveBeenCalledWith(
      'https://secure.snd.payu.com/pay/abc',
      { external: true },
    )
  })

  it('threads the guest token into both checkout-start calls (guest checkout)', async () => {
    stripeMutate.mockResolvedValue({ checkout_url: 'https://checkout.stripe.com/c/pay/cs_2' })
    payuMutate.mockResolvedValue({ redirect_uri: 'https://secure.snd.payu.com/pay/def' })
    const wrapper = await mountSuspended(PaymentMethods, {
      props: {
        orderId: 9,
        amountMinor: 5000,
        currency: 'PLN',
        orderNumber: 'ORD-9',
        guestToken: 'tok-guest-abc',
      },
    })

    // [0] = PayU/BLIK, [1] = Stripe (card).
    await wrapper.findAll('button')[0]!.trigger('click')
    await flush(wrapper)
    expect(payuMutate).toHaveBeenCalledWith({ orderId: 9, guestToken: 'tok-guest-abc' })

    await wrapper.findAll('button')[1]!.trigger('click')
    await flush(wrapper)
    expect(stripeMutate).toHaveBeenCalledWith({ orderId: 9, guestToken: 'tok-guest-abc' })
  })

  it('shows an inline error and does not redirect when a provider fails', async () => {
    stripeMutate.mockRejectedValue({ data: { detail: 'Stripe not configured' } })
    const wrapper = await mountSuspended(PaymentMethods, { props: { orderId: 7, amountMinor: 99800, currency: 'USD', orderNumber: 'ORD-7' } })

    // [1] = Stripe (card) button.
    await wrapper.findAll('button')[1]!.trigger('click')
    await flush(wrapper)

    expect(mockNavigate).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Stripe not configured')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(PaymentMethods, { props: { orderId: 7, amountMinor: 99800, currency: 'USD', orderNumber: 'ORD-7' } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
