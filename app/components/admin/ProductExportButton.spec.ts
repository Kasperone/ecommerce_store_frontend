// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import ProductExportButton from './ProductExportButton.vue'

/**
 * Thin wrapper over useExportProducts; we stub the composable + toast and assert
 * it forwards the resolved filters and toasts on failure. Blob/URL mechanics are
 * pinned in useExportProducts.spec.ts.
 */

const { mockExport, mockToastAdd } = vi.hoisted(() => ({
  mockExport: vi.fn(),
  mockToastAdd: vi.fn(),
}))

mockNuxtImport('useExportProducts', () => () => ({
  exportProducts: mockExport,
  isExporting: ref(false),
}))
mockNuxtImport('useToast', () => () => ({ add: mockToastAdd }))

async function flush() {
  await new Promise(r => setTimeout(r, 0))
}

describe('ProductExportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExport.mockResolvedValue(null)
  })

  it('forwards the resolved filters to exportProducts', async () => {
    const wrapper = await mountSuspended(ProductExportButton, {
      props: { categoryId: 3, isActive: true, search: 'tea' },
    })
    await wrapper.find('button').trigger('click')
    await flush()

    expect(mockExport).toHaveBeenCalledWith({ categoryId: 3, isActive: true, search: 'tea' })
    expect(mockToastAdd).not.toHaveBeenCalled()
  })

  it('toasts on failure', async () => {
    mockExport.mockResolvedValue({ title: 'Forbidden', detail: 'Forbidden' })
    const wrapper = await mountSuspended(ProductExportButton, { props: {} })
    await wrapper.find('button').trigger('click')
    await flush()

    expect(mockToastAdd).toHaveBeenCalledTimes(1)
    expect(mockToastAdd.mock.calls[0][0].color).toBe('error')
  })
})
