// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ProductFilters, { type ProductFilterValues } from './ProductFilters.vue'
import { makeCategory } from '../../../test/helpers/fixtures'

const baseValues: ProductFilterValues = {
  active: 'all',
  featured: 'all',
  inStock: 'all',
  categoryId: undefined,
  minPrice: undefined,
  maxPrice: undefined,
  search: undefined,
}

const categoriesFixture = [
  makeCategory({ id: 1 }),
  makeCategory({ id: 2, name: 'Music', slug: 'music' }),
]

describe('ProductFilters', () => {
  it('renders without errors', async () => {
    const wrapper = await mountSuspended(ProductFilters, {
      props: { values: baseValues, categories: categoriesFixture },
    })
    expect(wrapper.html()).toContain('Status')
    expect(wrapper.html()).toContain('Reset filters')
  })

  it('emits update:filters with trimmed search after debounce', async () => {
    const wrapper = await mountSuspended(ProductFilters, {
      props: { values: baseValues, categories: categoriesFixture },
    })

    const searchInput = wrapper.find('input[placeholder*="Search"]').element as HTMLInputElement
    expect(searchInput).toBeTruthy()
    searchInput.value = '  book  '
    searchInput.dispatchEvent(new Event('input', { bubbles: true }))

    // Wait past the 300ms debounce window.
    await new Promise(r => setTimeout(r, 350))

    const emits = wrapper.emitted('update:filters') as Array<[Partial<ProductFilterValues>]> | undefined
    expect(emits).toBeTruthy()
    expect(emits?.[emits.length - 1]?.[0]).toEqual({ search: 'book' })
  })

  it('emits search: undefined when input is cleared', async () => {
    const wrapper = await mountSuspended(ProductFilters, {
      props: { values: { ...baseValues, search: 'something' }, categories: categoriesFixture },
    })

    const searchInput = wrapper.find('input[placeholder*="Search"]').element as HTMLInputElement
    searchInput.value = ''
    searchInput.dispatchEvent(new Event('input', { bubbles: true }))

    await new Promise(r => setTimeout(r, 350))

    const emits = wrapper.emitted('update:filters') as Array<[Partial<ProductFilterValues>]> | undefined
    expect(emits).toBeTruthy()
    expect(emits?.[emits.length - 1]?.[0]).toEqual({ search: undefined })
  })

  it('syncs search input from props when external value changes', async () => {
    const wrapper = await mountSuspended(ProductFilters, {
      props: { values: baseValues, categories: categoriesFixture },
    })

    await wrapper.setProps({ values: { ...baseValues, search: 'externally-set' } })

    const searchInput = wrapper.find('input[placeholder*="Search"]').element as HTMLInputElement
    expect(searchInput.value).toBe('externally-set')
  })

  it('gates the price filter behind an explicit Apply (disabled until dirty)', async () => {
    const wrapper = await mountSuspended(ProductFilters, {
      props: { values: baseValues, categories: categoriesFixture },
    })

    const applyBtn = wrapper.findAll('button').find(b => b.text().includes('Apply'))
    expect(applyBtn).toBeTruthy()
    // No pending change yet → the button is disabled, and price is NOT live-emitted
    // on render (unlike search). It commits only on an explicit Apply / Enter.
    expect(applyBtn!.attributes('disabled')).toBeDefined()
  })
})
