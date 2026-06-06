// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import WarehouseFormModal from './WarehouseFormModal.vue'

/**
 * The modal owns the create/update mutations + the success toast. We stub those
 * auto-imports and assert the modal's own logic: create-vs-edit title + prefill,
 * the create/update payloads, the default-locked switch, error rendering, and a11y.
 * URL/verb mapping is pinned in `useWarehouseQueries.spec.ts`.
 */

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
    'label': { enabled: false },
    // Nuxt UI's USwitch renders a button[role=switch] wrapping a visually-hidden
    // input (for form submission); axe flags that as nested-interactive. Library
    // rendering artifact, same posture as the UInputNumber `label` exception.
    'nested-interactive': { enabled: false },
  },
}

const { createMutate, updateMutate, toastAdd } = vi.hoisted(() => ({
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  toastAdd: vi.fn(),
}))

mockNuxtImport('useCreateWarehouse', () => () => ({
  mutateAsync: createMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useUpdateWarehouse', () => () => ({
  mutateAsync: updateMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

beforeEach(() => {
  createMutate.mockReset().mockResolvedValue({})
  updateMutate.mockReset().mockResolvedValue({})
  toastAdd.mockReset()
  document.body.innerHTML = ''
})

function clickSave() {
  const saveBtn = [...document.querySelectorAll('button')].find(
    b => b.textContent?.trim() === 'Save',
  ) as HTMLButtonElement | undefined
  saveBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

const existing = {
  id: 3,
  code: 'EU-1',
  name: 'Europe',
  is_active: true,
  is_default: false,
  created_at: '2026-05-28T00:00:00Z',
  updated_at: '2026-05-28T00:00:00Z',
}

describe('WarehouseFormModal', () => {
  it('shows the create title when no warehouse is passed', async () => {
    await mountSuspended(WarehouseFormModal, { props: { open: true, warehouse: null } })
    expect(document.body.textContent).toContain('New warehouse')
  })

  it('prefills and shows the edit title when a warehouse is passed', async () => {
    await mountSuspended(WarehouseFormModal, { props: { open: true, warehouse: existing } })
    expect(document.body.textContent).toContain('Edit warehouse')
    const inputs = document.querySelectorAll('input')
    const values = [...inputs].map(i => (i as HTMLInputElement).value)
    expect(values).toContain('Europe')
    expect(values).toContain('EU-1')
  })

  it('is axe-clean when open', async () => {
    await mountSuspended(WarehouseFormModal, { props: { open: true, warehouse: null } })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })

  it('creates a warehouse on save', async () => {
    const wrapper = await mountSuspended(WarehouseFormModal, {
      props: { open: true, warehouse: null },
    })
    const inputs = wrapper.findAllComponents({ name: 'UInput' })
    inputs[0]!.vm.$emit('update:modelValue', 'Asia')
    inputs[1]!.vm.$emit('update:modelValue', 'AS-1')
    await new Promise(r => setTimeout(r, 0))

    clickSave()
    await new Promise(r => setTimeout(r, 0))

    expect(createMutate).toHaveBeenCalledWith({
      name: 'Asia',
      code: 'AS-1',
      is_active: true,
      is_default: false,
    })
    expect(toastAdd).toHaveBeenCalled()
  })

  it('updates an existing warehouse on save', async () => {
    const wrapper = await mountSuspended(WarehouseFormModal, {
      props: { open: true, warehouse: existing },
    })
    const inputs = wrapper.findAllComponents({ name: 'UInput' })
    inputs[0]!.vm.$emit('update:modelValue', 'Europe West')
    await new Promise(r => setTimeout(r, 0))

    clickSave()
    await new Promise(r => setTimeout(r, 0))

    expect(updateMutate).toHaveBeenCalledWith({
      id: 3,
      patch: { name: 'Europe West', code: 'EU-1', is_active: true, is_default: false },
    })
  })

  it('locks the default switch when editing the current default', async () => {
    const wrapper = await mountSuspended(WarehouseFormModal, {
      props: { open: true, warehouse: { ...existing, is_default: true } },
    })
    const switches = wrapper.findAllComponents({ name: 'USwitch' })
    // [0] = active, [1] = default — the default one is disabled.
    expect(switches[1]!.props('disabled')).toBe(true)
  })

  it('shows the inline error alert + an error toast when the mutation fails', async () => {
    createMutate.mockRejectedValue({ data: { detail: 'Code already exists' } })
    const wrapper = await mountSuspended(WarehouseFormModal, {
      props: { open: true, warehouse: null },
    })
    const inputs = wrapper.findAllComponents({ name: 'UInput' })
    inputs[0]!.vm.$emit('update:modelValue', 'Dup')
    inputs[1]!.vm.$emit('update:modelValue', 'MAIN')
    await new Promise(r => setTimeout(r, 0))

    clickSave()
    await new Promise(r => setTimeout(r, 0))

    // Gold-standard flow: the normalized detail surfaces inline (role=alert) and
    // as an error toast.
    expect(document.querySelector('[role="alert"]')).toBeTruthy()
    expect(document.body.textContent).toContain('Code already exists')
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  })
})
