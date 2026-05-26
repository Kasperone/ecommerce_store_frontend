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
