import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import {
  COMPANY_MEMBER_STATUSES,
  COMPANY_ROLES,
  companyMemberStatusColor,
  companyRoleColor,
} from './useTeam'

/**
 * Colada-backed query/mutations for the company team roster. Specs assert on the
 * URLs + verbs pushed at `apiFetch` (the network boundary), plus the presentation
 * helpers (single-sourced off the generated schema literals).
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

describe('useTeamQuery', () => {
  it('GETs /api/v1/companies/me/users', async () => {
    apiFetch.mockResolvedValue([])
    const { useTeamQuery } = await import('./useTeam')

    await runInComponent(() => useTeamQuery())
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch.mock.calls[0]?.[0]).toBe('/api/v1/companies/me/users')
  })
})

describe('useInviteMember', () => {
  it('POSTs the invite body to /api/v1/companies/me/users', async () => {
    apiFetch.mockResolvedValue({ id: 1 })
    const { useInviteMember } = await import('./useTeam')

    const result = (await runInComponent(() => useInviteMember())) as any
    await result.mutateAsync({ email: 'new@co.com', role: 'BUYER' })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/companies/me/users')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ email: 'new@co.com', role: 'BUYER' })
  })
})

describe('useUpdateMember', () => {
  it('PATCHes /api/v1/companies/me/users/{id} with the role/status patch', async () => {
    apiFetch.mockResolvedValue({ id: 5 })
    const { useUpdateMember } = await import('./useTeam')

    const result = (await runInComponent(() => useUpdateMember())) as any
    await result.mutateAsync({ id: 5, patch: { role: 'COMPANY_ADMIN' } })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/companies/me/users/5')
    expect(options.method).toBe('PATCH')
    expect(options.body).toMatchObject({ role: 'COMPANY_ADMIN' })
  })

  it('sends a status-only patch when suspending', async () => {
    apiFetch.mockResolvedValue({ id: 6 })
    const { useUpdateMember } = await import('./useTeam')

    const result = (await runInComponent(() => useUpdateMember())) as any
    await result.mutateAsync({ id: 6, patch: { status: 'suspended' } })

    expect(apiFetch.mock.calls[0]?.[1].body).toMatchObject({ status: 'suspended' })
  })
})

describe('useRemoveMember', () => {
  it('DELETEs /api/v1/companies/me/users/{id}', async () => {
    apiFetch.mockResolvedValue(undefined)
    const { useRemoveMember } = await import('./useTeam')

    const result = (await runInComponent(() => useRemoveMember())) as any
    await result.mutateAsync(9)

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/companies/me/users/9')
    expect(options.method).toBe('DELETE')
  })
})

describe('presentation helpers', () => {
  it('exposes all four roles and three statuses', () => {
    expect(COMPANY_ROLES).toEqual(['COMPANY_ADMIN', 'BUYER', 'APPROVER', 'VIEWER'])
    expect(COMPANY_MEMBER_STATUSES).toEqual(['active', 'invited', 'suspended'])
  })

  it('maps each role and status to a badge colour', () => {
    expect(companyRoleColor('COMPANY_ADMIN')).toBe('primary')
    expect(companyRoleColor('VIEWER')).toBe('neutral')
    expect(companyMemberStatusColor('active')).toBe('success')
    expect(companyMemberStatusColor('suspended')).toBe('warning')
  })
})
