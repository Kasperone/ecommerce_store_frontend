import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * B2B gating context. `GET /companies/me` 200 → `isB2B` true (the caller is a
 * company contact); a 404 leaves `isB2B` false (not a business account). Specs
 * assert on the URL hit + the derived `isB2B` for both outcomes.
 *
 * The query is auth-gated: for guests it must never fire — the endpoint 401s
 * unauthenticated, and on the public /cart page (quote CTA) that 401 would
 * bounce the guest to /login via useApi's session-expired path.
 */

const apiFetch = vi.fn()
const authState = { isAuthenticated: true }

vi.mock('~/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

vi.mock('~/stores/auth', () => ({
  useAuthStore: () => authState,
}))

beforeEach(() => {
  vi.clearAllMocks()
  authState.isAuthenticated = true
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

describe('useCompanyContext', () => {
  it('fetches /api/v1/companies/me', async () => {
    apiFetch.mockResolvedValue({ id: 3, name: 'Acme', status: 'approved' })
    const { useCompanyContext } = await import('./useCompanyContext')

    await runInComponent(() => useCompanyContext())

    expect(apiFetch.mock.calls[0]?.[0]).toBe('/api/v1/companies/me')
  })

  it('reports isB2B=true and exposes the company on a 200', async () => {
    apiFetch.mockResolvedValue({ id: 3, name: 'Acme', status: 'approved' })
    const { useCompanyContext } = await import('./useCompanyContext')

    const ctx = (await runInComponent(() => useCompanyContext())) as any

    expect(ctx.isB2B.value).toBe(true)
    expect(ctx.company.value).toMatchObject({ id: 3, name: 'Acme' })
  })

  it('reports isB2B=false on a 404 (not a B2B account)', async () => {
    apiFetch.mockRejectedValue({ status: 404, data: { detail: 'Not found' } })
    const { useCompanyContext } = await import('./useCompanyContext')

    const ctx = (await runInComponent(() => useCompanyContext())) as any

    expect(ctx.isB2B.value).toBe(false)
    expect(ctx.company.value).toBeNull()
  })

  it('never probes for guests (auth-gated) and reports isB2B=false', async () => {
    authState.isAuthenticated = false
    apiFetch.mockResolvedValue({ id: 3, name: 'Acme', status: 'approved' })
    const { useCompanyContext } = await import('./useCompanyContext')

    const ctx = (await runInComponent(() => useCompanyContext())) as any

    expect(apiFetch).not.toHaveBeenCalled()
    expect(ctx.isB2B.value).toBe(false)
    expect(ctx.company.value).toBeNull()
  })
})
