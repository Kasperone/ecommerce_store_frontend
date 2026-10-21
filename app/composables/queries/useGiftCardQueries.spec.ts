import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada-backed query/mutation layer for admin gift cards. Specs assert on the
 * URLs and verbs pushed at `apiFetch` (the network boundary) — the collection
 * route keeps its trailing slash, item routes carry none.
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

const tick = () => new Promise(r => setTimeout(r, 0))

describe('useGiftCardsQuery', () => {
  it('fetches /api/v1/admin/gift-cards/ (trailing slash) with filters', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useGiftCardsQuery } = await import('./useGiftCardQueries')

    await runInComponent(() =>
      useGiftCardsQuery({ page: 2, pageSize: 10, status: 'active', currency: 'PLN', q: '7QK2' }),
    )
    await nextTick()
    await tick()

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/gift-cards/')
    expect(options.query).toMatchObject({
      page: 2,
      page_size: 10,
      status: 'active',
      currency: 'PLN',
      q: '7QK2',
    })
  })

  it('defaults page=1 / page_size=20 and leaves status/currency/q undefined', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useGiftCardsQuery } = await import('./useGiftCardQueries')

    await runInComponent(() => useGiftCardsQuery({}))
    await nextTick()
    await tick()

    const options = apiFetch.mock.calls[0]?.[1]
    expect(options.query).toMatchObject({ page: 1, page_size: 20 })
    expect(options.query.status).toBeUndefined()
    expect(options.query.currency).toBeUndefined()
    expect(options.query.q).toBeUndefined()
  })

  it('drops an empty q string to undefined', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0 })
    const { useGiftCardsQuery } = await import('./useGiftCardQueries')

    await runInComponent(() => useGiftCardsQuery({ q: '' }))
    await nextTick()
    await tick()

    expect(apiFetch.mock.calls[0]?.[1].query.q).toBeUndefined()
  })
})

describe('useGiftCardQuery', () => {
  it('fetches /api/v1/admin/gift-cards/{id} (no trailing slash)', async () => {
    apiFetch.mockResolvedValue({ id: 4, entries: [] })
    const { useGiftCardQuery } = await import('./useGiftCardQueries')

    await runInComponent(() => useGiftCardQuery(4))
    await nextTick()
    await tick()

    expect(apiFetch.mock.calls[0]?.[0]).toBe('/api/v1/admin/gift-cards/4')
  })

  it('stays disabled while the id is undefined', async () => {
    const { useGiftCardQuery } = await import('./useGiftCardQueries')

    await runInComponent(() => useGiftCardQuery(undefined))
    await nextTick()
    await tick()

    expect(apiFetch).not.toHaveBeenCalled()
  })
})

describe('useIssueGiftCard', () => {
  it('POSTs /api/v1/admin/gift-cards/ with the issue body', async () => {
    apiFetch.mockResolvedValue({ id: 1, code: 'AAAA-BBBB-CCCC-DDDD' })
    const { useIssueGiftCard } = await import('./useGiftCardQueries')

    const result = (await runInComponent(() => useIssueGiftCard())) as any
    await result.mutateAsync({
      initial_value: 100,
      currency: 'PLN',
      expires_at: null,
      recipient_email: null,
      user_id: null,
      note: null,
      locale: 'pl',
    })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/gift-cards/')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ initial_value: 100, currency: 'PLN', locale: 'pl' })
  })
})

describe('useUpdateGiftCard', () => {
  it('PATCHes /api/v1/admin/gift-cards/{id}', async () => {
    apiFetch.mockResolvedValue({ id: 3, status: 'disabled' })
    const { useUpdateGiftCard } = await import('./useGiftCardQueries')

    const result = (await runInComponent(() => useUpdateGiftCard())) as any
    await result.mutateAsync({ id: 3, patch: { status: 'disabled' } })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/gift-cards/3')
    expect(options.method).toBe('PATCH')
    expect(options.body).toMatchObject({ status: 'disabled' })
  })
})

describe('useAdjustGiftCard', () => {
  it('POSTs /api/v1/admin/gift-cards/{id}/adjust with the signed amount', async () => {
    apiFetch.mockResolvedValue({ id: 3, balance: 5, entries: [] })
    const { useAdjustGiftCard } = await import('./useGiftCardQueries')

    const result = (await runInComponent(() => useAdjustGiftCard())) as any
    await result.mutateAsync({ id: 3, body: { amount: -20, note: 'fraud claw-back' } })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/admin/gift-cards/3/adjust')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ amount: -20, note: 'fraud claw-back' })
  })
})
