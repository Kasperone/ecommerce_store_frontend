// @vitest-environment nuxt
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import ProductPicker from './ProductPicker.vue'

/**
 * Meilisearch-backed product/collection picker. We mock `useSearchSuggest` so no
 * network/Nuxt-app context is needed and we control the suggestion list, then
 * assert: suggestion → emit (id for product, slug for collection), multi-select
 * accumulation, and chip removal.
 *
 * The mocked composable returns REAL `ref()`s (the component reads them in the
 * template) — a `{ value }` stand-in would break reactivity (testing-rules note).
 */

const products = ref<any[]>([])
const categories = ref<any[]>([])

mockNuxtImport('useSearchSuggest', () => () => ({
  products,
  categories,
  loading: ref(false),
  failed: ref(false),
  hasResults: ref(false),
  clear: vi.fn(),
}))

function resetSuggestions() {
  products.value = [
    { id: 11, slug: 'phone', name: 'Phone', name_highlight: 'Phone', in_stock: true },
    { id: 22, slug: 'tablet', name: 'Tablet', name_highlight: 'Tablet', in_stock: true },
  ]
  categories.value = [{ id: 3, slug: 'electronics', name: 'Electronics' }]
}

describe('ProductPicker (product mode)', () => {
  it('emits the product id when a suggestion is clicked', async () => {
    resetSuggestions()
    const w = await mountSuspended(ProductPicker, {
      props: { mode: 'product', modelValue: null },
    })
    await w.find('input').setValue('pho')
    const phone = w.findAll('ul li button').find(b => b.text().includes('Phone'))!
    await phone.trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([11])
  })

  it('accumulates ids in multiple mode', async () => {
    resetSuggestions()
    const w = await mountSuspended(ProductPicker, {
      props: { mode: 'product', multiple: true, modelValue: [11] },
    })
    await w.find('input').setValue('tab')
    const tablet = w.findAll('ul li button').find(b => b.text().includes('Tablet'))!
    await tablet.trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([[11, 22]])
  })

  it('renders a chip for each selected product id', async () => {
    resetSuggestions()
    const w = await mountSuspended(ProductPicker, {
      props: { mode: 'product', multiple: true, modelValue: [11, 22] },
    })
    // Ids without a cached name render as #id.
    expect(w.text()).toContain('#11')
    expect(w.text()).toContain('#22')
  })

  it('removes a product from the selection', async () => {
    resetSuggestions()
    const w = await mountSuspended(ProductPicker, {
      props: { mode: 'product', multiple: true, modelValue: [11, 22] },
    })
    const removeBtn = w.find('button[aria-label="Remove"]')
    await removeBtn.trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([[22]])
  })
})

describe('ProductPicker (collection mode)', () => {
  it('emits the category slug when a suggestion is clicked', async () => {
    resetSuggestions()
    const w = await mountSuspended(ProductPicker, {
      props: { mode: 'collection', modelValue: null },
    })
    await w.find('input').setValue('elec')
    const cat = w.findAll('ul li button').find(b => b.text().includes('Electronics'))!
    await cat.trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['electronics'])
  })

  it('shows the selected slug as a badge and clears it', async () => {
    resetSuggestions()
    const w = await mountSuspended(ProductPicker, {
      props: { mode: 'collection', modelValue: 'electronics' },
    })
    expect(w.text()).toContain('electronics')
    await w.find('button[aria-label="Clear"]').trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([null])
  })
})
