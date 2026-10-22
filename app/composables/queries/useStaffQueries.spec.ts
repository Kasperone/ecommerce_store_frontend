import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada-backed query/mutation layer for the admin staff roster. Specs assert
 * on the URLs and verbs pushed at `apiFetch` (the network boundary).
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

describe('useStaffQuery', () => {
  it('fetches /api/v1/admin/staff/ (trailing slash) with filters', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useStaffQuery } = await import('./useStaffQueries')

    await runInComponent(() => useStaffQuery({ page: 2, pageSize: 10, search: 'ann' }))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/staff/')
    expect(options.query).toMatchObject({ page: 2, page_size: 10, search: 'ann' })
  })

  it('defaults page=1 / page_size=20 and leaves search undefined', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useStaffQuery } = await import('./useStaffQueries')

    await runInComponent(() => useStaffQuery({}))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.query).toMatchObject({ page: 1, page_size: 20 })
    expect(options.query.search).toBeUndefined()
  })

  it('drops an empty search string to undefined', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useStaffQuery } = await import('./useStaffQueries')

    await runInComponent(() => useStaffQuery({ search: '' }))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch.mock.calls[0]?.[1].query.search).toBeUndefined()
  })
})

describe('useUpdateStaff', () => {
  it('PATCHes /api/v1/admin/staff/{userId} with the role/active patch', async () => {
    apiFetch.mockResolvedValue({ id: 3, role: 'ADMIN', is_active: true })
    const { useUpdateStaff } = await import('./useStaffQueries')

    const result = (await runInComponent(() => useUpdateStaff())) as any
    await result.mutateAsync({ userId: 3, patch: { role: 'ADMIN', is_active: false } })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/staff/3')
    expect(options.method).toBe('PATCH')
    expect(options.body).toMatchObject({ role: 'ADMIN', is_active: false })
  })
})
