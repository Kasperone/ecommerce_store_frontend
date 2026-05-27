// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import HighlightText from './HighlightText.vue'

describe('ShopHighlightText', () => {
  it('renders plain text with no emphasis', async () => {
    const wrapper = await mountSuspended(HighlightText, { props: { value: 'Blue Phone' } })
    expect(wrapper.text()).toBe('Blue Phone')
    expect(wrapper.find('em').exists()).toBe(false)
  })

  it('wraps matched terms in <em>', async () => {
    const wrapper = await mountSuspended(HighlightText, { props: { value: '<em>Pho</em>ne' } })
    expect(wrapper.find('em').text()).toBe('Pho')
    expect(wrapper.text()).toBe('Phone')
  })

  it('renders embedded HTML as inert text — never as live markup (XSS-safe)', async () => {
    const wrapper = await mountSuspended(HighlightText, {
      props: { value: '<script>al<em>ert</em>(1)</script>' },
    })
    // The <script> is escaped into a text node, not a real element.
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.text()).toContain('<script>')
    expect(wrapper.find('em').text()).toBe('ert')
  })
})
