// @vitest-environment nuxt
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineComponent, h, ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * The account dashboard no longer hosts the inline email-language card (it
 * re-homes in the preferences page). It must instead surface a link into the
 * settings hub. It additionally surfaces a B2B-gated link to `/account/quotes`
 * (shown only when `useCompanyContext().isB2B`).
 */
mockNuxtImport('useAuthStore', () => () => ({
  user: { email: 'shopper@example.com', locale: 'en' },
}))

// `useCompanyContext` drives the B2B-gated quotes nav card. A module-scope ref
// lets each test flip the gate before mounting.
const isB2B = ref(false)
mockNuxtImport('useCompanyContext', () => () => ({
  company: ref(null),
  isB2B,
  isResolving: ref(false),
  error: ref(null),
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

afterEach(() => {
  isB2B.value = false
})

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

  it('hides the quotes card for non-B2B accounts', async () => {
    isB2B.value = false
    const wrapper = await mountPage()
    const hrefs = wrapper.findAll('a').map(l => l.attributes('href'))
    expect(hrefs).not.toContain('/account/quotes')
  })

  it('shows the quotes card for B2B accounts', async () => {
    isB2B.value = true
    const wrapper = await mountPage()
    const hrefs = wrapper.findAll('a').map(l => l.attributes('href'))
    expect(hrefs).toContain('/account/quotes')
  })

  it('declares the \'user\' middleware', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/pages/account/index.vue'), 'utf-8')
    expect(src).toMatch(/middleware:\s*'user'/)
  })
})
