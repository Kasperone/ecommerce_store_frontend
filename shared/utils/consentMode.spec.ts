import { describe, expect, it } from 'vitest'
import { toGcm } from './consentMode'

describe('toGcm — cookie categories → Consent Mode v2 signals', () => {
  it('grants everything when analytics + marketing are both on', () => {
    expect(toGcm({ analytics: true, marketing: true })).toEqual({
      analytics_storage: 'granted',
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
    })
  })

  it('denies everything when both are off', () => {
    expect(toGcm({ analytics: false, marketing: false })).toEqual({
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    })
  })

  it('maps analytics ONLY to analytics_storage (ad signals stay denied)', () => {
    expect(toGcm({ analytics: true, marketing: false })).toEqual({
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    })
  })

  it('maps marketing to all three ad signals (analytics stays denied)', () => {
    expect(toGcm({ analytics: false, marketing: true })).toEqual({
      analytics_storage: 'denied',
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
    })
  })
})
