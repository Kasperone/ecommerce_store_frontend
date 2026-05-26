// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import InventoryAdjustDialog from './InventoryAdjustDialog.vue'

/**
 * The dialog owns its mutations (adjust stock + set threshold) and the success
 * toast, so we stub those auto-imports and assert the dialog's own logic: the
 * no-op guard (nothing changed → close, no network) and a11y. Argument mapping
 * for the mutations is pinned in `useInventoryQueries.spec.ts`.
 *
 * `aria-hidden-focus` is disabled in axe runs for the same reka-ui open-transition
 * timing reason documented in AdminFormModal.spec.ts.
 */

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
    // Nuxt UI's UInputNumber renders a visually-hidden native input (for form
    // submission) that axe flags as unlabeled; the visible control is labeled via
    // UFormField. Disabled here for the same reason as CategoryFormModal.spec.ts.
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
  it('renders the product name and current stock', async () => {
    await mountSuspended(InventoryAdjustDialog, { props: baseProps() })
    expect(document.body.textContent).toContain('Blue Widget')
    expect(document.body.textContent).toContain('10')
  })

  it('is axe-clean when open', async () => {
    await mountSuspended(InventoryAdjustDialog, { props: baseProps() })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })

  it('closes without calling any mutation when nothing changed', async () => {
    const wrapper = await mountSuspended(InventoryAdjustDialog, { props: baseProps() })
    clickSave()
    await new Promise(r => setTimeout(r, 0))

    expect(adjustMutate).not.toHaveBeenCalled()
    expect(thresholdMutate).not.toHaveBeenCalled()
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('adjusts stock when the new-stock value changed', async () => {
    const wrapper = await mountSuspended(InventoryAdjustDialog, { props: baseProps() })
    // Drive the first UInputNumber (new stock) via its v-model event.
    const numberInputs = wrapper.findAllComponents({ name: 'UInputNumber' })
    expect(numberInputs.length).toBeGreaterThan(0)
    numberInputs[0]!.vm.$emit('update:modelValue', 25)
    await new Promise(r => setTimeout(r, 0))

    clickSave()
    await new Promise(r => setTimeout(r, 0))

    expect(adjustMutate).toHaveBeenCalledWith({ productId: 1, newStock: 25, note: undefined })
    expect(toastAdd).toHaveBeenCalled()
  })

  it('updates only the threshold when stock is unchanged', async () => {
    const wrapper = await mountSuspended(InventoryAdjustDialog, {
      props: baseProps({ currentThreshold: null }),
    })
    // [0] = new stock, [1] = low-stock threshold — change only the threshold.
    const numberInputs = wrapper.findAllComponents({ name: 'UInputNumber' })
    numberInputs[1]!.vm.$emit('update:modelValue', 15)
    await new Promise(r => setTimeout(r, 0))

    clickSave()
    await new Promise(r => setTimeout(r, 0))

    expect(thresholdMutate).toHaveBeenCalledWith({ productId: 1, threshold: 15 })
    expect(adjustMutate).not.toHaveBeenCalled()
  })

  it('shows an error alert and no success toast when a mutation fails', async () => {
    adjustMutate.mockRejectedValue({ data: { detail: 'Stock conflict' } })
    const wrapper = await mountSuspended(InventoryAdjustDialog, { props: baseProps() })
    const numberInputs = wrapper.findAllComponents({ name: 'UInputNumber' })
    numberInputs[0]!.vm.$emit('update:modelValue', 25)
    await new Promise(r => setTimeout(r, 0))

    clickSave()
    await new Promise(r => setTimeout(r, 0))

    expect(document.querySelector('[role="alert"]')).toBeTruthy()
    expect(toastAdd).not.toHaveBeenCalled()
  })
})
