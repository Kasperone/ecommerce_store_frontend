// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import TagManagerDialog from './TagManagerDialog.vue'

/**
 * The vocabulary-manager modal owns the tags query + create/update/delete. We
 * stub those and assert: the vocabulary renders with usage counts, the create
 * flow fires, and a11y. URL/verb mapping is pinned in useTagQueries.spec.ts.
 *
 * `aria-hidden-focus` is disabled for the reka-ui open-transition timing reason
 * documented in AdminFormModal.spec.ts; `region` for the isolated-mount reason.
 */

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
    'region': { enabled: false },
  },
}

const mocks = vi.hoisted(() => ({
  tags: [] as unknown[],
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  deleteMutate: vi.fn(),
  toastAdd: vi.fn(),
}))

mockNuxtImport('useTagsQuery', () => () => ({ data: ref(mocks.tags), isLoading: ref(false) }))
mockNuxtImport('useCreateTag', () => () => ({ mutateAsync: mocks.createMutate, isLoading: ref(false) }))
mockNuxtImport('useUpdateTag', () => () => ({ mutateAsync: mocks.updateMutate, isLoading: ref(false) }))
mockNuxtImport('useDeleteTag', () => () => ({ mutateAsync: mocks.deleteMutate, isLoading: ref(false) }))
mockNuxtImport('useToast', () => () => ({ add: mocks.toastAdd }))

beforeEach(() => {
  mocks.tags = []
  mocks.createMutate.mockReset().mockResolvedValue({})
  mocks.updateMutate.mockReset().mockResolvedValue({})
  mocks.deleteMutate.mockReset().mockResolvedValue({})
  mocks.toastAdd.mockReset()
  document.body.innerHTML = ''
})

describe('TagManagerDialog (AdminTagManagerDialog)', () => {
  it('renders the vocabulary with usage counts', async () => {
    mocks.tags = [{ id: 1, name: 'VIP', color: '#3b82f6', usage_count: 3 }]
    await mountSuspended(TagManagerDialog, { props: { open: true } })
    expect(document.body.textContent).toContain('VIP')
    expect(document.body.textContent).toContain('Used by 3')
  })

  it('is axe-clean when open', async () => {
    mocks.tags = [{ id: 1, name: 'VIP', color: '#3b82f6', usage_count: 0 }]
    await mountSuspended(TagManagerDialog, { props: { open: true } })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })

  it('creates a tag from the name input', async () => {
    const wrapper = await mountSuspended(TagManagerDialog, { props: { open: true } })
    const input = wrapper.findAllComponents({ name: 'UInput' })[0]
    input!.vm.$emit('update:modelValue', 'wholesale')
    await new Promise(r => setTimeout(r, 0))

    const createBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Create',
    ) as HTMLButtonElement | undefined
    createBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))

    expect(mocks.createMutate).toHaveBeenCalledWith({ name: 'wholesale', color: null })
    expect(mocks.toastAdd).toHaveBeenCalled()
  })
})
