// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import ReportExportButton from './ReportExportButton.vue'

/**
 * Thin wrapper over useExportSalesReport; we stub the composable + toast and
 * assert it forwards the resolved range/granularity, disables without a complete
 * range, and toasts on failure. Blob/URL mechanics live in
 * useExportSalesReport.spec.ts.
 */

const { mockExport, mockToastAdd } = vi.hoisted(() => ({
  mockExport: vi.fn(),
  mockToastAdd: vi.fn(),
}))

mockNuxtImport('useExportSalesReport', () => () => ({
  exportSalesReport: mockExport,
  isExporting: ref(false),
}))
mockNuxtImport('useToast', () => () => ({ add: mockToastAdd }))

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

async function flush() {
  await new Promise(r => setTimeout(r, 0))
}

describe('ReportExportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExport.mockResolvedValue(null)
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(ReportExportButton, {
      props: { start: '2026-05-01', end: '2026-05-31', granularity: 'day' },
    })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })

  it('forwards the resolved range + granularity to exportSalesReport', async () => {
    const wrapper = await mountSuspended(ReportExportButton, {
      props: { start: '2026-05-01', end: '2026-05-31', granularity: 'week' },
    })
    await wrapper.find('button').trigger('click')
    await flush()

    expect(mockExport).toHaveBeenCalledWith({
      start: '2026-05-01',
      end: '2026-05-31',
      granularity: 'week',
    })
    expect(mockToastAdd).not.toHaveBeenCalled()
  })

  it('is disabled (and does not export) without a complete range', async () => {
    const wrapper = await mountSuspended(ReportExportButton, {
      props: { start: '2026-05-01', granularity: 'day' },
    })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    await wrapper.find('button').trigger('click')
    await flush()
    expect(mockExport).not.toHaveBeenCalled()
  })

  it('toasts on failure', async () => {
    mockExport.mockResolvedValue({ title: 'Forbidden', detail: 'Forbidden' })
    const wrapper = await mountSuspended(ReportExportButton, {
      props: { start: '2026-05-01', end: '2026-05-31', granularity: 'day' },
    })
    await wrapper.find('button').trigger('click')
    await flush()

    expect(mockToastAdd).toHaveBeenCalledTimes(1)
    expect(mockToastAdd.mock.calls[0]![0].color).toBe('error')
  })
})
