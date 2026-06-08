// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { axe } from 'vitest-axe'
import WalletButton from './WalletButton.vue'

/**
 * <CheckoutWalletButton> — in-page Apple Pay / Google Pay / Link via Stripe's
 * Express Checkout Element. Stripe.js (`loadStripe`) and the element are mocked;
 * the wallet button itself can't render in a headless env, so we assert the
 * orchestration: graceful-hide when unconfigured, element mount when configured,
 * and the confirm flow (submit → create PaymentIntent → confirmPayment).
 */

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

const {
  configState,
  createPiMutate,
  loadStripeMock,
  submitMock,
  confirmPaymentMock,
  mountMock,
  elementsMock,
  onHandlers,
} = vi.hoisted(() => {
  const onHandlers = new Map<string, (...args: unknown[]) => unknown>()
  const submitMock = vi.fn(async () => ({ error: undefined as { message?: string } | undefined }))
  const confirmPaymentMock = vi.fn(
    async () => ({ error: undefined as { message?: string } | undefined }),
  )
  const mountMock = vi.fn()
  const expressEl = {
    on: vi.fn((evt: string, cb: (...args: unknown[]) => unknown) => {
      onHandlers.set(evt, cb)
    }),
    mount: mountMock,
    unmount: vi.fn(),
  }
  const elementsMock = vi.fn(() => ({ create: vi.fn(() => expressEl), submit: submitMock }))
  const stripe = { elements: elementsMock, confirmPayment: confirmPaymentMock }
  return {
    configState: { configured: true, publishable_key: 'pk_test_x' },
    createPiMutate: vi.fn(async () => ({ client_secret: 'pi_1_secret_abc' })),
    loadStripeMock: vi.fn(async () => stripe),
    submitMock,
    confirmPaymentMock,
    mountMock,
    elementsMock,
    onHandlers,
  }
})

vi.mock('@stripe/stripe-js/pure', () => ({ loadStripe: loadStripeMock }))

// `useStripeConfig` returns a real ref so the component's `watch(config, …)` is
// a valid source; the value is read from `configState` at call time.
mockNuxtImport('useStripeConfig', () => () => ({ data: ref({ ...configState }) }))
mockNuxtImport('useCreateStripePaymentIntent', () => () => ({ mutateAsync: createPiMutate }))

const PROPS = { orderId: 7, amountMinor: 99800, currency: 'USD', orderNumber: 'ORD-7' }

async function settle() {
  await flushPromises()
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  configState.configured = true
  configState.publishable_key = 'pk_test_x'
  onHandlers.clear()
})

describe('CheckoutWalletButton', () => {
  it('does not load Stripe when unconfigured', async () => {
    configState.configured = false
    configState.publishable_key = ''

    await mountSuspended(WalletButton, { props: PROPS })
    await settle()

    expect(loadStripeMock).not.toHaveBeenCalled()
    expect(mountMock).not.toHaveBeenCalled()
  })

  it('loads Stripe and mounts the Express Checkout Element when configured', async () => {
    await mountSuspended(WalletButton, { props: PROPS })
    await settle()

    expect(loadStripeMock).toHaveBeenCalledWith('pk_test_x')
    // amount/currency drive the element; currency is lowercased for Stripe.
    expect(elementsMock).toHaveBeenCalledWith({ mode: 'payment', amount: 99800, currency: 'usd' })
    expect(mountMock).toHaveBeenCalledTimes(1)
  })

  it('on confirm: submits, creates a PaymentIntent, and confirms with a return_url', async () => {
    await mountSuspended(WalletButton, { props: PROPS })
    await settle()

    await onHandlers.get('confirm')?.()
    await settle()

    expect(submitMock).toHaveBeenCalled()
    expect(createPiMutate).toHaveBeenCalledWith({ orderId: 7, guestToken: undefined })
    expect(confirmPaymentMock).toHaveBeenCalledTimes(1)
    const arg = confirmPaymentMock.mock.calls[0]![0] as {
      clientSecret: string
      confirmParams: { return_url: string }
    }
    expect(arg.clientSecret).toBe('pi_1_secret_abc')
    expect(arg.confirmParams.return_url).toContain('/checkout/payment/return')
    expect(arg.confirmParams.return_url).toContain('order=ORD-7')
    // Authed order — no token rides the return_url.
    expect(arg.confirmParams.return_url).not.toContain('token=')
  })

  it('threads the guest token into the PaymentIntent call and the return_url', async () => {
    await mountSuspended(WalletButton, {
      props: { ...PROPS, guestToken: 'tok-guest-abc' },
    })
    await settle()

    await onHandlers.get('confirm')?.()
    await settle()

    expect(createPiMutate).toHaveBeenCalledWith({ orderId: 7, guestToken: 'tok-guest-abc' })
    const arg = confirmPaymentMock.mock.calls[0]![0] as {
      confirmParams: { return_url: string }
    }
    expect(arg.confirmParams.return_url).toContain('token=tok-guest-abc')
  })

  it('does not create a PaymentIntent when element validation fails', async () => {
    submitMock.mockResolvedValueOnce({ error: { message: 'Incomplete card' } })
    const wrapper = await mountSuspended(WalletButton, { props: PROPS })
    await settle()

    await onHandlers.get('confirm')?.()
    await settle()

    expect(createPiMutate).not.toHaveBeenCalled()
    expect(confirmPaymentMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Incomplete card')
  })

  it('shows an inline error when confirmation fails', async () => {
    confirmPaymentMock.mockResolvedValueOnce({ error: { message: 'Card declined' } })
    const wrapper = await mountSuspended(WalletButton, { props: PROPS })
    await settle()

    await onHandlers.get('confirm')?.()
    await settle()

    expect(wrapper.text()).toContain('Card declined')
  })

  it('shows the "or pay another way" divider once a wallet is available', async () => {
    const wrapper = await mountSuspended(WalletButton, { props: PROPS })
    await settle()

    onHandlers.get('ready')?.({ availablePaymentMethods: { applePay: true } })
    await settle()

    expect(wrapper.text()).toContain('Or pay another way')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(WalletButton, { props: PROPS })
    await settle()

    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
