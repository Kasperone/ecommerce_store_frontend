// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import InventoryExportButton from './InventoryExportButton.vue'

/**
 * Thin wrapper over useExportInventory; we stub the composable + toast and assert
 * it forwards the resolved filters and toasts on failure. Blob/URL mechanics are
 * pinned in useExportInventory.spec.ts.
 */

const { mockExport, mockToastAdd } = vi.hoisted(() => ({
  mockExport: vi.fn(),
  mockToastAdd: vi.fn(),
}))

mockNuxtImport('useExportInventory', () => () => ({
  exportInventory: mockExport,
  isExporting: ref(false),
}))
mockNuxtImport('useToast', () => () => ({ add: mockToastAdd }))

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

async function flush() {
  await new Promise(r => setTimeout(r, 0))
}

describe('InventoryExportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExport.mockResolvedValue(null)
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(InventoryExportButton, { props: {} })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })

  it('forwards the resolved filters to exportInventory', async () => {
    const wrapper = await mountSuspended(InventoryExportButton, {
      props: { status: 'low_stock', search: 'bolt' },
    })
    await wrapper.find('button').trigger('click')
    await flush()

    expect(mockExport).toHaveBeenCalledWith({ status: 'low_stock', search: 'bolt' })
    expect(mockToastAdd).not.toHaveBeenCalled()
  })

  it('toasts on failure', async () => {
    mockExport.mockResolvedValue({ title: 'Forbidden', detail: 'Forbidden' })
    const wrapper = await mountSuspended(InventoryExportButton, { props: {} })
    await wrapper.find('button').trigger('click')
    await flush()

    expect(mockToastAdd).toHaveBeenCalledTimes(1)
    expect(mockToastAdd.mock.calls[0]![0].color).toBe('error')
  })
})
