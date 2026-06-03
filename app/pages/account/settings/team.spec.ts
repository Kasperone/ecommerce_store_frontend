// @vitest-environment nuxt
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { CompanyMemberResponse } from '~/composables/queries/useTeam'

/**
 * Company team management page. Any active member reads the roster; only a
 * COMPANY_ADMIN sees the invite form + per-row controls (gated on
 * `useCompanyContext().company.role`). The page surfaces the backend errors as
 * friendly copy: invite-to-an-unregistered-email → pending success (D-D-7);
 * last-admin 409 → "cannot demote/suspend/remove the last admin". The company
 * context, the roster query and the mutations are mocked at their auto-import /
 * module boundaries.
 */

function makeMember(over: Partial<CompanyMemberResponse> = {}): CompanyMemberResponse {
  return {
    id: 1,
    created_at: '2026-06-01T10:00:00Z',
    updated_at: '2026-06-01T10:00:00Z',
    company_id: 3,
    user_id: 7,
    role: 'BUYER',
    status: 'active',
    invited_email: null,
    invited_at: null,
    user_email: 'bea@co.com',
    user_name: 'Bea Buyer',
    ...over,
  }
}

const ROSTER: CompanyMemberResponse[] = [
  makeMember({ id: 1, user_name: 'Adam Admin', role: 'COMPANY_ADMIN', status: 'active' }),
  makeMember({ id: 2, user_name: 'Bea Buyer', role: 'BUYER', status: 'active' }),
]

// --- Mocked reactive state shared across the suite ---------------------------
const membersData = ref<CompanyMemberResponse[] | undefined>(ROSTER)
const isB2B = ref(true)
const isResolving = ref(false)
const companyRef = ref<{ role: string } | null>({ role: 'COMPANY_ADMIN' })

const inviteMutate = vi.fn()
const updateMutate = vi.fn()
const removeMutate = vi.fn()

// Partial mock: keep the real presentation helpers (COMPANY_ROLES etc., which the
// table imports) and override only the Colada hooks.
vi.mock('~/composables/queries/useTeam', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/composables/queries/useTeam')>()
  return {
    ...actual,
    useTeamQuery: () => ({ data: membersData, error: ref(null) }),
    useInviteMember: () => ({ mutateAsync: inviteMutate }),
    useUpdateMember: () => ({ mutateAsync: updateMutate }),
    useRemoveMember: () => ({ mutateAsync: removeMutate }),
  }
})

mockNuxtImport('useCompanyContext', () => () => ({
  company: companyRef,
  isB2B,
  isResolving,
  error: ref(null),
}))

const toastAdd = vi.fn()
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

// Track the mounted page so afterEach can unmount it BEFORE wiping the body —
// tearing down an open teleported modal after the body is cleared crashes Vue's
// unmount (nextSibling/type null; Wave-B banked gotcha).
let pageWrapper: Awaited<ReturnType<typeof mountSuspended>> | null = null

async function mountPage() {
  const Page = (await import('./team.vue')).default
  pageWrapper = await mountSuspended(Page, { global: { stubs: { NuxtLayout: PassThroughStub } } })
  return pageWrapper
}

function buttonsByText(root: { querySelectorAll: typeof document.querySelectorAll }, text: string) {
  return [...root.querySelectorAll('button')].filter(
    b => b.textContent?.trim() === text,
  ) as HTMLButtonElement[]
}

beforeEach(() => {
  membersData.value = ROSTER
  isB2B.value = true
  isResolving.value = false
  companyRef.value = { role: 'COMPANY_ADMIN' }
  inviteMutate.mockReset().mockResolvedValue({ id: 99 })
  updateMutate.mockReset().mockResolvedValue({ id: 1 })
  removeMutate.mockReset().mockResolvedValue(undefined)
  toastAdd.mockReset()
})

afterEach(() => {
  pageWrapper?.unmount()
  pageWrapper = null
  document.body.innerHTML = ''
})

