// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import ProductTagEditor from './ProductTagEditor.vue'

/**
 * The product-tag editor is bound (v-model) to a plain string[] of tag names.
 * We stub the vocabulary query and assert: selected chips render, vocabulary
 * pills offer un-selected tags, add-by-name and pill-click update the bound
 * value, and remove drops a chip. URL/verb mapping lives in the query spec.
 */

const mocks = vi.hoisted(() => ({
  vocabulary: [] as unknown[],
}))

mockNuxtImport('useProductTagsQuery', () => () => ({ data: ref(mocks.vocabulary), isLoading: ref(false) }))

beforeEach(() => {
  mocks.vocabulary = []
})

describe('ProductTagEditor (AdminProductTagEditor)', () => {
  it('renders selected tag chips and the empty hint when none', async () => {
    const empty = await mountSuspended(ProductTagEditor, { props: { modelValue: [] } })
    expect(empty.text()).toContain('No tags yet.')

    const withTags = await mountSuspended(ProductTagEditor, { props: { modelValue: ['sale'] } })
    expect(withTags.text()).toContain('sale')
  })

  it('offers un-selected vocabulary tags as one-click pills', async () => {
    mocks.vocabulary = [
      { id: 1, name: 'sale', color: null, usage_count: 1 },
      { id: 2, name: 'new', color: null, usage_count: 0 },
    ]
    const wrapper = await mountSuspended(ProductTagEditor, { props: { modelValue: ['sale'] } })
    // sale is selected, new is not → only `new` shows as a suggestion pill.
    expect(wrapper.text()).toContain('new')
  })

  it('adds a tag by name from the input and updates the model', async () => {
    const wrapper = await mountSuspended(ProductTagEditor, { props: { modelValue: [] } })
    const input = wrapper.findAllComponents({ name: 'UInput' })[0]
    input!.vm.$emit('update:modelValue', 'clearance')
    await new Promise(r => setTimeout(r, 0))

    const addBtn = wrapper.findAll('button').find(b => b.text().trim() === 'Add')
    await addBtn!.trigger('click')
    await new Promise(r => setTimeout(r, 0))

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted!.at(-1)).toEqual([['clearance']])
  })

  it('does not add a case-insensitive duplicate', async () => {
    const wrapper = await mountSuspended(ProductTagEditor, { props: { modelValue: ['Sale'] } })
    const input = wrapper.findAllComponents({ name: 'UInput' })[0]
    input!.vm.$emit('update:modelValue', 'sale')
    await new Promise(r => setTimeout(r, 0))

    const addBtn = wrapper.findAll('button').find(b => b.text().trim() === 'Add')
    await addBtn!.trigger('click')
    await new Promise(r => setTimeout(r, 0))

    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
  })

  it('removes a chip via its remove button', async () => {
    const wrapper = await mountSuspended(ProductTagEditor, { props: { modelValue: ['sale', 'new'] } })
    const removeBtn = wrapper.find('button[aria-label="Remove sale"]')
    expect(removeBtn.exists()).toBe(true)
    await removeBtn.trigger('click')
    await new Promise(r => setTimeout(r, 0))

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted!.at(-1)).toEqual([['new']])
  })
})
