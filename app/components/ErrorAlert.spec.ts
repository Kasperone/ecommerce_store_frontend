// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ErrorAlert from './ErrorAlert.vue'

describe('ErrorAlert', () => {
  it('renders the problem title', async () => {
    const wrapper = await mountSuspended(ErrorAlert, {
      props: { problem: { title: 'Something broke' } },
    })
    expect(wrapper.text()).toContain('Something broke')
  })

  it('renders the detail when distinct from title', async () => {
    const wrapper = await mountSuspended(ErrorAlert, {
      props: {
        problem: { title: 'Validation failed', detail: 'Slug must be unique' },
      },
    })
    expect(wrapper.text()).toContain('Slug must be unique')
  })

  it('renders nothing when problem is null', async () => {
    const wrapper = await mountSuspended(ErrorAlert, {
      props: { problem: null },
    })
    expect(wrapper.html().trim()).toBe('<!--v-if-->')
  })

  it('emits field-errors when problem.errors is populated', async () => {
    const wrapper = await mountSuspended(ErrorAlert, {
      props: {
        problem: {
          title: 'Bad request',
          errors: { slug: ['Already taken'] },
        },
      },
    })
    const events = wrapper.emitted('fieldErrors')
    expect(events).toBeTruthy()
    expect(events?.[0]?.[0]).toEqual({ slug: ['Already taken'] })
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(ErrorAlert, {
      props: { problem: { title: 'Validation failed', detail: 'Something went wrong' } },
    })
    expect(await axe(wrapper.element as HTMLElement)).toHaveNoViolations()
  })
})
