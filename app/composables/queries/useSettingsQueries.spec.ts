import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada-backed query/mutation layer for the store-config singleton. Specs
 * assert on the URLs + verbs pushed at `apiFetch` (no id in the path — there
 * is exactly one settings row).
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

describe('useStoreConfigQuery', () => {
  it('GETs /api/v1/admin/settings (no trailing slash, no id)', async () => {
    apiFetch.mockResolvedValue({ id: 1, store_name: 'Acme' })
    const { useStoreConfigQuery } = await import('./useSettingsQueries')

    await runInComponent(() => useStoreConfigQuery())
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    const [url] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/settings')
  })
})

describe('useUpdateStoreConfig', () => {
  it('PATCHes /api/v1/admin/settings with the partial body', async () => {
    apiFetch.mockResolvedValue({ id: 1, store_name: 'Renamed' })
    const { useUpdateStoreConfig } = await import('./useSettingsQueries')

    const result = (await runInComponent(() => useUpdateStoreConfig())) as any
    await result.mutateAsync({ store_name: 'Renamed', invoice_vat_rate: 23 })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/settings')
    expect(options.method).toBe('PATCH')
    expect(options.body).toMatchObject({ store_name: 'Renamed', invoice_vat_rate: 23 })
  })
})
