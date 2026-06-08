// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import InventoryLowStockReportButton from './InventoryLowStockReportButton.vue'

/**
 * The "Email low-stock report" action: clicking triggers the mutation and toasts
 * the resolved recipients + product count, or surfaces an error toast on failure.
 */

const { mockMutate, mockToastAdd } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockToastAdd: vi.fn(),
}))

mockNuxtImport('useEmailLowStockReport', () => () => ({
  mutateAsync: mockMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useToast', () => () => ({ add: mockToastAdd }))

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

async function flush() {
  await new Promise(r => setTimeout(r, 0))
}

describe('InventoryLowStockReportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMutate.mockResolvedValue({ recipients: ['admin@store.test'], product_count: 3 })
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(InventoryLowStockReportButton)
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })

  it('calls the mutation and toasts success with count + recipients', async () => {
    const wrapper = await mountSuspended(InventoryLowStockReportButton)
    await wrapper.find('button').trigger('click')
    await flush()

    expect(mockMutate).toHaveBeenCalledTimes(1)
    expect(mockToastAdd).toHaveBeenCalledTimes(1)
    const opts = mockToastAdd.mock.calls[0][0]
    expect(opts.color).toBe('success')
    expect(opts.description).toContain('3')
    expect(opts.description).toContain('admin@store.test')
  })

  it('toasts an error when the mutation rejects', async () => {
    mockMutate.mockRejectedValue(new Error('boom'))
    const wrapper = await mountSuspended(InventoryLowStockReportButton)
    await wrapper.find('button').trigger('click')
    await flush()

    expect(mockToastAdd).toHaveBeenCalledTimes(1)
    expect(mockToastAdd.mock.calls[0][0].color).toBe('error')
  })
})
