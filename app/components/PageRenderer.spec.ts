// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import PageRenderer from './PageRenderer.vue'
import type { Section } from '~/blocks/types'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function richText(heading: string, id: string): Section {
  return {
    id,
    type: 'rich-text',
    settings: { heading, body: `<p>${heading} body</p>`, width: 'normal', alignment: 'left' },
  }
}

function spacer(id: string): Section {
  return { id, type: 'spacer', settings: { height: 48, show_divider: true, color: null } }
}

describe('PageRenderer', () => {
  it('renders a multi-section layout in order', async () => {
    const wrapper = await mountSuspended(PageRenderer, {
      props: { sections: [richText('First', 'a'), spacer('b'), richText('Second', 'c')] },
    })
    const text = wrapper.text()
    expect(text).toContain('First')
    expect(text).toContain('Second')
    expect(text.indexOf('First')).toBeLessThan(text.indexOf('Second'))
    expect(wrapper.find('.c-spacer-block').exists()).toBe(true)
  })

  it('falls back to UnknownBlock for an unregistered type (no crash)', async () => {
    const bogus = { id: 'x', type: 'totally-made-up', settings: {} } as unknown as Section
    const wrapper = await mountSuspended(PageRenderer, {
      props: { sections: [richText('Real', 'a'), bogus] },
    })
    expect(wrapper.text()).toContain('Real')
    // Dev env → the UnknownBlock note surfaces; in prod it would render nothing.
    expect(wrapper.text()).toContain('Unknown block type')
  })

  it('renders nothing for an empty section list', async () => {
    const wrapper = await mountSuspended(PageRenderer, { props: { sections: [] } })
    expect(wrapper.text().trim()).toBe('')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(PageRenderer, {
      props: { sections: [richText('First', 'a'), spacer('b')] },
    })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
