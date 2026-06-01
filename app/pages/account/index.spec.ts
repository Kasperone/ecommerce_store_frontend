// @vitest-environment nuxt
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * The account dashboard no longer hosts the inline email-language card (it
 * re-homes in the preferences page). It must instead surface a link into the
 * settings hub.
 */
mockNuxtImport('useAuthStore', () => () => ({
  user: { email: 'shopper@example.com', locale: 'en' },
}))

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

async function mountPage() {
  const Page = (await import('./index.vue')).default
  return await mountSuspended(Page, {
    global: { stubs: { NuxtLayout: PassThroughStub } },
  })
}

describe('account dashboard page', () => {
  it('renders a link into the settings hub', async () => {
    const wrapper = await mountPage()
    const hrefs = wrapper.findAll('a').map(l => l.attributes('href'))
    expect(hrefs).toContain('/account/settings')
  })

  it('no longer renders the email-language select', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Email language')
  })

  it('still renders the orders card', async () => {
    const wrapper = await mountPage()
    const hrefs = wrapper.findAll('a').map(l => l.attributes('href'))
    expect(hrefs).toContain('/account/orders')
  })

  it('declares the \'user\' middleware', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/pages/account/index.vue'), 'utf-8')
    expect(src).toMatch(/middleware:\s*'user'/)
  })
})
