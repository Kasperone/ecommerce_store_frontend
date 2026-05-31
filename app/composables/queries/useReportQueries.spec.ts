import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * Colada-backed read-only report queries. Specs assert the URLs + query params
 * pushed at `apiFetch`, and that the sales query stays disabled until a complete
 * range is supplied (the backend requires start+end).
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

describe('useSalesReport', () => {
  it('fetches /reports/sales with start, end and granularity', async () => {
    apiFetch.mockResolvedValue({ buckets: [] })
    const { useSalesReport } = await import('./useReportQueries')

    await runInComponent(() =>
      useSalesReport({ start: '2026-05-01', end: '2026-05-31', granularity: 'week' }),
    )

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/reports/sales')
    expect(options.query).toMatchObject({
      start: '2026-05-01',
      end: '2026-05-31',
      granularity: 'week',
    })
  })

  it('defaults granularity to day', async () => {
    apiFetch.mockResolvedValue({ buckets: [] })
    const { useSalesReport } = await import('./useReportQueries')

    await runInComponent(() => useSalesReport({ start: '2026-05-01', end: '2026-05-31' }))

    expect(apiFetch.mock.calls[0]?.[1].query.granularity).toBe('day')
  })

  it('stays disabled (no fetch) when the range is incomplete', async () => {
    const { useSalesReport } = await import('./useReportQueries')

    await runInComponent(() => useSalesReport({ start: '2026-05-01' }))
    await runInComponent(() => useSalesReport({}))

    expect(apiFetch).not.toHaveBeenCalled()
  })
})

describe('useTopProductsReport', () => {
  it('fetches /reports/top-products with range + default limit 10', async () => {
    apiFetch.mockResolvedValue({ rows: [] })
    const { useTopProductsReport } = await import('./useReportQueries')

    await runInComponent(() => useTopProductsReport({ start: '2026-05-01', end: '2026-05-31' }))

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/reports/top-products')
    expect(options.query).toMatchObject({ start: '2026-05-01', end: '2026-05-31', limit: 10 })
  })

  it('forwards an explicit limit', async () => {
    apiFetch.mockResolvedValue({ rows: [] })
    const { useTopProductsReport } = await import('./useReportQueries')

    await runInComponent(() => useTopProductsReport({ limit: 25 }))

    expect(apiFetch.mock.calls[0]?.[1].query.limit).toBe(25)
  })
})

describe('useCategoryRevenueReport', () => {
  it('fetches /reports/by-category with the range', async () => {
    apiFetch.mockResolvedValue({ rows: [] })
    const { useCategoryRevenueReport } = await import('./useReportQueries')

    await runInComponent(() => useCategoryRevenueReport({ start: '2026-05-01', end: '2026-05-31' }))

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/reports/by-category')
    expect(options.query).toMatchObject({ start: '2026-05-01', end: '2026-05-31' })
  })
})

describe('useRefundSummaryReport', () => {
  it('fetches /reports/refund-summary with the range', async () => {
    apiFetch.mockResolvedValue({ refund_count: 0, rows: [] })
    const { useRefundSummaryReport } = await import('./useReportQueries')

    await runInComponent(() => useRefundSummaryReport({ start: '2026-05-01', end: '2026-05-31' }))

    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/v1/admin/reports/refund-summary')
    expect(options.query).toMatchObject({ start: '2026-05-01', end: '2026-05-31' })
  })
})
