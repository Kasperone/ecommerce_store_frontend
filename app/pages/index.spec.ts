// @vitest-environment nuxt
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { PagePublic } from '~/composables/usePublicPage'
import type { Section } from '~/blocks/types'

/**
 * CMS-driven homepage. The homepage renders the published `home` CMS page
 * through <PageRenderer> when `usePublicPage('home')` returns a page with
 * sections, and renders nothing otherwise (the legacy hardcoded fallback —
 * promo strip, hero slider, hero banners, featured grid — was removed once the
 * storefront moved fully to the CMS).
 *
 * `usePublicPage` is mocked at its auto-import boundary.
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

// Mutable per-test: `null` → renders nothing, a PagePublic → PageRenderer path.
const pageData = ref<PagePublic | null>(null)

mockNuxtImport('usePublicPage', () => () => ({ data: pageData }))

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
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('CMS-driven homepage', () => {
  it('renders the CMS page via PageRenderer when a published page exists', async () => {
    pageData.value = CMS_PAGE
    const wrapper = await mountPage()
    // PageRenderer drives the homepage — the CMS rich-text content is present.
    expect(wrapper.text()).toContain('CMS Welcome')
    expect(wrapper.findComponent({ name: 'PageRenderer' }).exists()).toBe(true)
  })

  it('renders nothing when no CMS page exists (null)', async () => {
    pageData.value = null
    const wrapper = await mountPage()
    expect(wrapper.findComponent({ name: 'PageRenderer' }).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('CMS Welcome')
  })

  it('renders nothing when the CMS page has no sections (empty)', async () => {
    pageData.value = { ...CMS_PAGE, layout: { sections: [] } } as PagePublic
    const wrapper = await mountPage()
    expect(wrapper.findComponent({ name: 'PageRenderer' }).exists()).toBe(false)
  })
})
