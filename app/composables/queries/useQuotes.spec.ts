import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Customer-facing quote queries/mutations. Specs assert on the URLs and verbs
 * pushed at `apiFetch` (the network boundary) — distinct from the admin layer
 * (`/api/v1/admin/quotes`); these hit the customer router `/api/v1/quotes/`.
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
  mount(harness, { global: { plugins: [pinia, PiniaColada] } })
  await nextTick()
  return captured
}

describe('useMyQuotesQuery', () => {
  it('fetches /api/v1/quotes/ (trailing slash)', async () => {
    apiFetch.mockResolvedValue([])
    const { useMyQuotesQuery } = await import('./useQuotes')

    await runInComponent(() => useMyQuotesQuery())
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch.mock.calls[0]?.[0]).toBe('/api/v1/quotes/')
  })
})

describe('useMyQuoteQuery', () => {
  it('fetches /api/v1/quotes/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 9, items: [] })
    const { useMyQuoteQuery } = await import('./useQuotes')

    await runInComponent(() => useMyQuoteQuery(9))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch.mock.calls[0]?.[0]).toBe('/api/v1/quotes/9')
  })

  it('does not fetch when the id is undefined', async () => {
    const { useMyQuoteQuery } = await import('./useQuotes')
    await runInComponent(() => useMyQuoteQuery(undefined))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    expect(apiFetch).not.toHaveBeenCalled()
  })
})

describe('useRequestQuote', () => {
  it('POSTs /api/v1/quotes/ with the cart lines (no client price)', async () => {
    apiFetch.mockResolvedValue({ id: 1 })
    const { useRequestQuote } = await import('./useQuotes')

    const result = (await runInComponent(() => useRequestQuote())) as any
    await result.mutateAsync({
      currency: 'USD',
      items: [{ product_id: 11, quantity: 2 }],
    })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/quotes/')
    expect(options.method).toBe('POST')
    expect(options.body).toEqual({
      currency: 'USD',
      items: [{ product_id: 11, quantity: 2 }],
    })
  })
})

describe('useAcceptQuote', () => {
  it('POSTs /api/v1/quotes/{id}/accept', async () => {
    apiFetch.mockResolvedValue({ id: 4, status: 'accepted' })
    const { useAcceptQuote } = await import('./useQuotes')

    const result = (await runInComponent(() => useAcceptQuote())) as any
    await result.mutateAsync(4)

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/quotes/4/accept')
    expect(options.method).toBe('POST')
  })
})
