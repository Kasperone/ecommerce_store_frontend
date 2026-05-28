// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import InventoryTransferDialog from './InventoryTransferDialog.vue'

/**
 * The dialog owns the transfer mutation + warehouse list + per-product levels +
 * toast. We stub those and assert the payload, the client-side same-warehouse +
 * insufficient guards, and a11y. URL/verb mapping is in `useInventoryQueries.spec.ts`.
 */

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
    'label': { enabled: false },
    'nested-interactive': { enabled: false },
  },
}

const { transferMutate, toastAdd } = vi.hoisted(() => ({
  transferMutate: vi.fn(),
  toastAdd: vi.fn(),
}))

mockNuxtImport('useTransferStock', () => () => ({
  mutateAsync: transferMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useWarehousesQuery', () => () => ({
  data: ref({
    items: [
      { id: 1, code: 'MAIN', name: 'Main', is_default: true, is_active: true },
      { id: 2, code: 'EU-1', name: 'Europe', is_default: false, is_active: true },
    ],
  }),
}))
mockNuxtImport('useProductLevels', () => () => ({
  data: ref([
    { warehouse_id: 1, warehouse_code: 'MAIN', warehouse_name: 'Main', quantity: 10, is_default: true },
  ]),
}))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

beforeEach(() => {
  transferMutate.mockReset().mockResolvedValue({})
  toastAdd.mockReset()
  document.body.innerHTML = ''
})

const baseProps = { open: true, productId: 1, productName: 'Blue Widget' }

function clickSave() {
  const btn = [...document.querySelectorAll('button')].find(
    b => b.textContent?.trim() === 'Transfer',
  ) as HTMLButtonElement | undefined
  btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('InventoryTransferDialog', () => {
  it('shows the source available level', async () => {
    await mountSuspended(InventoryTransferDialog, { props: baseProps })
    await new Promise(r => setTimeout(r, 0))
    expect(document.body.textContent).toContain('10')
  })

  it('is axe-clean when open', async () => {
    await mountSuspended(InventoryTransferDialog, { props: baseProps })
    await new Promise(r => setTimeout(r, 0))
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })

  it('transfers from the source to the chosen destination', async () => {
    const wrapper = await mountSuspended(InventoryTransferDialog, { props: baseProps })
    await new Promise(r => setTimeout(r, 0))
    // [0] = from (default MAIN=1), [1] = to.
    wrapper.findAllComponents({ name: 'USelect' })[1]!.vm.$emit('update:modelValue', 2)
    wrapper.findAllComponents({ name: 'UInputNumber' })[0]!.vm.$emit('update:modelValue', 3)
    await new Promise(r => setTimeout(r, 0))

    clickSave()
    await new Promise(r => setTimeout(r, 0))

    expect(transferMutate).toHaveBeenCalledWith({
      productId: 1,
      fromWarehouseId: 1,
      toWarehouseId: 2,
      quantity: 3,
      note: undefined,
    })
    expect(toastAdd).toHaveBeenCalled()
  })

  it('blocks a same-warehouse transfer client-side', async () => {
    const wrapper = await mountSuspended(InventoryTransferDialog, { props: baseProps })
    await new Promise(r => setTimeout(r, 0))
    wrapper.findAllComponents({ name: 'USelect' })[1]!.vm.$emit('update:modelValue', 1) // == from
    await new Promise(r => setTimeout(r, 0))

    clickSave()
    await new Promise(r => setTimeout(r, 0))

    expect(transferMutate).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alert"]')).toBeTruthy()
  })

  it('blocks a transfer exceeding the source level client-side', async () => {
    const wrapper = await mountSuspended(InventoryTransferDialog, { props: baseProps })
    await new Promise(r => setTimeout(r, 0))
    wrapper.findAllComponents({ name: 'USelect' })[1]!.vm.$emit('update:modelValue', 2)
    wrapper.findAllComponents({ name: 'UInputNumber' })[0]!.vm.$emit('update:modelValue', 99)
    await new Promise(r => setTimeout(r, 0))

    clickSave()
    await new Promise(r => setTimeout(r, 0))

    expect(transferMutate).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alert"]')).toBeTruthy()
  })
})
