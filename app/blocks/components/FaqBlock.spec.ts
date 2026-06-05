// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import FaqBlock from './FaqBlock.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function item(question: string, answer: string, id?: string) {
  return { type: 'faq-item' as const, id: id ?? null, settings: { question, answer } }
}

describe('FaqBlock', () => {
  it('renders the heading + a question per item', async () => {
    const wrapper = await mountSuspended(FaqBlock, {
      props: {
        settings: { heading: 'FAQ' },
        blocks: [
          item('How do I return?', '<p>Within 30 days.</p>', 'a'),
          item('Where do you ship?', '<p>Worldwide.</p>', 'b'),
        ],
      },
    })
    expect(wrapper.text()).toContain('FAQ')
    expect(wrapper.text()).toContain('How do I return?')
    expect(wrapper.text()).toContain('Where do you ship?')
  })

  it('drops items without a question', async () => {
    const wrapper = await mountSuspended(FaqBlock, {
      props: { settings: { heading: null }, blocks: [item('', 'orphan answer', 'x')] },
    })
    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('renders nothing on empty blocks', async () => {
    const wrapper = await mountSuspended(FaqBlock, {
      props: { settings: { heading: 'FAQ' }, blocks: [] },
    })
    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(FaqBlock, {
      props: {
        settings: { heading: 'FAQ' },
        blocks: [item('How do I return?', '<p>Within 30 days.</p>', 'a')],
      },
    })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
