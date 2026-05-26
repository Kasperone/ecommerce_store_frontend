import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * PayU checkout mutation. Asserts the start-checkout call hits the right
 * endpoint with POST and surfaces the redirect_uri the buyer is sent to.
 */

const apiFetch = vi.fn()

vi.mock('~/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function runInComponent(setupFn: () => unknown) {
  let captured: unknown
  const harness = defineComponent({
    setup() {
      captured = setupFn()
      return () => h('div')
    },
  })
  const pinia = createPinia()
  setActivePinia(pinia)
  mount(harness, {
    global: {
      plugins: [pinia, PiniaColada],
    },
  })
  await nextTick()
  return captured
}

describe('useStartPayuCheckout', () => {
  it('POSTs /api/v1/payments/payu/orders/{id} and returns the redirect_uri', async () => {
    apiFetch.mockResolvedValue({ redirect_uri: 'https://secure.snd.payu.com/pay/abc' })
    const { useStartPayuCheckout } = await import('./usePaymentQueries')

    const result = await runInComponent(() => useStartPayuCheckout()) as {
      mutateAsync: (id: number) => Promise<{ redirect_uri: string }>
    }
    const res = await result.mutateAsync(42)

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/payments/payu/orders/42')
    expect(options.method).toBe('POST')
    expect(res.redirect_uri).toBe('https://secure.snd.payu.com/pay/abc')
  })
})

describe('useStartStripeCheckout', () => {
  it('POSTs /api/v1/payments/stripe/checkout/{id} and returns the checkout_url', async () => {
    apiFetch.mockResolvedValue({ checkout_url: 'https://checkout.stripe.com/c/pay/cs_1' })
    const { useStartStripeCheckout } = await import('./usePaymentQueries')

    const result = await runInComponent(() => useStartStripeCheckout()) as {
      mutateAsync: (id: number) => Promise<{ checkout_url: string }>
    }
    const res = await result.mutateAsync(42)

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/payments/stripe/checkout/42')
    expect(options.method).toBe('POST')
    expect(res.checkout_url).toBe('https://checkout.stripe.com/c/pay/cs_1')
  })
})

describe('useStripeConfig', () => {
  it('GETs /api/v1/payments/stripe/config', async () => {
    apiFetch.mockResolvedValue({ configured: true, publishable_key: 'pk_test_x' })
    const { useStripeConfig } = await import('./usePaymentQueries')

    const result = await runInComponent(() => useStripeConfig()) as {
      refetch: () => Promise<unknown>
    }
    await result.refetch()

    // GET — no options object (default method).
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/payments/stripe/config')
  })
})

describe('useCreateStripePaymentIntent', () => {
  it('POSTs /api/v1/payments/stripe/payment-intent/{id} and returns the client_secret', async () => {
    apiFetch.mockResolvedValue({ client_secret: 'pi_1_secret_abc' })
    const { useCreateStripePaymentIntent } = await import('./usePaymentQueries')

    const result = await runInComponent(() => useCreateStripePaymentIntent()) as {
      mutateAsync: (id: number) => Promise<{ client_secret: string }>
    }
    const res = await result.mutateAsync(42)

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/payments/stripe/payment-intent/42')
    expect(options.method).toBe('POST')
    expect(res.client_secret).toBe('pi_1_secret_abc')
  })
})
