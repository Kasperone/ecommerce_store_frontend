// @vitest-environment nuxt
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { CollectionWithProductCount } from '#shared/types/api'

/**
 * Storefront `/collections` landing — a grid of active collections (hero card +
 * name + product count) or an empty-state. `useCollectionsListPublic` is mocked
 * at its auto-import boundary.
 */

const list = ref<CollectionWithProductCount[] | null>(null)

mockNuxtImport('useCollectionsListPublic', () => () => ({ data: list }))

function collection(over: Partial<CollectionWithProductCount> = {}): CollectionWithProductCount {
  return {
    id: 1,
    name: 'Summer Picks',
    slug: 'summer-picks',
    is_active: true,
    sort_order: 0,
    type: 'manual',
    product_count: 4,
    created_at: '2026-06-08T00:00:00Z',
    updated_at: '2026-06-08T00:00:00Z',
    ...over,
  } as CollectionWithProductCount
}

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

async function mountPage() {
  const Page = (await import('./index.vue')).default
  return await mountSuspended(Page, {
    global: { stubs: { NuxtLayout: PassThroughStub } },
  })
}

beforeEach(() => {
  list.value = null
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('collections index page', () => {
  it('renders a card per active collection with its product count', async () => {
    list.value = [
      collection(),
      collection({ id: 2, name: 'On Sale', slug: 'on-sale', product_count: 1 }),
    ]
    const wrapper = await mountPage()
    const text = wrapper.text()
    expect(text).toContain('Summer Picks')
    expect(text).toContain('On Sale')
    // Pluralized product counts (4 products / 1 product).
    expect(text).toContain('4 products')
    expect(text).toContain('1 product')
  })

  it('links each card to the localized collection slug', async () => {
    list.value = [collection({ slug: 'summer-picks' })]
    const wrapper = await mountPage()
    const link = wrapper.findAll('a').find(a => a.text().includes('Summer Picks'))
    expect(link?.attributes('href')).toContain('/collections/summer-picks')
  })

  it('renders an empty-state when there are no collections', async () => {
    list.value = []
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('No collections yet')
    expect(wrapper.findAll('a').some(a => a.attributes('href')?.includes('/collections/'))).toBe(false)
  })
})
