// @vitest-environment nuxt
import { ref } from 'vue'
import { beforeEach, describe, it, expect } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import Logo from './Logo.vue'

// Brand identity comes from store_config. Mock it (declared post-imports; the
// factory closes over the ref lazily) so the wordmark/logo is deterministic and
// no real GET /store-config fires. `null` → i18n fallback ('E-commerce Store').
const storeConfig = ref<{ store_name?: string, logo_url?: string } | null>(null)
mockNuxtImport('useStoreConfig', () => () => ({ data: storeConfig }))

beforeEach(() => {
  storeConfig.value = null
})

describe('LayoutLogo', () => {
  it('renders an anchor to home by default (link mode)', async () => {
    const wrapper = await mountSuspended(Logo)
    const anchor = wrapper.find('a')
    expect(anchor.exists()).toBe(true)
    expect(anchor.attributes('href')).toBe('/')
    expect(anchor.attributes('aria-label')).toBeTruthy()
    // the wordmark + the inline mark both render (i18n fallback name)
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.text()).toContain('E-commerce Store')
  })

  it('renders a non-anchor wrapper when link=false (avoids nested <a>)', async () => {
    const wrapper = await mountSuspended(Logo, { props: { link: false } })
    // No anchor — this is the form used inside UHeader's #title slot, which
    // already links to home; nesting <a> in <a> caused a hydration mismatch.
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.text()).toContain('E-commerce Store')
  })

  it('hides the wordmark when showText=false', async () => {
    const wrapper = await mountSuspended(Logo, { props: { showText: false } })
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('E-commerce Store')
  })

  it('uses store_name from store_config as the wordmark', async () => {
    storeConfig.value = { store_name: 'Acme Bikes' }
    const wrapper = await mountSuspended(Logo)
    expect(wrapper.text()).toContain('Acme Bikes')
    expect(wrapper.text()).not.toContain('E-commerce Store')
    // No logo uploaded → the SVG mark still renders.
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('renders the uploaded logo image instead of the wordmark when logo_url is set', async () => {
    storeConfig.value = { store_name: 'Acme Bikes', logo_url: 'https://cdn.example.com/logo.png' }
    const wrapper = await mountSuspended(Logo)
    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('https://cdn.example.com/logo.png')
    expect(img.attributes('alt')).toBe('Acme Bikes')
    // The image carries the brand on its own — the SVG mark + wordmark text drop.
    expect(wrapper.find('svg').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Acme Bikes')
  })
})
