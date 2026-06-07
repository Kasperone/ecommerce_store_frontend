// @vitest-environment nuxt
import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import TrackingSection from './TrackingSection.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('OrdersTrackingSection', () => {
  it('renders nothing when no tracking field is set', async () => {
    const wrapper = await mountSuspended(TrackingSection, {
      props: { shippingCarrier: null, trackingNumber: null, trackingUrl: null },
    })
    expect(wrapper.find('[data-testid="order-tracking"]').exists()).toBe(false)
  })

  it('renders nothing when all tracking props are omitted', async () => {
    const wrapper = await mountSuspended(TrackingSection, { props: {} })
    expect(wrapper.find('[data-testid="order-tracking"]').exists()).toBe(false)
  })

  it('renders the carrier and tracking number when set', async () => {
    const wrapper = await mountSuspended(TrackingSection, {
      props: {
        shippingCarrier: 'DHL',
        trackingNumber: 'JD014600003828800221',
        trackingUrl: null,
      },
    })
    const text = wrapper.text()
    expect(text).toContain('Shipment')
    expect(text).toContain('Carrier')
    expect(text).toContain('DHL')
    expect(text).toContain('Tracking number')
    expect(text).toContain('JD014600003828800221')
  })

  it('renders even when only the tracking number is set', async () => {
    const wrapper = await mountSuspended(TrackingSection, {
      props: { trackingNumber: '1Z999AA10123456784' },
    })
    expect(wrapper.find('[data-testid="order-tracking"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('1Z999AA10123456784')
    // No carrier row, no link.
    expect(wrapper.text()).not.toContain('Carrier')
    expect(wrapper.find('[data-testid="order-tracking-link"]').exists()).toBe(false)
  })

  it('renders a "Track shipment" external link when tracking_url is set', async () => {
    const wrapper = await mountSuspended(TrackingSection, {
      props: {
        shippingCarrier: 'UPS',
        trackingNumber: '1Z999AA10123456784',
        trackingUrl: 'https://www.ups.com/track?tracknum=1Z999AA10123456784',
      },
    })
    const link = wrapper.find('[data-testid="order-tracking-link"]')
    expect(link.exists()).toBe(true)
    expect(link.text()).toContain('Track shipment')
    expect(link.attributes('href'))
      .toBe('https://www.ups.com/track?tracknum=1Z999AA10123456784')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
  })

  it('omits the link when tracking_url is not set', async () => {
    const wrapper = await mountSuspended(TrackingSection, {
      props: { shippingCarrier: 'InPost', trackingNumber: '520000016840271002386426' },
    })
    expect(wrapper.find('[data-testid="order-tracking"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="order-tracking-link"]').exists()).toBe(false)
  })

  it('is axe-clean', async () => {
    await mountSuspended(TrackingSection, {
      props: {
        shippingCarrier: 'DHL',
        trackingNumber: 'JD014600003828800221',
        trackingUrl: 'https://www.dhl.com/track?id=JD014600003828800221',
      },
    })
    const result = await axe(document.body)
    expect(result).toHaveNoViolations()
  })
})
