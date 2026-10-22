import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { ProductResponse } from '#shared/types/api'

/**
 * Colada-backed query for the PDP related-products rail. Specs assert on the
 * URL + limit pushed at `apiFetch` and that the cards resolve through.
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

const CARD = (over: Partial<ProductResponse> = {}): ProductResponse =>
  ({
    id: 7,
    slug: 'blue-mug',
    name: 'Blue Mug',
    ...over,
  } as ProductResponse)

describe('useRelatedProductsQuery', () => {
  it('fetches /api/v1/products/{slug}/related with the default limit', async () => {
    apiFetch.mockResolvedValue([CARD()])
    const { useRelatedProductsQuery } = await import('./useRelatedProductsQuery')

    const query = await runInComponent(() =>
      useRelatedProductsQuery('blue-mug'),
    ) as { data: { value: ProductResponse[] | undefined } }
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/products/blue-mug/related')
    expect(options.query).toEqual({ limit: 8 })
    expect(query.data.value).toHaveLength(1)
  })

  it('passes a custom limit and url-encodes the slug', async () => {
    apiFetch.mockResolvedValue([])
    const { useRelatedProductsQuery } = await import('./useRelatedProductsQuery')

    await runInComponent(() => useRelatedProductsQuery('a/b mug', 4))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/products/a%2Fb%20mug/related')
    expect(options.query).toEqual({ limit: 4 })
  })

  it('does not fetch when the slug is empty', async () => {
    const { useRelatedProductsQuery } = await import('./useRelatedProductsQuery')

    await runInComponent(() => useRelatedProductsQuery(''))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).not.toHaveBeenCalled()
  })
})
