// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import type { VueWrapper } from '@vue/test-utils'
import MemberTable from './MemberTable.vue'
import type { CompanyMemberResponse } from '~/composables/queries/useTeam'

/**
 * Stateless team roster table (renders inline — assert against the wrapper). We
 * assert one row per member, role + status badges, that the admin view exposes
 * the per-row controls (role select, suspend/reactivate, remove) and emits the
 * right intent, that the non-admin view is read-only (no controls), and that
 * headers are real `<th scope="col">` (axe-clean).
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
    user_email: 'buyer@co.com',
    user_name: 'Bea Buyer',
    ...over,
  }
}

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function buttonsByText(wrapper: VueWrapper, text: string): HTMLButtonElement[] {
  return [...wrapper.element.querySelectorAll('button')].filter(
    b => b.textContent?.trim() === text,
  ) as HTMLButtonElement[]
}

describe('AccountTeamMemberTable', () => {
  it('renders one row per member with name + role + status', async () => {
    const wrapper = await mountSuspended(MemberTable, {
      props: {
        members: [
          makeMember({ id: 1, user_name: 'Bea Buyer', role: 'BUYER', status: 'active' }),
          makeMember({ id: 2, user_name: 'Adam Admin', role: 'COMPANY_ADMIN', status: 'invited' }),
        ],
      },
    })
    const text = wrapper.text()
    expect(text).toContain('Bea Buyer')
    expect(text).toContain('Adam Admin')
    expect(text).toContain('Admin')
    expect(text).toContain('Buyer')
    expect(text).toContain('Active')
    expect(text).toContain('Invited')
  })

  it('falls back to the email then a label when no name', async () => {
    const wrapper = await mountSuspended(MemberTable, {
      props: { members: [makeMember({ user_name: null, user_email: 'only@co.com' })] },
    })
    expect(wrapper.text()).toContain('only@co.com')
  })

  // --- Admin (canManage) view -------------------------------------------------
  it('shows the role select for each row when canManage', async () => {
    const wrapper = await mountSuspended(MemberTable, {
      props: { members: [makeMember()], canManage: true },
    })
    expect(wrapper.findComponent({ name: 'USelect' }).exists()).toBe(true)
  })

  it('shows suspend + remove on an active member when canManage', async () => {
    const wrapper = await mountSuspended(MemberTable, {
      props: { members: [makeMember({ status: 'active' })], canManage: true },
    })
    expect(buttonsByText(wrapper, 'Suspend')).toHaveLength(1)
    expect(buttonsByText(wrapper, 'Remove')).toHaveLength(1)
    expect(buttonsByText(wrapper, 'Reactivate')).toHaveLength(0)
  })

  it('shows reactivate instead of suspend on a suspended member', async () => {
    const wrapper = await mountSuspended(MemberTable, {
      props: { members: [makeMember({ status: 'suspended' })], canManage: true },
    })
    expect(buttonsByText(wrapper, 'Reactivate')).toHaveLength(1)
    expect(buttonsByText(wrapper, 'Suspend')).toHaveLength(0)
  })

  it('emits suspend with the member', async () => {
    const member = makeMember({ id: 11, status: 'active' })
    const wrapper = await mountSuspended(MemberTable, {
      props: { members: [member], canManage: true },
    })
    buttonsByText(wrapper, 'Suspend')[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('suspend')?.[0]?.[0]).toMatchObject({ id: 11 })
  })

  it('emits reactivate with the member', async () => {
    const member = makeMember({ id: 12, status: 'suspended' })
    const wrapper = await mountSuspended(MemberTable, {
      props: { members: [member], canManage: true },
    })
    buttonsByText(wrapper, 'Reactivate')[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('reactivate')?.[0]?.[0]).toMatchObject({ id: 12 })
  })

  it('emits remove with the member', async () => {
    const member = makeMember({ id: 13 })
    const wrapper = await mountSuspended(MemberTable, {
      props: { members: [member], canManage: true },
    })
    buttonsByText(wrapper, 'Remove')[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('remove')?.[0]?.[0]).toMatchObject({ id: 13 })
  })

  it('emits change-role when the role select changes', async () => {
    const member = makeMember({ id: 14, role: 'BUYER' })
    const wrapper = await mountSuspended(MemberTable, {
      props: { members: [member], canManage: true },
    })
    // Drive the USelect's underlying change through the component event (happy-dom
    // can't operate the Reka listbox); the table maps it to change-role.
    wrapper.findComponent({ name: 'USelect' }).vm.$emit('update:modelValue', 'COMPANY_ADMIN')
    await new Promise(r => setTimeout(r, 0))
    const emitted = wrapper.emitted('change-role')
    expect(emitted).toBeTruthy()
    expect(emitted![0]![0]).toMatchObject({ role: 'COMPANY_ADMIN' })
    expect((emitted![0]![0] as { member: CompanyMemberResponse }).member.id).toBe(14)
  })

  it('does not emit change-role when the role is unchanged', async () => {
    const wrapper = await mountSuspended(MemberTable, {
      props: { members: [makeMember({ role: 'BUYER' })], canManage: true },
    })
    wrapper.findComponent({ name: 'USelect' }).vm.$emit('update:modelValue', 'BUYER')
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('change-role')).toBeFalsy()
  })

  it('disables a row\'s controls while it is busy', async () => {
    const wrapper = await mountSuspended(MemberTable, {
      props: { members: [makeMember({ id: 3, status: 'active' })], canManage: true, busyId: 3 },
    })
    expect(buttonsByText(wrapper, 'Remove')[0]!.disabled).toBe(true)
  })

  // --- Non-admin (read-only) view ---------------------------------------------
  it('renders read-only (no controls) for a non-admin', async () => {
    const wrapper = await mountSuspended(MemberTable, {
      props: { members: [makeMember({ status: 'active' })], canManage: false },
    })
    expect(wrapper.findComponent({ name: 'USelect' }).exists()).toBe(false)
    expect(buttonsByText(wrapper, 'Suspend')).toHaveLength(0)
    expect(buttonsByText(wrapper, 'Remove')).toHaveLength(0)
  })

  it('still shows the role as a badge for a non-admin', async () => {
    const wrapper = await mountSuspended(MemberTable, {
      props: { members: [makeMember({ role: 'COMPANY_ADMIN' })], canManage: false },
    })
    expect(wrapper.text()).toContain('Admin')
  })

  // --- States -----------------------------------------------------------------
  it('shows an empty state when there are no members', async () => {
    const wrapper = await mountSuspended(MemberTable, { props: { members: [] } })
    expect(wrapper.find('[data-testid="team-empty"]').exists()).toBe(true)
  })

  it('shows a loading state when loading with no rows', async () => {
    const wrapper = await mountSuspended(MemberTable, {
      props: { members: [], loading: true },
    })
    expect(wrapper.text()).toContain('Loading members')
  })

  it('has accessible table headers and is axe-clean', async () => {
    const wrapper = await mountSuspended(MemberTable, {
      props: {
        members: [makeMember({ id: 1 }), makeMember({ id: 2, status: 'suspended' })],
        canManage: true,
      },
    })
    const table = wrapper.element.querySelector('table') as HTMLElement
    expect(table).toBeTruthy()
    expect(table.querySelectorAll('th[scope="col"]').length).toBeGreaterThan(0)
    expect(await axe(table, AXE_OPTIONS)).toHaveNoViolations()
  })
})
