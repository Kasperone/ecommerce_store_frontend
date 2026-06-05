// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h } from 'vue'
import BlockBoundary from './BlockBoundary.vue'

const Ok = defineComponent({
  setup() {
    return () => h('p', 'block ok')
  },
})

const Boom = defineComponent({
  setup() {
    throw new Error('block exploded')
  },
})

describe('BlockBoundary', () => {
  it('renders its slot when the block is healthy', async () => {
    const wrapper = await mountSuspended(BlockBoundary, {
      props: { type: 'hero' },
      slots: { default: () => h(Ok) },
    })
    expect(wrapper.text()).toContain('block ok')
  })

  it('contains a throwing block (no re-throw) and surfaces it in dev', async () => {
    // Outside a production build the boundary shows error chrome instead of
    // blanking. The key assertion is that mounting does not throw — one bad
    // block can't crash the page.
    const wrapper = await mountSuspended(BlockBoundary, {
      props: { type: 'hero' },
      slots: { default: () => h(Boom) },
    })
    expect(wrapper.text()).toContain('Block failed to render')
    expect(wrapper.text()).toContain('hero')
  })
})
