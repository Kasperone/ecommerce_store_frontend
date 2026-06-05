// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import PromoStripBlock from './PromoStripBlock.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function settings(over: Record<string, unknown> = {}) {
  return {
    text: 'Free shipping over $50',
    bg_color: null as string | null,
    link_url: null as string | null,
    dismissible: false,
    starts_at: null as string | null,
    ends_at: null as string | null,
    ...over,
  }
}

describe('PromoStripBlock', () => {
  it('renders the text', async () => {
    const wrapper = await mountSuspended(PromoStripBlock, {
      props: { settings: settings() },
    })
    expect(wrapper.text()).toContain('Free shipping over $50')
  })

  it('wraps the text in a link when link_url is set', async () => {
    const wrapper = await mountSuspended(PromoStripBlock, {
      props: { settings: settings({ link_url: '/sale' }) },
    })
    expect(wrapper.find('a[href="/sale"]').exists()).toBe(true)
  })

  it('renders no link when link_url is absent', async () => {
    const wrapper = await mountSuspended(PromoStripBlock, {
      props: { settings: settings({ link_url: null }) },
    })
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('renders a dismiss button only when dismissible', async () => {
    const wrapper = await mountSuspended(PromoStripBlock, {
      props: { settings: settings({ dismissible: true }) },
    })
    expect(wrapper.find('button[aria-label="Dismiss"]').exists()).toBe(true)
  })

  it('renders nothing on empty text', async () => {
    const wrapper = await mountSuspended(PromoStripBlock, {
      props: { settings: settings({ text: '' }) },
    })
    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(PromoStripBlock, {
      props: { settings: settings({ link_url: '/sale', dismissible: true }) },
    })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
