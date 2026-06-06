// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import InventoryRestockDialog from './InventoryRestockDialog.vue'

/**
 * The dialog owns the restock mutation + the warehouse list + toast. We stub
 * those auto-imports and assert the payload, default warehouse, and a11y. URL/verb
 * mapping is pinned in `useInventoryQueries.spec.ts`.
 */

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
    'label': { enabled: false },
    'nested-interactive': { enabled: false },
  },
}

const { restockMutate, toastAdd } = vi.hoisted(() => ({
  restockMutate: vi.fn(),
  toastAdd: vi.fn(),
}))

mockNuxtImport('useRestock', () => () => ({ mutateAsync: restockMutate, isLoading: ref(false) }))
mockNuxtImport('useWarehousesQuery', () => () => ({
  data: ref({ items: [{ id: 1, code: 'MAIN', name: 'Main', is_default: true, is_active: true }] }),
}))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

beforeEach(() => {
  restockMutate.mockReset().mockResolvedValue({})
  toastAdd.mockReset()
  document.body.innerHTML = ''
})

const baseProps = { open: true, productId: 1, productName: 'Blue Widget' }

function clickSave() {
  const btn = [...document.querySelectorAll('button')].find(
    b => b.textContent?.trim() === 'Restock',
  ) as HTMLButtonElement | undefined
  btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('InventoryRestockDialog', () => {
  it('renders the product name', async () => {
    await mountSuspended(InventoryRestockDialog, { props: baseProps })
    await new Promise(r => setTimeout(r, 0))
    expect(document.body.textContent).toContain('Blue Widget')
  })

  it('is axe-clean when open', async () => {
    await mountSuspended(InventoryRestockDialog, { props: baseProps })
    await new Promise(r => setTimeout(r, 0))
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })

  it('restocks the default warehouse with the entered quantity', async () => {
    const wrapper = await mountSuspended(InventoryRestockDialog, { props: baseProps })
    await new Promise(r => setTimeout(r, 0))
    wrapper.findAllComponents({ name: 'UInputNumber' })[0]!.vm.$emit('update:modelValue', 5)
    await new Promise(r => setTimeout(r, 0))

    clickSave()
    await new Promise(r => setTimeout(r, 0))

    expect(restockMutate).toHaveBeenCalledWith({
      productId: 1,
      warehouseId: 1,
      quantity: 5,
      note: undefined,
    })
    expect(toastAdd).toHaveBeenCalled()
  })

  it('shows the inline error alert + an error toast when the mutation fails', async () => {
    restockMutate.mockRejectedValue({ data: { detail: 'Warehouse not found' } })
    await mountSuspended(InventoryRestockDialog, { props: baseProps })
    await new Promise(r => setTimeout(r, 0))

    clickSave()
    await new Promise(r => setTimeout(r, 0))

    // Gold-standard flow: server detail surfaces inline (role=alert) + as a toast.
    expect(document.querySelector('[role="alert"]')).toBeTruthy()
    expect(document.body.textContent).toContain('Warehouse not found')
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  })
})
