// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import SearchBar from './SearchBar.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

const { mockSuggest, mockNavigate, mockClear } = vi.hoisted(() => ({
  mockSuggest: vi.fn(),
  mockNavigate: vi.fn(),
  mockClear: vi.fn(),
}))

mockNuxtImport('useSearchSuggest', () => mockSuggest)
mockNuxtImport('navigateTo', () => mockNavigate)

function withResults() {
  mockSuggest.mockReturnValue({
    products: ref([
      {
        id: 1,
        slug: 'blue-phone',
        name: 'Blue Phone',
        name_highlight: '<em>Blue</em> Phone',
        image_url: null,
        in_stock: true,
        price_usd: 99,
        price_pln: null,
        price_eur: null,
      },
    ]),
    categories: ref([{ id: 3, slug: 'electronics', name: 'Electronics' }]),
    loading: ref(false),
    failed: ref(false),
    hasResults: ref(true),
    clear: mockClear,
  })
}

function withNoResults() {
  mockSuggest.mockReturnValue({
    products: ref([]),
    categories: ref([]),
    loading: ref(false),
    failed: ref(false),
    hasResults: ref(false),
    clear: mockClear,
  })
}

async function open(wrapper: Awaited<ReturnType<typeof mountSuspended>>, query = 'phone') {
  const input = wrapper.find('input')
  await input.setValue(query)
  await input.trigger('focus')
  return input
}

beforeEach(() => {
  mockNavigate.mockClear()
  mockClear.mockClear()
  withResults()
})

describe('LayoutSearchBar', () => {
  it('renders the search input', async () => {
    const wrapper = await mountSuspended(SearchBar)
    expect(wrapper.find('input').exists()).toBe(true)
  })

  it('shows product hits and category shortcuts once a query is typed', async () => {
    const wrapper = await mountSuspended(SearchBar)
    await open(wrapper)
    const html = wrapper.html()
    expect(html).toContain('Blue Phone')
    expect(html).toContain('Electronics')
    expect(html).toContain('/products/blue-phone')
    expect(html).toContain('/category/electronics')
  })

  it('does not show the dropdown before a query is entered', async () => {
    const wrapper = await mountSuspended(SearchBar)
    await wrapper.find('input').trigger('focus')
    expect(wrapper.html()).not.toContain('Blue Phone')
  })

  it('navigates to /search on Enter with the typed query', async () => {
    const wrapper = await mountSuspended(SearchBar)
    const input = await open(wrapper)
    await input.trigger('keydown.enter')
    expect(mockNavigate).toHaveBeenCalledWith({ path: '/search', query: { q: 'phone' } })
  })

  it('navigates to /search from the "see all results" row', async () => {
    const wrapper = await mountSuspended(SearchBar)
    await open(wrapper)
    const seeAll = wrapper.findAll('button').find(b => b.text().includes('See all results'))
    expect(seeAll).toBeTruthy()
    await seeAll!.trigger('click')
    expect(mockNavigate).toHaveBeenCalledWith({ path: '/search', query: { q: 'phone' } })
  })

  it('shows a no-matches message when there are no hits', async () => {
    withNoResults()
    const wrapper = await mountSuspended(SearchBar)
    await open(wrapper, 'zzz')
    expect(wrapper.html()).toContain('No matches')
  })

  it('is axe-clean with the dropdown open', async () => {
    const wrapper = await mountSuspended(SearchBar)
    await open(wrapper)
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
