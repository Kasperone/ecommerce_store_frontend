// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import SegmentFormModal from './SegmentFormModal.vue'

/**
 * The modal owns the create/update mutations, the success toast, the structured
 * filter builder, and the client-side currency-required rule (currency mandatory
 * when min_total_spent is set — mirrors the backend 422). We stub the
 * auto-imported mutations/preview/toast and assert: create-vs-edit title,
 * prefill, the create payload (filters omit empty keys), the currency-required
 * guard, and that the preview helper is called when filters change. URL/verb
 * mapping is pinned in the query spec.
 */

const { createMutate, updateMutate, previewFilters, previewSaved, toastAdd, apiFetch }
  = vi.hoisted(() => ({
    createMutate: vi.fn(),
    updateMutate: vi.fn(),
    previewFilters: vi.fn(),
    previewSaved: vi.fn(),
    toastAdd: vi.fn(),
    apiFetch: vi.fn(),
  }))

mockNuxtImport('useCreateSegment', () => () => ({
  mutateAsync: createMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useUpdateSegment', () => () => ({
  mutateAsync: updateMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useSegmentPreview', () => () => ({ previewFilters, previewSaved }))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))
mockNuxtImport('useApi', () => () => ({ apiFetch }))

beforeEach(() => {
  createMutate.mockReset().mockResolvedValue({})
  updateMutate.mockReset().mockResolvedValue({})
  previewFilters.mockReset().mockResolvedValue({ count: 3, sample: [] })
  previewSaved.mockReset().mockResolvedValue({ count: 0, sample: [] })
  toastAdd.mockReset()
  apiFetch.mockReset().mockResolvedValue([])
  document.body.innerHTML = ''
})

function clickSave() {
  const saveBtn = [...document.querySelectorAll('button')].find(
    b => b.textContent?.trim() === 'Save',
  ) as HTMLButtonElement | undefined
  saveBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

const tick = () => new Promise(r => setTimeout(r, 0))

const existing = {
  id: 7,
  name: 'VIP buyers',
  description: 'High spenders',
  is_active: true,
  filters: { tag_match: 'any' as const, min_order_count: 5 },
  created_at: '2026-05-28T00:00:00Z',
  updated_at: '2026-05-28T00:00:00Z',
}

describe('SegmentFormModal', () => {
  it('shows the create title when no segment is passed', async () => {
    await mountSuspended(SegmentFormModal, { props: { open: true, segment: null } })
    expect(document.body.textContent).toContain('New segment')
  })

  it('prefills and shows the edit title when a segment is passed', async () => {
    await mountSuspended(SegmentFormModal, { props: { open: true, segment: existing } })
    expect(document.body.textContent).toContain('Edit segment')
    const values = [...document.querySelectorAll('input')].map(i => i.value)
    expect(values).toContain('VIP buyers')
  })

  it('runs a live preview when the modal opens', async () => {
    await mountSuspended(SegmentFormModal, { props: { open: true, segment: null } })
    await tick()
    expect(previewFilters).toHaveBeenCalled()
    expect(document.body.textContent).toContain('Matches 3 customers')
  })

  it('rejects an empty name without calling the mutation', async () => {
    await mountSuspended(SegmentFormModal, { props: { open: true, segment: null } })
    await tick()

    clickSave()
    await tick()

    expect(createMutate).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Name is required.')
  })

  it('requires a currency when a min total spent is set', async () => {
    const wrapper = await mountSuspended(SegmentFormModal, {
      props: { open: true, segment: null },
    })
    // name input is UInput[0].
    wrapper.findAllComponents({ name: 'UInput' })[0]!.vm.$emit('update:modelValue', 'Spenders')
    // The min_total_spent control is the third UInputNumber (min/max order, then spend).
    const numbers = wrapper.findAllComponents({ name: 'UInputNumber' })
    numbers[2]!.vm.$emit('update:modelValue', 100)
    await tick()

    clickSave()
    await tick()

    expect(createMutate).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('A currency is required')
  })

  it('creates a segment with a filter body that omits empty keys', async () => {
    const wrapper = await mountSuspended(SegmentFormModal, {
      props: { open: true, segment: null },
    })
    wrapper.findAllComponents({ name: 'UInput' })[0]!.vm.$emit('update:modelValue', 'Frequent')
    wrapper.findAllComponents({ name: 'UInputNumber' })[0]!.vm.$emit('update:modelValue', 5)
    await tick()

    clickSave()
    await tick()

    expect(createMutate).toHaveBeenCalledTimes(1)
    const body = createMutate.mock.calls[0]![0]
    expect(body.name).toBe('Frequent')
    expect(body.filters).toMatchObject({ tag_match: 'any', min_order_count: 5 })
    // No spend set ⇒ no currency / min_total_spent keys.
    expect(body.filters.currency).toBeUndefined()
    expect(body.filters.min_total_spent).toBeUndefined()
    expect(toastAdd).toHaveBeenCalled()
  })

  it('updates an existing segment on save (PATCH payload)', async () => {
    const wrapper = await mountSuspended(SegmentFormModal, {
      props: { open: true, segment: existing },
    })
    wrapper.findAllComponents({ name: 'UInput' })[0]!.vm.$emit('update:modelValue', 'VIP buyers v2')
    await tick()

    clickSave()
    await tick()

    expect(updateMutate).toHaveBeenCalledTimes(1)
    const { id, patch } = updateMutate.mock.calls[0]![0]
    expect(id).toBe(7)
    expect(patch.name).toBe('VIP buyers v2')
    expect(patch.filters).toMatchObject({ tag_match: 'any', min_order_count: 5 })
  })
})
