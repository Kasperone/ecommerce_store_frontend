// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ReviewStarsInput from './ReviewStarsInput.vue'

describe('ReviewStarsInput', () => {
  it('renders five star buttons', async () => {
    const wrapper = await mountSuspended(ReviewStarsInput, { props: { rating: 0 } })
    expect(wrapper.findAll('button').length).toBe(5)
  })

  it('emits the clicked rating via v-model', async () => {
    const wrapper = await mountSuspended(ReviewStarsInput, { props: { rating: 0 } })
    await wrapper.findAll('button')[2]!.trigger('click') // 3rd star
    expect(wrapper.emitted('update:rating')?.at(-1)).toEqual([3])
  })

  it('marks the selected star as pressed', async () => {
    const wrapper = await mountSuspended(ReviewStarsInput, { props: { rating: 4 } })
    const buttons = wrapper.findAll('button')
    expect(buttons[3]!.attributes('aria-pressed')).toBe('true')
    expect(buttons[0]!.attributes('aria-pressed')).toBe('false')
  })

  it('uses the provided starLabel for accessible names', async () => {
    const wrapper = await mountSuspended(ReviewStarsInput, {
      props: { rating: 0, starLabel: (n: number) => `Rate ${n} stars` },
    })
    expect(wrapper.findAll('button')[0]!.attributes('aria-label')).toBe('Rate 1 stars')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(ReviewStarsInput, {
      props: { rating: 3, groupLabel: 'Your rating' },
    })
    expect(
      await axe(wrapper.element, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
