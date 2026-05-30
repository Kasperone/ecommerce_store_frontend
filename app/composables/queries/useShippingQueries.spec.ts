import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Pinia Colada query/mutation layer for admin shipping (zones / methods /
 * rates). Specs assert on the URLs + verbs + bodies pushed at `apiFetch`,
 * mirroring `useInventoryQueries.spec.ts`.
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

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

describe('useShippingZonesQuery', () => {
  it('fetches /api/v1/admin/shipping/zones with paging defaults', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useShippingZonesQuery } = await import('./useShippingQueries')

    await runInComponent(() => useShippingZonesQuery({}))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/shipping/zones')
    expect(options.query).toEqual({ page: 1, page_size: 50 })
  })
})

describe('useCreateShippingZone', () => {
  it('POSTs the create body to /zones', async () => {
    apiFetch.mockResolvedValue({ id: 1, name: 'PL', country_codes: ['PL'] })
    const { useCreateShippingZone } = await import('./useShippingQueries')

    const mutation: any = await runInComponent(() => useCreateShippingZone())
    await mutation.mutateAsync({
      name: 'PL',
      description: null,
      is_active: true,
      sort_order: 0,
      country_codes: ['PL'],
    })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/shipping/zones')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ name: 'PL', country_codes: ['PL'] })
  })
})

describe('useUpdateShippingZone', () => {
  it('PUTs the patch to /zones/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 7 })
    const { useUpdateShippingZone } = await import('./useShippingQueries')

    const mutation: any = await runInComponent(() => useUpdateShippingZone())
    await mutation.mutateAsync({ id: 7, patch: { name: 'Renamed', country_codes: ['DE'] } })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/shipping/zones/7')
    expect(options.method).toBe('PUT')
    expect(options.body).toMatchObject({ name: 'Renamed', country_codes: ['DE'] })
  })
})

describe('useDeleteShippingZone', () => {
  it('DELETEs /zones/{id}', async () => {
    apiFetch.mockResolvedValue(undefined)
    const { useDeleteShippingZone } = await import('./useShippingQueries')

    const mutation: any = await runInComponent(() => useDeleteShippingZone())
    await mutation.mutateAsync(7)

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/shipping/zones/7')
    expect(options.method).toBe('DELETE')
  })
})

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

describe('useShippingMethodsQuery', () => {
  it('fetches /api/v1/admin/shipping/methods', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useShippingMethodsQuery } = await import('./useShippingQueries')

    await runInComponent(() => useShippingMethodsQuery({}))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/shipping/methods')
    expect(options.query).toEqual({ page: 1, page_size: 50 })
  })
})

describe('method create/update/delete', () => {
  it('POST/PUT/DELETE the right URLs', async () => {
    apiFetch.mockResolvedValue({ id: 1 })
    const queries = await import('./useShippingQueries')

    const create: any = await runInComponent(() => queries.useCreateShippingMethod())
    const update: any = await runInComponent(() => queries.useUpdateShippingMethod())
    const remove: any = await runInComponent(() => queries.useDeleteShippingMethod())

    await create.mutateAsync({ name: 'Standard' })
    await update.mutateAsync({ id: 4, patch: { name: 'New name' } })
    await remove.mutateAsync(4)

    expect(apiFetch.mock.calls[0]).toMatchObject([
      '/api/v1/admin/shipping/methods',
      { method: 'POST' },
    ])
    expect(apiFetch.mock.calls[1]).toMatchObject([
      '/api/v1/admin/shipping/methods/4',
      { method: 'PUT' },
    ])
    expect(apiFetch.mock.calls[2]).toMatchObject([
      '/api/v1/admin/shipping/methods/4',
      { method: 'DELETE' },
    ])
  })
})

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

describe('useShippingRatesQuery', () => {
  it('passes zone/method/currency filters through', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useShippingRatesQuery } = await import('./useShippingQueries')

    await runInComponent(() =>
      useShippingRatesQuery({ zoneId: 2, methodId: 3, currency: 'EUR' }),
    )
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/shipping/rates')
    expect(options.query).toMatchObject({
      zone_id: 2,
      method_id: 3,
      currency: 'EUR',
    })
  })

  it('omits the filters when unset', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useShippingRatesQuery } = await import('./useShippingQueries')

    await runInComponent(() => useShippingRatesQuery({}))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.query.zone_id).toBeUndefined()
    expect(options.query.method_id).toBeUndefined()
    expect(options.query.currency).toBeUndefined()
  })
})

describe('rate create/update/delete', () => {
  it('POST/PUT/DELETE the right URLs', async () => {
    apiFetch.mockResolvedValue({ id: 1 })
    const queries = await import('./useShippingQueries')

    const create: any = await runInComponent(() => queries.useCreateShippingRate())
    const update: any = await runInComponent(() => queries.useUpdateShippingRate())
    const remove: any = await runInComponent(() => queries.useDeleteShippingRate())

    await create.mutateAsync({
      zone_id: 1,
      method_id: 1,
      currency: 'USD',
      amount: 5,
      free_above_subtotal: null,
      tiers: null,
    })
    await update.mutateAsync({ id: 9, patch: { amount: 7.5 } })
    await remove.mutateAsync(9)

    expect(apiFetch.mock.calls[0]).toMatchObject([
      '/api/v1/admin/shipping/rates',
      { method: 'POST' },
    ])
    expect(apiFetch.mock.calls[1]).toMatchObject([
      '/api/v1/admin/shipping/rates/9',
      { method: 'PUT' },
    ])
    expect(apiFetch.mock.calls[2]).toMatchObject([
      '/api/v1/admin/shipping/rates/9',
      { method: 'DELETE' },
    ])
  })
})
