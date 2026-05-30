// @vitest-environment nuxt
import { describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ShippingZoneFormDialog from './ShippingZoneFormDialog.vue'

/**
 * UModal teleports its content out of the component's DOM subtree, so
 * `wrapper.text()` doesn't see the modal body. Assertions read from
 * `document.body.textContent`, same as `CategoryFormModal.spec.ts`.
 */

const AXE_OPTIONS = {
  rules: {
    'region': { enabled: false },
    'label': { enabled: false },
    'button-name': { enabled: false },
    'aria-hidden-focus': { enabled: false },
    'aria-dialog-name': { enabled: false },
    'label-title-only': { enabled: false },
  },
}

const { createMutate, updateMutate } = vi.hoisted(() => ({
  createMutate: vi.fn().mockResolvedValue({}),
  updateMutate: vi.fn().mockResolvedValue({}),
}))

mockNuxtImport('useCreateShippingZone', () => () => ({
  mutateAsync: createMutate,
  isLoading: { value: false },
}))
mockNuxtImport('useUpdateShippingZone', () => () => ({
  mutateAsync: updateMutate,
  isLoading: { value: false },
}))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

describe('AdminShippingZoneFormDialog', () => {
  it('renders create mode header when no zone is provided', async () => {
    await mountSuspended(ShippingZoneFormDialog, { props: { open: true, zone: null } })
    expect(document.body.textContent).toContain('New shipping zone')
  })

  it('renders edit mode header when a zone is provided', async () => {
    const zone = {
      id: 1, name: 'Poland Zone', country_count: 1, rate_count: 0, sort_order: 0,
      is_active: true, description: null,
      created_at: '2026-05-30T00:00:00Z', updated_at: '2026-05-30T00:00:00Z',
    }
    await mountSuspended(ShippingZoneFormDialog, {
      props: { open: true, zone, initialCountryCodes: ['PL'] },
    })
    expect(document.body.textContent).toContain('Edit shipping zone')
  })

  it('is axe-clean', async () => {
    await mountSuspended(ShippingZoneFormDialog, { props: { open: true, zone: null } })
    const results = await axe(document.body, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })

  it('renders the dim_divisor field with its courier-standard hint', async () => {
    await mountSuspended(ShippingZoneFormDialog, { props: { open: true, zone: null } })
    expect(document.body.textContent).toContain('Volumetric weight divisor')
    // The hint mentions both common standards so admins can pick.
    expect(document.body.textContent).toMatch(/5000/)
    expect(document.body.textContent).toMatch(/6000/)
  })

  it('passes dim_divisor through to the update mutation on save', async () => {
    updateMutate.mockClear()
    // Clear teleported leftover modal content from prior tests so we click
    // *this* test's Save button (UModal renders into document.body and
    // mountSuspended doesn't unmount cleanly between tests).
    document.body.innerHTML = ''
    const zone = {
      id: 1, name: 'PL Zone', country_count: 1, rate_count: 0, sort_order: 0,
      is_active: true, description: null, dim_divisor: 5000,
      created_at: '2026-05-30T00:00:00Z', updated_at: '2026-05-30T00:00:00Z',
    }
    await mountSuspended(ShippingZoneFormDialog, {
      props: { open: true, zone, initialCountryCodes: ['PL'] },
    })
    await new Promise(r => setTimeout(r, 0))
    const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[]
    const saveButton = buttons.find(b => b.textContent?.trim() === 'Save')
    expect(saveButton).toBeTruthy()
    saveButton!.click()
    await new Promise(r => setTimeout(r, 0))
    expect(updateMutate).toHaveBeenCalled()
    const patch = updateMutate.mock.calls.at(-1)![0].patch
    expect(patch.dim_divisor).toBe(5000)
  })

  it('passes null dim_divisor through on save when none is set (legacy zone path)', async () => {
    createMutate.mockClear()
    document.body.innerHTML = ''
    await mountSuspended(ShippingZoneFormDialog, {
      props: { open: true, zone: null },
    })
    await new Promise(r => setTimeout(r, 0))
    const textInputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[]
    expect(textInputs.length).toBeGreaterThan(0)
    const nameInput = textInputs[0]!
    nameInput.value = 'New EU Zone'
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[]
    const saveButton = buttons.find(b => b.textContent?.trim() === 'Save')
    saveButton!.click()
    await new Promise(r => setTimeout(r, 0))
    expect(createMutate).toHaveBeenCalled()
    const body = createMutate.mock.calls.at(-1)![0]
    expect(body.dim_divisor).toBeNull()
  })
})
