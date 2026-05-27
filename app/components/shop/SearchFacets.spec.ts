// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import SearchFacets from './SearchFacets.vue'

// UInputNumber renders a visually-hidden form input Nuxt UI labels via aria; the
// axe `label` rule double-flags it (same waiver as CategoryFormModal.spec).
const AXE_OPTIONS = { rules: { region: { enabled: false }, label: { enabled: false } } }

const facets = [
  { value: '3', label: 'Electronics', count: 5 },
  { value: '4', label: 'Books', count: 2 },
]

function mountFacets(props: Record<string, unknown> = {}) {
  return mountSuspended(SearchFacets, {
    props: { categoryFacets: facets, ...props },
  })
}

describe('ShopSearchFacets', () => {
  it('renders category buckets with their match counts', async () => {
    const wrapper = await mountFacets()
    const text = wrapper.text()
    expect(text).toContain('Electronics')
    expect(text).toContain('5')
    expect(text).toContain('Books')
  })

  it('emits the category id when a bucket is selected', async () => {
    const wrapper = await mountFacets()
    const button = wrapper.findAll('button').find(b => b.text().includes('Electronics'))
    await button!.trigger('click')
    expect(wrapper.emitted('update')?.[0]?.[0]).toEqual({ categoryId: 3 })
  })

  it('clears the category when the active bucket is clicked again', async () => {
    const wrapper = await mountFacets({ categoryId: 3 })
    const button = wrapper.findAll('button').find(b => b.text().includes('Electronics'))
    await button!.trigger('click')
    expect(wrapper.emitted('update')?.[0]?.[0]).toEqual({ categoryId: undefined })
  })

  it('shows a clear control only when filters are active and emits clear', async () => {
    const wrapper = await mountFacets({ hasActiveFilters: true })
    const clear = wrapper.findAll('button').find(b => b.text().includes('Clear'))
    expect(clear).toBeTruthy()
    await clear!.trigger('click')
    expect(wrapper.emitted('clear')).toBeTruthy()
  })

  it('renders the price range inputs', async () => {
    const wrapper = await mountFacets()
    // Min + max number inputs are present.
    expect(wrapper.findAll('input').length).toBeGreaterThanOrEqual(2)
  })

  it('is axe-clean', async () => {
    const wrapper = await mountFacets({ hasActiveFilters: true })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
