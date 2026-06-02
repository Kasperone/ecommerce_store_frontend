import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Company-profile query/mutation layer (`useCompany`).
 *
 * - `useCompanyProfileQuery` hits `GET /api/v1/companies/me`.
 * - `useUpdateCompanyProfile` PATCHes `/api/v1/companies/me` with the partial
 *   body and resolves with the updated company.
 *
 * `useApi` is stubbed at the import boundary so we assert on the URL + method +
 * body the composables build, without a real network.
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
  await new Promise(r => setTimeout(r, 0))
  return captured
}

describe('useCompanyProfileQuery', () => {
  it('fetches /api/v1/companies/me', async () => {
    apiFetch.mockResolvedValue({ id: 7, name: 'Acme', status: 'approved', role: 'COMPANY_ADMIN' })
    const { useCompanyProfileQuery } = await import('./useCompany')

    await runInComponent(() => useCompanyProfileQuery())

    expect(apiFetch.mock.calls[0]?.[0]).toBe('/api/v1/companies/me')
  })

  it('exposes the company (incl. role) on a 200', async () => {
    apiFetch.mockResolvedValue({ id: 7, name: 'Acme', status: 'approved', role: 'BUYER' })
    const { useCompanyProfileQuery } = await import('./useCompany')

    const q = (await runInComponent(() => useCompanyProfileQuery())) as any

    expect(q.data.value).toMatchObject({ id: 7, name: 'Acme', role: 'BUYER' })
  })
})

describe('useUpdateCompanyProfile', () => {
  it('PATCHes /api/v1/companies/me with the partial body and returns the updated company', async () => {
    const updated = { id: 7, name: 'Acme', status: 'approved', role: 'COMPANY_ADMIN', regon: '123456789' }
    apiFetch.mockResolvedValue(updated)
    const { useUpdateCompanyProfile } = await import('./useCompany')

    const m = (await runInComponent(() => useUpdateCompanyProfile())) as any
    const result = await m.mutateAsync({ regon: '123456789' })

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/v1/companies/me',
      expect.objectContaining({ method: 'PATCH', body: { regon: '123456789' } }),
    )
    expect(result).toMatchObject({ regon: '123456789' })
  })
})
