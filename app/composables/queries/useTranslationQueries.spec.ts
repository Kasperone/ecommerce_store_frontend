import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Pinia Colada query/mutation layer for the admin Translations workspace.
 * Specs assert on the URLs + verbs + query/body pushed at `apiFetch`,
 * mirroring `useShippingQueries.spec.ts`.
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

describe('useTranslationResourceTypesQuery', () => {
  it('fetches the resource-types summary with the locale', async () => {
    apiFetch.mockResolvedValue({ locale: 'pl', types: [] })
    const { useTranslationResourceTypesQuery } = await import('./useTranslationQueries')

    await runInComponent(() => useTranslationResourceTypesQuery('pl'))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/translations/resource-types')
    expect(options.query).toEqual({ locale: 'pl' })
  })
})

describe('useTranslationListQuery', () => {
  it('fetches a type list with locale/status/paging defaults', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useTranslationListQuery } = await import('./useTranslationQueries')

    await runInComponent(() => useTranslationListQuery('shipping_method', {}))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/translations/shipping_method')
    expect(options.query).toEqual({
      locale: 'pl',
      status: 'all',
      q: undefined,
      page: 1,
      page_size: 50,
    })
  })

  it('passes status, search and locale through', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useTranslationListQuery } = await import('./useTranslationQueries')

    await runInComponent(() =>
      useTranslationListQuery('product', { locale: 'pl', status: 'missing', q: 'phone' }),
    )
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/translations/product')
    expect(options.query).toMatchObject({ status: 'missing', q: 'phone' })
  })

  it('does not fetch when the resource type is null', async () => {
    const { useTranslationListQuery } = await import('./useTranslationQueries')
    await runInComponent(() => useTranslationListQuery(null, {}))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    expect(apiFetch).not.toHaveBeenCalled()
  })
})

describe('useUpdateTranslation', () => {
  it('PUTs the fields body to /{type}/{id} with the locale query', async () => {
    apiFetch.mockResolvedValue({ id: 3, complete: true })
    const { useUpdateTranslation } = await import('./useTranslationQueries')

    const mutation: any = await runInComponent(() => useUpdateTranslation())
    await mutation.mutateAsync({
      resourceType: 'shipping_method',
      id: 3,
      locale: 'pl',
      fields: { name: 'Paczkomat', description: null },
    })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/translations/shipping_method/3')
    expect(options.method).toBe('PUT')
    expect(options.query).toEqual({ locale: 'pl' })
    expect(options.body).toEqual({ fields: { name: 'Paczkomat', description: null } })
  })
})
