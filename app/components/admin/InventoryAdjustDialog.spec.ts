// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import InventoryAdjustDialog from './InventoryAdjustDialog.vue'

/**
 * The dialog owns its mutations (adjust stock + set threshold) and the success
 * toast, plus the per-warehouse levels + warehouse list queries. We stub those
 * auto-imports and assert the dialog's own logic: the no-op guard, the
 * warehouse-scoped adjust payload, and a11y. URL/verb mapping is pinned in
 * `useInventoryQueries.spec.ts`.
 */

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
    // UInputNumber renders a visually-hidden native input that axe flags as
    // unlabeled; the visible control is labeled via UFormField.
    'label': { enabled: false },
  },
}

const { adjustMutate, thresholdMutate, toastAdd } = vi.hoisted(() => ({
  adjustMutate: vi.fn(),
  thresholdMutate: vi.fn(),
  toastAdd: vi.fn(),
}))

mockNuxtImport('useAdjustStock', () => () => ({
  mutateAsync: adjustMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useSetLowStockThreshold', () => () => ({
  mutateAsync: thresholdMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useProductLevels', () => () => ({
  data: ref([
    { warehouse_id: 1, warehouse_code: 'MAIN', warehouse_name: 'Main', quantity: 10, is_default: true },
  ]),
}))
mockNuxtImport('useWarehousesQuery', () => () => ({
  data: ref({
    items: [{ id: 1, code: 'MAIN', name: 'Main', is_default: true, is_active: true }],
    total: 1,
  }),
}))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

beforeEach(() => {
  adjustMutate.mockReset().mockResolvedValue({})
  thresholdMutate.mockReset().mockResolvedValue({})
  toastAdd.mockReset()
  document.body.innerHTML = ''
})

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    open: true,
    productId: 1,
    productName: 'Blue Widget',
    currentStock: 10,
    currentThreshold: null,
    ...overrides,
  }
}

function clickSave() {
  const saveBtn = [...document.querySelectorAll('button')].find(
    b => b.textContent?.trim() === 'Save',
  ) as HTMLButtonElement | undefined
  saveBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('InventoryAdjustDialog', () => {
  it('renders the product name and the selected warehouse level', async () => {
    await mountSuspended(InventoryAdjustDialog, { props: baseProps() })
    await new Promise(r => setTimeout(r, 0))
    expect(document.body.textContent).toContain('Blue Widget')
    expect(document.body.textContent).toContain('MAIN')
    expect(document.body.textContent).toContain('10')
  })

  it('is axe-clean when open', async () => {
    await mountSuspended(InventoryAdjustDialog, { props: baseProps() })
    await new Promise(r => setTimeout(r, 0))
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })

  it('closes without calling any mutation when nothing changed', async () => {
    const wrapper = await mountSuspended(InventoryAdjustDialog, { props: baseProps() })
    await new Promise(r => setTimeout(r, 0))
    clickSave()
    await new Promise(r => setTimeout(r, 0))

    expect(adjustMutate).not.toHaveBeenCalled()
    expect(thresholdMutate).not.toHaveBeenCalled()
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('adjusts the selected warehouse when the new-stock value changed', async () => {
    const wrapper = await mountSuspended(InventoryAdjustDialog, { props: baseProps() })
    await new Promise(r => setTimeout(r, 0))
    const numberInputs = wrapper.findAllComponents({ name: 'UInputNumber' })
    numberInputs[0]!.vm.$emit('update:modelValue', 25)
    await new Promise(r => setTimeout(r, 0))

    clickSave()
    await new Promise(r => setTimeout(r, 0))

    expect(adjustMutate).toHaveBeenCalledWith({
      productId: 1,
      warehouseId: 1,
      newStock: 25,
      note: undefined,
    })
    expect(toastAdd).toHaveBeenCalled()
  })

  it('updates only the threshold when stock is unchanged', async () => {
    const wrapper = await mountSuspended(InventoryAdjustDialog, {
      props: baseProps({ currentThreshold: null }),
    })
    await new Promise(r => setTimeout(r, 0))
    // [0] = new stock, [1] = low-stock threshold — change only the threshold.
    const numberInputs = wrapper.findAllComponents({ name: 'UInputNumber' })
    numberInputs[1]!.vm.$emit('update:modelValue', 15)
    await new Promise(r => setTimeout(r, 0))

    clickSave()
    await new Promise(r => setTimeout(r, 0))

    expect(thresholdMutate).toHaveBeenCalledWith({ productId: 1, threshold: 15 })
    expect(adjustMutate).not.toHaveBeenCalled()
  })

  it('shows the inline error alert + an error toast (no success toast) when a mutation fails', async () => {
    adjustMutate.mockRejectedValue({ data: { detail: 'Stock conflict' } })
    const wrapper = await mountSuspended(InventoryAdjustDialog, { props: baseProps() })
    await new Promise(r => setTimeout(r, 0))
    const numberInputs = wrapper.findAllComponents({ name: 'UInputNumber' })
    numberInputs[0]!.vm.$emit('update:modelValue', 25)
    await new Promise(r => setTimeout(r, 0))

    clickSave()
    await new Promise(r => setTimeout(r, 0))

    // Gold-standard flow: server detail surfaces inline (role=alert) + an error
    // toast; the success toast is not raised.
    expect(document.querySelector('[role="alert"]')).toBeTruthy()
    expect(document.body.textContent).toContain('Stock conflict')
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
    expect(toastAdd).not.toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
  })
})
