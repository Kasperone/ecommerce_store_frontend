// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ProductFilters, { type ProductFilterValues } from './ProductFilters.vue'

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
  {
    id: 1,
    name: 'Books',
    slug: 'books',
    description: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    name: 'Music',
    slug: 'music',
    description: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
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
})
