// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import CustomerTags from './CustomerTags.vue'

/**
 * The tags panel owns the vocabulary query + attach/detach mutations. We stub
 * those auto-imports and assert: assigned chips render, unassigned vocabulary is
 * offered as one-click pills, add-by-name attaches, remove detaches, a11y. URL/
 * verb mapping is pinned in useTagQueries.spec.ts.
 */

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
    'region': { enabled: false },
  },
}

const mocks = vi.hoisted(() => ({
  vocabulary: [] as unknown[],
  attachMutate: vi.fn(),
  detachMutate: vi.fn(),
  toastAdd: vi.fn(),
}))

mockNuxtImport('useTagsQuery', () => () => ({ data: ref(mocks.vocabulary), isLoading: ref(false) }))
mockNuxtImport('useAttachTag', () => () => ({ mutateAsync: mocks.attachMutate, isLoading: ref(false) }))
mockNuxtImport('useDetachTag', () => () => ({ mutateAsync: mocks.detachMutate, isLoading: ref(false) }))
mockNuxtImport('useToast', () => () => ({ add: mocks.toastAdd }))

beforeEach(() => {
  mocks.vocabulary = []
  mocks.attachMutate.mockReset().mockResolvedValue([])
  mocks.detachMutate.mockReset().mockResolvedValue([])
  mocks.toastAdd.mockReset()
})

describe('CustomerTags (AdminCustomerTags)', () => {
  it('renders assigned tags and the empty hint when none', async () => {
    const empty = await mountSuspended(CustomerTags, { props: { customerId: 1, tags: [] } })
    expect(empty.text()).toContain('No tags.')

    const withTags = await mountSuspended(CustomerTags, {
      props: { customerId: 1, tags: [{ id: 1, name: 'VIP', color: null }] },
    })
    expect(withTags.text()).toContain('VIP')
  })

  it('offers unassigned vocabulary tags as suggestions', async () => {
    mocks.vocabulary = [
      { id: 1, name: 'VIP', color: null, usage_count: 1 },
      { id: 2, name: 'wholesale', color: null, usage_count: 0 },
    ]
    const wrapper = await mountSuspended(CustomerTags, {
      props: { customerId: 1, tags: [{ id: 1, name: 'VIP', color: null }] },
    })
    // VIP is assigned, wholesale is not → only wholesale shows as a suggestion.
    expect(wrapper.text()).toContain('wholesale')
  })

  it('attaches a new tag by name from the input', async () => {
    const wrapper = await mountSuspended(CustomerTags, { props: { customerId: 3, tags: [] } })
    const input = wrapper.findAllComponents({ name: 'UInput' })[0]
    input!.vm.$emit('update:modelValue', 'Brand New')
    await new Promise(r => setTimeout(r, 0))

    const addBtn = wrapper.findAll('button').find(b => b.text().trim() === 'Add')
    await addBtn!.trigger('click')
    await new Promise(r => setTimeout(r, 0))

    expect(mocks.attachMutate).toHaveBeenCalledWith({ customerId: 3, body: { name: 'Brand New' } })
  })

  it('detaches an assigned tag via its remove button', async () => {
    const wrapper = await mountSuspended(CustomerTags, {
      props: { customerId: 3, tags: [{ id: 7, name: 'VIP', color: null }] },
    })
    const removeBtn = wrapper.find('button[aria-label="Remove VIP"]')
    expect(removeBtn.exists()).toBe(true)
    await removeBtn.trigger('click')
    await new Promise(r => setTimeout(r, 0))

    expect(mocks.detachMutate).toHaveBeenCalledWith({ customerId: 3, tagId: 7 })
    expect(mocks.toastAdd).toHaveBeenCalled()
  })

  it('is axe-clean', async () => {
    mocks.vocabulary = [{ id: 2, name: 'wholesale', color: '#22c55e', usage_count: 0 }]
    const wrapper = await mountSuspended(CustomerTags, {
      props: { customerId: 1, tags: [{ id: 1, name: 'VIP', color: '#3b82f6' }] },
    })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
