import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada-backed query/mutation layer for the admin tax vocabulary. Specs assert
 * on the URLs and verbs pushed at `apiFetch`; Colada's own caching is upstream.
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

describe('useTaxCategoriesQuery', () => {
  it('fetches /api/v1/admin/tax/categories', async () => {
    apiFetch.mockResolvedValue([])
    const { useTaxCategoriesQuery } = await import('./useTaxQueries')

    await runInComponent(() => useTaxCategoriesQuery())
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).toHaveBeenCalled()
    const [url] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/tax/categories')
  })
})

describe('useCreateTaxCategory', () => {
  it('POSTs to /api/v1/admin/tax/categories with the body', async () => {
    apiFetch.mockResolvedValue({ id: 1 })
    const { useCreateTaxCategory } = await import('./useTaxQueries')

    const result = await runInComponent(() => useCreateTaxCategory()) as any
    await result.mutateAsync({ code: 'BOOKS', name: 'Books', name_pl: null, is_default: false })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/tax/categories')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ code: 'BOOKS', name: 'Books' })
  })
})

describe('useUpdateTaxCategory', () => {
  it('PATCHes /api/v1/admin/tax/categories/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 3 })
    const { useUpdateTaxCategory } = await import('./useTaxQueries')

    const result = await runInComponent(() => useUpdateTaxCategory()) as any
    await result.mutateAsync({ id: 3, patch: { name: 'Renamed' } })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/tax/categories/3')
    expect(options.method).toBe('PATCH')
    expect(options.body).toMatchObject({ name: 'Renamed' })
  })
})

describe('useDeleteTaxCategory', () => {
  it('DELETEs /api/v1/admin/tax/categories/{id}', async () => {
    apiFetch.mockResolvedValue(undefined)
    const { useDeleteTaxCategory } = await import('./useTaxQueries')

    const result = await runInComponent(() => useDeleteTaxCategory()) as any
    await result.mutateAsync(9)

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/tax/categories/9')
    expect(options.method).toBe('DELETE')
  })
})

describe('useCreateTaxRate', () => {
  it('POSTs to /api/v1/admin/tax/categories/{id}/rates', async () => {
    apiFetch.mockResolvedValue({ id: 1 })
    const { useCreateTaxRate } = await import('./useTaxQueries')

    const result = await runInComponent(() => useCreateTaxRate()) as any
    await result.mutateAsync({
      categoryId: 4,
      input: { country_code: 'DE', rate_pct: 19, valid_from: '2020-01-01', valid_to: null },
    })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/tax/categories/4/rates')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ country_code: 'DE', rate_pct: 19 })
  })
})

describe('useUpdateTaxRate', () => {
  it('PATCHes /api/v1/admin/tax/rates/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 5 })
    const { useUpdateTaxRate } = await import('./useTaxQueries')

    const result = await runInComponent(() => useUpdateTaxRate()) as any
    await result.mutateAsync({ id: 5, patch: { valid_to: '2025-01-01' } })

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/tax/rates/5')
    expect(options.method).toBe('PATCH')
    expect(options.body).toMatchObject({ valid_to: '2025-01-01' })
  })
})

describe('useDeleteTaxRate', () => {
  it('DELETEs /api/v1/admin/tax/rates/{id}', async () => {
    apiFetch.mockResolvedValue(undefined)
    const { useDeleteTaxRate } = await import('./useTaxQueries')

    const result = await runInComponent(() => useDeleteTaxRate()) as any
    await result.mutateAsync(11)

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/tax/rates/11')
    expect(options.method).toBe('DELETE')
  })
})
