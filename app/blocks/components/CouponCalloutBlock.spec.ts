// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import CouponCalloutBlock from './CouponCalloutBlock.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function settings(over: Record<string, unknown> = {}) {
  return {
    coupon_code: 'SAVE20',
    heading: 'Get 20% off',
    body: null as string | null,
    cta_label: null as string | null,
    cta_url: null as string | null,
    ...over,
  }
}

describe('CouponCalloutBlock', () => {
  it('renders the heading + coupon code', async () => {
    const wrapper = await mountSuspended(CouponCalloutBlock, {
      props: { settings: settings() },
    })
    expect(wrapper.text()).toContain('Get 20% off')
    expect(wrapper.text()).toContain('SAVE20')
  })

  it('renders a CTA only when both label and url are present', async () => {
    const wrapper = await mountSuspended(CouponCalloutBlock, {
      props: { settings: settings({ cta_label: 'Shop', cta_url: '/sale' }) },
    })
    expect(wrapper.find('a[href="/sale"]').exists()).toBe(true)
  })

  it('renders nothing when code and heading are absent', async () => {
    const wrapper = await mountSuspended(CouponCalloutBlock, {
      props: { settings: settings({ coupon_code: '', heading: null }) },
    })
    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(CouponCalloutBlock, {
      props: { settings: settings({ body: 'Limited time', cta_label: 'Shop', cta_url: '/sale' }) },
    })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
