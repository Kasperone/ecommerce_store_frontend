// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import StaffRoleDialog from './StaffRoleDialog.vue'

/**
 * The dialog owns the role/active update mutation + the success toast. We stub
 * the auto-imported mutation/toast and assert: prefill from the member prop, the
 * PATCH payload on save, the backend guard message (self-lockout /
 * last-active-admin) surfacing via ErrorAlert with no toast, and a11y.
 * URL/verb mapping is pinned in the query spec.
 */

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
    'label': { enabled: false },
    // USwitch renders button[role=switch] wrapping a visually-hidden input —
    // axe flags it as nested-interactive (library artifact). Same as warehouses.
    'nested-interactive': { enabled: false },
  },
}

const { updateMutate, toastAdd } = vi.hoisted(() => ({
  updateMutate: vi.fn(),
  toastAdd: vi.fn(),
}))

mockNuxtImport('useUpdateStaff', () => () => ({
  mutateAsync: updateMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

beforeEach(() => {
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

const tick = () => new Promise(r => setTimeout(r, 0))

const member = {
  id: 7,
  email: 'admin@example.com',
  first_name: 'Ada',
  last_name: 'Lovelace',
  role: 'ADMIN' as const,
  is_active: true,
  is_verified: true,
  is_owner: false,
  capabilities: [],
  created_at: '2026-05-28T00:00:00Z',
  updated_at: '2026-05-28T00:00:00Z',
}

describe('StaffRoleDialog', () => {
  it('shows the member name in the title and prefills the email', async () => {
    await mountSuspended(StaffRoleDialog, { props: { open: true, member } })
    expect(document.body.textContent).toContain('Ada Lovelace')
    expect(document.body.textContent).toContain('admin@example.com')
  })

  it('is axe-clean when open', async () => {
    await mountSuspended(StaffRoleDialog, { props: { open: true, member } })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })

  it('sends the current role + active state on save (PATCH payload)', async () => {
    await mountSuspended(StaffRoleDialog, { props: { open: true, member } })

    clickSave()
    await tick()

    expect(updateMutate).toHaveBeenCalledTimes(1)
    const { userId, patch } = updateMutate.mock.calls[0]![0]
    expect(userId).toBe(7)
    expect(patch).toMatchObject({ role: 'ADMIN', is_active: true })
    expect(toastAdd).toHaveBeenCalled()
  })

  it('sends the edited role + active state on save', async () => {
    const wrapper = await mountSuspended(StaffRoleDialog, {
      props: { open: true, member },
    })
    // Demote to CUSTOMER and deactivate.
    wrapper.findAllComponents({ name: 'USelect' })[0]!.vm.$emit('update:modelValue', 'CUSTOMER')
    wrapper.findAllComponents({ name: 'USwitch' })[0]!.vm.$emit('update:modelValue', false)
    await tick()

    clickSave()
    await tick()

    const { patch } = updateMutate.mock.calls[0]![0]
    expect(patch).toMatchObject({ role: 'CUSTOMER', is_active: false })
  })

  it('surfaces the backend guard message (self-lockout) inline + as an error toast', async () => {
    updateMutate.mockRejectedValue({
      data: { detail: 'You cannot demote or deactivate your own account.' },
    })
    await mountSuspended(StaffRoleDialog, { props: { open: true, member } })

    clickSave()
    await tick()

    // Gold-standard flow: the guard message surfaces inline (role=alert) + a toast.
    expect(document.querySelector('[role="alert"]')).toBeTruthy()
    expect(document.body.textContent).toContain(
      'You cannot demote or deactivate your own account.',
    )
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  })

  it('surfaces the last-active-admin guard message', async () => {
    updateMutate.mockRejectedValue({
      data: { detail: 'Cannot demote the last active admin.' },
    })
    await mountSuspended(StaffRoleDialog, { props: { open: true, member } })

    clickSave()
    await tick()

    expect(document.body.textContent).toContain('Cannot demote the last active admin.')
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  })
})
