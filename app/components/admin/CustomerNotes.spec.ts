// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import CustomerNotes from './CustomerNotes.vue'

/**
 * The notes panel owns its query + create/update/delete mutations and the
 * success toast, so we stub those auto-imports and assert the panel's own
 * rendering + add flow + a11y. URL/verb mapping is pinned in
 * useCustomerNoteQueries.spec.ts.
 *
 * `mocks` holds plain values in vi.hoisted (the factories run after the `vue`
 * import, so `ref()` is created inside them, not in hoisted).
 */

// `region` is a page-level landmark rule — N/A to an isolated card (it sits
// inside the page's <main> in production). Disabled like the other card specs.
const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
    'region': { enabled: false },
  },
}

const mocks = vi.hoisted(() => ({
  notes: [] as unknown[],
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  deleteMutate: vi.fn(),
  toastAdd: vi.fn(),
}))

mockNuxtImport('useCustomerNotesQuery', () => () => ({
  data: ref(mocks.notes),
  isLoading: ref(false),
  error: ref(null),
}))
mockNuxtImport('useCreateNote', () => () => ({ mutateAsync: mocks.createMutate, isLoading: ref(false) }))
mockNuxtImport('useUpdateNote', () => () => ({ mutateAsync: mocks.updateMutate, isLoading: ref(false) }))
mockNuxtImport('useDeleteNote', () => () => ({ mutateAsync: mocks.deleteMutate, isLoading: ref(false) }))
mockNuxtImport('useToast', () => () => ({ add: mocks.toastAdd }))

function note(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    body: 'VIP customer',
    author_id: 2,
    author_name: 'Ada M.',
    created_at: '2026-05-27T10:00:00',
    updated_at: '2026-05-27T10:00:00',
    ...overrides,
  }
}

beforeEach(() => {
  mocks.notes = []
  mocks.createMutate.mockReset().mockResolvedValue({})
  mocks.updateMutate.mockReset().mockResolvedValue({})
  mocks.deleteMutate.mockReset().mockResolvedValue({})
  mocks.toastAdd.mockReset()
  document.body.innerHTML = ''
})

describe('CustomerNotes (AdminCustomerNotes)', () => {
  it('shows the empty state when there are no notes', async () => {
    const wrapper = await mountSuspended(CustomerNotes, { props: { customerId: 1 } })
    expect(wrapper.text()).toContain('No notes yet.')
  })

  it('renders notes with author attribution', async () => {
    mocks.notes = [note({ body: 'Handle with care' })]
    const wrapper = await mountSuspended(CustomerNotes, { props: { customerId: 1 } })
    expect(wrapper.text()).toContain('Handle with care')
    expect(wrapper.text()).toContain('Ada M.')
  })

  it('is axe-clean', async () => {
    mocks.notes = [note()]
    const wrapper = await mountSuspended(CustomerNotes, { props: { customerId: 1 } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })

  it('creates a note from the textarea and toasts', async () => {
    const wrapper = await mountSuspended(CustomerNotes, { props: { customerId: 3 } })
    const textarea = wrapper.findAllComponents({ name: 'UTextarea' })[0]
    textarea!.vm.$emit('update:modelValue', 'New note body')
    await new Promise(r => setTimeout(r, 0))

    const addBtn = wrapper.findAll('button').find(b => b.text().trim() === 'Add note')
    await addBtn!.trigger('click')
    await new Promise(r => setTimeout(r, 0))

    expect(mocks.createMutate).toHaveBeenCalledWith({ customerId: 3, body: { body: 'New note body' } })
    expect(mocks.toastAdd).toHaveBeenCalled()
  })
})
