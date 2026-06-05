// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h, ref } from 'vue'
import type { PagePublic } from '~/composables/usePublicPage'
import type { Section } from '~/blocks/types'

/**
 * Catch-all CMS marketing page ([...slug].vue). The page owns: joining the
 * catch-all segments into a slug, fetching the published layout via
 * `usePublicPage` (locale-aware), rendering it through `<PageRenderer>`, SEO
 * meta from the page's seo_* fields, and a 404 `createError` when the slug has
 * no published page.
 *
 * `usePublicPage`, `useRoute` and `createError` are mocked at the auto-import
 * boundary so the render + not-found paths are deterministic without a network.
 */

const { pageRef, createErrorMock } = vi.hoisted(() => ({
  pageRef: { value: null as PagePublic | null },
  createErrorMock: vi.fn((opts: unknown) => {
    const err = new Error('createError') as Error & { __opts?: unknown }
    err.__opts = opts
    return err
  }),
}))

mockNuxtImport('usePublicPage', () => () => ({ data: ref(pageRef.value) }))
mockNuxtImport('createError', () => createErrorMock)

// NuxtLayout reads route.meta.layout, which the test env doesn't populate —
// stub it with a pass-through so the page's own content is what we assert on.
const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

function richText(heading: string, id: string): Section {
  return {
    id,
    type: 'rich-text',
    settings: { heading, body: `<p>${heading} body</p>`, width: 'normal', alignment: 'left' },
  }
}

function makePage(overrides: Partial<PagePublic> = {}): PagePublic {
  return {
    slug: 'about-us',
    type: 'standard',
    locale: 'en',
    layout: { sections: [richText('Hello world', 'a')] },
    seo_title: 'About Us',
    seo_description: 'Learn about our company.',
    seo_image_url: null,
    ...overrides,
  }
}

async function mountPage() {
  const Page = (await import('./[...slug].vue')).default
  return mountSuspended(Page, {
    global: { stubs: { NuxtLayout: PassThroughStub } },
  })
}

beforeEach(() => {
  pageRef.value = null
  createErrorMock.mockClear()
})

describe('catch-all CMS page', () => {
  it('renders the published layout via PageRenderer when the page exists', async () => {
    pageRef.value = makePage()
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('Hello world')
    expect(createErrorMock).not.toHaveBeenCalled()
  })

  it('throws a 404 createError when the slug has no published page', async () => {
    pageRef.value = null
    await expect(mountPage()).rejects.toThrow()
    expect(createErrorMock).toHaveBeenCalledTimes(1)
    expect(createErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
    )
  })

  it('renders nothing extra for a page with an empty section list', async () => {
    pageRef.value = makePage({ layout: { sections: [] } })
    const wrapper = await mountPage()
    expect(wrapper.text().trim()).toBe('')
    expect(createErrorMock).not.toHaveBeenCalled()
  })

  it('tolerates a layout with no sections array (defaults to empty)', async () => {
    pageRef.value = makePage({ layout: {} as PagePublic['layout'] })
    const wrapper = await mountPage()
    expect(createErrorMock).not.toHaveBeenCalled()
    expect(wrapper.text().trim()).toBe('')
  })
})
