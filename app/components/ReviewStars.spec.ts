// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ReviewStars from './ReviewStars.vue'

describe('ReviewStars', () => {
  it('renders five stars and fills the rating count', async () => {
    const wrapper = await mountSuspended(ReviewStars, { props: { rating: 3 } })
    // Every position renders an icon; only `rating` of them are amber.
    expect(wrapper.findAll('[aria-hidden="true"]').length).toBe(5)
    expect(wrapper.findAll('.text-amber-400').length).toBe(3)
  })

  it('exposes the rating via an img role + provided aria-label', async () => {
    const wrapper = await mountSuspended(ReviewStars, {
      props: { rating: 5, ariaLabel: '5 out of 5 stars' },
    })
    const img = wrapper.find('[role="img"]')
    expect(img.exists()).toBe(true)
    expect(img.attributes('aria-label')).toBe('5 out of 5 stars')
  })

  it('falls back to an x / 5 label when none is provided', async () => {
    const wrapper = await mountSuspended(ReviewStars, { props: { rating: 2 } })
    expect(wrapper.find('[role="img"]').attributes('aria-label')).toBe('2 / 5')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(ReviewStars, {
      props: { rating: 4, ariaLabel: '4 out of 5 stars' },
    })
    // `region` is disabled: an isolated inline component has no page landmark;
    // in real use it sits inside the page's landmarks.
    expect(
      await axe(wrapper.element, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
