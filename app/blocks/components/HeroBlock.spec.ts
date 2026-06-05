// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import HeroBlock from './HeroBlock.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function settings(over: Record<string, unknown> = {}) {
  return {
    heading: 'Summer Sale',
    subheading: null as string | null,
    image_url: null as string | null,
    overlay_opacity: 40,
    alignment: 'left' as const,
    cta_label: null as string | null,
    cta_url: null as string | null,
    theme: 'dark' as const,
    ...over,
  }
}

describe('HeroBlock', () => {
  it('renders heading + subheading', async () => {
    const wrapper = await mountSuspended(HeroBlock, {
      props: { settings: settings({ subheading: 'Up to 50% off' }) },
    })
    expect(wrapper.text()).toContain('Summer Sale')
    expect(wrapper.text()).toContain('Up to 50% off')
  })

  it('renders a background image (alt = heading) when image_url set', async () => {
    const wrapper = await mountSuspended(HeroBlock, {
      props: { settings: settings({ image_url: 'https://cdn.example.com/hero.jpg' }) },
    })
    const img = wrapper.find('img')
    expect(img.attributes('src')).toBe('https://cdn.example.com/hero.jpg')
    expect(img.attributes('alt')).toBe('Summer Sale')
  })

  it('renders a CTA only when both label and url are present', async () => {
    const withCta = await mountSuspended(HeroBlock, {
      props: { settings: settings({ cta_label: 'Shop', cta_url: '/sale' }) },
    })
    expect(withCta.find('a[href="/sale"]').exists()).toBe(true)

    const noUrl = await mountSuspended(HeroBlock, {
      props: { settings: settings({ cta_label: 'Shop', cta_url: null }) },
    })
    expect(noUrl.find('a').exists()).toBe(false)
  })

  it('shows the image placeholder when no image is set', async () => {
    const wrapper = await mountSuspended(HeroBlock, {
      props: { settings: settings({ image_url: null }) },
    })
    expect(wrapper.find('.c-image-placeholder').exists()).toBe(true)
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('hides the placeholder once an image is set', async () => {
    const wrapper = await mountSuspended(HeroBlock, {
      props: { settings: settings({ image_url: 'https://cdn.example.com/hero.jpg' }) },
    })
    expect(wrapper.find('.c-image-placeholder').exists()).toBe(false)
  })

  it('renders nothing without heading or image', async () => {
    const wrapper = await mountSuspended(HeroBlock, {
      props: { settings: settings({ heading: '', image_url: null }) },
    })
    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('survives undefined settings', async () => {
    const wrapper = await mountSuspended(HeroBlock, { props: {} })
    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(HeroBlock, {
      props: {
        settings: settings({
          subheading: 'Up to 50% off',
          image_url: 'https://cdn.example.com/hero.jpg',
          cta_label: 'Shop',
          cta_url: '/sale',
        }),
      },
    })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
