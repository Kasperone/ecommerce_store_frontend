import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Read-only Colada query layer for the admin audit log. Specs assert on the URL
 * and query params pushed at `apiFetch`.
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

describe('useAuditEventsQuery', () => {
  it('fetches /api/v1/admin/audit-events/ (trailing slash) with filters', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useAuditEventsQuery } = await import('./useAuditEventQueries')

    await runInComponent(() =>
      useAuditEventsQuery({
        page: 2,
        pageSize: 10,
        resourceType: 'product',
        action: 'update',
        resourceId: 5,
      }),
    )
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/audit-events/')
    expect(options.query).toMatchObject({
      page: 2,
      page_size: 10,
      resource_type: 'product',
      action: 'update',
      resource_id: 5,
    })
  })

  it('defaults page=1 / page_size=20 and omits unset filters', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useAuditEventsQuery } = await import('./useAuditEventQueries')

    await runInComponent(() => useAuditEventsQuery({}))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.query).toMatchObject({ page: 1, page_size: 20 })
    expect(options.query.resource_type).toBeUndefined()
    expect(options.query.action).toBeUndefined()
    expect(options.query.resource_id).toBeUndefined()
  })
})
