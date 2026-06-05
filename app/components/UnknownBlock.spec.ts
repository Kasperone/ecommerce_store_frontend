// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import UnknownBlock from './UnknownBlock.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

describe('UnknownBlock', () => {
  // The note renders outside a production build (dev/preview/test) — that's the
  // branch we verify here (a production build renders nothing, by construction).
  it('shows a dev note naming the unknown type', async () => {
    const wrapper = await mountSuspended(UnknownBlock, { props: { type: 'mystery' } })
    expect(wrapper.text()).toContain('Unknown block type')
    expect(wrapper.text()).toContain('mystery')
  })

  it('renders without a type', async () => {
    const wrapper = await mountSuspended(UnknownBlock, { props: {} })
    expect(wrapper.text()).toContain('Unknown block type')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(UnknownBlock, { props: { type: 'mystery' } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
