// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import RichTextBlock from './RichTextBlock.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function settings(over: Record<string, unknown> = {}) {
  return {
    heading: 'About us',
    body: '<p>We make great things.</p>',
    width: 'normal' as const,
    alignment: 'left' as const,
    ...over,
  }
}

describe('RichTextBlock', () => {
  it('renders heading + sanitised body html', async () => {
    const wrapper = await mountSuspended(RichTextBlock, {
      props: { settings: settings() },
    })
    expect(wrapper.text()).toContain('About us')
    expect(wrapper.html()).toContain('<p>We make great things.</p>')
  })

  it('renders nothing when heading and body are empty', async () => {
    const wrapper = await mountSuspended(RichTextBlock, {
      props: { settings: settings({ heading: null, body: '' }) },
    })
    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('applies the chosen width class', async () => {
    const wrapper = await mountSuspended(RichTextBlock, {
      props: { settings: settings({ width: 'narrow' }) },
    })
    expect(wrapper.find('section').classes()).toContain('max-w-2xl')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(RichTextBlock, {
      props: { settings: settings() },
    })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
