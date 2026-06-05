// @vitest-environment nuxt
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { PagePublic } from '~/composables/usePublicPage'
import type { Section } from '~/blocks/types'

/**
 * Homepage CMS swap (A4). The homepage renders the published `home` CMS page
 * through <PageRenderer> when `usePublicPage('home')` returns a page with
 * sections, and falls back to the legacy hardcoded composition (promo strip,
 * hero slider, hero banners, featured grid) when it returns null/empty.
 *
 * `usePublicPage` + `useFeaturedProducts` are mocked at their auto-import
 * boundary; the banner `useAsyncData` fetches run for real against a stubbed
 * `useApi().apiFetch` that resolves to empty lists.
 */

function richText(heading: string, id: string): Section {
  return {
    id,
    type: 'rich-text',
    settings: { heading, body: `<p>${heading} body</p>`, width: 'normal', alignment: 'left' },
  } as unknown as Section
}

const CMS_PAGE: PagePublic = {
  slug: 'home',
  type: 'home',
  locale: 'en',
  layout: { sections: [richText('CMS Welcome', 'a')] },
  seo_title: 'CMS Home Title',
  seo_description: 'CMS home description',
  seo_image_url: 'https://example.com/og.png',
} as unknown as PagePublic

// Mutable per-test: `null` → legacy fallback, a PagePublic → PageRenderer path.
const pageData = ref<PagePublic | null>(null)
const featuredData = ref<unknown[]>([])

mockNuxtImport('usePublicPage', () => () => ({ data: pageData }))
mockNuxtImport('useFeaturedProducts', () => () => ({ data: featuredData }))
mockNuxtImport('useApi', () => () => ({
  apiFetch: vi.fn(async () => [] as unknown[]),
}))

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
  pageData.value = null
  featuredData.value = []
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('homepage CMS swap', () => {
  it('renders the CMS page via PageRenderer when a published page exists', async () => {
    pageData.value = CMS_PAGE
    const wrapper = await mountPage()
    // PageRenderer drives the homepage — the CMS rich-text content is present.
    expect(wrapper.text()).toContain('CMS Welcome')
    // Legacy fallback components are absent on the CMS path.
    expect(wrapper.findComponent({ name: 'HomeHeroSlider' }).exists()).toBe(false)
  })

  it('renders the legacy fallback when no CMS page exists (null)', async () => {
    pageData.value = null
    const wrapper = await mountPage()
    // The legacy hero slider renders; CMS content does not.
    expect(wrapper.findComponent({ name: 'HomeHeroSlider' }).exists()).toBe(true)
    expect(wrapper.text()).not.toContain('CMS Welcome')
  })

  it('renders the legacy fallback when the CMS page has no sections (empty)', async () => {
    pageData.value = { ...CMS_PAGE, layout: { sections: [] } } as PagePublic
    const wrapper = await mountPage()
    expect(wrapper.findComponent({ name: 'HomeHeroSlider' }).exists()).toBe(true)
  })

  it('shows featured products in the fallback when present', async () => {
    pageData.value = null
    featuredData.value = [
      { id: 1, slug: 'p1', name: 'Fallback Product', price_usd: 10, price_pln: 40, price_eur: 9 },
    ]
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('Fallback Product')
  })
})
