// @vitest-environment nuxt
import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import Logo from './Logo.vue'

describe('LayoutLogo', () => {
  it('renders an anchor to home by default (link mode)', async () => {
    const wrapper = await mountSuspended(Logo)
    const anchor = wrapper.find('a')
    expect(anchor.exists()).toBe(true)
    expect(anchor.attributes('href')).toBe('/')
    expect(anchor.attributes('aria-label')).toBeTruthy()
    // the wordmark + the inline mark both render
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.text()).toContain('E-commerce Store')
  })

  it('renders a non-anchor wrapper when link=false (avoids nested <a>)', async () => {
    const wrapper = await mountSuspended(Logo, { props: { link: false } })
    // No anchor — this is the form used inside UHeader's #title slot, which
    // already links to home; nesting <a> in <a> caused a hydration mismatch.
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.text()).toContain('E-commerce Store')
  })

  it('hides the wordmark when showText=false', async () => {
    const wrapper = await mountSuspended(Logo, { props: { showText: false } })
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('E-commerce Store')
  })
})
