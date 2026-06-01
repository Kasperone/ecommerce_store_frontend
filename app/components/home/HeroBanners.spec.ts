// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import HeroBanners from './HeroBanners.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function banner(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'New Collection',
    subtitle: null as string | null,
    image_url: 'https://cdn.example.com/hero.jpg',
    link_url: null as string | null,
    placement: 'home_hero' as const,
    sort_order: 0,
    ...over,
  }
}

describe('HomeHeroBanners', () => {
  it('renders a banner image (alt = title) + title + subtitle', async () => {
    const wrapper = await mountSuspended(HeroBanners, {
      props: { banners: [banner({ subtitle: 'Autumn 2026' })] },
    })
    expect(wrapper.text()).toContain('New Collection')
    expect(wrapper.text()).toContain('Autumn 2026')
    const img = wrapper.find('img')
    expect(img.attributes('src')).toBe('https://cdn.example.com/hero.jpg')
    expect(img.attributes('alt')).toBe('New Collection')
  })

  it('wraps the banner in a link when link_url is set', async () => {
    const wrapper = await mountSuspended(HeroBanners, {
      props: { banners: [banner({ link_url: '/category/new' })] },
    })
    const link = wrapper.find('a[href="/category/new"]')
    expect(link.exists()).toBe(true)
    expect(link.text()).toContain('New Collection')
  })

  it('renders no link when link_url is absent', async () => {
    const wrapper = await mountSuspended(HeroBanners, {
      props: { banners: [banner({ link_url: null })] },
    })
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.text()).toContain('New Collection')
  })

  it('renders multiple banners', async () => {
    const wrapper = await mountSuspended(HeroBanners, {
      props: { banners: [banner({ id: 1, title: 'Alpha' }), banner({ id: 2, title: 'Bravo' })] },
    })
    expect(wrapper.text()).toContain('Alpha')
    expect(wrapper.text()).toContain('Bravo')
  })

  it('renders nothing on an empty list', async () => {
    const wrapper = await mountSuspended(HeroBanners, {
      props: { banners: [] },
    })
    expect(wrapper.find('section').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(HeroBanners, {
      props: { banners: [banner({ subtitle: 'Shop now', link_url: '/category/new' })] },
    })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
