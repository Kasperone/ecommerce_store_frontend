// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * The staff page renders the roster and wires the role/active edit dialog.
 * We stub the list query, the auth store, the dialog child, and the Nuxt UI
 * components (they pull in providers mountSuspended doesn't wire for raw
 * pages). The PATCH payload + guard-message rendering are pinned in the dialog
 * spec; here we assert list render, the "you" self badge, and that clicking a
 * row's edit button opens the dialog with that member.
 */

// `vi.hoisted` runs above imports, so we can't construct `ref()` here (the
// banked vitest-hoisted-ref gotcha). We hoist a plain mutable holder and lazily
// fill in real refs from module scope inside the mock factory's returned
// function (called later, at import time).
const holder = vi.hoisted(() => ({
  data: null as unknown,
  error: null as unknown,
}))

const ROSTER = {
  items: [
    {
      id: 1,
      email: 'admin@example.com',
      first_name: 'Ada',
      last_name: 'Lovelace',
      role: 'ADMIN',
      is_active: true,
      is_verified: true,
      created_at: '2026-05-28T00:00:00Z',
      updated_at: '2026-05-28T00:00:00Z',
    },
    {
      id: 2,
      email: 'grace@example.com',
      first_name: 'Grace',
      last_name: 'Hopper',
      role: 'ADMIN',
      is_active: false,
      is_verified: false,
      created_at: '2026-05-29T00:00:00Z',
      updated_at: '2026-05-29T00:00:00Z',
    },
  ],
  total: 2,
  page: 1,
  page_size: 20,
  pages: 1,
}

const staffData = ref<unknown>(ROSTER)
const staffError = ref<unknown>(null)
holder.data = staffData
holder.error = staffError

vi.mock('~/composables/queries/useStaffQueries', () => ({
  useStaffQuery: () => ({ data: holder.data, error: holder.error }),
  useUpdateStaff: () => ({ isLoading: ref(false), mutateAsync: vi.fn() }),
}))

// The acting admin is admin@example.com → row 1 gets the "you" badge.
mockNuxtImport('useAuthStore', () => () => ({
  user: { email: 'admin@example.com' },
}))

// Capture what the dialog is opened with.
const dialogProps = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }))
const DialogStub = defineComponent({
  name: 'AdminStaffRoleDialog',
  props: { open: { type: Boolean }, member: { type: Object, default: null } },
  setup(props) {
    return () => {
      dialogProps.value = { open: props.open, member: props.member }
      return h('div', { 'data-testid': 'dialog-stub' })
    }
  },
})

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const ButtonStub = defineComponent({
  props: { ariaLabel: { type: String, default: '' } },
  emits: ['click'],
  setup(props, { emit, slots }) {
    return () => h('button', {
      'aria-label': props.ariaLabel,
      'onClick': () => emit('click'),
    }, slots.default?.())
  },
})

// A minimal UTable stub that renders each row's name/email/actions slots so we
// can assert content + drive the per-row edit button without the real table.
const TableStub = defineComponent({
  name: 'UTable',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h('table', {}, (props.data as Record<string, unknown>[]).map(row =>
      h('tr', { key: row.id as number }, [
        h('td', {}, slots['name-cell']?.({ row: { original: row } })),
        h('td', {}, slots['email-cell']?.({ row: { original: row } })),
        h('td', {}, slots['role-cell']?.({ row: { original: row } })),
        h('td', {}, slots['is_active-cell']?.({ row: { original: row } })),
        h('td', {}, slots['actions-cell']?.({ row: { original: row } })),
      ]),
    ))
  },
})

beforeEach(() => {
  staffData.value = ROSTER
  staffError.value = null
  dialogProps.value = null
})

async function mountPage() {
  const Page = (await import('./index.vue')).default
  return await mountSuspended(Page, {
    global: {
      stubs: {
        NuxtLayout: PassThroughStub,
        UButton: ButtonStub,
        UTable: TableStub,
        UFormField: PassThroughStub,
        UInput: true,
        UPagination: true,
        UBadge: PassThroughStub,
        AdminStaffRoleDialog: DialogStub,
      },
    },
  })
}

describe('admin/staff page', () => {
  it('renders each staff member from the roster', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.text()).toContain('admin@example.com')
    expect(wrapper.text()).toContain('Grace Hopper')
    expect(wrapper.text()).toContain('grace@example.com')
  })

  it('flags the acting admin\'s own row with the "you" badge', async () => {
    const wrapper = await mountPage()
    // The "You" badge text appears exactly once (only on the matching email).
    const youCount = wrapper.text().split('You').length - 1
    expect(youCount).toBe(1)
  })

  it('opens the edit dialog with the clicked member', async () => {
    const wrapper = await mountPage()
    const editButtons = wrapper.findAll('button[aria-label="Edit role"]')
    expect(editButtons.length).toBe(2)
    await editButtons[1]!.trigger('click')

    expect(dialogProps.value?.open).toBe(true)
    expect((dialogProps.value?.member as { id: number }).id).toBe(2)
  })

  it('renders the list error via ErrorAlert', async () => {
    staffError.value = { data: { detail: 'Boom' } }
    const wrapper = await mountPage()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Boom')
  })
})
