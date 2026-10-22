// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import ExportButton from './ExportButton.vue'

const { mockExport, mockToastAdd } = vi.hoisted(() => ({
  mockExport: vi.fn(),
  mockToastAdd: vi.fn(),
}))

mockNuxtImport('useExportOrders', () => () => ({
  exportOrders: mockExport,
  isExporting: ref(false),
}))
mockNuxtImport('useToast', () => () => ({ add: mockToastAdd }))

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

async function flush() {
  await new Promise(r => setTimeout(r, 0))
}

describe('OrdersExportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExport.mockResolvedValue(null)
  })

  it('renders the export label', async () => {
    const wrapper = await mountSuspended(ExportButton)
    expect(wrapper.text()).toContain('Export CSV')
  })

  it('exports with the current filters on click', async () => {
    const wrapper = await mountSuspended(ExportButton, {
      props: { status: 'paid', dateFrom: '2026-05-01', dateTo: '2026-05-31' },
    })
    await wrapper.find('button').trigger('click')
    await flush()
    expect(mockExport).toHaveBeenCalledWith({
      status: 'paid',
      dateFrom: '2026-05-01',
      dateTo: '2026-05-31',
    })
    expect(mockToastAdd).not.toHaveBeenCalled()
  })

  it('passes undefined filters through when none are set', async () => {
    const wrapper = await mountSuspended(ExportButton)
    await wrapper.find('button').trigger('click')
    await flush()
    expect(mockExport).toHaveBeenCalledWith({
      status: undefined,
      dateFrom: undefined,
      dateTo: undefined,
    })
  })

  it('toasts an error when the export fails', async () => {
    mockExport.mockResolvedValue({ title: 'Boom', detail: 'Export failed' })
    const wrapper = await mountSuspended(ExportButton)
    await wrapper.find('button').trigger('click')
    await flush()
    expect(mockToastAdd).toHaveBeenCalledTimes(1)
    expect(mockToastAdd.mock.calls[0]![0].color).toBe('error')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(ExportButton)
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