describe('account team page', () => {
  it('renders the roster members', async () => {
    const wrapper = await mountPage()
    const text = wrapper.text()
    expect(text).toContain('Adam Admin')
    expect(text).toContain('Bea Buyer')
  })

  it('shows the invite form for a COMPANY_ADMIN', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('input[type="email"]').exists()).toBe(true)
  })

  it('hides the invite form and shows a read-only notice for a BUYER', async () => {
    companyRef.value = { role: 'BUYER' }
    const wrapper = await mountPage()
    expect(wrapper.find('input[type="email"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('View only')
  })

  it('shows no per-row controls for a non-admin', async () => {
    companyRef.value = { role: 'VIEWER' }
    const wrapper = await mountPage()
    expect(buttonsByText(wrapper.element, 'Remove')).toHaveLength(0)
    expect(buttonsByText(wrapper.element, 'Suspend')).toHaveLength(0)
  })

  it('shows the not-B2B notice for a non-business account', async () => {
    isB2B.value = false
    companyRef.value = null
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="not-b2b"]').exists()).toBe(true)
  })

  // --- Invite ----------------------------------------------------------------
  it('calls the invite mutation on a valid submit', async () => {
    const wrapper = await mountPage()
    await wrapper.find('input[type="email"]').setValue('new@co.com')
    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))
    expect(inviteMutate).toHaveBeenCalledWith({ email: 'new@co.com', role: 'BUYER' })
  })

  it('treats an invite to an unregistered email as a pending success (D-D-7)', async () => {
    // The backend no longer 404s an unknown email — it stages a pending invite
    // (user_id null), bound to the account when that address registers.
    inviteMutate.mockResolvedValue({ id: 100, user_id: null })
    const wrapper = await mountPage()
    await wrapper.find('input[type="email"]').setValue('ghost@co.com')
    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    expect(inviteMutate).toHaveBeenCalledWith({ email: 'ghost@co.com', role: 'BUYER' })
    // A pending-specific success toast fires; no inline error is shown.
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'success',
        title: expect.stringContaining('once they create an account'),
      }),
    )
  })

  it('surfaces a friendly "already a member" message on a 409 invite', async () => {
    inviteMutate.mockRejectedValue({ status: 409, data: { detail: 'already a member' } })
    const wrapper = await mountPage()
    await wrapper.find('input[type="email"]').setValue('dup@co.com')
    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('already a member')
  })

  // --- Role change -----------------------------------------------------------
  it('calls the update mutation when a role select changes', async () => {
    const wrapper = await mountPage()
    const selects = wrapper.findAllComponents({ name: 'USelect' })
    // The roster role selects come after the invite-form role select (index 0).
    const rosterSelect = selects[selects.length - 1]!
    rosterSelect.vm.$emit('update:modelValue', 'COMPANY_ADMIN')
    await new Promise(r => setTimeout(r, 0))
    expect(updateMutate).toHaveBeenCalled()
    const arg = updateMutate.mock.calls[0]![0]
    expect(arg.patch).toMatchObject({ role: 'COMPANY_ADMIN' })
  })

  it('surfaces the last-admin 409 as a friendly message on a role change', async () => {
    updateMutate.mockRejectedValue({ status: 409, data: { detail: 'Cannot demote the last company admin' } })
    const wrapper = await mountPage()
    const selects = wrapper.findAllComponents({ name: 'USelect' })
    selects[selects.length - 1]!.vm.$emit('update:modelValue', 'VIEWER')
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('last company admin')
  })

  // --- Remove via confirm modal ----------------------------------------------
  it('opens the confirm modal and removes on confirm', async () => {
    const wrapper = await mountPage()
    // The first roster row's Remove button → ROSTER[0] (id 1).
    buttonsByText(wrapper.element, 'Remove')[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    // The teleported modal lives in document.body.
    expect(document.body.textContent).toContain('Remove member')
    const confirmBtn = buttonsByText(document, 'Remove').find(
      b => b.closest('[role="dialog"]'),
    )
    confirmBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(removeMutate).toHaveBeenCalledWith(1)
  })

  it('opens the confirm modal and suspends on confirm', async () => {
    const wrapper = await mountPage()
    // Suspend the second row (Bea Buyer, id 2 — not an admin, no last-admin guard).
    buttonsByText(wrapper.element, 'Suspend')[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(document.body.textContent).toContain('Suspend member')
    const confirmBtn = buttonsByText(document, 'Suspend').find(
      b => b.closest('[role="dialog"]'),
    )
    confirmBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(updateMutate).toHaveBeenCalledWith({ id: 2, patch: { status: 'suspended' } })
  })

  it('declares the \'user\' middleware', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/pages/account/settings/team.vue'), 'utf-8')
    expect(src).toMatch(/middleware:\s*'user'/)
  })
})
