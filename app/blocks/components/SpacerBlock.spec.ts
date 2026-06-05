// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import SpacerBlock from './SpacerBlock.vue'

describe('SpacerBlock', () => {
  it('applies the configured height', async () => {
    const wrapper = await mountSuspended(SpacerBlock, {
      props: { settings: { height: 80, show_divider: false, color: null } },
    })
    expect(wrapper.find('div').attributes('style')).toContain('height: 80px')
  })

  it('renders the backend max height of 480px', async () => {
    const wrapper = await mountSuspended(SpacerBlock, {
      props: { settings: { height: 480, show_divider: false, color: null } },
    })
    expect(wrapper.find('div').attributes('style')).toContain('height: 480px')
  })

  it('clamps heights above 480 to the 480px cap', async () => {
    const wrapper = await mountSuspended(SpacerBlock, {
      props: { settings: { height: 999, show_divider: false, color: null } },
    })
    expect(wrapper.find('div').attributes('style')).toContain('height: 480px')
  })

  it('renders a divider only when show_divider is set', async () => {
    const withRule = await mountSuspended(SpacerBlock, {
      props: { settings: { height: 48, show_divider: true, color: null } },
    })
    expect(withRule.find('hr').exists()).toBe(true)

    const noRule = await mountSuspended(SpacerBlock, {
      props: { settings: { height: 48, show_divider: false, color: null } },
    })
    expect(noRule.find('hr').exists()).toBe(false)
  })

  it('is aria-hidden (decorative)', async () => {
    const wrapper = await mountSuspended(SpacerBlock, {
      props: { settings: { height: 48, show_divider: false, color: null } },
    })
    expect(wrapper.find('div').attributes('aria-hidden')).toBe('true')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(SpacerBlock, {
      props: { settings: { height: 48, show_divider: true, color: null } },
    })
    expect(await axe(wrapper.element)).toHaveNoViolations()
  })
})
