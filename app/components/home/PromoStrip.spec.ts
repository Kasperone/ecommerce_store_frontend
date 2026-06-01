// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import PromoStrip from './PromoStrip.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function banner(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'Summer Sale',
    subtitle: null as string | null,
    image_url: 'https://cdn.example.com/promo.jpg',
    link_url: null as string | null,
    placement: 'promo_strip' as const,
    sort_order: 0,
    ...over,
  }
}

describe('HomePromoStrip', () => {
  it('renders a banner title + subtitle', async () => {
    const wrapper = await mountSuspended(PromoStrip, {
      props: { banners: [banner({ subtitle: 'Up to 50% off' })] },
    })
    expect(wrapper.text()).toContain('Summer Sale')
    expect(wrapper.text()).toContain('Up to 50% off')
  })

  it('wraps the banner in a link when link_url is set', async () => {
    const wrapper = await mountSuspended(PromoStrip, {
      props: { banners: [banner({ link_url: '/products' })] },
    })
    const link = wrapper.find('a[href="/products"]')
    expect(link.exists()).toBe(true)
    expect(link.text()).toContain('Summer Sale')
  })

  it('renders plain text (no link) when link_url is absent', async () => {
    const wrapper = await mountSuspended(PromoStrip, {
      props: { banners: [banner({ link_url: null })] },
    })
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.text()).toContain('Summer Sale')
  })

  it('renders nothing on an empty list', async () => {
    const wrapper = await mountSuspended(PromoStrip, {
      props: { banners: [] },
    })
    expect(wrapper.find('section').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(PromoStrip, {
      props: { banners: [banner({ subtitle: 'Save now', link_url: '/products' })] },
    })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
